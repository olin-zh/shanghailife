// Stripe 付款回调：付款成功就把广告挂上 / 续期；船位被别人占了就自动退款
import { env } from "../../../../lib/auth";
import { AD_DAYS } from "../../../../lib/boats";
import { refund, verify } from "../../../../lib/stripe";

type Order = { id: string; user_id: string; user_name: string | null; boat_id: number; kind: string; image: ArrayBuffer | null; mosaic: ArrayBuffer | null; mime: string | null; caption: string | null; status: string };

export async function POST(req: Request) {
  try { return await handle(req); } catch (err) { console.error("stripe webhook", err); return new Response(`error: ${(err as Error).message}`, { status: 500 }); }
}
async function handle(req: Request) {
  const e = await env();
  const body = await req.text();
  if (!(await verify(e, body, req.headers.get("stripe-signature")))) return new Response("bad signature", { status: 400 });
  const ev = JSON.parse(body) as { type: string; data: { object: any } };
  const s = ev.data.object;
  const orderId = s?.metadata?.order as string | undefined;
  if (!orderId) return new Response("ok");
  const o = await e.DB.prepare("SELECT id, user_id, user_name, boat_id, kind, image, mosaic, mime, caption, status FROM boat_orders WHERE id = ?").bind(orderId).first<Order>();
  if (!o || o.status !== "pending") return new Response("ok"); // 已处理过（Stripe 可能重发）
  const now = Date.now(), week = AD_DAYS * 86400_000;

  if (ev.type === "checkout.session.expired") {
    await e.DB.prepare("UPDATE boat_orders SET status = 'expired' WHERE id = ? AND status = 'pending'").bind(o.id).run();
    await e.DB.prepare("UPDATE boats SET hold_by = NULL, hold_until = NULL WHERE id = ? AND hold_by = ?").bind(o.boat_id, o.user_id).run();
    return new Response("ok");
  }
  if (ev.type !== "checkout.session.completed" || s.payment_status !== "paid") return new Response("ok");
  const claim = await e.DB.prepare("UPDATE boat_orders SET status = 'paid', paid_at = ?, payment_intent = ? WHERE id = ? AND status = 'pending'").bind(now, s.payment_intent ?? null, o.id).run();
  if (claim.meta.changes !== 1) return new Response("ok");

  let ok = false;
  if (o.kind === "renew") {
    ok = (await e.DB.prepare("UPDATE boats SET expires_at = MAX(COALESCE(expires_at, 0), ?) + ? WHERE id = ? AND owner = ?").bind(now, week, o.boat_id, o.user_id).run()).meta.changes === 1;
  } else {
    ok = (await e.DB.prepare("UPDATE boats SET owner = ?, owner_name = ?, image = ?, mime = ?, mosaic = ?, caption = ?, version = version + 1, expires_at = ?, hidden = 0, flagged = 0, hold_by = NULL, hold_until = NULL, updated_at = ? WHERE id = ? AND (hold_by = ? OR owner IS NULL OR expires_at IS NULL OR expires_at < ?)")
      .bind(o.user_id, o.user_name, o.image, o.mime, o.mosaic, o.caption, now + week, now, o.boat_id, o.user_id, now).run()).meta.changes === 1;
  }
  if (!ok && s.payment_intent) { // 船位没了：全额退款
    await refund(e, s.payment_intent).catch(() => {});
    await e.DB.prepare("UPDATE boat_orders SET status = 'refunded' WHERE id = ?").bind(o.id).run();
  } else await e.DB.prepare("UPDATE boat_orders SET image = NULL, mosaic = NULL WHERE id = ?").bind(o.id).run();
  return new Response("ok");
}
