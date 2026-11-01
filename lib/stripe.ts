// Stripe：用 REST 接口建付款页、验证 Webhook 签名、退款。密钥放在 Cloudflare 加密变量里。
type E = { STRIPE_SECRET_KEY?: string; STRIPE_WEBHOOK_SECRET?: string };

export const stripeOn = (e: unknown) => !!(e as E).STRIPE_SECRET_KEY;

async function call(e: unknown, path: string, form: Record<string, string>) {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${(e as E).STRIPE_SECRET_KEY}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form),
  });
  const d = (await r.json()) as any;
  if (!r.ok) throw new Error(d?.error?.message || "Stripe 出错了");
  return d;
}

export function checkout(e: unknown, o: { order: string; name: string; cents: number; email: string; success: string; cancel: string }) {
  return call(e, "checkout/sessions", {
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(o.cents),
    "line_items[0][price_data][product_data][name]": o.name,
    "metadata[order]": o.order,
    client_reference_id: o.order,
    customer_email: o.email,
    success_url: o.success,
    cancel_url: o.cancel,
    expires_at: String(Math.floor(Date.now() / 1000) + 31 * 60),
  }) as Promise<{ id: string; url: string }>;
}

export const refund = (e: unknown, paymentIntent: string) => call(e, "refunds", { payment_intent: paymentIntent });

// Stripe-Signature: t=时间戳,v1=HMAC-SHA256(`${t}.${正文}`)
export async function verify(e: unknown, body: string, header: string | null) {
  const secret = (e as E).STRIPE_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t); if (!t || Math.abs(Date.now() / 1000 - t) > 600) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`)));
  const hex = [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
  const v1s = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  return v1s.some((v) => v.length === hex.length && [...v].every((c, i) => c === hex[i]));
}
