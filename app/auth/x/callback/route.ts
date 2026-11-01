import { env, createSession, randomId, readCookie, sessionCookie } from "../../../../lib/auth";
import { X_COOKIE, callbackUrl, origin, xConfig } from "../../../../lib/xauth";

const back = (req: Request, err: string, extra: string[] = []) => {
  const h = new Headers({ location: origin(req) + `/?login_error=${err}` });
  h.append("set-cookie", `${X_COOKIE}=; Path=/auth/x; Max-Age=0`);
  extra.forEach((c) => h.append("set-cookie", c));
  return new Response(null, { status: 302, headers: h });
};

export async function GET(req: Request) {
  const e = await env();
  const cfg = xConfig(e);
  const url = new URL(req.url);
  const [state, verifier] = (readCookie(req.headers.get("cookie"), X_COOKIE) || "").split(".");
  if (url.searchParams.get("error")) return back(req, "x_cancel");
  if (!state || !verifier || url.searchParams.get("state") !== state) return back(req, "x_state");

  const tok = await fetch(new URL("/2/oauth2/token", cfg.api), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: "Basic " + btoa(`${cfg.id}:${cfg.secret}`) },
    body: new URLSearchParams({ code: url.searchParams.get("code") || "", grant_type: "authorization_code", redirect_uri: callbackUrl(req), code_verifier: verifier, client_id: cfg.id }),
  }).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { access_token?: string } | null;
  if (!tok?.access_token) return back(req, "x_token");

  const me = await fetch(new URL("/2/users/me", cfg.api), { headers: { authorization: `Bearer ${tok.access_token}` } })
    .then((r) => (r.ok ? r.json() : null)).catch(() => null) as { data?: { id: string; name: string; username: string } } | null;
  if (!me?.data?.id) return back(req, "x_user");

  const { id: xid, name, username } = me.data;
  let row = await e.DB.prepare("SELECT id FROM users WHERE x_id = ?").bind(xid).first<{ id: string }>();
  if (!row) {
    const id = randomId();
    await e.DB.prepare("INSERT INTO users (id, email, name, pass_hash, pass_salt, x_id, created_at) VALUES (?, ?, ?, '!', '!', ?, ?)")
      .bind(id, `x:${xid}`, (name || username || "玩家").slice(0, 16), xid, Date.now()).run();
    row = { id };
  }
  const s = await createSession(e.DB, row.id);
  const h = new Headers({ location: origin(req) + "/" });
  h.append("set-cookie", sessionCookie(s.token, s.maxAge));
  h.append("set-cookie", `${X_COOKIE}=; Path=/auth/x; Max-Age=0`);
  return new Response(null, { status: 302, headers: h });
}
