// 店招牌：店主上传（免费随时换），所有人都能看。图片存在 D1。
import { env, readCookie, userFromToken, SESSION_COOKIE, json } from "../../../../../lib/auth";
import { sniffImage } from "../../../../../lib/boats";
import { SIGN_MAX_BYTES } from "../../../../../lib/estates";
import { validCell } from "../../../../../lib/grid";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!validCell(id)) return json({ error: "没有这块地" }, 400);
  const { DB } = await env();
  const user = await userFromToken(DB, readCookie(req.headers.get("cookie"), SESSION_COOKIE));
  if (!user) return json({ error: "请先登录" }, 401);
  const buf = new Uint8Array(await req.arrayBuffer());
  if (!buf.length) return json({ error: "没有收到图片" }, 400);
  if (buf.length > SIGN_MAX_BYTES) return json({ error: "图片太大了（最多 300KB）" }, 413);
  const mime = sniffImage(buf);
  if (!mime) return json({ error: "只支持 JPG、PNG、WebP 图片" }, 415);
  const r = await DB.prepare("UPDATE estates SET sign = ?, sign_mime = ?, sign_ver = sign_ver + 1, sign_hidden = 0 WHERE id = ? AND owner = ? AND kind IS NOT NULL").bind(buf, mime, id, user.id).run();
  return r.meta.changes ? json({ ok: true, toast: "招牌挂上去了 🪧" }) : json({ error: "只有店主盖好店以后才能挂招牌" }, 403);
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const { DB } = await env();
  const r = await DB.prepare("SELECT sign, sign_mime, sign_ver, sign_hidden FROM estates WHERE id = ?").bind(id).first<{ sign: ArrayBuffer | number[] | null; sign_mime: string | null; sign_ver: number; sign_hidden: number }>();
  if (!r || !r.sign || r.sign_hidden) return new Response("没有招牌", { status: 404 });
  const bytes = r.sign instanceof ArrayBuffer ? new Uint8Array(r.sign) : new Uint8Array(r.sign);
  const v = new URL(req.url).searchParams.get("v");
  return new Response(bytes, { headers: { "content-type": r.sign_mime || "image/jpeg", "cache-control": v === String(r.sign_ver) ? "public, max-age=86400" : "no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" } });
}
