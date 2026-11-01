import { mutate } from "../../../../lib/store";
import { flow } from "../../../../lib/ledger";
import { ENTRY_JOBS, GENDERS, START_GRANT, birthOk, newGame, type Gender, type JobId } from "../../../../lib/game";
import { env, hashPassword, randomId, createSession, sessionCookie, json } from "../../../../lib/auth";

export async function POST(req: Request) {
  const { email, password, name, gender, birth, job } = (await req.json().catch(() => ({}))) as Record<string, string>;
  const em = String(email || "").trim().toLowerCase();
  const nm = String(name || "").trim().slice(0, 16);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return json({ error: "邮箱格式不对" }, 400);
  if (String(password || "").length < 8) return json({ error: "密码至少 8 位" }, 400);
  if (!nm) return json({ error: "请填写昵称" }, 400);
  // 注册时顺便建角色：性别、出生日期、第一份工作
  if (!(gender in GENDERS)) return json({ error: "请选择性别" }, 400);
  if (!birthOk(birth)) return json({ error: "出生日期不对（要年满 16 岁）" }, 400);
  const j = (ENTRY_JOBS.includes(job as JobId) ? job : ENTRY_JOBS[0]) as JobId;
  const { DB } = await env();
  const exists = await DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(em).first();
  if (exists) return json({ error: "这个邮箱已经注册过了，请直接登录" }, 409);
  const id = randomId(), salt = randomId();
  await DB.prepare("INSERT INTO users (id, email, name, pass_hash, pass_salt, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, em, nm, await hashPassword(password, salt), salt, Date.now()).run();
  await mutate(DB, id, () => ({ state: newGame(nm.slice(0, 12), j, gender as Gender, birth), out: null }));
  await flow(DB, "gov", id, START_GRANT, "落户补贴");
  const s = await createSession(DB, id);
  return json({ user: { id, email: em, name: nm } }, 200, { "set-cookie": sessionCookie(s.token, s.maxAge) });
}
