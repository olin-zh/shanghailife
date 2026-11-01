// 登录玩家的所有游戏操作都在这里执行，客户端只拿结果。
import { env, readCookie, userFromToken, SESSION_COOKIE, json } from "../../../lib/auth";
import { mutate, loadSave } from "../../../lib/store";
import { JOBS, PLACES, act, buyPlot, isState, newGame, sellPlot, travel, type JobId, type PlaceId, type State } from "../../../lib/game";
import { PLOT_COUNT, plotName, plotPrice } from "../../../lib/plots";

type Out = { toast?: string; label?: string; error?: string };

// 导入游客存档：只保留进度类信息，钱和日子重置，避免把本地改过的数据带进来
function sanitize(x: State): State {
  const s = newGame(String(x.name).slice(0, 12) || "小张", JOBS[x.job] && x.job !== "engineer" ? x.job : "coder");
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

  // 买地：先在 plots 表里抢下这块地（同一时间只有一个人能抢到），再扣存档里的钱；扣钱失败就把地放回去
  if (b.op === "buy") {
    const id = Number(b.id);
    if (!Number.isInteger(id) || id < 0 || id >= PLOT_COUNT) return json({ error: "没有这块地" }, 400);
    const pre = (await loadSave(DB, user.id)).state;
    const check = pre && buyPlot(pre, id, plotPrice(id), plotName(id));
    if (!pre || !check || check.state === pre) return json({ error: check?.toast || "还没开始游戏", state: pre }, 400);
    const claimed = await DB.prepare("UPDATE plots SET owner = ?, owner_name = ?, bought_at = ? WHERE id = ? AND owner IS NULL")
      .bind(user.id, pre.name, Date.now(), id).run().then((r) => r.meta.changes === 1).catch(() => false);
    if (!claimed) return json({ error: "这块地刚被别人买走了", state: pre }, 409);
    let toast: string | undefined, label: string | undefined, ok = false;
    const r = await mutate(DB, user.id, (s) => {
      if (!s) return null;
      const x = buyPlot(s, id, plotPrice(id), plotName(id));
      if (x.state === s) { toast = x.toast; return { state: s, out: null }; }
      ok = true; toast = x.toast; label = x.label; return { state: x.state, out: null };
    }).catch(() => null);
    if (!ok) {
      await DB.prepare("UPDATE plots SET owner = NULL, owner_name = NULL, bought_at = NULL WHERE id = ? AND owner = ?").bind(id, user.id).run();
      return json({ error: toast || "买地失败", state: r?.state ?? pre }, 400);
    }
    return json({ state: r!.state, toast, label });
  }
  // 卖地：先把钱加进存档，再把地放回市场
  if (b.op === "sell") {
    let id = -1, toast: string | undefined;
    const r = await mutate(DB, user.id, (s) => {
      if (!s || s.ownPlot == null) { toast = "侬没有地可卖"; return { state: s, out: null }; }
      id = s.ownPlot; const x = sellPlot(s, plotPrice(id), plotName(id)); toast = x.toast; return { state: x.state, out: null };
    });
    if (id < 0) return json({ error: toast, state: r?.state }, 400);
    await DB.prepare("UPDATE plots SET owner = NULL, owner_name = NULL, bought_at = NULL WHERE id = ? AND owner = ?").bind(id, user.id).run();
    return json({ state: r!.state, toast });
  }

  const r = await mutate<Out>(DB, user.id, (s) => {
    switch (b.op) {
      case "new": {
        if (s) return { state: s, out: { error: "已经有存档了" } };
        const job = (JOBS[b.job as JobId] && b.job !== "engineer" ? b.job : "coder") as JobId;
        return { state: newGame(String(b.name || "").trim().slice(0, 12) || user.name, job), out: {} };
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
    await DB.prepare("UPDATE plots SET owner = NULL, owner_name = NULL, bought_at = NULL WHERE owner = ?").bind(user.id).run();
    await DB.prepare("UPDATE estates SET owner = NULL, owner_name = NULL, bought_at = NULL, kind = NULL, name = NULL, price = NULL, wage = NULL, openings = 0, till = 0, visits = 0, npc = 0, settled_at = NULL, sign = NULL, sign_mime = NULL, sign_ver = sign_ver + 1 WHERE owner = ?").bind(user.id).run();
    await DB.prepare("DELETE FROM estate_staff WHERE user_id = ? OR estate_id IN (SELECT id FROM estates WHERE owner IS NULL)").bind(user.id).run();
    await DB.prepare("UPDATE shops SET owner = NULL, owner_name = NULL, kind = NULL, name = NULL, price = NULL, till = 0, sold = 0, npc = 0, settled_at = NULL, opened_at = NULL WHERE owner = ?").bind(user.id).run();
  }
  if (r.out.error) return json({ error: r.out.error, state: r.state }, 400);
  return json({ state: r.state, ...r.out });
}
