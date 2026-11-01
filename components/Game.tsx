"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createCity, type City, type Other } from "../lib/city";
import { plotName, type Plot } from "../lib/plots";
import { AD_DAYS, AD_PRICE, BOAT_COUNT, boatName, type Boat } from "../lib/boats";
import { DEPOSIT, KINDS, SLOTS, npcPerHour, slotAt, type Shop, type ShopKind } from "../lib/shops";
import { actsAt, homeOf, isHome, HOMES, GIGS, gigHint, jobTitle, lvOf, nextLvXp, LV_XP, weeklyCost, GIFT_AMOUNTS, JOBS, NPCS, PLACES, act, clock, coopable, isState, mood, newGame, travel, trip, type JobId, type PlaceId, type State } from "../lib/game";

type User = { id: string; email: string; name: string };
type Chat = { id: string; name: string; at: PlaceId; text: string; ts: number };
type Offer = { kind: "gift" | "invite"; id: string; name: string; amount?: number; label?: string };
const LOCAL = "shanghailife.v2";

export default function Game() {
  const mapRef = useRef<HTMLDivElement>(null);
  const city = useRef<City | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [s, setS] = useState<State | null>(null);
  const [sel, setSel] = useState<PlaceId | null>(null);
  const [panel, setPanel] = useState<"friends" | "log" | "help" | "chat" | "auth" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [others, setOthers] = useState<Record<string, Other>>({});
  const [chats, setChats] = useState<Chat[]>([]);
  const [online, setOnline] = useState<"off" | "connecting" | "on">("off");
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [peer, setPeer] = useState<string | null>(null);
  const [xOn, setXOn] = useState(false);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [boats, setBoats] = useState<Boat[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const loadShops = useCallback(() => { fetch("/api/shops").then((r) => r.json() as Promise<any>).then((d) => { if (Array.isArray(d.shops)) setShops(d.shops); }).catch(() => {}); }, []);
  const [isAdmin, setIsAdmin] = useState(false);
  const [boatSel, setBoatSel] = useState<number | null>(null);
  const loadBoats = useCallback(() => { fetch("/api/boats").then((r) => r.json() as Promise<any>).then((d) => { if (Array.isArray(d.boats)) { setBoats(d.boats); setIsAdmin(!!d.admin); } }).catch(() => {}); }, []);
  const [sellAsk, setSellAsk] = useState(false);
  const loadPlots = useCallback(() => { fetch("/api/plots").then((r) => r.json() as Promise<any>).then((d) => { if (Array.isArray(d.plots)) setPlots(d.plots); }).catch(() => {}); }, []);
  const [offer, setOffer] = useState<Offer | null>(null);
  const send = (m: unknown) => ws.current?.readyState === 1 && ws.current.send(JSON.stringify(m));

  const say = useCallback((t: string) => { setToast(t); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 2800); }, []);

  // 地图
  useEffect(() => {
    if (!mapRef.current) return;
    city.current = createCity(mapRef.current, (id) => { setSel(id); setPeer(null); city.current?.focus(id); }, (id) => { setPeer(id); setSel(null); }, (id) => { setBoatSel(id); });
    return () => city.current?.dispose();
  }, [say]);

  // 读取登录状态和存档
  useEffect(() => {
    let local: State | null = null;
    try { const x = JSON.parse(localStorage.getItem(LOCAL) || "null"); if (isState(x)) local = x; } catch {}
    setS(local);
    fetch("/api/auth/me").then((r) => r.json() as Promise<any>).then((d) => { setUser(d.user ?? null); setXOn(!!d.x); }).catch(() => setUser(null));
    const le = new URLSearchParams(location.search).get("login_error");
    if (le) { say(({ x_off: "X 登录还没开通", x_cancel: "侬取消了 X 登录", x_state: "登录超时了，请再试一次", x_token: "X 授权失败，请再试一次", x_user: "读取 X 账号信息失败" } as Record<string, string>)[le] || "登录失败"); history.replaceState(null, "", "/"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 登录后以服务器存档为准；没有服务器存档但有游客存档，就导入（钱包重置）
  const [busy, setBusy] = useState(false);
  const api = useCallback(async (body: Record<string, unknown>) => {
    const r = await fetch("/api/game", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const d = r ? ((await r.json().catch(() => ({}))) as any) : { error: "网络出错了" };
    if ("state" in d) setS(isState(d.state) ? d.state : null);
    if (d.error) say(d.error); else if (d.toast) say(d.toast);
    return r?.ok ? d : null;
  }, [say]);
  useEffect(() => {
    if (user === undefined) return;
    if (!user) { // 退出登录：回到游客存档
      try { const x = JSON.parse(localStorage.getItem(LOCAL) || "null"); setS(isState(x) ? x : null); } catch { setS(null); }
      return;
    }
    fetch("/api/game").then((r) => r.json() as Promise<any>).then(async (d) => {
      if (isState(d.state)) return setS(d.state);
      let local: unknown = null;
      try { local = JSON.parse(localStorage.getItem(LOCAL) || "null"); } catch {}
      if (isState(local)) { await api({ op: "import", save: local }); say("已导入游客存档，钱包从 ¥1,500 重新开始"); }
      else setS(null);
    }).catch(() => {});
  }, [user, api, say]);

  // 地块：进来先拉一次，之后每 20 秒刷新，看看别人买了哪块
  useEffect(() => { loadPlots(); const h = setInterval(loadPlots, 20000); return () => clearInterval(h); }, [loadPlots, user]);
  useEffect(() => { city.current?.setPlots(plots); }, [plots]);
  useEffect(() => { loadBoats(); const h = setInterval(loadBoats, 30000); return () => clearInterval(h); }, [loadBoats, user]);
  useEffect(() => { city.current?.setBoats(boats); }, [boats]);
  useEffect(() => { loadShops(); const h = setInterval(loadShops, 20000); return () => clearInterval(h); }, [loadShops, user]);
  useEffect(() => { city.current?.setShops(shops); }, [shops]);
  const shopOp = async (id: number, body: Record<string, unknown>) => {
    setBusy(true);
    const r = await fetch(`/api/shops/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const d = r ? ((await r.json().catch(() => ({}))) as any) : { error: "网络出错了" };
    setBusy(false);
    if ("state" in d && d.state !== undefined) setS(isState(d.state) ? d.state : null);
    if (d.error) say(d.error); else if (d.toast) say(d.toast);
    loadShops(); return r?.ok;
  };
  // 分享链接 …/#boat-12 直接打开那艘船的广告
  useEffect(() => {
    const open = () => { const m = location.hash.match(/^#boat-(\d+)$/); if (m) setBoatSel(Math.max(0, Math.min(BOAT_COUNT - 1, Number(m[1]) - 1))); };
    open(); addEventListener("hashchange", open); return () => removeEventListener("hashchange", open);
  }, []);

  // 游客存档只存在本地浏览器
  useEffect(() => {
    if (user || !s) return;
    try { localStorage.setItem(LOCAL, JSON.stringify(s)); } catch {}
  }, [s, user]);

  // 实时多人
  useEffect(() => {
    if (!user || !s) return;
    let closed = false, retry = 1000;
    const connect = () => {
      setOnline("connecting");
      const sock = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws`);
      ws.current = sock;
      sock.onopen = () => { setOnline("on"); retry = 1000; };
      sock.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.t === "hello") setOthers(Object.fromEntries(m.players.filter((p: Other) => p.id !== user.id).map((p: Other) => [p.id, p])));
        else if (m.t === "join" && m.p.id !== user.id) setOthers((o) => ({ ...o, [m.p.id]: m.p }));
        else if (m.t === "leave") setOthers((o) => { const n = { ...o }; delete n[m.id]; return n; });
        else if (m.t === "move" && m.id !== user.id) setOthers((o) => (o[m.id] ? { ...o, [m.id]: { ...o[m.id], at: m.at, act: undefined } } : o));
        else if (m.t === "act") setOthers((o) => (o[m.id] ? { ...o, [m.id]: { ...o[m.id], act: m.label } } : o));
        else if (m.t === "chat") { setChats((c) => [...c.slice(-49), m]); city.current?.bubble(m.id === user.id ? "me" : m.id, m.text); }
        else if (m.t === "wave") say(`${m.name} 向侬挥手 👋`);
        else if (m.t === "notice") say(m.text);
        else if (m.t === "gift_offer") setOffer({ kind: "gift", id: m.id, name: m.name, amount: m.amount });
        else if (m.t === "invite_offer") setOffer({ kind: "invite", id: m.id, name: m.name, label: m.label });
        else if (m.t === "state") { if ("state" in m) setS(isState(m.state) ? m.state : null); if (m.toast) say(m.toast); }
      };
      sock.onclose = (e) => {
        setOnline("off"); setOthers({});
        if (e.code === 4000) { say("账号在别处登录了"); return; }
        if (!closed) setTimeout(connect, (retry = Math.min(retry * 2, 15000)));
      };
    };
    connect();
    return () => { closed = true; ws.current?.close(); ws.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, !!s]);

  // 把自己和别人画到地图上
  useEffect(() => {
    const list: Other[] = Object.values(others);
    if (s) list.push({ id: "me", name: s.name, at: s.at, color: 0xc4472f });
    city.current?.setPlayers(list);
    city.current?.setHere(s?.at ?? null);
    city.current?.setMine(s ? homeOf(s) : null);
  }, [others, s]);
  useEffect(() => { city.current?.setSelected(sel); }, [sel]);

  const after = (st: State | null, label?: string, moved?: PlaceId) => {
    if (moved && st?.at === moved) { send({ t: "move" }); city.current?.focus(moved); }
    if (label) send({ t: "act", label });
  };
  // 登录玩家：交给服务器算；游客：本地算
  const go = async (op: { op: "travel"; to: PlaceId } | { op: "act"; i: number }) => {
    if (!s || busy) return;
    if (user) {
      setBusy(true); const d = await api(op); setBusy(false);
      if (d) after(d.state, d.label, op.op === "travel" ? op.to : undefined);
      return;
    }
    const r = op.op === "travel" ? travel(s, op.to) : act(s, op.i);
    setS(r.state); if (r.toast) say(r.toast);
    after(r.state, r.label, op.op === "travel" ? op.to : undefined);
  };

  const here = sel ? Object.values(others).filter((o) => o.at === sel) : [];
  const status = s ? [["精力", s.energy], ["肚皮", s.hunger], ["开心", s.fun], ["社交", s.social]] as const : [];

  return (
    <>
      <div className="mapwrap" ref={mapRef} />

      <header className="top pill">
        <span className="brand">🏮 上海生活</span>
        {s ? <span className="meta"><b>{clock(s)}</b> 第{s.day}天 · 心情 <b>{mood(s)}</b></span> : <span className="meta">拖动地图逛一逛，点建筑看看能做啥</span>}
        {user ? (
          <span className={"net " + online} title={online === "on" ? "已连线" : "未连线"}>{online === "on" ? `● ${Object.keys(others).length + 1} 人在线` : "○ 连线中"}</span>
        ) : user === null ? (
          <button className="btn primary" onClick={() => setPanel("auth")}>登录 / 注册</button>
        ) : null}
      </header>

      <nav className="chips">
        <button className="pill" onClick={() => { setSel("sjxc"); setPeer(null); city.current?.focus("sjxc"); }}>🏘️ 松江买地 · 余{plots.filter((p) => !p.ownerName).length}块</button>
        <button className="pill" onClick={() => setPanel(panel === "chat" ? null : "chat")}>💬 聊天</button>
        <button className="pill" onClick={() => setPanel(panel === "friends" ? null : "friends")}>🤝 朋友</button>
        <button className="pill" onClick={() => setPanel(panel === "log" ? null : "log")}>📜 日脚</button>
        <button className="pill" onClick={() => setPanel(panel === "help" ? null : "help")}>❓ 怎么玩</button>
      </nav>

      <section className="bottom">{s ? (
        <>
          <div className="who"><b>{s.name} · {jobTitle(s)}</b><span className="money" style={{ color: s.money < 0 ? "var(--red)" : undefined }}>¥{s.money.toLocaleString()}</span></div>
          <div className="career">
            <span>Lv{lvOf(s)}</span>
            <div className="bar"><i style={{ width: (nextLvXp(s) == null ? 100 : Math.min(100, (((s.xp || 0) - LV_XP[lvOf(s) - 1]) / (nextLvXp(s)! - LV_XP[lvOf(s) - 1])) * 100)) + "%" }} /></div>
            <span className="sub">{nextLvXp(s) == null ? "已到顶级" : `经验 ${s.xp || 0}/${nextLvXp(s)}`} · 每周开销¥{weeklyCost(s)}</span>
          </div>
          <div className="stats">{status.map(([l, v]) => <div className="st" key={l}>{l} {Math.round(v)}<div className="bar"><i className={v < 25 ? "low" : ""} style={{ width: v + "%" }} /></div></div>)}</div>
          <div className="last">{s.log[0]?.[1]}</div>
        </>
      ) : <Start onStart={(n, j) => { if (user) api({ op: "new", name: n, job: j }); else setS(newGame(n, j)); setSel("home"); }} />}</section>

      {sel && (
        <aside className="sheet">
          <button className="x" aria-label="关闭" onClick={() => setSel(null)}>✕</button>
          <h2>{PLACES[sel].ic} {PLACES[sel].name}</h2>
          <p className="sub">{PLACES[sel].sub}{s?.at === sel ? " · 侬在这里" : ""}{s && isHome(sel) && homeOf(s) === sel ? " · 🔑 侬的家" : ""}</p>
          {isHome(sel) && <p className="sub">{HOMES[sel].note}{HOMES[sel].perk.energy ? `；在这里睡觉额外精力+${HOMES[sel].perk.energy}` : ""}</p>}
          <p>{PLACES[sel].desc}</p>
          {here.length > 0 && <p className="sub">这里还有：{here.map((o) => o.name).join("、")}</p>}
          {slotAt(sel) >= 0 && shops[slotAt(sel)] && <ShopBox shop={shops[slotAt(sel)]} here={!!s && s.at === sel} user={user} money={s?.money ?? 0} busy={busy} onOp={(b) => shopOp(slotAt(sel), b)} onLogin={() => setPanel("auth")} />}
          {sel === "sjxc" && (
            <div className="plots">
              <p className="sub">在售 {plots.filter((p) => !p.ownerName).length} / {plots.length} 块。买下就能住，不用交房租；每人限购一块，转卖回收九成。</p>
              <div className="lotgrid">{plots.map((p) => {
                const can = !!user && !!s && s.at === "sjxc" && s.ownPlot == null && !p.ownerName;
                return (
                  <button key={p.id} className={"lotbtn" + (p.ownerName ? " sold" : "") + (p.mine ? " mine" : "")} disabled={!can || busy || s!.money < p.price}
                    onClick={async () => { setBusy(true); const d = await api({ op: "buy", id: p.id }); setBusy(false); loadPlots(); if (d) after(d.state, d.label); }}
                    title={p.ownerName ? `${plotName(p.id)} · ${p.ownerName}家` : `${plotName(p.id)} · ¥${p.price.toLocaleString()}`}>
                    <b>{plotName(p.id)}</b><span>{p.ownerName ? (p.mine ? "🔑 我家" : p.ownerName) : `¥${(p.price / 10000).toFixed(1)}万`}</span>
                  </button>);
              })}</div>
              {!user && <p className="sub">登录后才能买地。</p>}
              {user && s && s.at !== "sjxc" && s.ownPlot == null && <p className="sub">先坐过来，才能买地。</p>}
              {user && s?.ownPlot != null && (sellAsk
                ? <div className="row2"><span className="sub">卖掉{plotName(s.ownPlot)}，到手九成？</span><button className="btn ghost" onClick={() => setSellAsk(false)}>算了</button><button className="btn primary" disabled={busy} onClick={async () => { setSellAsk(false); setBusy(true); await api({ op: "sell" }); setBusy(false); loadPlots(); }}>确定卖</button></div>
                : <button className="link" onClick={() => setSellAsk(true)}>卖掉我的地</button>)}
            </div>
          )}
          {!s ? <p className="sub">先在下面起个名字，开始游戏。</p> : s.at !== sel ? (
            <button className="go" disabled={busy} onClick={() => go({ op: "travel", to: sel })}>{s.money < trip(s.at, sel).cost && sel === homeOf(s) ? `🚶 没钱坐地铁，走回家 · ${Math.round(trip(s.at, sel).mins * 3 / 60)}小时` : `🚇 坐过去 · ¥${trip(s.at, sel).cost} · ${trip(s.at, sel).mins}分钟`}</button>
          ) : (
            <div className="acts">{actsAt(s, sel).map((a, i) => (
              <button key={i} className="act" disabled={busy || (a[2] > 0 && s.money < a[2])} onClick={() => go({ op: "act", i })}>
                <span>{a[0]}{a[4] === "gig" && (() => { const [pl, k] = String(a[5]).split(":"); const g = GIGS[pl as PlaceId]?.[Number(k)]; return g ? <em className="hint">{gigHint(g)}</em> : null; })()}</span>
                <small>{a[1] >= 60 ? (a[1] / 60).toFixed(a[1] % 60 ? 1 : 0) + "小时" : a[1] + "分"}{a[2] ? " · ¥" + a[2] : ""}</small>
              </button>))}</div>
          )}
        </aside>
      )}

      {panel && (
        <aside className="panel">
          <button className="x" aria-label="关闭" onClick={() => setPanel(null)}>✕</button>
          {panel === "auth" && <Auth xOn={xOn} onDone={(u) => { setUser(u); setPanel(null); say(`欢迎，${u.name}`); }} />}
          {panel === "help" && <><h2>怎么玩</h2><p>拖动地图看看上海，滚轮或右下角按钮缩放。点建筑上的图标查看能做啥，不在那里就先坐地铁过去，过江更贵。</p><p>上班赚钞票，吃饭困觉保持状态，多和人来往交朋友。每30天交一次房租，亭子间¥2,800；有钱了可以去看房搬家，好房子睡得更香，但房租也更贵。去张江面试能换高薪工作。</p><p>登录后存档会存在云端，还能在地图上看到其他玩家、聊天、点名字牌向对方挥手。</p></>}
          {panel === "log" && <><h2>日脚</h2>{s ? s.log.map(([t, x], i) => <p key={i}><span className="t">{t}</span>{x}</p>) : <p>先开始游戏吧。</p>}</>}
          {panel === "friends" && <><h2>朋友</h2>{s && Object.keys(s.friends).length ? Object.entries(s.friends).map(([k, v]) => <p key={k}>{NPCS[k].name} <span className="t">· {v >= 60 ? "好朋友" : v >= 30 ? "熟人" : "认得"} {v}</span></p>) : <p>还没认得人。去城隍庙、武康路或永康路转转。</p>}
            {s?.pals && Object.keys(s.pals).length > 0 && <><h2 style={{ marginTop: 8 }}>玩家朋友</h2>{Object.entries(s.pals).map(([k, v]) => <p key={k}>{v.name} <span className="t">· 一起做过 {v.n} 次事{others[k] ? " · 在线" : ""}</span></p>)}</>}
            {Object.keys(others).length > 0 && <><h2 style={{ marginTop: 8 }}>在线玩家</h2>{Object.values(others).map((o) => <p key={o.id}><button className="link" style={{ textDecoration: "none", color: "var(--ink)", fontSize: 13 }} onClick={() => { setPeer(o.id); setSel(null); }}>{o.name}</button> <span className="t">· 在{PLACES[o.at].name}</span></p>)}</>}</>}
          {panel === "chat" && <ChatBox user={user} chats={chats} online={online === "on"} onLogin={() => setPanel("auth")} onSend={(t) => ws.current?.send(JSON.stringify({ t: "chat", text: t }))} />}
          {user && panel !== "auth" && panel !== "chat" && <button className="link" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); setUser(null); setPanel(null); }}>退出登录（{user.email}）</button>}
        </aside>
      )}

      {peer && others[peer] && s && (
        <aside className="sheet peer">
          <button className="x" aria-label="关闭" onClick={() => setPeer(null)}>✕</button>
          <h2>🙂 {others[peer].name}</h2>
          <p className="sub">在{PLACES[others[peer].at].name}{others[peer].act ? ` · ${others[peer].act}` : ""}{s.pals?.[peer] ? ` · 一起做过 ${s.pals[peer].n} 次事` : ""}</p>
          <button className="act" onClick={() => { send({ t: "wave", to: peer }); say("已经向对方挥手 👋"); }}><span>👋 挥手打招呼</span></button>
          {others[peer].at !== s.at ? <p className="sub">走到同一个地方，才能送红包或一起做事。</p> : <>
            <p className="sub">送红包（对方接受后从侬这里扣钱）</p>
            <div className="gifts">{GIFT_AMOUNTS.map((a) => <button key={a} className="gift" disabled={s.money < a} onClick={() => send({ t: "gift", to: peer, amount: a })}>🧧 ¥{a}</button>)}</div>
            <p className="sub">邀请一起做（双方都多加社交和开心）</p>
            <div className="acts">{coopable(s.at).map((c) => <button key={c.i} className="act" disabled={c.cost > 0 && s.money < c.cost} onClick={() => send({ t: "invite", to: peer, i: c.i, label: c.label })}><span>🤝 一起{c.label}</span>{c.cost ? <small>各付¥{c.cost}</small> : null}</button>)}</div>
          </>}
        </aside>
      )}

      {boatSel != null && boats[boatSel] && (
        <BoatView boat={boats[boatSel]} user={user} hasGame={!!s} money={s?.money ?? 0} admin={isAdmin} onClose={() => setBoatSel(null)}
          onDone={(d) => { if (d.state !== undefined) setS(isState(d.state) ? d.state : null); if (d.toast) say(d.toast); if (d.error) say(d.error); loadBoats(); }}
          onLogin={() => { setBoatSel(null); setPanel("auth"); }} />
      )}

      {offer && (
        <div className="offer" role="dialog" aria-label="邀请">
          <p>{offer.kind === "gift" ? <>🧧 <b>{offer.name}</b> 给侬发了一个 <b>¥{offer.amount}</b> 红包</> : <>🤝 <b>{offer.name}</b> 邀请侬一起<b>{offer.label}</b></>}</p>
          <div className="row">
            <button className="btn ghost" onClick={() => { send({ t: "reply", id: offer.id, ok: false }); setOffer(null); }}>不了</button>
            <button className="btn primary" onClick={() => { send({ t: "reply", id: offer.id, ok: true }); setOffer(null); }}>{offer.kind === "gift" ? "收下" : "好呀"}</button>
          </div>
        </div>
      )}

      <div className="zoom"><button aria-label="放大" onClick={() => city.current?.zoomBy(1.3)}>＋</button><button aria-label="缩小" onClick={() => city.current?.zoomBy(1 / 1.3)}>－</button></div>
      {s && <ResetButton onReset={() => { setSel(null); if (user) api({ op: "reset" }); else { try { localStorage.removeItem(LOCAL); } catch {} setS(null); } }} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}

function Start({ onStart }: { onStart: (name: string, job: JobId) => void }) {
  const [name, setName] = useState("小张");
  const [job, setJob] = useState<JobId>("coder");
  return (
    <>
      <div style={{ fontWeight: 700, fontSize: 15 }}>刚到上海，从一间亭子间开始。</div>
      <input id="nm" value={name} maxLength={12} onChange={(e) => setName(e.target.value)} aria-label="名字" />
      <div className="jobs">{(Object.keys(JOBS) as JobId[]).filter((k) => k !== "engineer").map((k) => (
        <button key={k} aria-pressed={k === job} onClick={() => setJob(k)}>{JOBS[k].ic} {JOBS[k].title}<br /><span className="sub">日薪¥{JOBS[k].pay}</span></button>
      ))}</div>
      <button className="big" onClick={() => onStart(name.trim() || "小张", job)}>开始过日脚</button>
    </>
  );
}

function Auth({ onDone, xOn }: { onDone: (u: User) => void; xOn: boolean }) {
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setErr(""); setBusy(true);
    const f = new FormData(e.currentTarget);
    const r = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(f)) }).catch(() => null);
    setBusy(false);
    if (!r) return setErr("网络出错了，请稍后再试");
    const d = (await r.json()) as any;
    if (!r.ok) return setErr(d.error || "出错了");
    onDone(d.user);
  };
  return (
    <form className="auth" onSubmit={submit}>
      <div className="tabs"><button type="button" aria-pressed={mode === "signup"} onClick={() => setMode("signup")}>创建账号</button><button type="button" aria-pressed={mode === "login"} onClick={() => setMode("login")}>登录</button></div>
      {mode === "signup" && <label>昵称<input name="name" id="au-name" maxLength={16} required placeholder="地图上显示的名字" /></label>}
      <label>邮箱<input name="email" id="au-email" type="email" required autoComplete="email" /></label>
      <label>密码<input name="password" id="au-pass" type="password" minLength={8} required autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="至少 8 位" /></label>
      {err && <p className="err">{err}</p>}
      <button className="big" disabled={busy}>{busy ? "请稍等…" : mode === "login" ? "登录" : "创建账号并开始"}</button>
      {xOn && <a className="xbtn" href="/api/auth/x">用 𝕏 账号登录</a>}
      <p className="sub">注册即表示同意 <a href="/terms">用户协议</a> 和 <a href="/privacy">隐私政策</a>。</p>
    </form>
  );
}

function ChatBox({ user, chats, online, onSend, onLogin }: { user: User | null | undefined; chats: Chat[]; online: boolean; onSend: (t: string) => void; onLogin: () => void }) {
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [chats.length]);
  if (!user) return <><h2>聊天</h2><p>登录后可以和地图上的其他玩家聊天。</p><button className="big" onClick={onLogin}>登录 / 注册</button></>;
  return (
    <>
      <h2>全城聊天</h2>
      <div className="chatlog">{chats.length ? chats.map((c, i) => <p key={i}><b>{c.name}</b> <span className="t">@{PLACES[c.at]?.name}</span><br />{c.text}</p>) : <p className="sub">还没人说话，打个招呼吧。</p>}<div ref={end} /></div>
      <form className="chatform" onSubmit={(e) => { e.preventDefault(); const t = text.trim(); if (!t || !online) return; onSend(t); setText(""); }}>
        <input id="chat-input" value={text} maxLength={120} onChange={(e) => setText(e.target.value)} placeholder={online ? "说点啥…" : "连线中…"} />
        <button className="btn primary" disabled={!online}>发送</button>
      </form>
    </>
  );
}

function ResetButton({ onReset }: { onReset: () => void }) {
  const [c, setC] = useState(false);
  useEffect(() => { if (!c) return; const h = setTimeout(() => setC(false), 3000); return () => clearTimeout(h); }, [c]);
  return <button className="reset pill" onClick={() => (c ? (onReset(), setC(false)) : setC(true))}>{c ? "再点一次确认重新开始" : "重新开始"}</button>;
}

// 把图片缩放裁成 2:1 的 JPEG（最大 640×320），顺便去掉照片里的定位等信息
async function toAdJpeg(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error("读不了这张图片")); i.src = url; });
    const W = 640, H = 320, c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d")!; g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
    const k = Math.max(W / img.width, H / img.height), w = img.width * k, h = img.height * k;
    g.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    for (const q of [0.86, 0.75, 0.6, 0.45]) { const b = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", q)); if (b && b.size <= 290 * 1024) return b; }
    throw new Error("图片压缩后还是太大");
  } finally { URL.revokeObjectURL(url); }
}

function BoatView({ boat, user, hasGame, money, admin, onClose, onDone, onLogin }: {
  boat: Boat; user: User | null | undefined; hasGame: boolean; money: number; admin: boolean;
  onClose: () => void; onDone: (d: any) => void; onLogin: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const live = !!boat.ownerName;
  useEffect(() => { if (!file) { setPreview(null); return; } const u = URL.createObjectURL(file); setPreview(u); return () => URL.revokeObjectURL(u); }, [file]);
  const daysLeft = boat.expiresAt ? Math.max(0, Math.ceil((boat.expiresAt - Date.now()) / 86400000)) : 0;
  const upload = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const blob = await toAdJpeg(file);
      const r = await fetch(`/api/boats/${boat.id}?caption=${encodeURIComponent(caption)}`, { method: "POST", headers: { "content-type": "image/jpeg" }, body: blob });
      const d = await r.json().catch(() => ({ error: "上传失败" }));
      onDone(d); if (r.ok) { setFile(null); setCaption(""); }
    } catch (e) { onDone({ error: (e as Error).message }); }
    setBusy(false);
  };
  const call = async (url: string, method: string) => { setBusy(true); const r = await fetch(url, { method }).catch(() => null); onDone(r ? await r.json().catch(() => ({})) : { error: "网络出错了" }); setBusy(false); };
  return (
    <div className="lightbox" role="dialog" aria-label={boatName(boat.id)} onClick={onClose}>
      <div className="lbcard" onClick={(e) => e.stopPropagation()}>
        <button className="x" aria-label="关闭" onClick={onClose}>✕</button>
        <h2>🚢 {boatName(boat.id)}</h2>
        {live ? <>
          <img className="adimg" src={`/api/boats/${boat.id}/image?v=${boat.version}`} alt={boat.caption || `${boat.ownerName}的广告`} />
          <p className="sub">{boat.ownerName} 的广告{boat.caption ? ` · ${boat.caption}` : ""} · 还剩 {daysLeft} 天</p>
          <div className="row2">
            {boat.mine && <label className="btn ghost filebtn">换一张图<input type="file" accept="image/*" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>}
            {(boat.mine || admin) && (confirmDel
              ? <><span className="sub">确定撤下？费用不退。</span><button className="btn ghost" onClick={() => setConfirmDel(false)}>算了</button><button className="btn primary" disabled={busy} onClick={() => call(`/api/boats/${boat.id}`, "DELETE")}>撤下</button></>
              : <button className="btn ghost" onClick={() => setConfirmDel(true)}>{admin && !boat.mine ? "管理员下架" : "撤下广告"}</button>)}
            {!boat.mine && user && <button className="link" disabled={busy} onClick={() => call(`/api/boats/${boat.id}/report`, "POST")}>举报这张图</button>}
          </div>
        </> : <>
          <div className="adfree">广告位招租</div>
          <p className="sub">上传一张图片，挂在这艘船的广告牌上 {AD_DAYS} 天，全城玩家都看得到。¥{AD_PRICE.toLocaleString()} 游戏币，每人最多同时 3 艘。图片会被裁成 2:1。</p>
          {!user ? <button className="big" onClick={onLogin}>登录后租船</button>
            : !hasGame ? <p className="sub">先开始游戏才能租船。</p>
            : <label className="btn ghost filebtn">选择图片<input type="file" accept="image/*" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>}
        </>}
        {file && <>
          {preview && <img className="adimg" src={preview} alt="预览" />}
          <input id="ad-caption" value={caption} maxLength={40} onChange={(e) => setCaption(e.target.value)} placeholder="一句话说明（选填）" />
          <p className="sub">请勿上传色情、暴力、侵权或违法内容；被 3 位玩家举报会自动隐藏。</p>
          <button className="big" disabled={busy || (!live && money < AD_PRICE)} onClick={upload}>{busy ? "上传中…" : live ? "换上这张图" : money < AD_PRICE ? `钞票不够（要¥${AD_PRICE.toLocaleString()}）` : `付¥${AD_PRICE.toLocaleString()} 挂上去`}</button>
        </>}
      </div>
    </div>
  );
}

function ShopBox({ shop, here, user, money, busy, onOp, onLogin }: { shop: Shop; here: boolean; user: User | null | undefined; money: number; busy: boolean; onOp: (b: Record<string, unknown>) => Promise<boolean | undefined>; onLogin: () => void }) {
  const [kind, setKind] = useState<ShopKind>("cafe");
  const [name, setName] = useState("");
  const [price, setPrice] = useState(KINDS.cafe.ref);
  const [ask, setAsk] = useState(false);
  const slot = SLOTS[shop.id];
  useEffect(() => { if (shop.price) setPrice(shop.price); }, [shop.price]);
  if (!shop.ownerName) {
    const est = npcPerHour(shop.id, kind, price || 1);
    return (
      <div className="shop">
        <b>🏪 空铺面 · 铺租¥{slot.rent}/天（真实时间）</b>
        <p className="sub">开一家店，押金¥{DEPOSIT.toLocaleString()}。开着时按真实时间自动有客人；其他玩家进店消费的钱也进侬的账。要到店里才能收账。每人只能开一家。</p>
        {!user ? <button className="btn primary" onClick={onLogin}>登录后开店</button> : <>
          <div className="kinds">{(Object.keys(KINDS) as ShopKind[]).map((k) => <button key={k} aria-pressed={k === kind} onClick={() => { setKind(k); setPrice(KINDS[k].ref); }}>{KINDS[k].ic} {KINDS[k].name}</button>)}</div>
          <input id="shop-name" value={name} maxLength={12} onChange={(e) => setName(e.target.value)} placeholder="店名，比如：阿明生煎" />
          <label className="pricerow">售价 ¥<input id="shop-price" type="number" min={1} value={price} onChange={(e) => setPrice(Math.round(Number(e.target.value)))} /><span className="sub">参考价¥{KINDS[kind].ref} · 预计每天净赚约¥{Math.round(est.profit * 24 - slot.rent)}</span></label>
          <button className="btn primary" disabled={busy || !here || money < DEPOSIT || !name.trim()} onClick={() => onOp({ op: "open", kind, name, price })}>{!here ? "先坐到这里才能开店" : money < DEPOSIT ? `押金不够（要¥${DEPOSIT.toLocaleString()}）` : `付押金开张`}</button>
        </>}
      </div>
    );
  }
  const k = KINDS[shop.kind!];
  if (!shop.mine) return (
    <div className="shop">
      <b>{k.ic} 「{shop.name}」· {shop.ownerName}开的{k.name}</b>
      <button className="act" disabled={busy || !here || !user || money < (shop.price || 0)} onClick={() => onOp({ op: "buy" })}>
        <span>进店消费{!user ? "（要登录）" : !here ? "（先坐过来）" : ""}</span><small>¥{shop.price} · {Object.entries(k.eff).map(([a, v]) => `${({ energy: "精力", hunger: "肚皮", fun: "开心", social: "社交" } as Record<string, string>)[a]}${v! > 0 ? "+" : ""}${v}`).join(" ")}</small>
      </button>
    </div>
  );
  const est = npcPerHour(shop.id, shop.kind!, price || 1);
  return (
    <div className="shop mine">
      <b>{k.ic} 我的店「{shop.name}」</b>
      <p className="sub">账上 <b style={{ color: (shop.till ?? 0) < 0 ? "var(--red)" : "var(--green)" }}>¥{(shop.till ?? 0).toLocaleString()}</b> · 玩家光顾 {shop.sold} 次 · 散客约 {shop.npc} 人 · 铺租¥{slot.rent}/天</p>
      <label className="pricerow">售价 ¥<input id="shop-price-edit" type="number" min={1} value={price} onChange={(e) => setPrice(Math.round(Number(e.target.value)))} /><button className="btn ghost" disabled={busy || price === shop.price} onClick={() => onOp({ op: "price", price })}>改价</button><span className="sub">按这个价每天约净赚¥{Math.round(est.profit * 24 - slot.rent)}</span></label>
      <div className="row2">
        <button className="btn primary" disabled={busy || !here} onClick={() => onOp({ op: "collect" })}>{here ? "收账" : "到店才能收账"}</button>
        {ask ? <><span className="sub">关店退一半押金，确定？</span><button className="btn ghost" onClick={() => setAsk(false)}>算了</button><button className="btn ghost" disabled={busy || !here} onClick={async () => { setAsk(false); await onOp({ op: "close" }); }}>关店</button></>
          : <button className="link" onClick={() => setAsk(true)}>关店</button>}
      </div>
    </div>
  );
}
