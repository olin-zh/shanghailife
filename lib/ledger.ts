// 账本：钱不凭空产生或消失，每笔都从一个账户转到另一个账户。
// 玩家账户就是存档里的 money；系统账户（市政府 gov、市场 market）的余额在 accounts 表。
export const SYS = { gov: "市政府", market: "市场" } as const;
export type Acct = string; // "gov" | "market" | 用户 id

export async function flow(DB: D1Database, src: Acct, dst: Acct, amount: number, memo: string) {
  amount = Math.round(amount);
  if (!amount) return;
  if (amount < 0) { [src, dst] = [dst, src]; amount = -amount; }
  const stmts = [DB.prepare("INSERT INTO ledger (ts, src, dst, amount, memo) VALUES (?, ?, ?, ?, ?)").bind(Date.now(), src, dst, amount, memo.slice(0, 60))];
  if (src in SYS) stmts.push(DB.prepare("UPDATE accounts SET balance = balance - ? WHERE id = ?").bind(amount, src));
  if (dst in SYS) stmts.push(DB.prepare("UPDATE accounts SET balance = balance + ? WHERE id = ?").bind(amount, dst));
  await DB.batch(stmts).catch(() => {});
}
// 一次游戏操作前后对比：多出来的税交给市政府，其余的钱和市场结算
export async function settleOp(DB: D1Database, uid: string, before: { money: number; taxPaid?: number } | null, after: { money: number; taxPaid?: number } | null, memo: string) {
  if (!before || !after) return;
  const tax = (after.taxPaid || 0) - (before.taxPaid || 0);
  const market = after.money - before.money + tax;
  if (market) await flow(DB, "market", uid, market, memo);
  if (tax > 0) await flow(DB, uid, "gov", tax, `个人所得税 · ${memo}`);
}
