import { env, readCookie, userFromToken, SESSION_COOKIE, json } from "../../../../../lib/auth";
import { HIDE_AFTER_REPORTS } from "../../../../../lib/estates";

// 举报招牌：同一张图被 3 个不同玩家举报就自动隐藏
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const { DB } = await env();
  const user = await userFromToken(DB, readCookie(req.headers.get("cookie"), SESSION_COOKIE));
  if (!user) return json({ error: "请先登录" }, 401);
  const e = await DB.prepare("SELECT owner, sign_ver FROM estates WHERE id = ? AND sign IS NOT NULL").bind(id).first<{ owner: string; sign_ver: number }>();
  if (!e) return json({ error: "没有招牌" }, 404);
  if (e.owner === user.id) return json({ error: "不能举报自己的招牌" }, 400);
  await DB.prepare("INSERT OR IGNORE INTO estate_reports (estate_id, version, user_id, created_at) VALUES (?, ?, ?, ?)").bind(id, e.sign_ver, user.id, Date.now()).run();
  const n = (await DB.prepare("SELECT COUNT(*) AS n FROM estate_reports WHERE estate_id = ? AND version = ?").bind(id, e.sign_ver).first<{ n: number }>())?.n ?? 0;
  if (n >= HIDE_AFTER_REPORTS) await DB.prepare("UPDATE estates SET sign_hidden = 1 WHERE id = ? AND sign_ver = ?").bind(id, e.sign_ver).run();
  return json({ toast: "收到举报，谢谢" });
}
