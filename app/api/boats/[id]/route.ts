import { env, readCookie, userFromToken, SESSION_COOKIE, json } from "../../../../lib/auth";
import { mutate } from "../../../../lib/store";
import { flow } from "../../../../lib/ledger";
import { AD_DAYS, AD_MAX_BYTES, AD_MAX_PER_PLAYER, AD_PRICE, BOAT_COUNT, boatName, sniffImage } from "../../../../lib/boats";

const admins = (e: any) => String(e.ADMIN_EMAILS || "").split(",").map((s: string) => s.trim().toLowerCase()).filter(Boolean);

// 租船打广告 / 给自己的船换图。请求体是图片本身，说明文字放在 ?caption=
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 0 || id >= BOAT_COUNT) return json({ error: "没有这艘船" }, 400);
  const e = await env();
  const user = await userFromToken(e.DB, readCookie(req.headers.get("cookie"), SESSION_COOKIE));
  if (!user) return json({ error: "请先登录" }, 401);
  const buf = new Uint8Array(await req.arrayBuffer());
  if (!buf.length) return json({ error: "没有收到图片" }, 400);
  if (buf.length > AD_MAX_BYTES) return json({ error: "图片太大了（最多 300KB）" }, 413);
  const mime = sniffImage(buf);
  if (!mime) return json({ error: "只支持 JPG、PNG、WebP 图片" }, 415);
  const caption = (new URL(req.url).searchParams.get("caption") || "").replace(/\s+/g, " ").trim().slice(0, 40) || null;
  const now = Date.now();

  const cur = await e.DB.prepare("SELECT owner, expires_at, hidden FROM boats WHERE id = ?").bind(id).first<{ owner: string | null; expires_at: number | null; hidden: number }>();
  if (!cur) return json({ error: "没有这艘船" }, 404);
  const mineLive = cur.owner === user.id && (cur.expires_at ?? 0) > now && !cur.hidden;

  if (mineLive) { // 自己的船：免费换图，到期时间不变
    await e.DB.prepare("UPDATE boats SET image = ?, mime = ?, caption = ?, version = version + 1, updated_at = ? WHERE id = ? AND owner = ?").bind(buf, mime, caption, now, id, user.id).run();
    return json({ ok: true, toast: "广告图换好了" });
  }
  const active = await e.DB.prepare("SELECT COUNT(*) AS n FROM boats WHERE owner = ? AND expires_at > ? AND hidden = 0").bind(user.id, now).first<{ n: number }>();
  if ((active?.n ?? 0) >= AD_MAX_PER_PLAYER) return json({ error: `每人最多同时租 ${AD_MAX_PER_PLAYER} 艘船` }, 400);

  // 先抢船位（空船或已过期），再扣游戏币；扣不成就把船位放回去
  const exp = now + AD_DAYS * 86400_000;
  const claimed = await e.DB.prepare("UPDATE boats SET owner = ?, owner_name = ?, image = ?, mime = ?, caption = ?, version = version + 1, expires_at = ?, hidden = 0, updated_at = ? WHERE id = ? AND (owner IS NULL OR expires_at IS NULL OR expires_at < ? OR hidden = 1)")
    .bind(user.id, user.name, buf, mime, caption, exp, now, id, now).run().then((r) => r.meta.changes === 1);
  if (!claimed) return json({ error: "这艘船已经有人在打广告了" }, 409);
  let err: string | undefined;
  const paid = await mutate(e.DB, user.id, (s) => {
    if (!s) { err = "先开始游戏才能租船"; return { state: s, out: false }; }
    if (s.money < AD_PRICE) { err = `钞票不够，租一艘船要¥${AD_PRICE.toLocaleString()}`; return { state: s, out: false }; }
    const n = structuredClone(s); n.money -= AD_PRICE;
    n.log.unshift([`第${n.day}天`, `租下${boatName(id)}打广告，花了¥${AD_PRICE.toLocaleString()}，能挂 ${AD_DAYS} 天。`]); n.log = n.log.slice(0, 40);
    return { state: n, out: true };
  }).catch(() => null);
  if (!paid?.out) {
    await e.DB.prepare("UPDATE boats SET owner = NULL, owner_name = NULL, image = NULL, mime = NULL, caption = NULL, expires_at = NULL WHERE id = ? AND owner = ?").bind(id, user.id).run();
    return json({ error: err || "租船失败", state: paid?.state }, 400);
  }
  await flow(e.DB, user.id, "gov", AD_PRICE, `租${boatName(id)}打广告`);
  return json({ ok: true, state: paid.state, toast: `广告挂上${boatName(id)}了，能挂 ${AD_DAYS} 天 🚢` });
}

// 管理员下架，或广告主自己撤下
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const e = await env();
  const user = await userFromToken(e.DB, readCookie(req.headers.get("cookie"), SESSION_COOKIE));
  if (!user) return json({ error: "请先登录" }, 401);
  const isAdmin = admins(e).includes(user.email.toLowerCase());
  const r = await e.DB.prepare(`UPDATE boats SET owner = NULL, owner_name = NULL, image = NULL, mime = NULL, caption = NULL, expires_at = NULL, hidden = 0 WHERE id = ?${isAdmin ? "" : " AND owner = ?"}`)
    .bind(...(isAdmin ? [id] : [id, user.id])).run();
  return r.meta.changes ? json({ ok: true, toast: "广告已撤下" }) : json({ error: "不能撤下别人的广告" }, 403);
}
