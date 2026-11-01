import { env } from "../../../../../lib/auth";

// 广告图片。URL 带 ?v=版本号，换图后版本号变，所以可以长期缓存。
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const { DB } = await env();
  const r = await DB.prepare("SELECT image, mime, version, expires_at, hidden FROM boats WHERE id = ?").bind(id).first<{ image: ArrayBuffer | number[] | null; mime: string | null; version: number; expires_at: number | null; hidden: number }>();
  if (!r || !r.image || r.hidden || (r.expires_at ?? 0) < Date.now()) return new Response("没有这张图", { status: 404 });
  const bytes = r.image instanceof ArrayBuffer ? new Uint8Array(r.image) : new Uint8Array(r.image);
  const v = new URL(req.url).searchParams.get("v");
  return new Response(bytes, {
    headers: { "content-type": r.mime || "image/jpeg", "cache-control": v === String(r.version) ? "public, max-age=86400" : "no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" },
  });
}
