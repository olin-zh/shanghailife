import { env, readCookie, userFromToken, SESSION_COOKIE, json } from "../../../../../lib/auth";

// 举报：立刻给这张图打马赛克，等管理员审核（恢复或下架）。管理员已经审核通过的同一张图不再处理举报
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const { DB } = await env();
  const user = await userFromToken(DB, readCookie(req.headers.get("cookie"), SESSION_COOKIE));
  if (!user) return json({ error: "登录后才能举报" }, 401);
  const b = await DB.prepare("SELECT owner, version, reviewed_ver FROM boats WHERE id = ?").bind(id).first<{ owner: string | null; version: number; reviewed_ver: number }>();
  if (!b?.owner) return json({ error: "这艘船上没有广告" }, 404);
  if (b.owner === user.id) return json({ error: "不能举报自己的广告" }, 400);
  await DB.prepare("INSERT OR IGNORE INTO boat_reports (boat_id, version, user_id, created_at) VALUES (?, ?, ?, ?)").bind(id, b.version, user.id, Date.now()).run();
  if (b.reviewed_ver === b.version) return json({ ok: true, toast: "已收到举报。这张图管理员审核过了" });
  await DB.prepare("UPDATE boats SET flagged = 1 WHERE id = ? AND version = ?").bind(id, b.version).run();
  return json({ ok: true, toast: "已收到举报，图片先打上马赛克，等管理员审核" });
}
