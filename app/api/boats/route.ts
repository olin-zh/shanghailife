import { env, readCookie, userFromToken, SESSION_COOKIE, json, isAdminUser } from "../../../lib/auth";
import type { Boat } from "../../../lib/boats";

// 所有游船的广告情况（不含图片本身）
export async function GET(req: Request) {
  const e = await env();
  const user = await userFromToken(e.DB, readCookie(req.headers.get("cookie"), SESSION_COOKIE));
  const now = Date.now();
  const rows = (await e.DB.prepare("SELECT id, owner, owner_name, caption, version, expires_at, hidden, flagged, hold_by, hold_until FROM boats ORDER BY id").all<{ id: number; owner: string | null; owner_name: string | null; caption: string | null; version: number; expires_at: number | null; hidden: number; flagged: number; hold_by: string | null; hold_until: number | null }>()).results;
  const boats: Boat[] = rows.map((r) => {
    const live = !!r.owner && (r.expires_at ?? 0) > now && !r.hidden;
    return { id: r.id, ownerName: live ? r.owner_name : null, caption: live ? r.caption : null, version: live ? r.version : 0, expiresAt: live ? r.expires_at : null, mine: live && !!user && r.owner === user.id, flagged: live && !!r.flagged, held: !live && !!r.hold_by && (r.hold_until ?? 0) > now && r.hold_by !== user?.id };
  });
  return json({ boats, admin: isAdminUser(e, user) });
}
