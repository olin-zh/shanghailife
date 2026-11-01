// 游船广告：租船 / 续租走 Stripe 付真钱（每周 $10）；自己的船免费换图；管理员或广告主可以撤下
import { env, readCookie, userFromToken, SESSION_COOKIE, json, isAdminUser } from "../../../../lib/auth";
import { AD_DAYS, AD_MAX_BYTES, AD_MAX_PER_PLAYER, AD_USD_CENTS, BOAT_COUNT, HOLD_MINUTES, boatName, sniffImage } from "../../../../lib/boats";
import { checkout, stripeOn } from "../../../../lib/stripe";

const origin = (req: Request) => new URL(req.url).origin;

async function readImage(fd: FormData, field: string, max: number) {
  const f = fd.get(field);
  if (!f || typeof f === "string") return null;
  const buf = new Uint8Array(await f.arrayBuffer());
  if (!buf.length || buf.length > max) return null;
  const mime = sniffImage(buf);
  return mime ? { buf, mime } : null;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 0 || id >= BOAT_COUNT) return json({ error: "没有这艘船" }, 400);
  const e = await env();
  const user = await userFromToken(e.DB, readCookie(req.headers.get("cookie"), SESSION_COOKIE));
  if (!user) return json({ error: "请先登录" }, 401);
  const now = Date.now();
  const cur = await e.DB.prepare("SELECT owner, expires_at, hidden, hold_by, hold_until FROM boats WHERE id = ?").bind(id).first<{ owner: string | null; expires_at: number | null; hidden: number; hold_by: string | null; hold_until: number | null }>();
  if (!cur) return json({ error: "没有这艘船" }, 404);
  const mineLive = cur.owner === user.id && (cur.expires_at ?? 0) > now && !cur.hidden;
  const renew = new URL(req.url).searchParams.get("renew") === "1";

  let img: { buf: Uint8Array; mime: string } | null = null, mosaic: { buf: Uint8Array; mime: string } | null = null, caption: string | null = null;
  if (!renew) {
    const fd = await req.formData().catch(() => null);
    if (!fd) return json({ error: "没有收到图片" }, 400);
    img = await readImage(fd, "image", AD_MAX_BYTES);
    if (!img) return json({ error: "图片不对：只支持 JPG、PNG、WebP，最多 300KB" }, 415);
    mosaic = await readImage(fd, "mosaic", 20 * 1024);
    caption = String(fd.get("caption") || "").replace(/\s+/g, " ").trim().slice(0, 40) || null;
  }

  if (mineLive && !renew) { // 自己的船：免费换图，到期时间不变，审核状态重置
    await e.DB.prepare("UPDATE boats SET image = ?, mime = ?, mosaic = ?, caption = ?, version = version + 1, flagged = 0, updated_at = ? WHERE id = ? AND owner = ?").bind(img!.buf, img!.mime, mosaic?.buf ?? null, caption, now, id, user.id).run();
    return json({ ok: true, toast: "广告图换好了" });
  }
  if (!stripeOn(e)) return json({ error: "付款还没开通，请稍后再来" }, 503);
  if (renew && !mineLive) return json({ error: "只能给自己正在挂的广告续租" }, 400);
  if (!renew) {
    const active = await e.DB.prepare("SELECT COUNT(*) AS n FROM boats WHERE owner = ? AND expires_at > ? AND hidden = 0").bind(user.id, now).first<{ n: number }>();
    if ((active?.n ?? 0) >= AD_MAX_PER_PLAYER) return json({ error: `每人最多同时租 ${AD_MAX_PER_PLAYER} 艘船` }, 400);
    // 先把船位留给这个人 30 分钟，付完款再正式挂上
    const held = await e.DB.prepare("UPDATE boats SET hold_by = ?, hold_until = ? WHERE id = ? AND (owner IS NULL OR expires_at IS NULL OR expires_at < ? OR hidden = 1) AND (hold_until IS NULL OR hold_until < ? OR hold_by = ?)")
      .bind(user.id, now + HOLD_MINUTES * 60_000, id, now, now, user.id).run();
    if (held.meta.changes !== 1) return json({ error: "这艘船已经有人在打广告，或者正有人在付款" }, 409);
  }
  const order = crypto.randomUUID();
  await e.DB.prepare("INSERT INTO boat_orders (id, user_id, user_name, boat_id, kind, image, mosaic, mime, caption, amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(order, user.id, user.name, id, renew ? "renew" : "new", img?.buf ?? null, mosaic?.buf ?? null, img?.mime ?? null, caption, AD_USD_CENTS, now).run();
  try {
    const s = await checkout(e, { order, name: `${boatName(id)} 广告位 ${AD_DAYS} 天${renew ? "（续租）" : ""}`, cents: AD_USD_CENTS, email: user.email,
      success: `${origin(req)}/?paid=${order}#boat-${id + 1}`, cancel: `${origin(req)}/?unpaid=${order}#boat-${id + 1}` });
    await e.DB.prepare("UPDATE boat_orders SET session_id = ? WHERE id = ?").bind(s.id, order).run();
    return json({ ok: true, url: s.url });
  } catch (err) {
    await e.DB.prepare("UPDATE boat_orders SET status = 'failed' WHERE id = ?").bind(order).run();
    if (!renew) await e.DB.prepare("UPDATE boats SET hold_by = NULL, hold_until = NULL WHERE id = ? AND hold_by = ?").bind(id, user.id).run();
    return json({ error: (err as Error).message }, 502);
  }
}

// 管理员下架，或广告主自己撤下（费用不退）
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const e = await env();
  const user = await userFromToken(e.DB, readCookie(req.headers.get("cookie"), SESSION_COOKIE));
  if (!user) return json({ error: "请先登录" }, 401);
  const admin = isAdminUser(e, user);
  const r = await e.DB.prepare(`UPDATE boats SET owner = NULL, owner_name = NULL, image = NULL, mime = NULL, mosaic = NULL, caption = NULL, expires_at = NULL, hidden = 0, flagged = 0 WHERE id = ?${admin ? "" : " AND owner = ?"}`)
    .bind(...(admin ? [id] : [id, user.id])).run();
  return r.meta.changes ? json({ ok: true, toast: "广告已撤下" }) : json({ error: "不能撤下别人的广告" }, 403);
}
