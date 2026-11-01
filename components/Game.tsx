"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createCity, type City, type Other } from "../lib/city";
import type { Plot } from "../lib/plots";
import { LANGS, currentLang, initI18n, setLang, type Lang } from "../lib/i18n";
import { allParcels, parcelName, parcelOf, MAX_HOUSES } from "../lib/grid";
import { AD_DAYS, AD_USD_CENTS, BOAT_COUNT, boatName, type Boat } from "../lib/boats";
import { EKINDS, MAX_STAFF, SHIFT_MINS, WAGE_MAX, WAGE_MIN, estateName, estatePlace, estatePrice, perDay, type Estate, type EstateKind } from "../lib/estates";
import { DEPOSIT, KINDS, SLOTS, npcPerHour, slotAt, type Shop, type ShopKind } from "../lib/shops";
import { ENTRY_JOBS, GENDERS, START_GRANT, ageOf, birthOk, type Gender, actsAt, homeOf, homePlace, isHome, HOMES, GIGS, gigHint, jobTitle, lvOf, nextLvXp, LV_XP, weeklyCost, GIFT_AMOUNTS, JOBS, NPCS, PLACES, act, clock, coopable, isState, mood, newGame, travel, trip, SKILLS, skillMax, skillPer, LICENSE_LV, skillLv, type SkillId, type JobId, type PlaceId, type State } from "../lib/game";

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
  const [cell, setCell] = useState<number | null>(null);
  const [i18nReady, setI18nReady] = useState(false);
  const [panel, setPanel] = useState<"friends" | "log" | "help" | "chat" | "auth" | "skills" | "estates" | "money" | "admin" | null>(null);
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
  const [estates, setEstates] = useState<Estate[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const loadEstates = useCallback(() => { fetch("/api/estates").then((r) => r.json() as Promise<any>).then((d) => { if (Array.isArray(d.estates)) { setEstates(d.estates); setMe(d.me ?? null); } }).catch(() => {}); }, []);
  const [isAdmin, setIsAdmin] = useState(false);
  const [pending, setPending] = useState(0);
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
    let dead = false;
    initI18n().then(() => { if (dead || !mapRef.current) return;
    city.current = createCity(mapRef.current, (id) => { setSel(id); setCell(null); setPeer(null); city.current?.focus(id); }, (id) => { setPeer(id); setSel(null); setCell(null); }, (id) => { setBoatSel(id); }, (id) => { setCell(id); setSel(null); setPeer(null); });
    setI18nReady(true); });
    return () => { dead = true; city.current?.dispose(); };
  }, [say]);

  // 读取登录状态和存档
  useEffect(() => {
    let local: State | null = null;
    try { const x = JSON.parse(localStorage.getItem(LOCAL) || "null"); if (isState(x)) local = x; } catch {}
    setS(local);
    fetch("/api/auth/me").then((r) => r.json() as Promise<any>).then((d) => { setUser(d.user ?? null); setXOn(!!d.x); setIsAdmin(!!d.admin); setPending(d.pending || 0); if (d.admin && d.pending) say(`有 ${d.pending} 条被举报的广告等侬审核`); }).catch(() => setUser(null));
    const q = new URLSearchParams(location.search);
    if (q.get("paid")) { say("付款成功！广告几秒钟后挂上 🚢"); history.replaceState(null, "", "/" + location.hash); [3000, 8000, 15000].forEach((t) => setTimeout(loadBoats, t)); }
    else if (q.get("unpaid")) { say("付款取消了，船位会保留 30 分钟"); history.replaceState(null, "", "/" + location.hash); }
    const le = q.get("login_error");
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
  useEffect(() => { city.current?.setCell(cell); }, [cell, i18nReady]);
  useEffect(() => { loadPlots(); const h = setInterval(loadPlots, 20000); return () => clearInterval(h); }, [loadPlots, user]);
  useEffect(() => { city.current?.setPlots(plots); }, [plots, i18nReady]);
  useEffect(() => { loadBoats(); const h = setInterval(loadBoats, 30000); return () => clearInterval(h); }, [loadBoats, user]);
  useEffect(() => { city.current?.setBoats(boats); }, [boats, i18nReady]);
  useEffect(() => { loadShops(); const h = setInterval(loadShops, 20000); return () => clearInterval(h); }, [loadShops, user]);
  useEffect(() => { city.current?.setShops(shops); }, [shops, i18nReady]);
  useEffect(() => { loadEstates(); const h = setInterval(loadEstates, 20000); return () => clearInterval(h); }, [loadEstates, user]);
  useEffect(() => { city.current?.setEstates(estates); }, [estates, i18nReady]);
  const estateOp = async (id: number, body: Record<string, unknown>) => {
    setBusy(true);
    const r = await fetch(`/api/estates/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const d = r ? ((await r.json().catch(() => ({}))) as any) : { error: "网络出错了" };
    setBusy(false);
    if ("state" in d && d.state !== undefined) setS(isState(d.state) ? d.state : null);
    if (d.error) say(d.error); else if (d.toast) say(d.toast);
    loadEstates(); return r?.ok;
  };
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
    city.current?.setMine(s ? homePlace(s) : null);
  }, [others, s, i18nReady]);
  useEffect(() => { city.current?.setSelected(sel); }, [sel, i18nReady]);

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
  // 底部状态卡：默认收起，点一下展开；展开后 12 秒没动或点了地图就自动收起
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!open) return; const h = setTimeout(() => setOpen(false), 12000); return () => clearTimeout(h); }, [open, s]);
  useEffect(() => { setOpen(false); }, [sel, cell, peer]);
  useEffect(() => { if (s && (!s.gender || !s.birth)) setOpen(true); }, [s?.gender, s?.birth, !!s]);
  const status = s ? [["精力", s.energy], ["肚皮", s.hunger], ["开心", s.fun], ["社交", s.social]] as const : [];

  return (
    <>
      <div className="mapwrap" ref={mapRef} />

      <header className="top pill">
        <span className="brand">🏮 上海生活</span>
        <select className="lang" aria-label="语言 / Language" value={currentLang()} onChange={(e) => setLang(e.target.value as Lang)}>{(Object.keys(LANGS) as Lang[]).map((l) => <option key={l} value={l}>{LANGS[l]}</option>)}</select>
        {s ? <span className="meta"><b>{clock(s)}</b> {`第${s.day}天`} · 心情 <b>{mood(s)}</b></span> : <span className="meta">拖动地图逛一逛，点建筑看看能做啥</span>}
        {user ? (
          <span className={"net " + online} title={online === "on" ? "已连线" : "未连线"}>{online === "on" ? `● ${Object.keys(others).length + 1} 人在线` : "○ 连线中"}</span>
        ) : user === null ? (
          <button className="btn primary" onClick={() => setPanel("auth")}>登录 / 注册</button>
        ) : null}
      </header>

      <nav className="chips">
        <button className="pill" onClick={() => setPanel(panel === "estates" ? null : "estates")}>{`🏗️ 买地 · 余${allParcels().length - plots.length - estates.length}格`}</button>
        <button className="pill" onClick={() => setPanel(panel === "skills" ? null : "skills")}>🎯 能力</button>
        <button className="pill" onClick={() => setPanel(panel === "money" ? null : "money")}>💰 账本</button>
        {isAdmin && <button className="pill" onClick={() => setPanel(panel === "admin" ? null : "admin")}>🛠️ 管理{pending ? ` · ${pending} 待审` : ""}</button>}
        <button className="pill" onClick={() => setPanel(panel === "chat" ? null : "chat")}>💬 聊天</button>
        <button className="pill" onClick={() => setPanel(panel === "friends" ? null : "friends")}>🤝 朋友</button>
        <button className="pill" onClick={() => setPanel(panel === "log" ? null : "log")}>📜 日脚</button>
        <button className="pill" onClick={() => setPanel(panel === "help" ? null : "help")}>❓ 怎么玩</button>
      </nav>

      <section className={"bottom" + (s && open ? "" : s ? " folded" : "")} onClick={() => { if (s && !open) setOpen(true); }}>{s ? (
        <>
          <div className="who" onClick={(e) => { e.stopPropagation(); setOpen(!open); }} role="button" aria-expanded={open} title={open ? "收起" : "展开"}><b>{s.name}{s.gender ? ` ${s.gender === "m" ? "♂" : s.gender === "f" ? "♀" : ""}` : ""}{s.birth ? ` ${ageOf(s.birth)}岁` : ""} · {jobTitle(s)}</b><span className="money" style={{ color: s.money < 0 ? "var(--red)" : undefined }}>¥{s.money.toLocaleString()} <span className="fold">{open ? "▾" : "▴"}</span></span></div>
          {!open && <div className="mini">{status.map(([l, v], i) => <span key={l} className={v < 25 ? "low" : ""} title={l}>{["⚡", "🍜", "😊", "💬"][i]} {Math.round(v)}</span>)}</div>}
          {open && <><div className="career">
            <span>Lv{lvOf(s)}</span>
            <div className="bar"><i style={{ width: (nextLvXp(s) == null ? 100 : Math.min(100, (((s.xp || 0) - LV_XP[lvOf(s) - 1]) / (nextLvXp(s)! - LV_XP[lvOf(s) - 1])) * 100)) + "%" }} /></div>
            <span className="sub">{nextLvXp(s) == null ? "已到顶级" : `经验 ${s.xp || 0}/${nextLvXp(s)}`} · 每周开销¥{weeklyCost(s)}</span>
          </div>
          <div className="stats">{status.map(([l, v]) => <div className="st" key={l}>{l} {Math.round(v)}<div className="bar"><i className={v < 25 ? "low" : ""} style={{ width: v + "%" }} /></div></div>)}</div>
          {(!s.gender || !s.birth) ? <ProfileFix onSave={(g, b) => { if (user) api({ op: "profile", gender: g, birth: b }); else setS({ ...s, gender: g, birth: b }); }} /> : <div className="last">{s.log[0]?.[1]}</div>}
          </>}
        </>
      ) : <Start onStart={(n, j, g, b) => { if (user) api({ op: "new", name: n, job: j, gender: g, birth: b }); else setS(newGame(n, j, g, b)); setSel("hostel"); }} />}</section>

      {sel && (
        <aside className="sheet">
          <button className="x" aria-label="关闭" onClick={() => setSel(null)}>✕</button>
          <h2>{PLACES[sel].ic} {PLACES[sel].name}</h2>
          <p className="sub">{PLACES[sel].sub}{s?.at === sel ? " · 侬在这里" : ""}{s && homePlace(s) === sel ? " · 🔑 侬的家" : ""}</p>
          {isHome(sel) && <p className="sub">{HOMES[sel].note}{HOMES[sel].perk.energy ? `；在这里睡觉额外精力+${HOMES[sel].perk.energy}` : ""}</p>}
          <p>{PLACES[sel].desc}</p>
          {here.length > 0 && <p className="sub">这里还有：{here.map((o) => o.name).join("、")}</p>}
          {slotAt(sel) >= 0 && shops[slotAt(sel)] && <ShopBox shop={shops[slotAt(sel)]} here={!!s && s.at === sel} user={user} money={s?.money ?? 0} busy={busy} onOp={(b) => shopOp(slotAt(sel), b)} onLogin={() => setPanel("auth")} />}
          {(() => { const near = allParcels().filter((p) => p.place === sel); if (!near.length) return null; const sold = new Set([...plots.map((p) => p.id), ...estates.map((e) => e.id)]); const free = near.filter((p) => !sold.has(p.id));
            return <p className="sub">🏗️ 附近有 {free.length} 格空地在卖（住宅 {free.filter((p) => p.use === "res").length}、商业 {free.filter((p) => p.use === "com").length}），¥{(Math.min(...near.map((p) => p.price)) / 10000).toFixed(1)}万起。点地图上淡黄（住宅）或淡蓝（商业）的格子看看。</p>; })()}
          {!s ? <p className="sub">先在下面起个名字，开始游戏。</p> : s.at !== sel ? (
            <button className="go" disabled={busy} onClick={() => go({ op: "travel", to: sel })}>{s.money < trip(s.at, sel).cost && sel === homePlace(s) ? `🚶 没钱坐地铁，走回家 · ${Math.round(trip(s.at, sel).mins * 3 / 60)}小时` : `🚇 坐过去 · ¥${trip(s.at, sel).cost} · ${trip(s.at, sel).mins}分钟`}</button>
          ) : (
            <div className="acts">{actsAt(s, sel).map((a, i) => (
              <button key={i} className="act" disabled={busy || (a[2] > 0 && s.money < a[2])} onClick={() => go({ op: "act", i })}>
                <span>{a[0]}{a[4] === "gig" && (() => { const [pl, k] = String(a[5]).split(":"); const g = GIGS[pl as PlaceId]?.[Number(k)]; return g ? <em className="hint">{gigHint(g)}</em> : null; })()}</span>
                <small>{a[1] >= 60 ? (a[1] / 60).toFixed(a[1] % 60 ? 1 : 0) + "小时" : a[1] + "分"}{a[2] ? " · ¥" + a[2] : ""}</small>
              </button>))}</div>
          )}
        </aside>
      )}

      {cell != null && !sel && (
        <aside className="sheet">
          <button className="x" aria-label="关闭" onClick={() => setCell(null)}>✕</button>
          <LandBox id={cell} plots={plots} estates={estates} me={me} s={s} user={user} busy={busy} onLogin={() => setPanel("auth")} onSay={say} reload={() => { loadEstates(); loadPlots(); }}
            onEstate={estateOp} onHouse={async (b) => { setBusy(true); const d = await api(b); setBusy(false); loadPlots(); if (d) after(d.state, d.label); }}
            onGo={(pl) => go({ op: "travel", to: pl })} />
        </aside>
      )}

      {panel && (
        <aside className="panel">
          <button className="x" aria-label="关闭" onClick={() => setPanel(null)}>✕</button>
          {panel === "auth" && <Auth xOn={xOn} onDone={(u) => { setUser(u); setPanel(null); say(`欢迎，${u.name}`); }} />}
          {panel === "estates" && <><h2>买地</h2><p className="muted">地图上淡黄的格子是住宅地，淡蓝的是商业地，都挨着某个地点；人到了那个地点就能买。价格看区和地段：市中心最贵，临江、挨着主干道、靠地铁更贵。住宅地每人最多 {MAX_HOUSES} 格（买了就能住，不交房租），商业地最多 2 格（盖店、挂招牌、雇人）。</p>
            {(() => { const mine = [...plots.filter((p) => p.mine).map((p) => ({ id: p.id, t: "🏠 我的房子" })), ...estates.filter((e) => e.mine).map((e) => ({ id: e.id, t: e.kind ? `${EKINDS[e.kind].ic}「${e.name}」` : "🏗️ 我的商业地" }))];
              const hiring = estates.filter((e) => e.kind && e.openings > e.staff.length && !e.mine);
              return <>
                {mine.length > 0 && <h2 style={{ marginTop: 8 }}>我的地</h2>}
                {mine.map((m) => <button key={m.id} className="act" onClick={() => { setPanel(null); setCell(m.id); setSel(null); city.current?.focus(parcelOf(m.id)?.place ?? "home"); }}><span>{m.t}</span><small>{parcelName(m.id)}</small></button>)}
                {hiring.length > 0 && <h2 style={{ marginTop: 8 }}>在招人的店</h2>}
                {hiring.map((e) => <button key={e.id} className="act" onClick={() => { setPanel(null); setCell(e.id); setSel(null); city.current?.focus(estatePlace(e.id)); }}><span>{EKINDS[e.kind!].ic}「{e.name}」· 日薪¥{e.wage}</span><small>{PLACES[estatePlace(e.id)].name}旁 · 缺 {e.openings - e.staff.length} 人</small></button>)}
              </>; })()}</>}
          {panel === "money" && <LedgerBox user={user} s={s} />}
          {panel === "admin" && isAdmin && <AdminBox onSay={say} onPending={setPending} />}
          {panel === "skills" && s && <><h2>能力</h2><p className="muted">驾驶最高 20 级、每级 +0.1%；其他能力最高 50 级、每级 +4%。</p>
            {(Object.keys(SKILLS) as SkillId[]).map((k) => { const v = skillLv(s.sk?.[k] || 0, skillMax(k)), sk = SKILLS[k]; return (
              <div key={k} style={{ margin: "10px 0" }}>
                <b>{sk.ic} {sk.name} · {v.lv} 级</b>{k === "drive" && <span className="muted">{v.lv >= LICENSE_LV ? " · 已有驾照" : " · 未考驾照"}</span>}
                <span className="muted" style={{ float: "right" }}>+{+(v.lv * skillPer(k) * 100).toFixed(1)}%</span>
                <div style={{ height: 6, background: "#0001", borderRadius: 3, margin: "4px 0" }}><div style={{ height: 6, borderRadius: 3, background: "#e0533d", width: `${v.need ? (v.into / v.need) * 100 : 100}%` }} /></div>
                <div className="muted" style={{ fontSize: 12 }}>{v.need ? `再 ${v.need - v.into} 点升级 · ` : "已满级 · "}怎么练：{sk.how}。作用：{sk.use}。</div>
              </div>); })}</>}
          {panel === "help" && <><h2>怎么玩</h2><p>拖动地图看看上海，滚轮或右下角按钮缩放。点建筑上的图标查看能做啥，不在那里就先坐地铁过去，过江更贵。</p><p>上班赚钞票，吃饭困觉保持状态，多和人来往交朋友。每30天交一次房租，亭子间¥2,800；有钱了可以去看房搬家，好房子睡得更香，但房租也更贵。去张江面试能换高薪工作。</p><p>地图按 300 米一格划分。淡黄的格子是住宅地、淡蓝的是商业地，点一格就能看价格；人到旁边的地点就能买。买住宅地自动盖房，搬进去就不用交房租；商业地可以盖健身房、咖啡馆、超市、服装店，挂招牌、雇玩家。</p><p>登录后存档会存在云端，还能在地图上看到其他玩家、聊天、点名字牌向对方挥手。</p></>}
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

// 性别 + 出生日期：开局和补填资料共用
function ProfileFields({ gender, birth, onGender, onBirth }: { gender: Gender | null; birth: string; onGender: (g: Gender) => void; onBirth: (b: string) => void }) {
  return <div className="pricerow" style={{ margin: "6px 0" }}>
    <span>性别</span>{(Object.keys(GENDERS) as Gender[]).map((g) => <button key={g} type="button" className="btn ghost" aria-pressed={gender === g} style={gender === g ? { borderColor: "var(--green)", color: "var(--green)", fontWeight: 700 } : undefined} onClick={() => onGender(g)}>{GENDERS[g]}</button>)}
    <span style={{ marginLeft: 8 }}>出生日期</span><input id="birth" type="date" style={{ width: "auto" }} min="1926-01-01" max={new Date(Date.now() - 16 * 365.25 * 86400000).toISOString().slice(0, 10)} value={birth} onChange={(e) => onBirth(e.target.value)} />
  </div>;
}
function ProfileFix({ onSave }: { onSave: (g: Gender, b: string) => void }) {
  const [gender, setGender] = useState<Gender | null>(null);
  const [birth, setBirth] = useState("");
  return <div className="last"><b>补充一下资料：</b><ProfileFields gender={gender} birth={birth} onGender={setGender} onBirth={setBirth} />
    <button className="btn primary" disabled={!gender || !birthOk(birth)} onClick={() => gender && onSave(gender, birth)}>保存</button></div>;
}

function Start({ onStart }: { onStart: (name: string, job: JobId, gender: Gender, birth: string) => void }) {
  const [name, setName] = useState("小张");
  const [job, setJob] = useState<JobId>(ENTRY_JOBS[0]);
  const [gender, setGender] = useState<Gender | null>(null);
  const [birth, setBirth] = useState("2000-01-01");
  return (
    <>
      <div style={{ fontWeight: 700, fontSize: 15 }}>刚到上海：领¥{START_GRANT.toLocaleString()}落户补贴，先住青年旅舍，找份工作。</div>
      <input id="nm" value={name} maxLength={12} onChange={(e) => setName(e.target.value)} aria-label="名字" />
      <ProfileFields gender={gender} birth={birth} onGender={setGender} onBirth={setBirth} />
      <div className="jobs">{ENTRY_JOBS.map((k) => (
        <button key={k} aria-pressed={k === job} onClick={() => setJob(k)}>{JOBS[k].ic} {JOBS[k].title}<br /><span className="sub">日薪¥{JOBS[k].pay}</span></button>
      ))}</div>
      <p className="sub">好工作（咖啡师、销售、设计师、码农、算法工程师）要先练能力，再去那里应聘。</p>
      <button className="big" disabled={!gender || !birthOk(birth)} onClick={() => gender && onStart(name.trim() || "小张", job, gender, birth)}>{!gender ? "先选性别" : !birthOk(birth) ? "出生日期不对（要年满 16 岁）" : "开始过日脚"}</button>
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
// 马赛克版：缩到 24×12 再存成 JPEG，审核期间给其他玩家看
async function toMosaic(blob: Blob): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error("读不了这张图片")); i.src = url; });
    const c = document.createElement("canvas"); c.width = 24; c.height = 12; c.getContext("2d")!.drawImage(img, 0, 0, 24, 12);
    return (await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.8)))!;
  } finally { URL.revokeObjectURL(url); }
}
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
      const blob = await toAdJpeg(file), fd = new FormData();
      fd.append("image", blob, "ad.jpg"); fd.append("mosaic", await toMosaic(blob), "m.jpg"); fd.append("caption", caption);
      const r = await fetch(`/api/boats/${boat.id}`, { method: "POST", body: fd });
      const d = (await r.json().catch(() => ({ error: "上传失败" }))) as any;
      if (d.url) { location.href = d.url; return; } // 去 Stripe 付款页
      onDone(d); if (r.ok) { setFile(null); setCaption(""); }
    } catch (e) { onDone({ error: (e as Error).message }); }
    setBusy(false);
  };
  const renew = async () => { setBusy(true); const r = await fetch(`/api/boats/${boat.id}?renew=1`, { method: "POST" }).catch(() => null); const d = r ? ((await r.json().catch(() => ({}))) as any) : { error: "网络出错了" }; if (d.url) { location.href = d.url; return; } onDone(d); setBusy(false); };
  const call = async (url: string, method: string) => { setBusy(true); const r = await fetch(url, { method }).catch(() => null); onDone(r ? await r.json().catch(() => ({})) : { error: "网络出错了" }); setBusy(false); };
  return (
    <div className="lightbox" role="dialog" aria-label={boatName(boat.id)} onClick={onClose}>
      <div className="lbcard" onClick={(e) => e.stopPropagation()}>
        <button className="x" aria-label="关闭" onClick={onClose}>✕</button>
        <h2>🚢 {boatName(boat.id)}</h2>
        {live ? <>
          <img className="adimg" style={boat.flagged && !boat.mine && !admin ? { imageRendering: "pixelated" } : undefined} src={`/api/boats/${boat.id}/image?v=${boat.version}${boat.flagged && !boat.mine && !admin ? "&m=1" : ""}`} alt={boat.caption || `${boat.ownerName}的广告`} />
          {boat.flagged && <p className="sub">⚠️ 这张图被举报了，管理员审核前先打上马赛克。</p>}
          <p className="sub">{boat.ownerName} 的广告{boat.caption ? ` · ${boat.caption}` : ""} · 还剩 {daysLeft} 天</p>
          <div className="row2">
            {boat.mine && <button className="btn primary" disabled={busy} onClick={renew}>续租 {AD_DAYS} 天 · ${AD_USD_CENTS / 100}</button>}
            {boat.mine && <label className="btn ghost filebtn">换一张图<input type="file" accept="image/*" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>}
            {(boat.mine || admin) && (confirmDel
              ? <><span className="sub">确定撤下？费用不退。</span><button className="btn ghost" onClick={() => setConfirmDel(false)}>算了</button><button className="btn primary" disabled={busy} onClick={() => call(`/api/boats/${boat.id}`, "DELETE")}>撤下</button></>
              : <button className="btn ghost" onClick={() => setConfirmDel(true)}>{admin && !boat.mine ? "管理员下架" : "撤下广告"}</button>)}
            {!boat.mine && user && <button className="link" disabled={busy} onClick={() => call(`/api/boats/${boat.id}/report`, "POST")}>举报这张图</button>}
          </div>
        </> : <>
          <div className="adfree">广告位招租</div>
          <p className="sub">上传一张图片，挂在这艘船的广告牌上 {AD_DAYS} 天，全城玩家都看得到。租金 <b>${AD_USD_CENTS / 100} 美元 / 周</b>，用信用卡通过 Stripe 支付；每人最多同时 3 艘。图片会被裁成 2:1。</p>
          {boat.held && <p className="sub">⏳ 有人正在付款租这艘船，30 分钟内没付完会重新放出来。</p>}
          {!user ? <button className="big" onClick={onLogin}>登录后租船</button>
            : <label className="btn ghost filebtn">选择图片<input type="file" accept="image/*" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>}
        </>}
        {file && <>
          {preview && <img className="adimg" src={preview} alt="预览" />}
          <input id="ad-caption" value={caption} maxLength={40} onChange={(e) => setCaption(e.target.value)} placeholder="一句话说明（选填）" />
          <p className="sub">请勿上传色情、暴力、侵权或违法内容。被举报的图会先打马赛克，由管理员决定恢复还是下架。</p>
          <button className="big" disabled={busy} onClick={upload}>{busy ? (live ? "上传中…" : "正在打开付款页…") : live ? "换上这张图" : `去付款 · $${AD_USD_CENTS / 100} 挂 ${AD_DAYS} 天`}</button>
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

const EFF_NAMES: Record<string, string> = { energy: "精力", hunger: "肚皮", fun: "开心", social: "社交" };
function EstateBox({ id, estates, me, s, user, busy, onOp, onLogin, onSay, reload }: {
  id: number; estates: Estate[]; me: string | null; s: State | null; user: User | null | undefined; busy: boolean;
  onOp: (id: number, b: Record<string, unknown>) => Promise<boolean | undefined>; onLogin: () => void; onSay: (t: string) => void; reload: () => void;
}) {
  const [kind, setKind] = useState<EstateKind>("cafe");
  const [name, setName] = useState("");
  const [price, setPrice] = useState(EKINDS.cafe.ref);
  const [wage, setWage] = useState(300);
  const [openings, setOpenings] = useState(1);
  const [big, setBig] = useState(false);
  const [ask, setAsk] = useState(false);
  const [up, setUp] = useState(false);
  const place = estatePlace(id), here = s?.at === place;
  const myJob = estates.find((e) => e.staff.some((x) => x.id === me));
  const e: Estate = estates.find((x) => x.id === id) ?? { id, price: estatePrice(id), ownerName: null, kind: null, name: null, sell: null, wage: null, openings: 0, staff: [], sign: 0 };
  useEffect(() => { if (e?.sell) setPrice(e.sell); if (e?.wage) setWage(e.wage); if (e) setOpenings(e.openings); setAsk(false); }, [e?.id, e?.sell, e?.wage, e?.openings]);
  const upload = async (f: File) => {
    if (!e) return; setUp(true);
    try {
      const blob = await toAdJpeg(f);
      const r = await fetch(`/api/estates/${e.id}/sign`, { method: "POST", headers: { "content-type": "image/jpeg" }, body: blob });
      const d = (await r.json().catch(() => ({ error: "上传失败" }))) as any; onSay(d.error || d.toast); reload();
    } catch (err) { onSay((err as Error).message); }
    setUp(false);
  };
  return (
    <div className="plots">
      {myJob && myJob.id !== id && <p className="sub">💼 侬在{PLACES[estatePlace(myJob.id)].name}的「{myJob.name}」打工。</p>}
      {e && <div className={"shop" + (e.mine ? " mine" : "")}>
        <b>{e.kind ? `${EKINDS[e.kind].ic} ${EKINDS[e.kind].name}「${e.name}」` : e.ownerName ? `${e.ownerName}的商业地` : `空地 · ¥${e.price.toLocaleString()}`}</b>
        {e.kind && e.sign > 0 && <img className="adimg" style={{ cursor: "zoom-in" }} src={`/api/estates/${e.id}/sign?v=${e.sign}`} alt={`${e.name}的招牌`} onClick={() => setBig(true)} />}
        {big && <div className="lightbox" role="dialog" aria-label="招牌" onClick={() => setBig(false)}><div className="lbcard"><img className="adimg" src={`/api/estates/${e.id}/sign?v=${e.sign}`} alt={`${e.name}的招牌`} /><p className="sub">{e.ownerName} 的{EKINDS[e.kind!].name}「{e.name}」</p>
          {user && !e.mine && <button className="link" onClick={async (ev) => { ev.stopPropagation(); const r = await fetch(`/api/estates/${e.id}/report`, { method: "POST" }); const d = (await r.json().catch(() => ({}))) as any; onSay(d.error || d.toast); }}>举报这张招牌</button>}</div></div>}

        {!e.ownerName && <p className="sub">地价¥{e.price.toLocaleString()}。买下后可盖健身房、咖啡馆、超市或服装店，挂自己的招牌、雇玩家打工；按真实时间自动有客人。每人最多 2 块。</p>}
        {!e.ownerName && (!user ? <button className="btn primary" onClick={onLogin}>登录后买地</button>
          : <button className="btn primary" disabled={busy || !here || (s?.money ?? 0) < e.price} onClick={() => onOp(e.id, { op: "buy" })}>{!here ? `先到${PLACES[place].name}才能买` : (s?.money ?? 0) < e.price ? `钞票不够（要¥${e.price.toLocaleString()}）` : `¥${e.price.toLocaleString()} 买下`}</button>)}

        {e.ownerName && !e.mine && !e.kind && <p className="sub">{e.ownerName} 买下了，还没开工。</p>}

        {e.mine && !e.kind && <>
          <p className="sub">选一种店开工：</p>
          <div className="kinds">{(Object.keys(EKINDS) as EstateKind[]).map((k) => <button key={k} aria-pressed={k === kind} onClick={() => { setKind(k); setPrice(EKINDS[k].ref); }}>{EKINDS[k].ic} {EKINDS[k].name} ¥{EKINDS[k].build / 10000}万</button>)}</div>
          <p className="sub">{EKINDS[kind].desc} · 每天运营成本¥{EKINDS[kind].upkeep}</p>
          <input id="estate-name" value={name} maxLength={12} onChange={(ev) => setName(ev.target.value)} placeholder="店名，比如：阿明健身" />
          <label className="pricerow">售价 ¥<input id="estate-price" type="number" min={1} value={price} onChange={(ev) => setPrice(Math.round(Number(ev.target.value)))} /><span className="sub">参考价¥{EKINDS[kind].ref} · 预计每天净赚约¥{perDay(e.id, kind, price || 1, 0)}</span></label>
          <button className="btn primary" disabled={busy || !here || (s?.money ?? 0) < EKINDS[kind].build || !name.trim()} onClick={() => onOp(e.id, { op: "build", kind, name, price })}>{!here ? `先到${PLACES[place].name}才能开工` : (s?.money ?? 0) < EKINDS[kind].build ? `钞票不够（要¥${EKINDS[kind].build.toLocaleString()}）` : `付¥${EKINDS[kind].build.toLocaleString()} 开工`}</button>
          <button className="link" disabled={busy || !here} onClick={() => onOp(e.id, { op: "sell" })}>卖回市政府（回收七成）</button>
        </>}

        {e.kind && !e.mine && <>
          <p className="sub">老板 {e.ownerName} · 员工 {e.staff.length ? e.staff.map((x) => x.name).join("、") : "暂无"}</p>
          <button className="act" disabled={busy || !here || !user || (s?.money ?? 0) < (e.sell || 0)} onClick={() => onOp(e.id, { op: "visit" })}>
            <span>进店消费{!user ? "（要登录）" : !here ? "（先坐过来）" : ""}</span><small>¥{e.sell} · {Object.entries(EKINDS[e.kind].eff).map(([a, v]) => `${EFF_NAMES[a]}${v! > 0 ? "+" : ""}${v}`).join(" ")}{EKINDS[e.kind].sk ? " · 体能+3" : ""}</small>
          </button>
          {e.staff.some((x) => x.id === me) ? <>
            <button className="act" disabled={busy || !here} onClick={() => onOp(e.id, { op: "shift" })}><span>上一班{!here ? "（先坐过来）" : ""}</span><small>{SHIFT_MINS / 60} 小时 · 日薪¥{e.wage} · 每个游戏日一次</small></button>
            <button className="link" onClick={() => onOp(e.id, { op: "quit" })}>辞职</button>
          </> : e.openings > e.staff.length && <button className="act" disabled={busy || !here || !user || !!myJob} onClick={() => onOp(e.id, { op: "apply" })}>
            <span>应聘店员{myJob ? "（先辞掉现在的工作）" : !here ? "（先坐过来）" : ""}</span><small>日薪¥{e.wage} · 还缺 {e.openings - e.staff.length} 人</small></button>}
        </>}

        {e.mine && e.kind && <>
          <p className="sub">账上 <b style={{ color: (e.till ?? 0) < 0 ? "var(--red)" : "var(--green)" }}>¥{(e.till ?? 0).toLocaleString()}</b> · 玩家光顾 {e.visits} 次 · 散客约 {e.npc} 人 · 每天运营成本¥{EKINDS[e.kind].upkeep}</p>
          <label className="btn ghost filebtn">{up ? "上传中…" : e.sign ? "换招牌" : "上传招牌图片"}<input type="file" accept="image/*" hidden disabled={up} onChange={(ev) => { const f = ev.target.files?.[0]; if (f) upload(f); ev.target.value = ""; }} /></label>
          <p className="sub">招牌会裁成 2:1，挂在店顶上，全城都看得到。请勿上传违规内容，被 3 位玩家举报会自动隐藏。</p>
          <label className="pricerow">售价 ¥<input id="estate-price-edit" type="number" min={1} value={price} onChange={(ev) => setPrice(Math.round(Number(ev.target.value)))} /><button className="btn ghost" disabled={busy || price === e.sell} onClick={() => onOp(e.id, { op: "price", price })}>改价</button><span className="sub">每天约净赚¥{perDay(e.id, e.kind, price || 1, e.staff.length)}</span></label>
          <p className="sub"><b>雇人</b> · 每位员工让客流 +20%，每上一班还给店里带来¥{EKINDS[e.kind].shift}左右营业额（员工能力越高越多），工资从店里账上付。</p>
          <label className="pricerow">日薪 ¥<input id="estate-wage" type="number" min={WAGE_MIN} max={WAGE_MAX} value={wage} onChange={(ev) => setWage(Math.round(Number(ev.target.value)))} />岗位<select id="estate-openings" value={openings} onChange={(ev) => setOpenings(Number(ev.target.value))}>{Array.from({ length: MAX_STAFF + 1 }, (_, i) => <option key={i} value={i}>{i}</option>)}</select><button className="btn ghost" disabled={busy} onClick={() => onOp(e.id, { op: "hire", wage, openings })}>保存</button></label>
          {e.staff.length > 0 && <div className="row2">{e.staff.map((x) => <span key={x.id} className="sub">👤 {x.name} <button className="link" disabled={busy} onClick={() => onOp(e.id, { op: "fire", uid: x.id })}>解雇</button></span>)}</div>}
          <div className="row2">
            <button className="btn primary" disabled={busy || !here} onClick={() => onOp(e.id, { op: "collect" })}>{here ? "收账" : `到${PLACES[place].name}才能收账`}</button>
            {ask ? <><span className="sub">连地带店卖回市政府，回收地价七成、造价三成？</span><button className="btn ghost" onClick={() => setAsk(false)}>算了</button><button className="btn ghost" disabled={busy || !here} onClick={async () => { setAsk(false); await onOp(e.id, { op: "sell" }); }}>卖掉</button></>
              : <button className="link" onClick={() => setAsk(true)}>卖掉</button>}
          </div>
        </>}
      </div>}
    </div>
  );
}

// 点地图上的一格：住宅地买来住，商业地交给 EstateBox
function LandBox({ id, plots, estates, me, s, user, busy, onLogin, onSay, reload, onEstate, onHouse, onGo }: {
  id: number; plots: Plot[]; estates: Estate[]; me: string | null; s: State | null; user: User | null | undefined; busy: boolean;
  onLogin: () => void; onSay: (t: string) => void; reload: () => void; onEstate: (id: number, b: Record<string, unknown>) => Promise<boolean | undefined>;
  onHouse: (b: Record<string, unknown>) => void; onGo: (p: PlaceId) => void;
}) {
  const [ask, setAsk] = useState(false);
  const pc = parcelOf(id);
  useEffect(() => setAsk(false), [id]);
  if (!pc) return <p className="sub">这一格不能买。</p>;
  const place = pc.place, here = s?.at === place, house = plots.find((p) => p.id === id);
  return <>
    <h2>{pc.use === "com" ? "🏬" : "🏠"} {parcelName(id)}</h2>
    <p className="sub">{pc.district}区 · {pc.use === "com" ? "商业用地" : "住宅用地"} · 挨着{PLACES[place].name}{here ? "（侬在这里）" : ""}</p>
    {pc.use === "com" ? <EstateBox id={id} estates={estates} me={me} s={s} user={user} busy={busy} onOp={onEstate} onLogin={onLogin} onSay={onSay} reload={reload} />
      : house ? <div className={"shop" + (house.mine ? " mine" : "")}>
          <b>{house.mine ? "🔑 我的房子" : `${house.ownerName}家`}</b>
          {house.mine && <>
            <p className="sub">{s?.ownPlot === id ? "侬现在住在这里，到" + PLACES[place].name + "就能在家睡觉做饭。" : `还没住进来：到${PLACES[place].name}点“搬进自己的房子”。`}</p>
            {ask ? <div className="row2"><span className="sub">卖回市政府，回收七成（¥{Math.round(pc.price * 0.7).toLocaleString()}）？</span><button className="btn ghost" onClick={() => setAsk(false)}>算了</button><button className="btn primary" disabled={busy} onClick={() => { setAsk(false); onHouse({ op: "sell", id }); }}>确定卖</button></div>
              : <button className="link" onClick={() => setAsk(true)}>卖掉这块地</button>}
          </>}
        </div>
      : <div className="shop">
          <b>空地 · ¥{pc.price.toLocaleString()}</b>
          <p className="sub">买下自动盖一栋小房子，可以搬进来住，不用再交房租；在家睡觉精力恢复更多。每人最多 {MAX_HOUSES} 格住宅地，卖回市政府回收七成。</p>
          {!user ? <button className="btn primary" onClick={onLogin}>登录后买地</button>
            : <button className="btn primary" disabled={busy || !here || (s?.money ?? 0) < pc.price} onClick={() => onHouse({ op: "buy", id })}>{!here ? `先到${PLACES[place].name}才能买` : (s?.money ?? 0) < pc.price ? `钞票不够（要¥${pc.price.toLocaleString()}）` : `¥${pc.price.toLocaleString()} 买下`}</button>}
        </div>}
    {s && !here && <button className="go" disabled={busy} onClick={() => onGo(place)}>🚇 去{PLACES[place].name} · ¥{trip(s.at, place).cost} · {trip(s.at, place).mins}分钟</button>}
  </>;
}

// 账本：系统账户余额 + 我的最近 30 笔流水
function LedgerBox({ user, s }: { user: User | null | undefined; s: State | null }) {
  const [d, setD] = useState<{ accounts: { id: string; name: string; balance: number }[]; rows: { ts: number; amount: number; with: string; memo: string }[] } | null>(null);
  useEffect(() => { fetch("/api/ledger").then((r) => r.json() as Promise<any>).then(setD).catch(() => {}); }, [user, s?.money]);
  return <>
    <h2>账本</h2>
    <p className="muted">钱不会凭空出现或消失：工资、吃饭、房租都和“市场”结算；买地、收税、落户补贴走“市政府”。所有收入先扣 10% 税。</p>
    {s && <p className="sub">侬累计交税 ¥{(s.taxPaid || 0).toLocaleString()}{s.deposit ? ` · 租房押金 ¥${s.deposit.toLocaleString()}` : ""}</p>}
    <h2 style={{ marginTop: 8 }}>我的流水</h2>
    {!user ? <p>登录后才有账本记录。</p> : !d?.rows.length ? <p>还没有记录。</p> : d.rows.map((r, i) => (
      <p key={i}><span className="t">{new Date(r.ts).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span> <b style={{ color: r.amount < 0 ? "var(--red)" : "var(--green)" }}>{r.amount > 0 ? "+" : ""}{r.amount.toLocaleString()}</b> {r.amount < 0 ? "付给" : "来自"}{r.with} · {r.memo}</p>))}
  </>;
}

// 管理员后台：系统账户、全服流水、调整市政府储备、下架店招牌
function AdminBox({ onSay, onPending }: { onSay: (t: string) => void; onPending: (n: number) => void }) {
  type D = { flagged: { id: number; owner_name: string; caption: string | null; version: number; reports: number }[]; orders: { id: string; user_name: string; boat_id: number; kind: string; amount: number; status: string; paid_at: number }[]; accounts: { id: string; name: string; balance: number }[]; players: { n: number; money: number }; minted: number; rows: { ts: number; from: string; to: string; amount: number; memo: string }[]; signs: { id: number; owner_name: string; name: string | null; sign_ver: number }[] };
  const [d, setD] = useState<D | null>(null);
  const [amt, setAmt] = useState(1000000);
  const [memo, setMemo] = useState("");
  const load = useCallback(() => { fetch("/api/admin").then((r) => r.json() as Promise<any>).then((x) => { if (x.error) onSay(x.error); else { setD(x); onPending(x.flagged.length); } }).catch(() => {}); }, [onSay]);
  useEffect(load, [load]);
  const post = async (b: Record<string, unknown>) => { const r = await fetch("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }); const x = (await r.json().catch(() => ({}))) as any; onSay(x.error || x.toast); load(); };
  if (!d) return <p>读取中…</p>;
  const total = d.accounts.reduce((a, x) => a + x.balance, 0) + d.players.money;
  return <>
    <h2>管理后台</h2>
    <h2 style={{ marginTop: 8 }}>被举报的游船广告（{d.flagged.length}）</h2>
    {!d.flagged.length && <p className="sub">没有待审核的广告。</p>}
    {d.flagged.map((b) => <div key={b.id} style={{ marginBottom: 8 }}><img className="adimg" src={`/api/boats/${b.id}/image?v=${b.version}`} alt={`${b.owner_name}的广告`} /><div className="row2"><span className="sub">{boatName(b.id)} · {b.owner_name}{b.caption ? ` ·「${b.caption}」` : ""} · {b.reports} 人举报</span><button className="btn primary" onClick={() => post({ op: "boat_ok", id: b.id })}>恢复上架</button><button className="btn ghost" onClick={() => post({ op: "boat_off", id: b.id })}>下架</button></div></div>)}
    {d.orders.length > 0 && <><h2 style={{ marginTop: 8 }}>广告收入（最近 50 笔）</h2>
      <p className="sub">合计 ${(d.orders.filter((o) => o.status === "paid").reduce((a, o) => a + o.amount, 0) / 100).toFixed(2)}（Stripe 手续费另扣）</p>
      {d.orders.map((o) => <p key={o.id}><span className="t">{new Date(o.paid_at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span> {o.user_name} · {boatName(o.boat_id)} · {o.kind === "renew" ? "续租" : "新租"} · ${o.amount / 100}{o.status === "refunded" ? "（已退款）" : ""}</p>)}</>}
    {d.accounts.map((a) => <p key={a.id}>{a.id === "gov" ? "🏛️" : "🏪"} {a.name} <b>¥{a.balance.toLocaleString()}</b></p>)}
    <p>👥 玩家 {d.players.n} 人，手上共 <b>¥{Math.round(d.players.money).toLocaleString()}</b></p>
    <p className="sub">全服货币总量 ¥{Math.round(total).toLocaleString()} · 管理员累计增发 ¥{d.minted.toLocaleString()}（另含开服储备 ¥10,000,000）</p>
    <h2 style={{ marginTop: 8 }}>调整市政府储备</h2>
    <label className="pricerow">金额 ¥<input id="admin-amt" type="number" inputMode="numeric" style={{ width: "auto", flex: 1, minWidth: 140 }} value={amt} onChange={(e) => setAmt(Math.round(Number(e.target.value)))} /><span className="sub">= ¥{Math.abs(amt || 0).toLocaleString()}</span></label>
    <input id="admin-memo" value={memo} maxLength={40} onChange={(e) => setMemo(e.target.value)} placeholder="说明，比如：开新区增发" />
    <div className="row2"><button className="btn primary" onClick={() => post({ op: "mint", amount: Math.abs(amt), memo })}>增发</button><button className="btn ghost" onClick={() => post({ op: "mint", amount: -Math.abs(amt), memo })}>回收</button></div>
    <h2 style={{ marginTop: 8 }}>店招牌（{d.signs.length}）</h2>
    {d.signs.map((g) => <div key={g.id} style={{ marginBottom: 8 }}><img className="adimg" src={`/api/estates/${g.id}/sign?v=${g.sign_ver}`} alt={`${g.owner_name}的招牌`} /><div className="row2"><span className="sub">{g.owner_name} ·「{g.name || "未开张"}」</span><button className="btn ghost" onClick={() => post({ op: "sign_off", id: g.id })}>下架</button></div></div>)}
    <h2 style={{ marginTop: 8 }}>全服流水（最近 100 笔）</h2>
    {d.rows.map((r, i) => <p key={i}><span className="t">{new Date(r.ts).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span> {r.from} → {r.to} <b>¥{r.amount.toLocaleString()}</b> · {r.memo}</p>)}
  </>;
}
