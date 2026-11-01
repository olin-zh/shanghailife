// 纯游戏规则：不依赖界面，前后端都能用。
export type PlaceId = "home" | "rmgy" | "metro" | "bund" | "chp" | "tzf" | "wk" | "ykl" | "ljz" | "ferry";
export type JobId = "coder" | "barista" | "designer";
export type Stats = { energy: number; hunger: number; fun: number; social: number };
export type State = Stats & {
  v: 2; name: string; job: JobId; at: PlaceId; day: number; min: number; month: number; money: number;
  worked: Record<number, 1>; friends: Record<string, number>; flags: Record<string, 1>; log: [string, string][];
  pals?: Record<string, { name: string; n: number }>; // 真人玩家好友：一起做事的次数
};

export const JOBS: Record<JobId, { place: PlaceId; pay: number; title: string; ic: string }> = {
  coder: { place: "ljz", pay: 420, title: "陆家嘴码农", ic: "💻" },
  barista: { place: "wk", pay: 220, title: "武康路咖啡师", ic: "☕" },
  designer: { place: "tzf", pay: 320, title: "田子坊设计师", ic: "🎨" },
};

export const PLACES: Record<PlaceId, { name: string; ic: string; x: number; z: number; h: number; sub: string; desc: string }> = {
  home: { name: "石库门亭子间", ic: "🏠", x: -22, z: 14, h: 5, sub: "黄浦 · 老弄堂", desc: "七平方的亭子间，楼下爷叔天天生煤炉。房租便宜，隔音为零。" },
  rmgy: { name: "人民公园", ic: "💒", x: -30, z: -6, h: 6, sub: "相亲角", desc: "周末满地伞，阿姨们举着简历替小孩找对象。" },
  metro: { name: "人民广场站", ic: "🚇", x: -18, z: -12, h: 4, sub: "1/2/8号线换乘", desc: "早上八点半，人贴人。" },
  bund: { name: "外滩", ic: "🌃", x: -3, z: -10, h: 9, sub: "中山东一路", desc: "万国建筑博览群，对岸是陆家嘴的灯，江风很大。" },
  chp: { name: "城隍庙", ic: "🥟", x: -8, z: 16, h: 6, sub: "豫园 · 小吃", desc: "南翔小笼、生煎、排骨年糕，排队是常态。" },
  tzf: { name: "田子坊", ic: "🎨", x: -30, z: 26, h: 5, sub: "泰康路 · 创意园", desc: "弄堂改的工作室和小店，游客比住户多。" },
  wk: { name: "武康路", ic: "☕", x: -50, z: 12, h: 9, sub: "徐汇 · 梧桐区", desc: "梧桐树、老洋房、排队拍照的人和一家家咖啡馆。" },
  ykl: { name: "永康路", ic: "🍺", x: -42, z: 30, h: 5, sub: "酒吧街", desc: "站在路边喝啤酒的地方，十点以后要小声。" },
  ljz: { name: "陆家嘴", ic: "🏙️", x: 22, z: -6, h: 24, sub: "浦东 · 金融城", desc: "三件套底下的写字楼，电梯要排十分钟。" },
  ferry: { name: "东金线轮渡", ic: "⛴️", x: 6, z: 6, h: 4, sub: "两块钱过江", desc: "坐轮渡过黄浦江，比地铁慢，但风景好。" },
};

export const NPCS: Record<string, { name: string; line: string }> = {
  ayi: { name: "王阿姨", line: "“小鬼头吃过了伐？阿姨帮侬留了碗菜泡饭。”" },
  yeshu: { name: "陈爷叔", line: "“生煎要先咬一小口，汤烫额！”" },
  lily: { name: "Lily", line: "“这家拿铁拉花不错，下次一起来拍照？”" },
  max: { name: "阿迈", line: "“兄弟，今朝夜里去哪里白相？”" },
  mama: { name: "相亲角李妈妈", line: "“侬有房伐？有户口伐？”" },
};

type Act = [label: string, mins: number, cost: number, eff: Partial<Stats>, kind?: "work" | null, npc?: string];
export const ACTS: Record<PlaceId, Act[]> = {
  home: [["困觉（睡一觉）", 480, 0, { energy: 70, hunger: -25 }], ["吃王阿姨的菜泡饭", 30, 0, { hunger: 35, social: 5 }, null, "ayi"], ["刷手机", 60, 0, { fun: 15, energy: -5 }], ["外卖点一份炸猪排", 40, 38, { hunger: 45 }]],
  metro: [["在站台等下一班", 20, 0, { fun: -3 }], ["便利店买杯豆浆", 10, 6, { hunger: 10, energy: 3 }]],
  ljz: [["上班", 480, 0, { energy: -35, hunger: -25, fun: -15 }, "work"], ["去楼下买饭团", 15, 9, { hunger: 20 }], ["和同事吐槽老板", 30, 0, { fun: 10, social: 10 }]],
  wk: [["上班（咖啡师）", 480, 0, { energy: -30, hunger: -20, fun: -5 }, "work"], ["买杯拿铁坐一下午", 120, 36, { fun: 22, energy: 8 }], ["扫街拍梧桐", 60, 0, { fun: 15 }, null, "lily"]],
  tzf: [["上班（设计师）", 480, 0, { energy: -30, hunger: -20, fun: -8 }, "work"], ["逛小店", 60, 30, { fun: 18 }]],
  chp: [["吃生煎和小馄饨", 40, 28, { hunger: 50, fun: 5 }, null, "yeshu"], ["排队买南翔小笼", 90, 45, { hunger: 55, fun: -5 }]],
  bund: [["江边看夜景", 60, 0, { fun: 25, energy: -5 }], ["和朋友散步", 90, 0, { fun: 20, social: 15 }, null, "any"]],
  rmgy: [["看相亲角的简历", 45, 0, { fun: 12 }, null, "mama"], ["被阿姨盘问家底", 30, 0, { fun: -10, social: 12 }, null, "mama"]],
  ykl: [["路边喝精酿", 120, 60, { fun: 30, energy: -15, social: 12 }, null, "max"], ["蹦迪到天亮", 300, 180, { fun: 40, energy: -45, social: 20 }]],
  ferry: [["坐轮渡吹江风", 30, 2, { fun: 14 }]],
};

const EVENTS: { when: (s: State) => boolean; text: string; eff: Partial<Stats> }[] = [
  { when: (s) => s.month >= 6 && s.month <= 7, text: "黄梅天，被子三天没晒干，心情有点潮。", eff: { fun: -6 } },
  { when: (s) => s.month >= 8 && s.month <= 9, text: "台风登陆，地铁临时停运一段。", eff: { energy: -6 } },
  { when: () => true, text: "楼下爷叔在弄堂里讲股票，听了半个钟头。", eff: { fun: 4 } },
  { when: () => true, text: "共享单车扫到一辆坏的，白走了一站路。", eff: { energy: -4 } },
  { when: () => true, text: "在便利店抽中一张免费关东煮券。", eff: { hunger: 8 } },
  { when: () => true, text: "房东发微信：下个月房租要涨两百。", eff: { fun: -5 } },
];

const clamp = (v: number) => Math.max(0, Math.min(100, v));
const pad = (n: number) => String(n).padStart(2, "0");
export const clock = (s: State) => `${pad(Math.floor(s.min / 60))}:${pad(s.min % 60)}`;
export const stamp = (s: State) => `第${s.day}天 ${clock(s)}`;

export function newGame(name: string, job: JobId): State {
  const s: State = { v: 2, name, job, at: "home", day: 1, min: 420, month: new Date().getMonth() + 1, money: 1500, energy: 80, hunger: 70, fun: 60, social: 30, worked: {}, friends: {}, flags: {}, log: [] };
  log(s, `${name}拖着行李箱住进了石库门亭子间。房租¥2800，楼下有个王阿姨。`);
  return s;
}

function log(s: State, t: string) { s.log.unshift([stamp(s), t]); s.log = s.log.slice(0, 40); }
function apply(s: State, eff: Partial<Stats>) { for (const k in eff) { const key = k as keyof Stats; s[key] = clamp(s[key] + (eff[key] || 0)); } }

function advance(s: State, mins: number) {
  const before = s.day;
  s.min += mins;
  while (s.min >= 1440) { s.min -= 1440; s.day++; }
  const h = mins / 60;
  s.hunger = clamp(s.hunger - h * 3);
  s.energy = clamp(s.energy - h * 1.5);
  if (s.day !== before) {
    if (s.day % 30 === 1) { s.money -= 2800; log(s, "交房租¥2800。上海居，大不易。"); }
    if (Math.random() < 0.6) { const ev = EVENTS.filter((e) => e.when(s)); const e = ev[Math.floor(Math.random() * ev.length)]; apply(s, e.eff); log(s, e.text); }
  }
}

function check(s: State) {
  if (s.hunger <= 0) { s.hunger = 30; s.money -= 200; s.at = "home"; log(s, "饿昏了头，被送去社区医院挂了水，花了¥200。"); }
  if (s.energy <= 0) { s.energy = 40; s.at = "home"; advance(s, 600); log(s, "累到在地铁上困着，坐过了五站。回家困了一整夜。"); }
  if (s.money < -3000) log(s, "欠了一屁股债，只好卷铺盖回老家。点“重新开始”再来一局。");
}

export function mood(s: State) { const v = (s.energy + s.hunger + s.fun + s.social) / 4; return v > 70 ? "开心" : v > 45 ? "还可以" : v > 25 ? "有点吃力" : "快撑不牢了"; }
export const crossRiver = (a: PlaceId, b: PlaceId) => (PLACES[a].x > 8) !== (PLACES[b].x > 8);
export function trip(a: PlaceId, b: PlaceId) {
  const d = Math.hypot(PLACES[a].x - PLACES[b].x, PLACES[a].z - PLACES[b].z);
  return { cost: crossRiver(a, b) ? 5 : 3, mins: Math.round(15 + d * 1.2) };
}

export type Result = { state: State; toast?: string; label?: string };

export function travel(prev: State, to: PlaceId): Result {
  if (to === prev.at) return { state: prev };
  const s = structuredClone(prev);
  const { cost, mins } = trip(s.at, to);
  if (s.money < cost) return { state: prev, toast: "钞票不够买地铁票了" };
  s.money -= cost; advance(s, mins); s.at = to;
  log(s, `坐地铁到${PLACES[to].name}，${mins}分钟。`);
  check(s);
  return { state: s };
}

export function act(prev: State, i: number): Result {
  const a = ACTS[prev.at][i];
  if (!a) return { state: prev };
  const [label, mins, cost, eff, kind, npc] = a;
  if (prev.money < cost) return { state: prev, toast: "钞票不够" };
  const s = structuredClone(prev);
  let toast: string | undefined;
  if (kind === "work") {
    const job = JOBS[s.job];
    if (job.place !== s.at) return { state: prev, toast: `侬不在这里上班，侬是${job.title}` };
    if (s.worked[s.day]) return { state: prev, toast: "今天已经上过班了" };
    if (s.energy < 25) return { state: prev, toast: "太累了，先回去困一觉" };
    s.worked[s.day] = 1; s.money += job.pay; log(s, `上了一天班，赚了¥${job.pay}。`);
  }
  s.money -= cost; apply(s, eff); advance(s, mins);
  if (npc) {
    const ids = npc === "any" ? Object.keys(s.friends) : [npc];
    ids.forEach((id) => (s.friends[id] = Math.min(100, (s.friends[id] || 0) + 12)));
    if (npc !== "any") {
      const n = NPCS[npc]; log(s, `${n.name}：${n.line}`);
      if (s.friends[npc] >= 60 && !s.flags["f_" + npc]) { s.flags["f_" + npc] = 1; toast = `侬和${n.name}成了好朋友！`; }
    }
  }
  if (kind !== "work") log(s, `${label}${cost ? `，花了¥${cost}` : ""}。`);
  check(s);
  return { state: s, toast, label };
}

/* ---------- 多人：红包与一起做事 ---------- */
export const GIFT_AMOUNTS = [8, 18, 88, 188];

export function sendGift(prev: State, amount: number, toName: string): Result {
  if (!GIFT_AMOUNTS.includes(amount)) return { state: prev };
  if (prev.money < amount) return { state: prev, toast: "钞票不够发红包" };
  const s = structuredClone(prev);
  s.money -= amount; log(s, `给${toName}发了¥${amount}红包。`);
  return { state: s };
}

export function receiveGift(prev: State, amount: number, fromName: string): Result {
  if (!GIFT_AMOUNTS.includes(amount)) return { state: prev };
  const s = structuredClone(prev);
  s.money += amount; s.social = clamp(s.social + 5); log(s, `收到${fromName}的¥${amount}红包。`);
  return { state: s, toast: `收到${fromName}的红包 ¥${amount} 🧧` };
}

// 合作活动：照常做这件事，另外多加社交和开心，并记下这位玩家朋友
export function coop(prev: State, i: number, partnerId: string, partnerName: string): Result {
  const a = ACTS[prev.at][i];
  if (!a || a[4] === "work") return { state: prev, toast: "这件事没法一起做" };
  if (prev.money < a[2]) return { state: prev, toast: "钞票不够" };
  const r = act(prev, i);
  const s = r.state;
  s.social = clamp(s.social + 15); s.fun = clamp(s.fun + 5);
  s.pals = { ...(s.pals || {}) };
  const p = (s.pals[partnerId] = { name: partnerName, n: (s.pals[partnerId]?.n || 0) + 1 });
  s.log[0] = [s.log[0][0], `和${partnerName}一起${a[0].replace(/（.*?）/, "")}，开心多了。`];
  return { state: s, label: `和${partnerName}一起${a[0]}`, toast: p.n === 3 ? `侬和${partnerName}成了好朋友！` : r.toast };
}

export function coopable(at: PlaceId) {
  return ACTS[at].map((a, i) => ({ i, label: a[0], cost: a[2] })).filter((x) => ACTS[at][x.i][4] !== "work");
}

export function isState(x: unknown): x is State {
  return !!x && typeof x === "object" && (x as State).v === 2 && typeof (x as State).name === "string";
}
