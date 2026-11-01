// 登录玩家的所有游戏操作都在这里执行，客户端只拿结果。
import { env, readCookie, userFromToken, SESSION_COOKIE, json } from "../../../lib/auth";
import { mutate, loadSave } from "../../../lib/store";
import { JOBS, PLACES, act, isState, newGame, travel, type JobId, type PlaceId, type State } from "../../../lib/game";

type Out = { toast?: string; label?: string; error?: string };

// 导入游客存档：只保留进度类信息，钱和日子重置，避免把本地改过的数据带进来
function sanitize(x: State): State {
  const s = newGame(String(x.name).slice(0, 12) || "小张", JOBS[x.job] ? x.job : "coder");
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

  const r = await mutate<Out>(DB, user.id, (s) => {
    switch (b.op) {
      case "new": {
        if (s) return { state: s, out: { error: "已经有存档了" } };
        const job = (JOBS[b.job as JobId] ? b.job : "coder") as JobId;
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
  if (r.out.error) return json({ error: r.out.error, state: r.state }, 400);
  return json({ state: r.state, ...r.out });
}
