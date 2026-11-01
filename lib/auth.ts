import { getCloudflareContext } from "@opennextjs/cloudflare";

export type Env = { DB: D1Database; CITY: DurableObjectNamespace; X_CLIENT_ID?: string; X_CLIENT_SECRET?: string };
export type User = { id: string; email: string; name: string };

export const SESSION_COOKIE = "sl_session";
const SESSION_DAYS = 30;

export async function env(): Promise<Env> {
  return (await getCloudflareContext({ async: true })).env as unknown as Env;
}

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
export const randomId = (bytes = 16) => hex(crypto.getRandomValues(new Uint8Array(bytes)).buffer);

export async function hashPassword(password: string, salt: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 100000 }, key, 256);
  return hex(bits);
}

export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function createSession(db: D1Database, userId: string) {
  const token = randomId(32);
  const expires = Date.now() + SESSION_DAYS * 86400_000;
  await db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").bind(token, userId, expires).run();
  return { token, maxAge: SESSION_DAYS * 86400 };
}

export function readCookie(header: string | null, name: string) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export async function userFromToken(db: D1Database, token: string | null): Promise<User | null> {
  if (!token) return null;
  const row = await db
    .prepare("SELECT u.id, u.email, u.name, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?")
    .bind(token)
    .first<{ id: string; email: string; name: string; expires_at: number }>();
  if (!row || row.expires_at < Date.now()) return null;
  return { id: row.id, email: row.email, name: row.name };
}

export function sessionCookie(token: string, maxAge: number) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
}

// 管理员：邮箱写在 Cloudflare 加密变量 ADMIN_EMAILS 里（逗号分隔），不进代码仓库
export const isAdminUser = (e: unknown, user: User | null) =>
  !!user && String((e as { ADMIN_EMAILS?: string }).ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).includes(user.email.toLowerCase());
