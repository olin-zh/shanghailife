import { env, readCookie, userFromToken, SESSION_COOKIE, json } from "../../../../lib/auth";
import { mutate, loadSave } from "../../../../lib/store";
import { PLACES } from "../../../../lib/game";
import { COST_RATE, DEPOSIT, KINDS, SLOTS, priceOk, settle, visitShop, type ShopKind } from "../../../../lib/shops";

type Row = { owner: string | null; owner_name: string | null; kind: ShopKind | null; name: string | null; price: number | null; till: number; npc: number; settled_at: number | null };

// 把一家店的账结到现在（带乐观锁，防止和别的请求同时写）
async function settleNow(DB: D1Database, id: number) {
  for (let i = 0; i < 6; i++) {
    const r = await DB.prepare("SELECT owner, owner_name, kind, name, price, till, npc, settled_at FROM shops WHERE id = ?").bind(id).first<Row>();
    if (!r?.owner || !r.kind || !r.price) return r;
    const now = Date.now(), st = settle(id, r.kind, r.price, r.till, r.npc, r.settled_at ?? now, now);
    const ok = await DB.prepare("UPDATE shops SET till = ?, npc = ?, settled_at = ? WHERE id = ? AND settled_at IS ?").bind(st.till, st.npc, now, id, r.settled_at).run();
    if (ok.meta.changes === 1) return { ...r, till: st.till, npc: st.npc, settled_at: now };
  }
  throw new Error("店里太忙，请重试");
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || !SLOTS[id]) return json({ error: "没有这个铺面" }, 400);
  const { DB } = await env();
  const user = await userFromToken(DB, readCookie(req.headers.get("cookie"), SESSION_COOKIE));
  if (!user) return json({ error: "请先登录" }, 401);
  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  const place = SLOTS[id].place, placeName = PLACES[place].name;
  const save = (await loadSave(DB, user.id)).state;
  if (!save) return json({ error: "先开始游戏" }, 400);
  const here = save.at === place;

  if (b.op === "open") {
    const kind = b.kind as ShopKind, price = Number(b.price), name = String(b.name || "").replace(/\s+/g, " ").trim().slice(0, 12);
    if (!KINDS[kind]) return json({ error: "选一种店" }, 400);
    if (!name) return json({ error: "给店起个名字" }, 400);
    if (!priceOk(kind, price)) return json({ error: "价格不合理" }, 400);
    if (!here) return json({ error: `先到${placeName}才能开店` }, 400);
    if (save.money < DEPOSIT) return json({ error: `开店押金要¥${DEPOSIT.toLocaleString()}` }, 400);
    const now = Date.now();
    const claimed = await DB.prepare("UPDATE shops SET owner = ?, owner_name = ?, kind = ?, name = ?, price = ?, till = 0, sold = 0, npc = 0, settled_at = ?, opened_at = ? WHERE id = ? AND owner IS NULL")
      .bind(user.id, save.name, kind, name, price, now, now, id).run().then((r) => r.meta.changes === 1).catch(() => false); // 每人一家店由唯一索引保证
    if (!claimed) return json({ error: "这里已经有店了，或者侬已经开了一家店" }, 409);
    const paid = await mutate(DB, user.id, (s) => {
      if (!s || s.money < DEPOSIT) return { state: s, out: false };
      const n = structuredClone(s); n.money -= DEPOSIT; n.log.unshift([`第${n.day}天`, `在${placeName}开了一家${KINDS[kind].name}「${name}」，押金¥${DEPOSIT.toLocaleString()}。`]); n.log = n.log.slice(0, 40);
      return { state: n, out: true };
    }).catch(() => null);
    if (!paid?.out) { await DB.prepare("UPDATE shops SET owner = NULL, owner_name = NULL, kind = NULL, name = NULL, price = NULL WHERE id = ? AND owner = ?").bind(id, user.id).run(); return json({ error: "押金不够，开店失败" }, 400); }
    return json({ state: paid.state, toast: `「${name}」开张了！🎉` });
  }

  const r = await settleNow(DB, id).catch((e: Error) => { throw e; });
  if (!r?.owner || !r.kind || !r.price) return json({ error: "这里还没有店" }, 404);
  const mine = r.owner === user.id;

  if (b.op === "buy") {
    if (mine) return json({ error: "自己的店就不用自己买了" }, 400);
    if (!here) return json({ error: `先到${placeName}` }, 400);
    const price = r.price, kind = r.kind;
    let toast: string | undefined;
    const res = await mutate(DB, user.id, (s) => {
      if (!s || s.at !== place) return { state: s, out: false };
      const x = visitShop(s, { kind, name: r.name!, price, ownerName: r.owner_name! }); toast = x.toast;
      return x.state === s ? { state: s, out: false } : { state: x.state, out: true };
    });
    if (!res?.out) return json({ error: toast || "没买成", state: res?.state }, 400);
    await DB.prepare("UPDATE shops SET till = till + ?, sold = sold + 1 WHERE id = ? AND owner = ?").bind(price - KINDS[kind].ref * COST_RATE, id, r.owner).run();
    return json({ state: res.state, toast });
  }
  if (!mine) return json({ error: "这不是侬的店" }, 403);
  if (b.op === "price") {
    const p = Number(b.price);
    if (!priceOk(r.kind, p)) return json({ error: "价格不合理" }, 400);
    await DB.prepare("UPDATE shops SET price = ? WHERE id = ? AND owner = ?").bind(p, id, user.id).run();
    return json({ toast: `价格改成¥${p}了` });
  }
  if (b.op === "collect" || b.op === "close") {
    if (!here) return json({ error: `要到${placeName}店里才能${b.op === "close" ? "关店" : "收账"}` }, 400);
    const till = Math.round(r.till), refund = b.op === "close" ? DEPOSIT / 2 : 0;
    // 先清账（只有账没被别人动过才成功），再加到存档
    const cleared = b.op === "close"
      ? await DB.prepare("UPDATE shops SET owner = NULL, owner_name = NULL, kind = NULL, name = NULL, price = NULL, till = 0, sold = 0, npc = 0, settled_at = NULL, opened_at = NULL WHERE id = ? AND owner = ? AND settled_at = ?").bind(id, user.id, r.settled_at).run()
      : await DB.prepare("UPDATE shops SET till = till - ? WHERE id = ? AND owner = ? AND settled_at = ?").bind(r.till, id, user.id, r.settled_at).run();
    if (cleared.meta.changes !== 1) return json({ error: "店里刚有客人，请再点一次" }, 409);
    const res = await mutate(DB, user.id, (s) => {
      if (!s) return null;
      const n = structuredClone(s); n.money += till + refund;
      n.log.unshift([`第${n.day}天`, b.op === "close" ? `关掉了「${r.name}」，结清账目¥${till}，退回一半押金¥${refund}。` : `到「${r.name}」收账¥${till}。`]); n.log = n.log.slice(0, 40);
      return { state: n, out: true };
    });
    return json({ state: res?.state, toast: b.op === "close" ? `店关了，到手¥${till + refund}` : till >= 0 ? `收账¥${till} 💰` : `这段时间亏了¥${-till}，从侬钱包里补上了` });
  }
  return json({ error: "未知操作" }, 400);
}
