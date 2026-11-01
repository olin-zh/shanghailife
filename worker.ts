// Cloudflare Worker 入口：/api/ws 走实时多人房间，其余交给 Next.js（OpenNext）。
// @ts-ignore 构建后生成
import nextHandler from "./.open-next/worker.js";
import { DurableObject } from "cloudflare:workers";
import { mutate, loadSave } from "./lib/store";
import { flow, settleOp } from "./lib/ledger";
import { coop, receiveGift, sendGift, ACTS, isHome, PLACES as ALL, type PlaceId, type State } from "./lib/game";

type Env = { DB: D1Database; CITY: DurableObjectNamespace<CityRoom>; ASSETS: Fetcher };
type Player = { id: string; name: string; at: string; act?: string; color: number };

const GIFT_AMOUNTS = [8, 18, 88, 188];
const PLACES = new Set(Object.keys(ALL));

function cookie(h: string | null, name: string) {
  if (!h) return null;
  for (const p of h.split(";")) { const [k, ...v] = p.trim().split("="); if (k === name) return decodeURIComponent(v.join("=")); }
  return null;
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(req.url);
    // www 统一跳到根域名，登录状态和游客存档才不会分成两份
    if (url.hostname.startsWith("www.")) { url.hostname = url.hostname.slice(4); return Response.redirect(url.toString(), 301); }
    if (url.pathname === "/api/ws") {
      if (req.headers.get("upgrade") !== "websocket") return new Response("需要 WebSocket", { status: 426 });
      const token = cookie(req.headers.get("cookie"), "sl_session");
      const user = token
        ? await env.DB.prepare("SELECT u.id, u.name, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?")
            .bind(token).first<{ id: string; name: string; expires_at: number }>()
        : null;
      if (!user || user.expires_at < Date.now()) return new Response("请先登录", { status: 401 });
      const room = env.CITY.get(env.CITY.idFromName("shanghai"));
      const fwd = new Request(req, { headers: new Headers(req.headers) });
      fwd.headers.set("x-user-id", user.id);
      fwd.headers.set("x-user-name", encodeURIComponent(user.name));
      return room.fetch(fwd);
    }
    return nextHandler.fetch(req, env, ctx);
  },
};

// 整座城市一个房间；用休眠 WebSocket，空闲时不占资源。
export class CityRoom extends DurableObject<Env> {
  lastChat = new Map<string, number>();

  async fetch(req: Request) {
    const id = req.headers.get("x-user-id")!;
    const name = decodeURIComponent(req.headers.get("x-user-name") || "玩家");
    const at = (await loadSave(this.env.DB, id)).state?.at || "home"; // 位置以服务器存档为准
    // 同一账号只保留最新连接
    for (const ws of this.ctx.getWebSockets(id)) { try { ws.close(4000, "在别处登录"); } catch {} }
    const pair = new WebSocketPair();
    const me: Player = { id, name, at: PLACES.has(at) ? at : "home", color: hashColor(id) };
    this.ctx.acceptWebSocket(pair[1], [id]);
    pair[1].serializeAttachment(me);
    pair[1].send(JSON.stringify({ t: "hello", you: id, players: this.players() }));
    this.broadcast({ t: "join", p: me }, id);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  players(): Player[] {
    const seen = new Map<string, Player>();
    for (const ws of this.ctx.getWebSockets()) { const p = ws.deserializeAttachment() as Player | null; if (p) seen.set(p.id, p); }
    return [...seen.values()];
  }

  broadcast(msg: unknown, except?: string) {
    const s = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      const p = ws.deserializeAttachment() as Player | null;
      if (p && p.id === except) continue;
      try { ws.send(s); } catch {}
    }
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const me = ws.deserializeAttachment() as Player;
    let m: any;
    try { m = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw)); } catch { return; }
    if (m.t === "move") {
      const at = (await loadSave(this.env.DB, me.id)).state?.at;
      if (!at || at === me.at) return;
      me.at = at; me.act = undefined; ws.serializeAttachment(me);
      this.broadcast({ t: "move", id: me.id, at: me.at });
    } else if (m.t === "act" && typeof m.label === "string") {
      me.act = m.label.slice(0, 30); ws.serializeAttachment(me);
      this.broadcast({ t: "act", id: me.id, label: me.act }, me.id);
    } else if (m.t === "chat" && typeof m.text === "string") {
      const text = m.text.replace(/\s+/g, " ").trim().slice(0, 120);
      const now = Date.now();
      if (!text || now - (this.lastChat.get(me.id) || 0) < 1500) return;
      this.lastChat.set(me.id, now);
      this.broadcast({ t: "chat", id: me.id, name: me.name, at: me.at, text, ts: now });
    } else if (m.t === "wave" && typeof m.to === "string") {
      this.sendTo(m.to, { t: "wave", from: me.id, name: me.name });
    } else if ((m.t === "gift" || m.t === "invite") && typeof m.to === "string" && m.to !== me.id) {
      // 送红包 / 邀请一起做事：只能对同一地点的玩家发起，对方接受后才生效
      const other = this.player(m.to);
      if (!other || other.at !== me.at) return this.sendTo(me.id, { t: "notice", text: "对方不在这里了" });
      if (m.t === "gift" && !GIFT_AMOUNTS.includes(m.amount)) return;
      if (m.t === "invite" && !(Number.isInteger(m.i) && m.i >= 0 && m.i < 8)) return;
      const id = crypto.randomUUID().slice(0, 8);
      this.offers.set(id, { kind: m.t, from: me.id, fromName: me.name, to: other.id, toName: other.name, at: me.at, amount: m.amount, i: m.i, label: String(m.label || "").slice(0, 30), exp: Date.now() + 60_000 });
      this.sendTo(other.id, { t: m.t === "gift" ? "gift_offer" : "invite_offer", id, from: me.id, name: me.name, amount: m.amount, i: m.i, label: String(m.label || "").slice(0, 30) });
      this.sendTo(me.id, { t: "notice", text: `已发给${other.name}，等对方回应…` });
    } else if (m.t === "reply" && typeof m.id === "string") {
      const o = this.offers.get(m.id);
      if (!o || o.to !== me.id || o.exp < Date.now()) return this.sendTo(me.id, { t: "notice", text: "这个邀请已经过期了" });
      this.offers.delete(m.id);
      const from = this.player(o.from);
      if (!m.ok) return this.sendTo(o.from, { t: "notice", text: `${o.toName}婉拒了` });
      if (!from || from.at !== o.at || me.at !== o.at) return this.sendTo(me.id, { t: "notice", text: "对方已经走开了" });
      if (o.kind === "gift") {
        // 先扣发红包的人，成功后再给收的人加；两边存档都在服务器上改
        const amount = o.amount!;
        const paid = await mutate(this.env.DB, o.from, (s) => {
          if (!s || s.at !== o.at || s.money < amount) return { state: s, out: false };
          return { state: sendGift(s, amount, o.toName).state, out: true };
        });
        if (!paid?.out) { this.sendTo(o.from, { t: "notice", text: "红包没发出去：钱不够或已经离开" }); this.sendTo(o.to, { t: "notice", text: "红包没发成" }); return; }
        const got = await mutate(this.env.DB, o.to, (s) => (s ? { state: receiveGift(s, amount, o.fromName).state, out: true } : { state: s, out: false }));
        if (!got?.out) { // 收款方没有存档：退回
          const back = await mutate(this.env.DB, o.from, (s) => (s ? { state: { ...s, money: s.money + amount }, out: true } : { state: s, out: false }));
          this.sendTo(o.from, { t: "state", state: back?.state, toast: "对方还没开始游戏，红包退回了" }); return;
        }
        await flow(this.env.DB, o.from, o.to, amount, `红包 ${o.fromName} → ${o.toName}`);
        this.sendTo(o.from, { t: "state", state: paid.state, toast: `红包已送给${o.toName} 🧧` });
        this.sendTo(o.to, { t: "state", state: got.state, toast: `收到${o.fromName}的红包 ¥${amount} 🧧` });
      } else {
        // 两边都先检查一遍，再分别记账
        const [a, b] = await Promise.all([loadSave(this.env.DB, o.from), loadSave(this.env.DB, o.to)]);
        const okFor = (s: State | null) => { if (!s || s.at !== o.at) return false; const a = ACTS[s.at as PlaceId]?.[o.i!]; return !!a && !a[4] && !isHome(s.at as PlaceId) && (a[2] === 0 || s.money >= a[2]); };
        if (!okFor(a.state) || !okFor(b.state)) { this.sendTo(o.from, { t: "notice", text: "没法一起做：有人钱不够或已经离开" }); this.sendTo(o.to, { t: "notice", text: "没法一起做：有人钱不够或已经离开" }); return; }
        for (const [uid, pid, pname] of [[o.from, o.to, o.toName], [o.to, o.from, o.fromName]] as const) {
          let toast: string | undefined;
          const pre = (await loadSave(this.env.DB, uid)).state;
          const r = await mutate(this.env.DB, uid, (s) => { if (!okFor(s)) return { state: s, out: false }; const x = coop(s!, o.i!, pid, pname); toast = x.toast; return { state: x.state, out: true }; });
          if (r?.out) await settleOp(this.env.DB, uid, pre, r.state, `和${pname}一起${o.label}`);
          this.sendTo(uid, { t: "state", state: r?.state, toast: toast || `和${pname}一起行动！` });
        }
        this.broadcast({ t: "act", id: o.from, label: `和${o.toName}一起${o.label}` });
        this.broadcast({ t: "act", id: o.to, label: `和${o.fromName}一起${o.label}` });
      }
    }
  }

  offers = new Map<string, { kind: string; from: string; fromName: string; to: string; toName: string; at: string; amount?: number; i?: number; label: string; exp: number }>();
  player(id: string) { for (const ws of this.ctx.getWebSockets(id)) { const p = ws.deserializeAttachment() as Player | null; if (p) return p; } return null; }
  sendTo(id: string, msg: unknown) { const s = JSON.stringify(msg); for (const w of this.ctx.getWebSockets(id)) { try { w.send(s); } catch {} } }

  async webSocketClose(ws: WebSocket) { this.left(ws); }
  async webSocketError(ws: WebSocket) { this.left(ws); }
  left(ws: WebSocket) {
    const me = ws.deserializeAttachment() as Player | null;
    if (!me) return;
    const still = this.ctx.getWebSockets(me.id).some((w) => w !== ws && w.readyState === 1);
    if (!still) this.broadcast({ t: "leave", id: me.id });
  }
}

function hashColor(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const palette = [0xe0533d, 0x2f86c9, 0xe8a530, 0x4aa65a, 0x9a5cc4, 0xd4568a, 0x2fa8a0];
  return palette[h % palette.length];
}
