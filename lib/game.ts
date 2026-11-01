// 纯游戏规则：不依赖界面，前后端都能用。
import { geo } from "./geo";
const at = (lon: number, lat: number) => geo(lon, lat);
export type PlaceId = "home" | "rmgy" | "metro" | "bund" | "chp" | "tzf" | "wk" | "ykl" | "ljz" | "ferry" | "njl" | "jas" | "xtd" | "xjh" | "hq" | "wjc" | "expo" | "sjgy" | "zj" | "gongfang" | "jiangjing" | "yangfang" | "sjxc";
export type JobId = "coder" | "barista" | "designer" | "engineer";
export type Stats = { energy: number; hunger: number; fun: number; social: number };
export type State = Stats & {
  v: 2; name: string; job: JobId; at: PlaceId; day: number; min: number; month: number; money: number;
  worked: Record<number, 1>; friends: Record<string, number>; flags: Record<string, 1>; log: [string, string][];
  pals?: Record<string, { name: string; n: number }>; // 真人玩家好友：一起做事的次数
  home?: HomeId; // 租住的地方，没有就是亭子间
  rentDay?: number; // 下次交房租的日子
  ownPlot?: number; // 在松江新城买下的地块编号
};

// 可以租住的房子：每处都是地图上的一个地点
export type HomeId = "home" | "gongfang" | "jiangjing" | "yangfang" | "sjxc";
export const HOMES: Record<HomeId, { rent: number; perk: Partial<Stats>; note: string }> = {
  home: { rent: 2800, perk: {}, note: "七平方，楼下有王阿姨" },
  gongfang: { rent: 4500, perk: { energy: 5 }, note: "老公房一室户，离五角场近，睡得更香" },
  jiangjing: { rent: 12000, perk: { energy: 10, fun: 10 }, note: "陆家嘴江景，一早醒来看得到东方明珠" },
  yangfang: { rent: 20000, perk: { energy: 12, fun: 15, social: 5 }, note: "带小花园的老洋房，朋友都想来坐坐" },
  sjxc: { rent: 0, perk: { energy: 15, fun: 12, social: 3 }, note: "自己买的房子，不用交房租，就是离市区远" },
};
export const isHome = (p: PlaceId): p is HomeId => p in HOMES;
export const homeOf = (s: State): HomeId => s.home || "home";

export const JOBS: Record<JobId, { place: PlaceId; pay: number; title: string; ic: string }> = {
  coder: { place: "ljz", pay: 420, title: "陆家嘴码农", ic: "💻" },
  engineer: { place: "zj", pay: 560, title: "张江算法工程师", ic: "🧪" },
  barista: { place: "wk", pay: 220, title: "武康路咖啡师", ic: "☕" },
  designer: { place: "tzf", pay: 320, title: "田子坊设计师", ic: "🎨" },
};

export const PLACES: Record<PlaceId, { name: string; ic: string; x: number; z: number; h: number; sub: string; desc: string }> = {
  home: { name: "石库门亭子间", ic: "🏠", ...at(121.4835, 31.2215), h: 5, sub: "黄浦 · 老弄堂", desc: "七平方的亭子间，楼下爷叔天天生煤炉。房租便宜，隔音为零。" },
  rmgy: { name: "人民公园", ic: "💒", ...at(121.47, 31.2345), h: 6, sub: "相亲角", desc: "周末满地伞，阿姨们举着简历替小孩找对象。" },
  metro: { name: "人民广场站", ic: "🚇", ...at(121.4765, 31.2318), h: 4, sub: "1/2/8号线换乘", desc: "早上八点半，人贴人。" },
  bund: { name: "外滩", ic: "🌃", ...at(121.4903, 31.2405), h: 9, sub: "中山东一路", desc: "万国建筑博览群，对岸是陆家嘴的灯，江风很大。" },
  chp: { name: "城隍庙", ic: "🥟", ...at(121.4925, 31.2275), h: 6, sub: "豫园 · 小吃", desc: "南翔小笼、生煎、排骨年糕，排队是常态。" },
  tzf: { name: "田子坊", ic: "🎨", ...at(121.4672, 31.2088), h: 5, sub: "泰康路 · 创意园", desc: "弄堂改的工作室和小店，游客比住户多。" },
  wk: { name: "武康路", ic: "☕", ...at(121.438, 31.2052), h: 9, sub: "徐汇 · 梧桐区", desc: "梧桐树、老洋房、排队拍照的人和一家家咖啡馆。" },
  ykl: { name: "永康路", ic: "🍺", ...at(121.456, 31.2108), h: 5, sub: "酒吧街", desc: "站在路边喝啤酒的地方，十点以后要小声。" },
  ljz: { name: "陆家嘴", ic: "🏙️", ...at(121.505, 31.237), h: 24, sub: "浦东 · 金融城", desc: "三件套底下的写字楼，电梯要排十分钟。" },
  njl: { name: "南京路步行街", ic: "🛍️", ...at(121.4805, 31.2372), h: 6, sub: "黄浦 · 第一百货", desc: "霓虹招牌一路排到外滩，游客举着自拍杆，老字号门口排着队。" },
  jas: { name: "静安寺", ic: "🛕", ...at(121.4453, 31.2232), h: 8, sub: "静安 · 南京西路", desc: "金顶古寺被商场和写字楼围着，香火和咖啡香混在一起。" },
  xtd: { name: "新天地", ic: "🍷", ...at(121.4745, 31.2196), h: 5, sub: "黄浦 · 太平桥", desc: "修旧如旧的石库门里开满了餐厅和酒吧，夜里最热闹。" },
  xjh: { name: "徐家汇", ic: "⛪", ...at(121.437, 31.193), h: 11, sub: "徐汇 · 天主教堂", desc: "红砖双尖顶的老教堂，对面是港汇商场，周末人挤人。" },
  hq: { name: "虹桥火车站", ic: "🚄", ...at(121.3205, 31.1945), h: 6, sub: "闵行 · 高铁枢纽", desc: "一天几百趟高铁，半小时到苏州，一小时到杭州。" },
  wjc: { name: "五角场", ic: "🎓", ...at(121.514, 31.299), h: 7, sub: "杨浦 · 大学城", desc: "五条路交汇的大彩蛋下面，学生和上班族擦肩而过，附近就是复旦。" },
  expo: { name: "世博中国馆", ic: "🏛️", ...at(121.4995, 31.1845), h: 10, sub: "浦东 · 世博园", desc: "红色的“东方之冠”还在，现在常年办展览。" },
  sjgy: { name: "世纪公园", ic: "🌳", ...at(121.5527, 31.2183), h: 4, sub: "浦东 · 大草坪", desc: "上海市区最大的公园，周末一地帐篷和风筝。" },
  zj: { name: "张江", ic: "🧪", ...at(121.596, 31.204), h: 8, sub: "浦东 · 科学城", desc: "芯片、生物医药和互联网公司扎堆，班车一辆接一辆。" },
  gongfang: { name: "杨浦老公房", ic: "🏢", ...at(121.53, 31.28), h: 6, sub: "杨浦 · 房租¥4500/月", desc: "六层老公房，楼道里贴满开锁小广告，一室户朝南。" },
  jiangjing: { name: "陆家嘴江景公寓", ic: "🌇", ...at(121.513, 31.244), h: 16, sub: "浦东 · 房租¥12000/月", desc: "三十几楼，落地窗正对黄浦江和外滩。" },
  yangfang: { name: "徐汇老洋房", ic: "🏡", ...at(121.448, 31.2125), h: 6, sub: "徐汇 · 房租¥20000/月", desc: "梧桐树下的独栋老洋房，木地板，小花园。" },
  sjxc: { name: "松江新城售楼处", ic: "🏘️", ...at(121.228, 31.0325), h: 6, sub: "松江 · 24 块地出售", desc: "地铁9号线终点附近的新城，湖边一排排待建的地块，买下一块就有自己的家。" },
  ferry: { name: "东金线轮渡", ic: "⛴️", ...at(121.4955, 31.2325), h: 4, sub: "两块钱过江", desc: "坐轮渡过黄浦江，比地铁慢，但风景好。" },
};

export const NPCS: Record<string, { name: string; line: string }> = {
  ayi: { name: "王阿姨", line: "“小鬼头吃过了伐？阿姨帮侬留了碗菜泡饭。”" },
  yeshu: { name: "陈爷叔", line: "“生煎要先咬一小口，汤烫额！”" },
  lily: { name: "Lily", line: "“这家拿铁拉花不错，下次一起来拍照？”" },
  max: { name: "阿迈", line: "“兄弟，今朝夜里去哪里白相？”" },
  shifu: { name: "静安寺小师傅", line: "“许愿要心诚，香火钱随喜就好。”" },
  tutu: { name: "复旦学姐图图", line: "“这节课老师不点名，进来坐吧。”" },
  sao: { name: "南京路扫地阿姨", line: "“侬看看这些游客，一天要捡几百个奶茶杯。”" },
  mama: { name: "相亲角李妈妈", line: "“侬有房伐？有户口伐？”" },
};

type Act = [label: string, mins: number, cost: number, eff: Partial<Stats>, kind?: "work" | "interview" | "rent" | "movein" | null, npc?: string];
const HOME_ACTS: Act[] = [["困觉（睡一觉）", 480, 0, { energy: 70, hunger: -25 }], ["刷手机", 60, 0, { fun: 15, energy: -5 }], ["外卖点一份炸猪排", 40, 38, { hunger: 45 }]];
export const ACTS: Record<PlaceId, Act[]> = {
  gongfang: HOME_ACTS, jiangjing: HOME_ACTS, yangfang: HOME_ACTS, sjxc: HOME_ACTS,
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
  njl: [["逛第一百货", 90, 60, { fun: 18, energy: -8 }], ["买沈大成青团", 20, 18, { hunger: 22, fun: 4 }], ["和扫地阿姨聊两句", 15, 0, { social: 8 }, null, "sao"]],
  jas: [["进寺烧香许愿", 45, 10, { fun: 12, energy: 3 }, null, "shifu"], ["逛久光百货", 90, 80, { fun: 20, energy: -10 }]],
  xtd: [["露台上喝一杯", 120, 88, { fun: 28, social: 10, energy: -10 }], ["吃一顿本帮菜", 70, 120, { hunger: 60, fun: 12 }], ["看一场脱口秀", 120, 150, { fun: 35, social: 8 }]],
  xjh: [["参观天主教堂", 40, 0, { fun: 14 }], ["逛港汇恒隆", 120, 50, { fun: 16, energy: -12 }], ["在书院看一下午书", 180, 0, { fun: 18, energy: 6 }]],
  hq: [["坐高铁去苏州一日游", 600, 260, { fun: 45, energy: -40, hunger: -20 }], ["站里吃碗兰州拉面", 30, 32, { hunger: 45 }]],
  wjc: [["去复旦蹭一节课", 100, 0, { fun: 12, energy: -8, social: 6 }, null, "tutu"], ["大学路撸串", 90, 70, { hunger: 50, fun: 15, social: 10 }]],
  expo: [["看一场展览", 120, 60, { fun: 24, energy: -10 }], ["江边骑车", 60, 15, { fun: 18, energy: -10 }]],
  sjgy: [["草坪上野餐", 150, 45, { fun: 25, hunger: 25, social: 8 }], ["绕湖跑一圈", 50, 0, { fun: 10, energy: -15 }], ["放风筝", 60, 20, { fun: 18 }]],
  zj: [["去科技公司面试", 180, 0, { energy: -15, fun: -5 }, "interview"], ["吃园区食堂", 30, 18, { hunger: 40 }]],
};

// 在某处能做的事：住的地方能睡觉；没住的房子只能看房、租下
export function actsAt(s: State | null, at: PlaceId): Act[] {
  if (at === "sjxc" && s && homeOf(s) !== "sjxc") {
    return s.ownPlot != null ? [["搬进自己的房子", 120, 0, { fun: 15 }, "movein"], ["去自家地块转转", 30, 0, { fun: 6 }]] : [["看看样板房", 30, 0, { fun: 5 }], ["湖边散步", 45, 0, { fun: 10, energy: -3 }]];
  }
  if (!isHome(at) || !s || homeOf(s) === at) return ACTS[at];
  const r = HOMES[at].rent;
  return [[`租下这里（先付一个月¥${r.toLocaleString()}）`, 90, r, { fun: 10 }, "rent"], ["看看房", 30, 0, { fun: 3 }]];
}

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
    if (homeOf(s) !== "sjxc" && s.day >= (s.rentDay ?? 31)) {
      const rent = HOMES[homeOf(s)].rent; s.money -= rent; s.rentDay = s.day + 30;
      log(s, `交房租¥${rent.toLocaleString()}。上海居，大不易。`);
    }
    if (Math.random() < 0.6) { const ev = EVENTS.filter((e) => e.when(s)); const e = ev[Math.floor(Math.random() * ev.length)]; apply(s, e.eff); log(s, e.text); }
  }
}

function check(s: State) {
  if (s.hunger <= 0) { s.hunger = 30; s.money -= 200; s.at = homeOf(s); log(s, "饿昏了头，被送去社区医院挂了水，花了¥200。"); }
  if (s.energy <= 0) { s.energy = 40; s.at = homeOf(s); advance(s, 600); log(s, "累到在地铁上困着，坐过了五站。回家困了一整夜。"); }
  if (s.money < -3000) log(s, "欠了一屁股债，只好卷铺盖回老家。点“重新开始”再来一局。");
}

export function mood(s: State) { const v = (s.energy + s.hunger + s.fun + s.social) / 4; return v > 70 ? "开心" : v > 45 ? "还可以" : v > 25 ? "有点吃力" : "快撑不牢了"; }
export const crossRiver = (a: PlaceId, b: PlaceId) => (PLACES[a].x > 8) !== (PLACES[b].x > 8);
export function trip(a: PlaceId, b: PlaceId) {
  const d = Math.hypot(PLACES[a].x - PLACES[b].x, PLACES[a].z - PLACES[b].z);
  return { cost: (crossRiver(a, b) ? 5 : 3) + (d > 60 ? 3 : d > 35 ? 1 : 0), mins: Math.round(15 + d * 1.1) };
}

export type Result = { state: State; toast?: string; label?: string };

export function travel(prev: State, to: PlaceId): Result {
  if (to === prev.at) return { state: prev };
  const s = structuredClone(prev);
  const { cost, mins } = trip(s.at, to);
  if (s.money < cost) {
    // 没钱坐地铁也能走回家，只是慢
    if (to !== homeOf(s)) return { state: prev, toast: "钞票不够买地铁票了，只能先走回家" };
    advance(s, mins * 3); s.at = to; s.energy = clamp(s.energy - 15);
    log(s, `没钱坐地铁，走了${Math.round(mins * 3 / 60)}个钟头回到${PLACES[to].name}。`);
    check(s);
    return { state: s };
  }
  s.money -= cost; advance(s, mins); s.at = to;
  log(s, `坐地铁到${PLACES[to].name}，${mins}分钟。`);
  check(s);
  return { state: s };
}

export function act(prev: State, i: number): Result {
  const a = actsAt(prev, prev.at)[i];
  if (!a) return { state: prev };
  const [label, mins, cost, eff, kind, npc] = a;
  if (cost > 0 && prev.money < cost) return { state: prev, toast: "钞票不够" };
  const s = structuredClone(prev);
  let toast: string | undefined;
  if (kind === "work") {
    const job = JOBS[s.job];
    if (job.place !== s.at) return { state: prev, toast: `侬不在这里上班，侬是${job.title}` };
    if (s.worked[s.day]) return { state: prev, toast: "今天已经上过班了" };
    if (s.energy < 25) return { state: prev, toast: "太累了，先回去困一觉" };
    s.worked[s.day] = 1; s.money += job.pay; log(s, `上了一天班，赚了¥${job.pay}。`);
  }
  if (kind === "movein") {
    s.home = "sjxc"; s.rentDay = undefined; advance(s, mins); apply(s, eff);
    log(s, "搬进了松江新城自己的房子，从此不用交房租。");
    check(s);
    return { state: s, toast: "住进自己的房子了 🏡", label: "搬进自己的房子" };
  }
  if (kind === "rent") {
    const h = s.at as HomeId;
    s.money -= cost; s.home = h; s.rentDay = s.day + 30; advance(s, mins); apply(s, eff);
    log(s, `搬进了${PLACES[h].name}，月租¥${HOMES[h].rent.toLocaleString()}。下次交租是第${s.rentDay}天。`);
    check(s);
    return { state: s, toast: `搬家成功！欢迎入住${PLACES[h].name} 🔑`, label: "搬新家" };
  }
  if (kind === "interview") {
    if (s.job === "engineer") return { state: prev, toast: "侬已经在张江上班了" };
    s.money -= cost; apply(s, eff); advance(s, mins);
    if (s.energy >= 30 && s.fun >= 25 && Math.random() < 0.45) { s.job = "engineer"; log(s, "面试通过！换工作当上了张江算法工程师，日薪¥560。"); toast = "面试通过，换新工作了！"; }
    else log(s, "面试没过。HR 说再沉淀沉淀，状态好点再来。");
    check(s);
    return { state: s, toast, label };
  }
  s.money -= cost; apply(s, eff); advance(s, mins);
  if (label.startsWith("困觉")) apply(s, HOMES[homeOf(s)].perk);
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
  const a = actsAt(prev, prev.at)[i];
  if (!a || a[4] || isHome(prev.at)) return { state: prev, toast: "这件事没法一起做" };
  if (a[2] > 0 && prev.money < a[2]) return { state: prev, toast: "钞票不够" };
  const r = act(prev, i);
  const s = r.state;
  s.social = clamp(s.social + 15); s.fun = clamp(s.fun + 5);
  s.pals = { ...(s.pals || {}) };
  const p = (s.pals[partnerId] = { name: partnerName, n: (s.pals[partnerId]?.n || 0) + 1 });
  s.log[0] = [s.log[0][0], `和${partnerName}一起${a[0].replace(/（.*?）/, "")}，开心多了。`];
  return { state: s, label: `和${partnerName}一起${a[0]}`, toast: p.n === 3 ? `侬和${partnerName}成了好朋友！` : r.toast };
}

export function coopable(at: PlaceId) {
  if (isHome(at)) return []; // 别人家里不一起做事，避免两边能做的事对不上
  return ACTS[at].map((a, i) => ({ i, label: a[0], cost: a[2], kind: a[4] })).filter((x) => !x.kind);
}

/* ---------- 买地（地块归属由服务器的 plots 表决定，这里只改存档） ---------- */
export function buyPlot(prev: State, id: number, price: number, name: string): Result {
  if (prev.at !== "sjxc") return { state: prev, toast: "先到松江新城售楼处" };
  if (prev.ownPlot != null) return { state: prev, toast: "每人只能买一块地" };
  if (prev.money < price) return { state: prev, toast: `还差¥${(price - prev.money).toLocaleString()}` };
  const s = structuredClone(prev);
  s.money -= price; s.ownPlot = id; s.home = "sjxc"; s.rentDay = undefined; s.fun = clamp(s.fun + 25);
  log(s, `在松江新城买下${name}，花了¥${price.toLocaleString()}，直接搬了进去。从此不用交房租！`);
  return { state: s, toast: `买下${name}了！🏡`, label: `买下${name}` };
}

export function sellPlot(prev: State, price: number, name: string): Result {
  if (prev.ownPlot == null) return { state: prev, toast: "侬没有地可卖" };
  const s = structuredClone(prev);
  const back = Math.round(price * 0.9);
  s.money += back; s.ownPlot = undefined;
  if (homeOf(s) === "sjxc") { s.home = "home"; s.rentDay = s.day + 30; }
  log(s, `卖掉了${name}，到手¥${back.toLocaleString()}（扣了一成手续费），搬回亭子间。`);
  return { state: s, toast: `卖掉了，到手¥${back.toLocaleString()}` };
}

export function isState(x: unknown): x is State {
  return !!x && typeof x === "object" && (x as State).v === 2 && typeof (x as State).name === "string";
}
