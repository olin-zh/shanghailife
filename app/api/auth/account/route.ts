// 账号管理：看资料、改昵称、改密码、退出所有设备、注销账号
import { wipePlayer } from "../../../../lib/wipe";
import { env, readCookie, userFromToken, SESSION_COOKIE, json, hashPassword, safeEqual, randomId, sessionCookie, isAdminUser } from "../../../../lib/auth";

type Row = { id: string; email: string; name: string; pass_hash: string; pass_salt: string; x_id: string | null; created_at: number };

export async function GET(req: Request) {
  const e = await env();
  const user = await userFromToken(e.DB, readCookie(req.headers.get("cookie"), SESSION_COOKIE));
  if (!user) return json({ error: "请先登录" }, 401);
  const r = await e.DB.prepare("SELECT id, email, name, pass_hash, pass_salt, x_id, created_at FROM users WHERE id = ?").bind(user.id).first<Row>();
  const sessions = (await e.DB.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND expires_at > ?").bind(user.id, Date.now()).first<{ n: number }>())?.n ?? 0;
  return json({ email: r!.email.startsWith("x:") ? null : r!.email, name: r!.name, x: !!r!.x_id, hasPassword: r!.pass_hash !== "!", createdAt: r!.created_at, sessions, admin: isAdminUser(e, user) });
}

export async function POST(req: Request) {
  const { DB } = await env();
  const token = readCookie(req.headers.get("cookie"), SESSION_COOKIE);
  const user = await userFromToken(DB, token);
  if (!user) return json({ error: "请先登录" }, 401);
  const b = (await req.json().catch(() => ({}))) as Record<string, string>;
  const r = (await DB.prepare("SELECT id, email, name, pass_hash, pass_salt, x_id, created_at FROM users WHERE id = ?").bind(user.id).first<Row>())!;
  const passOk = async (p: string) => r.pass_hash !== "!" && safeEqual(await hashPassword(String(p || ""), r.pass_salt), r.pass_hash);

  if (b.op === "name") { // 改昵称：地块、商店、游船上显示的名字一起改
    const name = String(b.name || "").replace(/\s+/g, " ").trim().slice(0, 16);
    if (!name) return json({ error: "昵称不能为空" }, 400);
    await DB.batch([
      DB.prepare("UPDATE users SET name = ? WHERE id = ?").bind(name, user.id),
      DB.prepare("UPDATE plots SET owner_name = ? WHERE owner = ?").bind(name, user.id),
      DB.prepare("UPDATE estates SET owner_name = ? WHERE owner = ?").bind(name, user.id),
      DB.prepare("UPDATE estate_staff SET user_name = ? WHERE user_id = ?").bind(name, user.id),
      DB.prepare("UPDATE shops SET owner_name = ? WHERE owner = ?").bind(name, user.id),
      DB.prepare("UPDATE boats SET owner_name = ? WHERE owner = ?").bind(name, user.id),
    ]);
    return json({ toast: "昵称改好了", user: { ...user, name } });
  }
  if (b.op === "password") { // 改密码；X 登录的账号第一次可以直接设密码。改完其他设备全部下线
    if (r.pass_hash !== "!" && !(await passOk(b.current))) return json({ error: "当前密码不对" }, 400);
    if (String(b.next || "").length < 8) return json({ error: "新密码至少 8 位" }, 400);
    const salt = randomId();
    await DB.prepare("UPDATE users SET pass_hash = ?, pass_salt = ? WHERE id = ?").bind(await hashPassword(String(b.next), salt), salt, user.id).run();
    await DB.prepare("DELETE FROM sessions WHERE user_id = ? AND token != ?").bind(user.id, token).run();
    return json({ toast: "密码改好了，其他设备已下线" });
  }
  if (b.op === "logout_all") {
    await DB.prepare("DELETE FROM sessions WHERE user_id = ? AND token != ?").bind(user.id, token).run();
    return json({ toast: "其他设备都已下线" });
  }
  if (b.op === "delete") { // 注销：要输入“注销”和密码（X 账号只要输入“注销”）；名下的地、店、广告位全部放回
    if (String(b.confirm || "").trim() !== "注销") return json({ error: "请输入“注销”两个字确认" }, 400);
    if (r.pass_hash !== "!" && !(await passOk(b.password))) return json({ error: "密码不对" }, 400);
    await wipePlayer(DB, user.id, "注销账号，余额上缴", true);
    return json({ toast: "账号已注销" }, 200, { "set-cookie": sessionCookie("", 0) });
  }
  return json({ error: "未知操作" }, 400);
}
