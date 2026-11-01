// 商业地块的所有操作。钱都在服务器上算：先抢占/改数据库，再改存档，存档改不成就回滚。
import { env, readCookie, userFromToken, SESSION_COOKIE, json } from "../../../../lib/auth";
import { mutate, loadSave } from "../../../../lib/store";
import { PLACES, sBonus, type State } from "../../../../lib/game";
import { parcelOf, validCell } from "../../../../lib/grid";
import { flow, settleOp } from "../../../../lib/ledger";
import { TAX } from "../../../../lib/game";
import { EKINDS, MAX_ESTATES, MAX_STAFF, canShift, doShift, estateName, estatePlace, estatePrice, priceOk, settle, shiftRevenue, visitEstate, wageOk, type EstateKind } from "../../../../lib/estates";

type Row = { owner: string | null; owner_name: string | null; kind: EstateKind | null; name: string | null; price: number | null; wage: number | null; openings: number; till: number; npc: number; settled_at: number | null };
const log = (n: State, t: string) => { n.log.unshift([`第${n.day}天`, t]); n.log = n.log.slice(0, 40); };

async function staffCount(DB: D1Database, id: number) { return (await DB.prepare("SELECT COUNT(*) AS n FROM estate_staff WHERE estate_id = ?").bind(id).first<{ n: number }>())?.n ?? 0; }

// 把账结到现在（乐观锁）
async function settleNow(DB: D1Database, id: number) {
  for (let i = 0; i < 6; i++) {
    const r = await DB.prepare("SELECT owner, owner_name, kind, name, price, wage, openings, till, npc, settled_at FROM estates WHERE id = ?").bind(id).first<Row>();
    if (!r?.owner || !r.kind || !r.price) return r;
    const owner = (await loadSave(DB, r.owner)).state;
    const n = await staffCount(DB, id), now = Date.now();
    const st = settle(id, r.kind, r.price, n, r.till, r.npc, r.settled_at ?? now, now, owner ? sBonus(owner, EKINDS[r.kind].boost) : 0);
    const ok = await DB.prepare("UPDATE estates SET till = ?, npc = ?, settled_at = ? WHERE id = ? AND settled_at IS ?").bind(st.till, st.npc, now, id, r.settled_at).run();
    if (ok.meta.changes === 1) return { ...r, till: st.till, npc: st.npc, settled_at: now };
  }
  throw new Error("店里太忙，请重试");
}
const pay = (DB: D1Database, uid: string, amount: number, line: string) =>
  mutate(DB, uid, (s) => {
    if (!s || s.money + amount < 0) return { state: s, out: false };
    const n = structuredClone(s); n.money += amount; log(n, line); return { state: n, out: true };
  }).catch(() => null);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!validCell(id)) return json({ error: "没有这块地" }, 400);
  const { DB } = await env();
  const user = await userFromToken(DB, readCookie(req.headers.get("cookie"), SESSION_COOKIE));
  if (!user) return json({ error: "请先登录" }, 401);
  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  const save = (await loadSave(DB, user.id)).state;
  if (!save) return json({ error: "先开始游戏" }, 400);
  const PLACE = estatePlace(id), here = save.at === PLACE, lot = estateName(id);
  const needHere = (what: string) => (here ? null : json({ error: `先到${PLACES[PLACE].name}才能${what}` }, 400));

  if (b.op === "buy") {
    if (parcelOf(id)?.use !== "com") return json({ error: "这一格不是商业用地" }, 400);
    const nh = needHere("买地"); if (nh) return nh;
    const price = estatePrice(id);
    if (save.money < price) return json({ error: `钞票不够，这块地要¥${price.toLocaleString()}` }, 400);
    const own = (await DB.prepare("SELECT COUNT(*) AS n FROM estates WHERE owner = ?").bind(user.id).first<{ n: number }>())?.n ?? 0;
    if (own >= MAX_ESTATES) return json({ error: `每人最多买 ${MAX_ESTATES} 块商业地` }, 400);
    // 只有这格没人买才插得进去；sign_ver 从时间戳起步，避免浏览器缓存到上一任店主的招牌
    const claimed = await DB.prepare("INSERT INTO estates (id, owner, owner_name, bought_at, sign_ver) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING")
      .bind(id, user.id, save.name, Date.now(), Math.floor(Date.now() / 1000) - 1_700_000_000).run().then((r) => r.meta.changes === 1).catch(() => false);
    if (!claimed) return json({ error: "这块地刚被别人买走了" }, 409);
    const r = await pay(DB, user.id, -price, `买下${lot}，花了¥${price.toLocaleString()}。`);
    if (!r?.out) { await DB.prepare("DELETE FROM estates WHERE id = ? AND owner = ?").bind(id, user.id).run(); return json({ error: "钞票不够，没买成" }, 400); }
    await flow(DB, user.id, "gov", price, `买地 ${lot}`);
    return json({ state: r.state, toast: `买下${lot}了！接下来盖点什么吧 🏗️` });
  }

  const r = await settleNow(DB, id);
  if (!r?.owner) return json({ error: "这块地还没人买" }, 404);
  const mine = r.owner === user.id;

  if (b.op === "build") {
    if (!mine) return json({ error: "这不是侬的地" }, 403);
    if (r.kind) return json({ error: "已经盖好了" }, 400);
    const kind = b.kind as EstateKind, name = String(b.name || "").replace(/\s+/g, " ").trim().slice(0, 12), price = Number(b.price);
    if (!EKINDS[kind]) return json({ error: "选一种店" }, 400);
    if (!name) return json({ error: "给店起个名字" }, 400);
    if (!priceOk(kind, price)) return json({ error: "价格不合理" }, 400);
    const nh = needHere("开工"); if (nh) return nh;
    const cost = EKINDS[kind].build;
    if (save.money < cost) return json({ error: `盖${EKINDS[kind].name}要¥${cost.toLocaleString()}` }, 400);
    const now = Date.now();
    const ok = await DB.prepare("UPDATE estates SET kind = ?, name = ?, price = ?, wage = 300, openings = 0, till = 0, npc = 0, visits = 0, settled_at = ? WHERE id = ? AND owner = ? AND kind IS NULL").bind(kind, name, price, now, id, user.id).run();
    if (ok.meta.changes !== 1) return json({ error: "已经盖好了" }, 409);
    const p = await pay(DB, user.id, -cost, `在${lot}盖了一家${EKINDS[kind].name}「${name}」，花了¥${cost.toLocaleString()}。`);
    if (!p?.out) { await DB.prepare("UPDATE estates SET kind = NULL, name = NULL, price = NULL, settled_at = NULL WHERE id = ? AND owner = ?").bind(id, user.id).run(); return json({ error: "钞票不够，没盖成" }, 400); }
    await flow(DB, user.id, "market", cost, `盖${EKINDS[kind].name} ${lot}`);
    return json({ state: p.state, toast: `「${name}」开张了！🎉 记得挂个招牌` });
  }

  if (b.op === "quit") { // 辞职：不用在店里
    const d = await DB.prepare("DELETE FROM estate_staff WHERE user_id = ? AND estate_id = ?").bind(user.id, id).run();
    return d.meta.changes ? json({ toast: "辞职了" }) : json({ error: "侬不在这家打工" }, 400);
  }
  if (b.op === "sell" && mine && !r.kind) { // 空地卖回市政府，回收七成
    const nh = needHere("卖地"); if (nh) return nh;
    const refund = Math.round(estatePrice(id) * 0.7);
    const c = await DB.prepare("DELETE FROM estates WHERE id = ? AND owner = ? AND kind IS NULL").bind(id, user.id).run();
    if (c.meta.changes !== 1) return json({ error: "请再试一次" }, 409);
    const p = await pay(DB, user.id, refund, `把${lot}转卖了，回收¥${refund.toLocaleString()}。`);
    await flow(DB, "gov", user.id, refund, `市政府回收 ${lot}`);
    return json({ state: p?.state, toast: `卖掉了，到手¥${refund.toLocaleString()}` });
  }
  if (!r.kind || !r.price) return json({ error: "这块地还没盖店" }, 400);
  const k = EKINDS[r.kind];

  if (b.op === "visit") {
    if (mine) return json({ error: "自己的店就不用自己消费了" }, 400);
    const nh = needHere("进店"); if (nh) return nh;
    let toast: string | undefined;
    const res = await mutate(DB, user.id, (s) => {
      if (!s || s.at !== PLACE) return { state: s, out: false };
      const x = visitEstate(s, { kind: r.kind!, name: r.name!, price: r.price!, ownerName: r.owner_name! }); toast = x.toast;
      return x.state === s ? { state: s, out: false } : { state: x.state, out: true };
    });
    if (!res?.out) return json({ error: toast || "没买成", state: res?.state }, 400);
    await flow(DB, user.id, "market", r.price, `在「${r.name}」消费`);
    await DB.prepare("UPDATE estates SET till = till + ?, visits = visits + 1 WHERE id = ? AND owner = ?").bind(r.price - k.ref * 0.45, id, r.owner).run();
    return json({ state: res.state, toast });
  }

  if (b.op === "apply") { // 应聘：店主开了岗位就是愿意雇人，来了就上岗
    if (mine) return json({ error: "自己是老板，不用应聘" }, 400);
    const nh = needHere("应聘"); if (nh) return nh;
    if (!r.openings) return json({ error: "这家现在不招人" }, 400);
    if (await staffCount(DB, id) >= r.openings) return json({ error: "岗位已经招满了" }, 409);
    const ins = await DB.prepare("INSERT INTO estate_staff (user_id, user_name, estate_id, hired_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO NOTHING").bind(user.id, save.name, id, Date.now()).run();
    if (!ins.meta.changes) return json({ error: "侬已经在别的店打工了，先辞职" }, 400);
    if (await staffCount(DB, id) > r.openings) { await DB.prepare("DELETE FROM estate_staff WHERE user_id = ?").bind(user.id).run(); return json({ error: "岗位刚被别人抢走了" }, 409); }
    return json({ toast: `被「${r.name}」录用了！每天可以来上一班，日薪¥${r.wage}` });
  }

  if (b.op === "shift") {
    const nh = needHere("上班"); if (nh) return nh;
    const emp = await DB.prepare("SELECT 1 AS x FROM estate_staff WHERE user_id = ? AND estate_id = ?").bind(user.id, id).first();
    if (!emp) return json({ error: "侬不是这家店的员工" }, 403);
    const why = canShift(save); if (why) return json({ error: why }, 400);
    const wage = r.wage || 0, rev = shiftRevenue(save, r.kind);
    // 工资从店里账上出；这一班的营业额先进账。账上不够付工资就上不了班
    const ok = await DB.prepare("UPDATE estates SET till = till + ? - ? WHERE id = ? AND owner = ? AND till + ? >= ?").bind(rev, wage, id, r.owner, rev, wage).run();
    if (ok.meta.changes !== 1) return json({ error: "老板账上钱不够发工资，今天先别上了" }, 400);
    let toast: string | undefined;
    const res = await mutate(DB, user.id, (s) => {
      if (!s || s.at !== PLACE || canShift(s)) return { state: s, out: false };
      const x = doShift(s, { kind: r.kind!, name: r.name!, wage, ownerName: r.owner_name! }); toast = x.toast; return { state: x.state, out: true };
    }).catch(() => null);
    if (!res?.out) { await DB.prepare("UPDATE estates SET till = till - ? + ? WHERE id = ?").bind(rev, wage, id).run(); return json({ error: "上班失败，请重试", state: res?.state }, 400); }
    await settleOp(DB, user.id, save, res.state, `在「${r.name}」上班`);
    return json({ state: res.state, toast });
  }

  if (!mine) return json({ error: "这不是侬的店" }, 403);
  if (b.op === "price") {
    const p = Number(b.price);
    if (!priceOk(r.kind, p)) return json({ error: "价格不合理" }, 400);
    await DB.prepare("UPDATE estates SET price = ? WHERE id = ? AND owner = ?").bind(p, id, user.id).run();
    return json({ toast: `价格改成¥${p}了` });
  }
  if (b.op === "hire") {
    const wage = Number(b.wage), openings = Number(b.openings);
    if (!wageOk(wage)) return json({ error: "日薪要在¥150 到 ¥900 之间" }, 400);
    if (!Number.isInteger(openings) || openings < 0 || openings > MAX_STAFF) return json({ error: `最多招 ${MAX_STAFF} 人` }, 400);
    if (openings < await staffCount(DB, id)) return json({ error: "岗位数不能少于现有员工，先解雇几位" }, 400);
    await DB.prepare("UPDATE estates SET wage = ?, openings = ? WHERE id = ? AND owner = ?").bind(wage, openings, id, user.id).run();
    return json({ toast: openings ? `开始招人：${openings} 个岗位，日薪¥${wage}` : "不招人了" });
  }
  if (b.op === "fire" && typeof b.uid === "string") {
    const d = await DB.prepare("DELETE FROM estate_staff WHERE user_id = ? AND estate_id = ?").bind(b.uid, id).run();
    return d.meta.changes ? json({ toast: "已解雇" }) : json({ error: "没有这位员工" }, 400);
  }
  if (b.op === "collect" || b.op === "sell") {
    const nh = needHere(b.op === "sell" ? "卖地" : "收账"); if (nh) return nh;
    const till = Math.round(r.till), tax = till > 0 ? Math.round(till * TAX) : 0;
    const refund = b.op === "sell" ? Math.round(estatePrice(id) * 0.7 + k.build * 0.3) : 0;
    const cleared = b.op === "sell"
      ? await DB.prepare("DELETE FROM estates WHERE id = ? AND owner = ? AND settled_at = ?").bind(id, user.id, r.settled_at).run()
      : await DB.prepare("UPDATE estates SET till = till - ? WHERE id = ? AND owner = ? AND settled_at = ?").bind(r.till, id, user.id, r.settled_at).run();
    if (cleared.meta.changes !== 1) return json({ error: "店里刚有客人，请再点一次" }, 409);
    if (b.op === "sell") await DB.prepare("DELETE FROM estate_staff WHERE estate_id = ?").bind(id).run();
    const res = await mutate(DB, user.id, (s) => {
      if (!s) return null;
      const n = structuredClone(s); n.money += till - tax + refund; n.taxPaid = (n.taxPaid || 0) + tax;
      log(n, b.op === "sell" ? `把${lot}连店一起卖了，回收¥${refund.toLocaleString()}，结清账目¥${till}。` : `到「${r.name}」收账¥${till}。`);
      return { state: n, out: true };
    });
    await flow(DB, "market", user.id, till, `「${r.name}」营业收入`);
    if (tax) await flow(DB, user.id, "gov", tax, `经营所得税 · 「${r.name}」`);
    if (refund) await flow(DB, "gov", user.id, refund, `市政府回收 ${lot}`);
    return json({ state: res?.state, toast: b.op === "sell" ? `卖掉了，到手¥${(till + refund).toLocaleString()}` : till >= 0 ? `收账¥${till}，扣税后¥${till - tax} 💰` : `这段时间亏了¥${-till}，从侬钱包里补上了` });
  }
  return json({ error: "未知操作" }, 400);
}
