// 管理员后台：全服账本、系统账户、调整市政府储备、下架店招牌
import { env, readCookie, userFromToken, SESSION_COOKIE, json, isAdminUser } from "../../../lib/auth";
import { flow, SYS } from "../../../lib/ledger";

async function guard(req: Request) {
  const e = await env();
  const user = await userFromToken(e.DB, readCookie(req.headers.get("cookie"), SESSION_COOKIE));
  return isAdminUser(e, user) ? { DB: e.DB, user: user! } : null;
}

export async function GET(req: Request) {
  const g = await guard(req); if (!g) return json({ error: "没有权限" }, 403);
  const { DB } = g;
  const accounts = (await DB.prepare("SELECT id, name, balance FROM accounts").all<{ id: string; name: string; balance: number }>()).results;
  const players = await DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(json_extract(data, '$.money')), 0) AS money FROM saves").first<{ n: number; money: number }>();
  const minted = await DB.prepare("SELECT COALESCE(SUM(CASE WHEN src = 'mint' THEN amount ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN dst = 'mint' THEN amount ELSE 0 END), 0) AS n FROM ledger").first<{ n: number }>();
  const rows = (await DB.prepare("SELECT l.ts, l.src, l.dst, l.amount, l.memo, us.name AS sn, ud.name AS dn FROM ledger l LEFT JOIN users us ON us.id = l.src LEFT JOIN users ud ON ud.id = l.dst ORDER BY l.id DESC LIMIT 100").all<{ ts: number; src: string; dst: string; amount: number; memo: string; sn: string | null; dn: string | null }>()).results;
  const nm = (id: string, n: string | null) => (SYS as Record<string, string>)[id] ?? (id === "mint" ? "货币发行" : n ?? "玩家");
  const signs = (await DB.prepare("SELECT id, owner_name, name, sign_ver FROM estates WHERE sign IS NOT NULL AND sign_hidden = 0 ORDER BY id").all<{ id: number; owner_name: string; name: string | null; sign_ver: number }>()).results;
  return json({ accounts, players, minted: minted?.n ?? 0, rows: rows.map((r) => ({ ts: r.ts, from: nm(r.src, r.sn), to: nm(r.dst, r.dn), amount: r.amount, memo: r.memo })), signs });
}

export async function POST(req: Request) {
  const g = await guard(req); if (!g) return json({ error: "没有权限" }, 403);
  const { DB } = g;
  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  if (b.op === "mint") { // 正数增发给市政府，负数从市政府回收
    const amount = Math.round(Number(b.amount));
    if (!Number.isFinite(amount) || !amount || Math.abs(amount) > 1e9) return json({ error: "金额不对" }, 400);
    const memo = String(b.memo || "").trim().slice(0, 40) || (amount > 0 ? "增发货币" : "回收货币");
    await flow(DB, "mint", "gov", amount, `管理员：${memo}`);
    return json({ toast: amount > 0 ? `市政府储备增加¥${amount.toLocaleString()}` : `市政府储备减少¥${(-amount).toLocaleString()}` });
  }
  if (b.op === "sign_off") {
    const r = await DB.prepare("UPDATE estates SET sign_hidden = 1 WHERE id = ? AND sign IS NOT NULL").bind(Number(b.id)).run();
    return r.meta.changes ? json({ toast: "招牌已下架" }) : json({ error: "没有这块招牌" }, 404);
  }
  return json({ error: "未知操作" }, 400);
}
