import { env, readCookie, userFromToken, SESSION_COOKIE, json } from "../../../lib/auth";
import { SYS } from "../../../lib/ledger";

// 我的最近 30 笔流水 + 系统账户余额
export async function GET(req: Request) {
  const { DB } = await env();
  const user = await userFromToken(DB, readCookie(req.headers.get("cookie"), SESSION_COOKIE));
  // 普通玩家只看得到市场账户；市政府账户只有管理员能看
  const accounts = (await DB.prepare("SELECT id, name, balance FROM accounts WHERE id = 'market'").all<{ id: string; name: string; balance: number }>()).results;
  if (!user) return json({ accounts, rows: [] });
  const rows = (await DB.prepare("SELECT ts, src, dst, amount, memo FROM ledger WHERE src = ? OR dst = ? ORDER BY id DESC LIMIT 30").bind(user.id, user.id).all<{ ts: number; src: string; dst: string; amount: number; memo: string }>()).results;
  const ids = [...new Set(rows.flatMap((r) => [r.src, r.dst]).filter((x) => x !== user.id && !(x in SYS)))];
  const names = new Map<string, string>();
  for (const id of ids) { const u = await DB.prepare("SELECT name FROM users WHERE id = ?").bind(id).first<{ name: string }>(); names.set(id, u?.name || "玩家"); }
  const who = (x: string) => (SYS as Record<string, string>)[x] ?? names.get(x) ?? "玩家";
  return json({ accounts, rows: rows.map((r) => ({ ts: r.ts, amount: r.src === user.id ? -r.amount : r.amount, with: who(r.src === user.id ? r.dst : r.src), memo: r.memo })) });
}
