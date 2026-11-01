import { env, readCookie, userFromToken, SESSION_COOKIE, isAdminUser } from "../../../../../lib/auth";

// 广告图片。被举报待审核时，普通玩家拿到的是马赛克版；广告主和管理员能看原图。URL 带 ?v= 版本号以便缓存
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const e = await env();
  const r = await e.DB.prepare("SELECT owner, image, mime, mosaic, version, expires_at, hidden, flagged FROM boats WHERE id = ?").bind(id).first<{ owner: string | null; image: ArrayBuffer | number[] | null; mime: string | null; mosaic: ArrayBuffer | number[] | null; version: number; expires_at: number | null; hidden: number; flagged: number }>();
  if (!r || !r.image || r.hidden || (r.expires_at ?? 0) < Date.now()) return new Response("没有这张图", { status: 404 });
  let pic = r.image, mime = r.mime || "image/jpeg";
  const u = new URL(req.url);
  if (r.flagged) {
    const user = await userFromToken(e.DB, readCookie(req.headers.get("cookie"), SESSION_COOKIE));
    const privileged = !!user && (user.id === r.owner || isAdminUser(e, user));
    if (!privileged || u.searchParams.get("m") === "1") {
      if (!r.mosaic) return new Response("审核中", { status: 404 });
      pic = r.mosaic; mime = "image/jpeg";
    }
  }
  const bytes = pic instanceof ArrayBuffer ? new Uint8Array(pic) : new Uint8Array(pic);
  return new Response(bytes, { headers: { "content-type": mime, "cache-control": r.flagged ? "no-store" : u.searchParams.get("v") === String(r.version) ? "public, max-age=86400" : "no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" } });
}
