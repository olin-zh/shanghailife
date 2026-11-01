// 登录玩家的所有游戏操作都在这里执行，客户端只拿结果。
import { env, readCookie, userFromToken, SESSION_COOKIE, json } from "../../../lib/auth";
import { mutate, loadSave } from "../../../lib/store";
import { ENTRY_JOBS, GENDERS, JOBS, PLACES, START_GRANT, act, actsAt, birthOk, type Gender, buyPlot, isState, newGame, sellPlot, travel, type JobId, type PlaceId, type State } from "../../../lib/game";
import { parcelOf, parcelName } from "../../../lib/grid";
import { flow, settleOp } from "../../../lib/ledger";

type Out = { toast?: string; label?: string; error?: string };

// 导入游客存档：只保留进度类信息，钱和日子重置，避免把本地改过的数据带进来
function sanitize(x: State): State {
  const s = newGame(String(x.name).slice(0, 12) || "小张", ENTRY_JOBS.includes(x.job) ? x.job : ENTRY_JOBS[0], x.gender, x.birth);
  s.friends = Object.fromEntries(
    Object.entries(x.friends || {}).filter(([k]) => k.length < 10).map(([k, v]) => [k, Math.max(0, Math.min(100, Number(v) || 0))]),
  );
  s.log.unshift([s.log[0][0], "从游客存档继续，钱包和日子重新开始。"]);
  return s;
}

export async function GET(req: Request) {
  const { DB } = await env();
  const user = await userFromToken(DB, readCookie(req.headers.get("cookie"), SESSION_COOKIE));
  if (!user) return json({ error: "未登录" }, 401);
  return json({ state: (await loadSave(DB, user.id)).state });
}

export async function POST(req: Request) {
  const { DB } = await env();
  const user = await userFromToken(DB, readCookie(req.headers.get("cookie"), SESSION_COOKIE));
  if (!user) return json({ error: "未登录" }, 401);
  const b = (await req.json().catch(() => ({}))) as Record<string, any>;

  // 买住宅地：先在 plots 表里抢下这一格（同一时间只有一个人能抢到），再扣存档里的钱；扣钱失败就把地放回去
  if (b.op === "buy") {
    const id = Number(b.id), pc = parcelOf(id);
    if (!pc || pc.use !== "res") return json({ error: "这一格不能买来住" }, 400);
    const pre = (await loadSave(DB, user.id)).state;
    const name = parcelName(id);
    const check = pre && buyPlot(pre, id, pc.place, pc.price, name);
    if (!pre || !check || check.state === pre) return json({ error: check?.toast || "还没开始游戏", state: pre }, 400);
    const claimed = await DB.prepare("INSERT INTO plots (id, owner, owner_name, bought_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET owner = excluded.owner, owner_name = excluded.owner_name, bought_at = excluded.bought_at WHERE plots.owner IS NULL")
      .bind(id, user.id, pre.name, Date.now()).run().then((r) => r.meta.changes === 1).catch(() => false);
    if (!claimed) return json({ error: "这块地刚被别人买走了", state: pre }, 409);
    let toast: string | undefined, label: string | undefined, ok = false;
    const r = await mutate(DB, user.id, (s) => {
      if (!s) return null;
      const x = buyPlot(s, id, pc.place, pc.price, name);
      if (x.state === s) { toast = x.toast; return { state: s, out: null }; }
      ok = true; toast = x.toast; label = x.label; return { state: x.state, out: null };
    }).catch(() => null);
    if (!ok) {
      await DB.prepare("DELETE FROM plots WHERE id = ? AND owner = ?").bind(id, user.id).run();
      return json({ error: toast || "买地失败", state: r?.state ?? pre }, 400);
    }
    await flow(DB, user.id, "gov", pc.price, `买地 ${name}`);
    return json({ state: r!.state, toast, label });
  }
  // 卖住宅地：先把钱加进存档，再把地放回市场
  if (b.op === "sell") {
    const id = Number(b.id), pc = parcelOf(id);
    if (!pc) return json({ error: "没有这块地" }, 400);
    let ok = false, toast: string | undefined;
    const r = await mutate(DB, user.id, (s) => {
      if (!s?.houses?.[id]) { toast = "这块不是侬的"; return { state: s, out: null }; }
      const x = sellPlot(s, id, pc.price, parcelName(id)); ok = true; toast = x.toast; return { state: x.state, out: null };
    });
    if (!ok) return json({ error: toast, state: r?.state }, 400);
    await DB.prepare("DELETE FROM plots WHERE id = ? AND owner = ?").bind(id, user.id).run();
    await flow(DB, "gov", user.id, Math.round(pc.price * 0.7), `市政府回收 ${parcelName(id)}`);
    return json({ state: r!.state, toast });
  }

  const before = (await loadSave(DB, user.id)).state;
  const r = await mutate<Out>(DB, user.id, (s) => {
    switch (b.op) {
      case "new": {
        if (s) return { state: s, out: { error: "已经有存档了" } };
        const job = (ENTRY_JOBS.includes(b.job as JobId) ? b.job : ENTRY_JOBS[0]) as JobId;
        if (!(b.gender in GENDERS)) return { state: s, out: { error: "请选择性别" } };
        if (!birthOk(b.birth)) return { state: s, out: { error: "出生日期不对（要年满 16 岁）" } };
        return { state: newGame(String(b.name || "").trim().slice(0, 12) || user.name, job, b.gender as Gender, b.birth), out: {} };
      }
      case "profile": { // 老存档补填性别和出生日期
        if (!s) return { state: s, out: { error: "还没开始游戏" } };
        if (!(b.gender in GENDERS)) return { state: s, out: { error: "请选择性别" } };
        if (!birthOk(b.birth)) return { state: s, out: { error: "出生日期不对（要年满 16 岁）" } };
        return { state: { ...s, gender: b.gender as Gender, birth: b.birth }, out: { toast: "资料已保存" } };
      }
      case "import":
        if (s) return { state: s, out: { error: "已经有存档了" } };
        if (!isState(b.save)) return { state: s, out: { error: "存档格式不对" } };
        return { state: sanitize(b.save), out: {} };
      case "reset":
        return { state: null, out: {} };
      case "travel": {
        if (!s) return { state: s, out: { error: "还没开始游戏" } };
        if (!(b.to in PLACES)) return { state: s, out: { error: "没有这个地方" } };
        const x = travel(s, b.to as PlaceId);
        return { state: x.state, out: { toast: x.toast } };
      }
      case "act": {
        if (!s) return { state: s, out: { error: "还没开始游戏" } };
        if (!Number.isInteger(b.i)) return { state: s, out: { error: "参数不对" } };
        const x = act(s, b.i);
        return { state: x.state, out: { toast: x.toast, label: x.label } };
      }
      default:
        return { state: s, out: { error: "未知操作" } };
    }
  }).catch((e: Error) => ({ state: null, out: { error: e.message } as Out }));

  if (!r) return json({ error: "操作失败" }, 500);
  if (b.op === "reset" && !r.out.error) { // 重开游戏：地和店都还回去
    await DB.prepare("DELETE FROM plots WHERE owner = ?").bind(user.id).run();
    await DB.prepare("DELETE FROM estate_staff WHERE user_id = ? OR estate_id IN (SELECT id FROM estates WHERE owner = ?)").bind(user.id, user.id).run();
    await DB.prepare("DELETE FROM estates WHERE owner = ?").bind(user.id).run();
    await DB.prepare("UPDATE shops SET owner = NULL, owner_name = NULL, kind = NULL, name = NULL, price = NULL, till = 0, sold = 0, npc = 0, settled_at = NULL, opened_at = NULL WHERE owner = ?").bind(user.id).run();
  }
  if (r.out.error) return json({ error: r.out.error, state: r.state }, 400);
  // 记账：新开局领补贴；重开游戏余额上缴；其他操作和市场结算、交税
  if (b.op === "new" || b.op === "import") await flow(DB, "gov", user.id, START_GRANT, "落户补贴");
  else if (b.op === "profile") { /* 不涉及钱 */ }
  else if (b.op === "reset") { if (before) await flow(DB, user.id, "gov", before.money, "重开游戏，余额上缴"); }
  else await settleOp(DB, user.id, before, r.state, b.op === "travel" ? `坐地铁去${PLACES[b.to as PlaceId]?.name ?? ""}` : (before && actsAt(before, before.at)[b.i]?.[0]) || r.out.label || "日常开销");
  return json({ state: r.state, ...r.out });
}
