import { env, readCookie, userFromToken, SESSION_COOKIE, json } from "../../../lib/auth";
import { estatePrice, settle, type Estate, type EstateKind } from "../../../lib/estates";

type Row = { id: number; owner: string | null; owner_name: string | null; kind: EstateKind | null; name: string | null; price: number | null; wage: number | null; openings: number; till: number; visits: number; npc: number; settled_at: number | null; sign_ver: number; sign_hidden: number; has_sign: number };

export async function GET(req: Request) {
  const { DB } = await env();
  const user = await userFromToken(DB, readCookie(req.headers.get("cookie"), SESSION_COOKIE));
  const rows = (await DB.prepare("SELECT id, owner, owner_name, kind, name, price, wage, openings, till, visits, npc, settled_at, sign_ver, sign_hidden, sign IS NOT NULL AS has_sign FROM estates WHERE owner IS NOT NULL ORDER BY id").all<Row>()).results;
  const staff = (await DB.prepare("SELECT user_id, user_name, estate_id FROM estate_staff").all<{ user_id: string; user_name: string; estate_id: number }>()).results;
  const now = Date.now();
  const estates: Estate[] = rows.filter((r) => r.owner).map((r) => {
    const st = staff.filter((x) => x.estate_id === r.id).map((x) => ({ id: x.user_id, name: x.user_name }));
    const e: Estate = { id: r.id, price: estatePrice(r.id), ownerName: r.owner ? r.owner_name : null, kind: r.owner ? r.kind : null, name: r.owner ? r.name : null, sell: r.owner ? r.price : null,
      wage: r.owner ? r.wage : null, openings: r.owner ? r.openings : 0, staff: st, sign: r.has_sign && !r.sign_hidden ? r.sign_ver : 0 };
    if (r.owner && user && r.owner === user.id) {
      e.mine = true; e.visits = r.visits;
      if (r.kind && r.price) { const x = settle(r.id, r.kind, r.price, st.length, r.till, r.npc, r.settled_at ?? now, now); e.till = Math.round(x.till); e.npc = Math.round(x.npc); }
      else e.till = Math.round(r.till);
    }
    return e;
  });
  return json({ estates, me: user?.id ?? null });
}
