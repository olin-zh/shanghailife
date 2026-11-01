// 清除玩家数据：管理员清存档 / 删账号 / 清空全服，以及玩家自己注销，都走这里
import { flow } from "./ledger";

const PLAYER_ASSETS = (DB: D1Database, uid: string) => [
  DB.prepare("DELETE FROM estate_staff WHERE user_id = ? OR estate_id IN (SELECT id FROM estates WHERE owner = ?)").bind(uid, uid),
  DB.prepare("DELETE FROM estates WHERE owner = ?").bind(uid),
  DB.prepare("DELETE FROM plots WHERE owner = ?").bind(uid),
  DB.prepare("UPDATE shops SET owner = NULL, owner_name = NULL, kind = NULL, name = NULL, price = NULL, till = 0, sold = 0, npc = 0, settled_at = NULL, opened_at = NULL WHERE owner = ?").bind(uid),
  DB.prepare("UPDATE boats SET owner = NULL, owner_name = NULL, image = NULL, mime = NULL, mosaic = NULL, caption = NULL, expires_at = NULL, hidden = 0, flagged = 0 WHERE owner = ?").bind(uid),
  DB.prepare("DELETE FROM saves WHERE user_id = ?").bind(uid),
];

// 清掉一个玩家的游戏数据（存档、钱、地、店、广告位）；deleteAccount 为真时连账号一起删
export async function wipePlayer(DB: D1Database, uid: string, memo: string, deleteAccount = false) {
  const save = await DB.prepare("SELECT json_extract(data, '$.money') AS m FROM saves WHERE user_id = ?").bind(uid).first<{ m: number }>();
  if (save?.m) await flow(DB, uid, "gov", save.m, memo); // 余额收回市政府，账本平衡
  const extra = deleteAccount ? [DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(uid), DB.prepare("DELETE FROM users WHERE id = ?").bind(uid)] : [];
  await DB.batch([...PLAYER_ASSETS(DB, uid), ...extra]);
}

// 清空全服：所有存档、地、店、广告、订单、举报、账本，市政府储备回到 ¥1,000 万；可选删除非管理员账号
export async function wipeAll(DB: D1Database, deleteAccounts: boolean, keepEmails: string[]) {
  const stmts = [
    "DELETE FROM saves", "DELETE FROM plots", "DELETE FROM estate_staff", "DELETE FROM estate_reports", "DELETE FROM estates",
    "DELETE FROM boat_reports", "DELETE FROM boat_orders", "DELETE FROM ledger",
    "UPDATE boats SET owner = NULL, owner_name = NULL, image = NULL, mime = NULL, mosaic = NULL, caption = NULL, version = 0, expires_at = NULL, hidden = 0, flagged = 0, reviewed_ver = 0, hold_by = NULL, hold_until = NULL, updated_at = NULL",
    "UPDATE shops SET owner = NULL, owner_name = NULL, kind = NULL, name = NULL, price = NULL, till = 0, sold = 0, npc = 0, settled_at = NULL, opened_at = NULL",
    "UPDATE accounts SET balance = CASE id WHEN 'gov' THEN 10000000 ELSE 0 END",
  ].map((q) => DB.prepare(q));
  if (deleteAccounts) {
    const keep = keepEmails.length ? `WHERE lower(email) NOT IN (${keepEmails.map(() => "?").join(",")})` : "";
    stmts.push(DB.prepare(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users ${keep})`).bind(...keepEmails));
    stmts.push(DB.prepare(`DELETE FROM users ${keep}`).bind(...keepEmails));
  }
  await DB.batch(stmts);
}
