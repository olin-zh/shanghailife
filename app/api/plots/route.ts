import { env, readCookie, userFromToken, SESSION_COOKIE, json } from "../../../lib/auth";
import type { Plot } from "../../../lib/plots";

// 全服已卖出的住宅格子：卖给了谁
export async function GET(req: Request) {
  const { DB } = await env();
  const user = await userFromToken(DB, readCookie(req.headers.get("cookie"), SESSION_COOKIE));
  const rows = (await DB.prepare("SELECT id, owner, owner_name FROM plots WHERE owner IS NOT NULL ORDER BY id").all<{ id: number; owner: string; owner_name: string | null }>()).results;
  const plots: Plot[] = rows.map((r) => ({ id: r.id, ownerName: r.owner_name || "玩家", mine: !!user && r.owner === user.id }));
  return json({ plots });
}
