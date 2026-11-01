import { env, hashPassword, safeEqual, createSession, sessionCookie, json } from "../../../../lib/auth";

export async function POST(req: Request) {
  const { email, password } = (await req.json().catch(() => ({}))) as Record<string, string>;
  const { DB } = await env();
  const row = await DB.prepare("SELECT id, email, name, pass_hash, pass_salt FROM users WHERE email = ?")
    .bind(String(email || "").trim().toLowerCase())
    .first<{ id: string; email: string; name: string; pass_hash: string; pass_salt: string }>();
  if (!row || !safeEqual(await hashPassword(String(password || ""), row.pass_salt), row.pass_hash))
    return json({ error: "邮箱或密码不对" }, 401);
  const s = await createSession(DB, row.id);
  return json({ user: { id: row.id, email: row.email, name: row.name } }, 200, { "set-cookie": sessionCookie(s.token, s.maxAge) });
}
