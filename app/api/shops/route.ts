import { env, readCookie, userFromToken, SESSION_COOKIE, json } from "../../../lib/auth";
import { SLOTS, settle, type Shop, type ShopKind } from "../../../lib/shops";

type Row = { id: number; owner: string | null; owner_name: string | null; kind: ShopKind | null; name: string | null; price: number | null; till: number; sold: number; npc: number; settled_at: number | null; opened_at: number | null };

export async function GET(req: Request) {
  const { DB } = await env();
  const user = await userFromToken(DB, readCookie(req.headers.get("cookie"), SESSION_COOKIE));
  const rows = (await DB.prepare("SELECT * FROM shops ORDER BY id").all<Row>()).results;
  const now = Date.now();
  const shops: Shop[] = rows.map((r) => {
    const base: Shop = { id: r.id, place: SLOTS[r.id].place, ownerName: r.owner ? r.owner_name : null, kind: r.owner ? r.kind : null, name: r.owner ? r.name : null, price: r.owner ? r.price : null };
    if (r.owner && user && r.owner === user.id && r.kind && r.price) {
      const st = settle(r.id, r.kind, r.price, r.till, r.npc, r.settled_at ?? now, now); // 只算给店主看，不写库
      Object.assign(base, { mine: true, till: Math.round(st.till), sold: r.sold, npc: Math.round(st.npc), openedAt: r.opened_at });
    }
    return base;
  });
  return json({ shops });
}
