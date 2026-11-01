// 服务器端存档：读写都带版本号，防止两个请求同时改同一份存档时互相覆盖。
import { isState, type State } from "./game";

export async function loadSave(db: D1Database, uid: string) {
  const row = await db.prepare("SELECT data, version FROM saves WHERE user_id = ?").bind(uid).first<{ data: string; version: number }>();
  if (!row) return { state: null as State | null, version: -1 };
  const x = JSON.parse(row.data);
  return { state: isState(x) ? x : null, version: row.version };
}

async function write(db: D1Database, uid: string, state: State | null, version: number) {
  const data = JSON.stringify(state);
  if (version < 0) {
    const r = await db.prepare("INSERT INTO saves (user_id, data, updated_at, version) VALUES (?, ?, ?, 1) ON CONFLICT(user_id) DO NOTHING").bind(uid, data, Date.now()).run();
    return r.meta.changes === 1;
  }
  const r = await db.prepare("UPDATE saves SET data = ?, updated_at = ?, version = version + 1 WHERE user_id = ? AND version = ?").bind(data, Date.now(), uid, version).run();
  return r.meta.changes === 1;
}

// 读出存档 → 交给 fn 计算新存档 → 写回；版本冲突就重读重算，最多 10 次
export async function mutate<T>(db: D1Database, uid: string, fn: (s: State | null) => { state: State | null; out: T } | null) {
  for (let i = 0; i < 10; i++) {
    if (i) await new Promise((r) => setTimeout(r, 10 + Math.random() * 30 * i)); // 冲突后稍等再试
    const { state, version } = await loadSave(db, uid);
    const r = fn(state);
    if (!r) return null;
    if (r.state === state) return { state, out: r.out };
    if (await write(db, uid, r.state, version)) return { state: r.state, out: r.out };
  }
  throw new Error("存档繁忙，请重试");
}
