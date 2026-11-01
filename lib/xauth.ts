// X（Twitter）OAuth 2.0 授权码 + PKCE。X_AUTH_BASE / X_API_BASE 只在本地测试时覆盖。
import type { Env } from "./auth";

export const X_COOKIE = "sl_xoauth";
const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf instanceof Uint8Array ? buf : new Uint8Array(buf)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function xConfig(env: Env & { X_AUTH_BASE?: string; X_API_BASE?: string }) {
  return {
    id: env.X_CLIENT_ID || "", secret: env.X_CLIENT_SECRET || "",
    auth: env.X_AUTH_BASE || "https://x.com", api: env.X_API_BASE || "https://api.x.com",
  };
}

export async function pkce() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  return { verifier, challenge, state };
}

// 用浏览器实际访问的域名拼回调地址（本地是 http://127.0.0.1，线上是 https://shanghailife.app）
export function origin(req: Request) {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || new URL(req.url).host;
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  return `${local ? "http" : "https"}://${host}`;
}
export const callbackUrl = (req: Request) => origin(req) + "/auth/x/callback";
