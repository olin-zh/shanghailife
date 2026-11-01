import { env, readCookie, userFromToken, SESSION_COOKIE, json } from "../../../../lib/auth";

export async function GET(req: Request) {
  const e = await env();
  const user = await userFromToken(e.DB, readCookie(req.headers.get("cookie"), SESSION_COOKIE));
  return json({ user, x: !!(e.X_CLIENT_ID && e.X_CLIENT_SECRET) });
}
