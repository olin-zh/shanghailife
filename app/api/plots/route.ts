import { env, readCookie, userFromToken, SESSION_COOKIE, json } from "../../../lib/auth";
import { PLOT_COUNT, plotPrice, type Plot } from "../../../lib/plots";

// 全服地块情况：哪块卖掉了、卖给了谁
export async function GET(req: Request) {
  const { DB } = await env();
  const user = await userFromToken(DB, readCookie(req.headers.get("cookie"), SESSION_COOKIE));
  const rows = (await DB.prepare("SELECT id, owner, owner_name FROM plots ORDER BY id").all<{ id: number; owner: string | null; owner_name: string | null }>()).results;
  const by = new Map(rows.map((r) => [r.id, r]));
  const plots: Plot[] = Array.from({ length: PLOT_COUNT }, (_, id) => {
    const r = by.get(id);
    return { id, price: plotPrice(id), owner: r?.owner ? "x" : null, ownerName: r?.owner_name ?? null, mine: !!user && r?.owner === user.id };
  });
  return json({ plots });
}
