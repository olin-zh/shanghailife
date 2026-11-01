import { env, readCookie, userFromToken, SESSION_COOKIE, json, isAdminUser } from "../../../../lib/auth";

export async function GET(req: Request) {
  const e = await env();
  const user = await userFromToken(e.DB, readCookie(req.headers.get("cookie"), SESSION_COOKIE));
  const admin = isAdminUser(e, user);
  // 管理员登录时顺带告诉他有几条待审核的广告
  const pending = admin ? ((await e.DB.prepare("SELECT COUNT(*) AS n FROM boats WHERE flagged = 1 AND owner IS NOT NULL").first<{ n: number }>())?.n ?? 0) : 0;
  return json({ user, admin, pending, x: !!(e.X_CLIENT_ID && e.X_CLIENT_SECRET) });
}
