import { env } from "../../../../lib/auth";
import { X_COOKIE, callbackUrl, origin, pkce, xConfig } from "../../../../lib/xauth";

export async function GET(req: Request) {
  const cfg = xConfig(await env());
  if (!cfg.id || !cfg.secret) return Response.redirect(origin(req) + "/?login_error=x_off", 302);
  const { verifier, challenge, state } = await pkce();
  const u = new URL("/i/oauth2/authorize", cfg.auth);
  u.search = new URLSearchParams({
    response_type: "code", client_id: cfg.id, redirect_uri: callbackUrl(req), scope: "users.read tweet.read",
    state, code_challenge: challenge, code_challenge_method: "S256",
  }).toString();
  return new Response(null, {
    status: 302,
    headers: { location: u.toString(), "set-cookie": `${X_COOKIE}=${state}.${verifier}; Path=/auth/x; HttpOnly; Secure; SameSite=Lax; Max-Age=600` },
  });
}
