import { env, readCookie, userFromToken, SESSION_COOKIE, json } from "../../../../../lib/auth";
import { HIDE_AFTER_REPORTS } from "../../../../../lib/boats";

// 举报：同一张图被 3 个不同玩家举报就自动隐藏，等管理员处理
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const { DB } = await env();
  const user = await userFromToken(DB, readCookie(req.headers.get("cookie"), SESSION_COOKIE));
  if (!user) return json({ error: "登录后才能举报" }, 401);
  const b = await DB.prepare("SELECT owner, version FROM boats WHERE id = ?").bind(id).first<{ owner: string | null; version: number }>();
  if (!b?.owner) return json({ error: "这艘船上没有广告" }, 404);
  if (b.owner === user.id) return json({ error: "不能举报自己的广告" }, 400);
  await DB.prepare("INSERT OR IGNORE INTO boat_reports (boat_id, version, user_id, created_at) VALUES (?, ?, ?, ?)").bind(id, b.version, user.id, Date.now()).run();
  const n = await DB.prepare("SELECT COUNT(*) AS n FROM boat_reports WHERE boat_id = ? AND version = ?").bind(id, b.version).first<{ n: number }>();
  if ((n?.n ?? 0) >= HIDE_AFTER_REPORTS) await DB.prepare("UPDATE boats SET hidden = 1 WHERE id = ? AND version = ?").bind(id, b.version).run();
  return json({ ok: true, toast: "已收到举报，谢谢" });
}
