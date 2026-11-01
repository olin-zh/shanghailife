// 纯游戏规则：不依赖界面，前后端都能用。
import { geo, onGrid } from "./geo";
const at = (lon: number, lat: number) => onGrid(geo(lon, lat)); // 所有地点都落在格子中心
export type PlaceId = "home" | "rmgy" | "metro" | "bund" | "chp" | "tzf" | "wk" | "ykl" | "ljz" | "ferry" | "njl" | "jas" | "xtd" | "xjh" | "hq" | "wjc" | "expo" | "sjgy" | "zj" | "gongfang" | "jiangjing" | "yangfang" | "sjxc" | "pvg" | "sha" | "dsh" | "qt" | "hostel" | "ruijin" | "huashan" | "renji";
export type JobId = "coder" | "barista" | "designer" | "engineer" | "waiter" | "clerk" | "courier" | "guard" | "sales";
export type Stats = { energy: number; hunger: number; fun: number; social: number };
export type State = Stats & {
  v: 2; name: string; job: JobId; at: PlaceId; day: number; min: number; month: number; money: number;
  worked: Record<number, 1>; friends: Record<string, number>; flags: Record<string, 1>; log: [string, string][];
  pals?: Record<string, { name: string; n: number }>; // 真人玩家好友：一起做事的次数
  home?: HomeId; // 租住的地方，没有就是亭子间
  rentDay?: number; // 下次交房租的日子
  ownPlot?: number; // 现在住的自家地块（格子编号）
  homeAt?: PlaceId; // 自家房子挨着哪个地点（在那里睡觉）
  houses?: Record<number, PlaceId>; // 名下的住宅地块：格子编号 → 所在地点
  lv?: number; xp?: number; // 当前职业的等级（1–5）和经验
  costDay?: number; // 下次结算一周生活开销的日子
  sk?: Partial<Record<SkillId, number>>; // 各项能力的累计经验
  shiftDay?: number; // 最近一次在玩家店里打工的游戏日
  deposit?: number; // 租房押金（退租时退回）
  taxPaid?: number; // 累计交的税
};

// 可以租住的房子：每处都是地图上的一个地点
export type HomeId = "home" | "gongfang" | "jiangjing" | "yangfang" | "sjxc" | "hostel";
export const HOMES: Record<HomeId, { rent: number; perk: Partial<Stats>; note: string }> = {
  home: { rent: 2800, perk: {}, note: "七平方，楼下有王阿姨" },
  gongfang: { rent: 4500, perk: { energy: 5 }, note: "老公房一室户，离五角场近，睡得更香" },
  jiangjing: { rent: 12000, perk: { energy: 10, fun: 10 }, note: "陆家嘴江景，一早醒来看得到东方明珠" },
  yangfang: { rent: 20000, perk: { energy: 12, fun: 15, social: 5 }, note: "带小花园的老洋房，朋友都想来坐坐" },
  sjxc: { rent: 0, perk: { energy: 15, fun: 12, social: 3 }, note: "自己买的房子，不用交房租" },
  hostel: { rent: 0, perk: { energy: -10 }, note: "八人间床位，¥50 一晚，睡不太好" },
};
/* ---------- 能力：6 种，每种 0–20 级，每级加成 SKILL_BONUS ---------- */
export type SkillId = "pro" | "talk" | "cook" | "fit" | "drive" | "sh";
export const SKILLS: Record<SkillId, { name: string; ic: string; how: string; use: string }> = {
  pro: { name: "专业技能", ic: "💻", how: "上班、加班、在书院看书、在家刷网课", use: "工资更高，张江面试更容易过" },
  talk: { name: "口才", ic: "🗣️", how: "和人聊天、相亲角、摆摊、家教、拍照、调酒、和玩家一起做事", use: "摆摊、拍照、家教、调酒收入更高" },
  cook: { name: "厨艺", ic: "🍳", how: "在家做饭、新天地上烹饪课、夜市摆摊", use: "自己开的店散客更多" },
  fit: { name: "体能", ic: "💪", how: "世纪公园跑步、滴水湖骑行、送外卖、跑腿", use: "上班和打工掉的精力更少" },
  drive: { name: "驾驶", ic: "🚗", how: "五角场驾校练车、开网约车", use: `练到 3 级考出驾照，解锁开网约车；坐车更快` },
  sh: { name: "上海话", ic: "🗨️", how: "和王阿姨、陈爷叔、李妈妈、扫地阿姨聊天，跟爷叔学上海话", use: "和本地 NPC 的好感涨得更快" },
};
export const SKILL_MAX = 50;
export const SKILL_BONUS = 0.04; // 每级 +4%
// 驾驶单独一套：最高 20 级，每级 +0.1%
export const skillMax = (k: SkillId) => (k === "drive" ? 20 : SKILL_MAX);
export const skillPer = (k: SkillId) => (k === "drive" ? 0.001 : SKILL_BONUS);
export const LICENSE_LV = 3;
// 从 n 级升到 n+1 级需要 3+n 点经验，满 20 级共 250 点
export function skillLv(xp: number, max = SKILL_MAX) { let lv = 0, need = 3; while (lv < max && xp >= need) { xp -= need; lv++; need = 3 + lv; } return { lv, into: xp, need: lv >= max ? 0 : need }; }
export const sLv = (s: State, k: SkillId) => skillLv(s.sk?.[k] || 0, skillMax(k)).lv;
export const sBonus = (s: State, k: SkillId) => sLv(s, k) * skillPer(k);
export function gainSkills(s: State, g: Partial<Record<SkillId, number>>) {
  const ups: string[] = [];
  s.sk = { ...(s.sk || {}) };
  for (const k in g) {
    const id = k as SkillId, before = sLv(s, id);
    s.sk[id] = (s.sk[id] || 0) + (g[id] || 0);
    const after = sLv(s, id);
    if (after > before) { ups.push(`${SKILLS[id].name} ${after} 级`); if (id === "drive" && before < LICENSE_LV && after >= LICENSE_LV) ups.push("考出驾照了，可以去机场开网约车"); }
  }
  if (ups.length) log(s, `能力提升：${ups.join("，")}。`);
  return ups;
}
// 每个活动练什么能力
const LOCAL_NPCS = new Set(["ayi", "yeshu", "mama", "sao"]);
const GIG_SKILLS: Partial<Record<PlaceId, Partial<Record<SkillId, number>>>> = { njl: { fit: 1 }, chp: { talk: 1, cook: 1 }, wjc: { talk: 1, pro: 1 }, pvg: { drive: 1 }, sha: { drive: 1 }, bund: { talk: 1 }, xtd: { talk: 1 }, ljz: { fit: 1 } };
const TALK_GIGS = new Set<PlaceId>(["chp", "bund", "wjc", "xtd"]), DRIVE_GIGS = new Set<PlaceId>(["pvg", "sha"]);
const LABEL_SKILLS: [RegExp, Partial<Record<SkillId, number>>][] = [[/书院/, { pro: 2 }], [/网课/, { pro: 3 }], [/在家做饭/, { cook: 2 }], [/烹饪课/, { cook: 5 }], [/跑一圈/, { fit: 3 }], [/骑行|骑车/, { fit: 3 }], [/驾校/, { drive: 4 }], [/学上海话/, { sh: 4 }], [/吐槽|聊/, { talk: 1 }]];

/* ---------- 职业成长 ---------- */
export const LEVELS: Record<JobId, string[]> = {
  coder: ["初级码农", "码农", "高级工程师", "技术专家", "技术总监"],
  barista: ["实习咖啡师", "咖啡师", "首席咖啡师", "店长", "区域经理"],
  designer: ["设计助理", "设计师", "资深设计师", "设计主管", "创意总监"],
  engineer: ["算法工程师", "高级算法工程师", "算法专家", "首席科学家", "研究院院长"],
  waiter: ["学徒服务员", "服务员", "领班", "楼面经理", "餐厅店长"],
  clerk: ["夜班店员", "店员", "值班长", "店长", "片区督导"],
  courier: ["新手快递员", "快递员", "金牌快递员", "站点主管", "片区经理"],
  guard: ["保安", "保安班长", "保安队长", "物业主管", "物业经理"],
  sales: ["销售助理", "销售", "销售主管", "销售经理", "销售总监"],
};
export const LV_XP = [0, 10, 28, 55, 95]; // 升到第 n 级需要的累计经验
export const PAY_MULT = [1, 1.2, 1.45, 1.75, 2.1];
export const lvOf = (s: State) => s.lv || 1;
export const jobTitle = (s: State) => `${PLACES[JOBS[s.job].place].name.slice(0, 3)} · ${LEVELS[s.job][lvOf(s) - 1]}`;
export const basePay = (s: State) => Math.round(JOBS[s.job].pay * PAY_MULT[lvOf(s) - 1]);
export const weeklyCost = (s: State) => 280 + (lvOf(s) - 1) * 210; // 手机话费、水电、聚餐……级别越高花得越多
export function nextLvXp(s: State) { const l = lvOf(s); return l >= 5 ? null : LV_XP[l]; }

/* ---------- 副业零工：[地点] → 列表；时段用 24 小时制，可以跨午夜 ---------- */
type Gig = { label: string; mins: number; cost: number; from: number; to: number; pay: [number, number]; eff: Partial<Stats>; peak?: [number, number][]; note?: string };
export const GIGS: Partial<Record<PlaceId, Gig[]>> = {
  njl: [{ label: "送外卖", mins: 120, cost: 0, from: 10, to: 22, pay: [70, 120], eff: { energy: -15, hunger: -10 }, peak: [[11, 13], [17, 20]], note: "饭点单多" }],
  chp: [{ label: "夜市摆摊卖小吃", mins: 180, cost: 60, from: 18, to: 23, pay: [60, 330], eff: { energy: -15, social: 6 }, note: "要先进¥60的货，生意看运气" }],
  wjc: [{ label: "给学生当家教", mins: 120, cost: 0, from: 16, to: 21, pay: [180, 220], eff: { energy: -10, social: 5 } }],
  pvg: [{ label: "开网约车接机", mins: 150, cost: 30, from: 6, to: 24, pay: [180, 300], eff: { energy: -20 }, note: "油费¥30" }],
  sha: [{ label: "开网约车接机", mins: 120, cost: 25, from: 6, to: 24, pay: [140, 240], eff: { energy: -18 }, note: "油费¥25" }],
  bund: [{ label: "给游客拍照", mins: 60, cost: 0, from: 9, to: 22, pay: [20, 130], eff: { fun: 5, energy: -5 }, peak: [[18, 22]], note: "晚上看夜景的人多" }],
  xtd: [{ label: "酒吧兼职调酒", mins: 240, cost: 0, from: 20, to: 2, pay: [240, 300], eff: { energy: -25, social: 10 } }],
  ljz: [{ label: "写字楼送咖啡跑腿", mins: 60, cost: 0, from: 8, to: 18, pay: [45, 70], eff: { energy: -8 }, peak: [[8, 10]] }],
};
const inHours = (h: number, a: number, b: number) => (a <= b ? h >= a && h < b : h >= a || h < b);
const rainy = (s: State) => s.month >= 6 && s.month <= 7;
export function gigHint(g: Gig) { return `${g.from}–${g.to === 24 ? 24 : g.to}点 · ¥${g.pay[0]}–${g.pay[1]}${g.note ? ` · ${g.note}` : ""}`; }

export const isHome = (p: PlaceId): p is HomeId => p in HOMES && p !== "sjxc" && p !== "hostel"; // 能租的房子（自家房子另算）
export const homeOf = (s: State): HomeId => s.home || "home";
// 回家去哪个地点：住自家房子就是房子旁边的地点
export const homePlace = (s: State): PlaceId => (s.home === "sjxc" ? s.homeAt || "sjxc" : homeOf(s));
export const ownsHouseAt = (s: State, at: PlaceId) => Object.entries(s.houses || {}).filter(([, p]) => p === at).map(([id]) => Number(id));

// 工作：入门工作谁都能做；好工作要先把能力练上去，再到那里应聘
export const JOBS: Record<JobId, { place: PlaceId; pay: number; title: string; ic: string; req?: Partial<Record<SkillId, number>> }> = {
  clerk: { place: "njl", pay: 150, title: "南京路便利店店员", ic: "🏪" },
  guard: { place: "ljz", pay: 150, title: "陆家嘴写字楼保安", ic: "🛡️" },
  waiter: { place: "chp", pay: 160, title: "城隍庙餐厅服务员", ic: "🍜" },
  courier: { place: "wjc", pay: 180, title: "五角场快递员", ic: "📦" },
  barista: { place: "wk", pay: 220, title: "武康路咖啡师", ic: "☕", req: { cook: 3 } },
  sales: { place: "jas", pay: 260, title: "静安寺商场销售", ic: "🛍️", req: { talk: 5 } },
  designer: { place: "tzf", pay: 320, title: "田子坊设计师", ic: "🎨", req: { pro: 3, talk: 3 } },
  coder: { place: "ljz", pay: 420, title: "陆家嘴码农", ic: "💻", req: { pro: 8 } },
  engineer: { place: "zj", pay: 560, title: "张江算法工程师", ic: "🧪", req: { pro: 15 } },
};
export const ENTRY_JOBS = (Object.keys(JOBS) as JobId[]).filter((k) => !JOBS[k].req);
// 还差哪些能力；空数组表示够格
export const missingFor = (s: State, j: JobId) => Object.entries(JOBS[j].req || {}).filter(([k, v]) => sLv(s, k as SkillId) < v!).map(([k, v]) => `${SKILLS[k as SkillId].name} ${v} 级（现在 ${sLv(s, k as SkillId)} 级）`);
export const reqText = (j: JobId) => Object.entries(JOBS[j].req || {}).map(([k, v]) => `${SKILLS[k as SkillId].name}${v}级`).join("、");
// 收入一律先扣 10% 税交给市政府
export const TAX = 0.1;
export function earn(s: State, gross: number) { const tax = Math.round(gross * TAX); s.money += gross - tax; s.taxPaid = (s.taxPaid || 0) + tax; return gross - tax; }

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
  pvg: { name: "浦东机场", ic: "✈️", ...at(121.805, 31.143), h: 6, sub: "浦东 · 国际航班", desc: "两座航站楼像展开的翅膀，磁悬浮七分多钟从龙阳路飞过来。" },
  sha: { name: "虹桥机场", ic: "🛫", ...at(121.356, 31.1955), h: 5, sub: "长宁 · 国内航班", desc: "离市区近，跑道另一头就是虹桥火车站，飞机和高铁背靠背。" },
  ruijin: { name: "瑞金医院", ic: "🏥", ...at(121.4693, 31.212), h: 8, sub: "黄浦 · 三甲医院", desc: "上海交大医学院附属瑞金医院，瑞金二路上，全国排名靠前的综合医院，专家号很难挂。" },
  huashan: { name: "华山医院", ic: "🏥", ...at(121.4413, 31.217), h: 8, sub: "静安 · 三甲医院", desc: "复旦大学附属华山医院，乌鲁木齐中路上，神经内科和皮肤科全国有名。" },
  renji: { name: "仁济医院东院", ic: "🏥", ...at(121.5205, 31.2285), h: 8, sub: "浦东 · 三甲医院", desc: "上海交大医学院附属仁济医院，浦东东方路上，离陆家嘴不远。" },
  hostel: { name: "火车站青年旅舍", ic: "🛏️", ...at(121.455, 31.249), h: 5, sub: "静安 · 上海火车站旁", desc: "刚到上海的人第一站：八人间床位 ¥50 一晚，楼下就是地铁。先在这里落脚，攒够押金再租房。" },
  qt: { name: "前滩", ic: "🏬", ...at(121.486, 31.152), h: 6, sub: "浦东 · 新商务区", desc: "黄浦江边的新商务区，太古里、写字楼和滨江绿道连成一片。" },
  dsh: { name: "滴水湖", ic: "🌊", ...at(121.930, 30.905), h: 4, sub: "临港 · 东海边", desc: "一圈圈同心圆的人工湖，湖边风车慢慢转，再往东就是大海。" },
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

type Act = [label: string, mins: number, cost: number, eff: Partial<Stats>, kind?: "work" | "overtime" | "gig" | "interview" | "rent" | "movein" | "trip" | "apply" | null, npc?: string];
const HOME_ACTS: Act[] = [["困觉（睡一觉）", 480, 0, { energy: 70, hunger: -25 }], ["在家做饭", 60, 25, { hunger: 45, fun: 3 }], ["刷网课学技能", 120, 49, { energy: -8, fun: -5 }], ["刷手机", 60, 0, { fun: 15, energy: -5 }], ["外卖点一份炸猪排", 40, 38, { hunger: 45 }]];
// 三甲医院：看病、体检、住院休养
const HOSPITAL_ACTS: Act[] = [["挂专家号看病", 150, 350, { energy: 20, fun: -5 }], ["住院休养一晚", 720, 1200, { energy: 80, hunger: 20, fun: -10 }], ["做一次全面体检", 180, 800, { fun: 5, energy: -5 }], ["医院食堂吃饭", 30, 20, { hunger: 40 }]];
export const HOSPITALS: PlaceId[] = ["ruijin", "huashan", "renji"];
const nearestHospital = (s: State) => HOSPITALS.reduce((a, b) => (Math.hypot(PLACES[b].x - PLACES[s.at].x, PLACES[b].z - PLACES[s.at].z) < Math.hypot(PLACES[a].x - PLACES[s.at].x, PLACES[a].z - PLACES[s.at].z) ? b : a));
export const ACTS: Record<PlaceId, Act[]> = {
  gongfang: HOME_ACTS, jiangjing: HOME_ACTS, yangfang: HOME_ACTS,
  sjxc: [["湖边散步", 45, 0, { fun: 10, energy: -3 }], ["逛新城万达", 90, 60, { fun: 15, hunger: 20 }]],
  home: [["困觉（睡一觉）", 480, 0, { energy: 70, hunger: -25 }], ["吃王阿姨的菜泡饭", 30, 0, { hunger: 35, social: 5 }, null, "ayi"], ["在家做饭", 60, 25, { hunger: 45, fun: 3 }], ["刷网课学技能", 120, 49, { energy: -8, fun: -5 }], ["刷手机", 60, 0, { fun: 15, energy: -5 }], ["外卖点一份炸猪排", 40, 38, { hunger: 45 }]],
  metro: [["在站台等下一班", 20, 0, { fun: -3 }], ["便利店买杯豆浆", 10, 6, { hunger: 10, energy: 3 }]],
  ljz: [["去楼下买饭团", 15, 9, { hunger: 20 }], ["和同事吐槽老板", 30, 0, { fun: 10, social: 10 }]],
  wk: [["买杯拿铁坐一下午", 120, 36, { fun: 22, energy: 8 }], ["扫街拍梧桐", 60, 0, { fun: 15 }, null, "lily"]],
  tzf: [["逛小店", 60, 30, { fun: 18 }]],
  chp: [["吃生煎和小馄饨", 40, 28, { hunger: 50, fun: 5 }, null, "yeshu"], ["跟陈爷叔学上海话", 60, 0, { fun: 6, social: 4 }, null, "yeshu"], ["排队买南翔小笼", 90, 45, { hunger: 55, fun: -5 }]],
  bund: [["江边看夜景", 60, 0, { fun: 25, energy: -5 }], ["和朋友散步", 90, 0, { fun: 20, social: 15 }, null, "any"]],
  rmgy: [["看相亲角的简历", 45, 0, { fun: 12 }, null, "mama"], ["被阿姨盘问家底", 30, 0, { fun: -10, social: 12 }, null, "mama"]],
  ykl: [["路边喝精酿", 120, 60, { fun: 30, energy: -15, social: 12 }, null, "max"], ["蹦迪到天亮", 300, 180, { fun: 40, energy: -45, social: 20 }]],
  ferry: [["坐轮渡吹江风", 30, 2, { fun: 14 }]],
  pvg: [["飞东京玩三天", 4320, 3200, { fun: 60, energy: -25, social: 10 }], ["飞巴厘岛躺五天", 7200, 5800, { fun: 80, energy: 20, hunger: -10 }], ["去接机，顺便吃碗面", 90, 35, { hunger: 30, social: 8 }]],
  sha: [["飞三亚度假两天", 2880, 1900, { fun: 45, energy: 10 }], ["飞北京出差一天", 1440, 1200, { energy: -30, fun: -5 }, "trip"], ["隔着玻璃看飞机起降", 40, 0, { fun: 10 }]],
  ruijin: HOSPITAL_ACTS, huashan: HOSPITAL_ACTS, renji: HOSPITAL_ACTS,
  hostel: [["困觉（床位¥50/晚）", 480, 50, { energy: 70, hunger: -25 }], ["和室友吹牛", 60, 0, { social: 12, fun: 6 }], ["刷招聘软件", 30, 0, { fun: -3 }], ["外卖点一份炸猪排", 40, 38, { hunger: 45 }]],
  qt: [["江边绿道散步", 60, 0, { fun: 14, energy: -4 }], ["在太古里吃个午饭", 50, 75, { hunger: 50, fun: 8 }]],
  dsh: [["环湖骑行", 120, 30, { fun: 25, energy: -15 }], ["海边看日出", 90, 0, { fun: 22, energy: -5 }], ["吃一顿海鲜大排档", 80, 160, { hunger: 60, fun: 15 }], ["逛海昌海洋公园", 240, 290, { fun: 40, energy: -18 }]],
  njl: [["逛第一百货", 90, 60, { fun: 18, energy: -8 }], ["买沈大成青团", 20, 18, { hunger: 22, fun: 4 }], ["和扫地阿姨聊两句", 15, 0, { social: 8 }, null, "sao"]],
  jas: [["进寺烧香许愿", 45, 10, { fun: 12, energy: 3 }, null, "shifu"], ["逛久光百货", 90, 80, { fun: 20, energy: -10 }]],
  xtd: [["上烹饪课", 180, 180, { fun: 8, energy: -8 }], ["露台上喝一杯", 120, 88, { fun: 28, social: 10, energy: -10 }], ["吃一顿本帮菜", 70, 120, { hunger: 60, fun: 12 }], ["看一场脱口秀", 120, 150, { fun: 35, social: 8 }]],
  xjh: [["参观天主教堂", 40, 0, { fun: 14 }], ["逛港汇恒隆", 120, 50, { fun: 16, energy: -12 }], ["在书院看一下午书", 180, 0, { fun: 18, energy: 6 }]],
  hq: [["坐高铁去苏州一日游", 600, 260, { fun: 45, energy: -40, hunger: -20 }], ["站里吃碗兰州拉面", 30, 32, { hunger: 45 }]],
  wjc: [["去复旦蹭一节课", 100, 0, { fun: 12, energy: -8, social: 6 }, null, "tutu"], ["大学路撸串", 90, 70, { hunger: 50, fun: 15, social: 10 }], ["去驾校练车", 240, 300, { energy: -12, fun: -3 }]],
  expo: [["看一场展览", 120, 60, { fun: 24, energy: -10 }], ["江边骑车", 60, 15, { fun: 18, energy: -10 }]],
  sjgy: [["草坪上野餐", 150, 45, { fun: 25, hunger: 25, social: 8 }], ["绕湖跑一圈", 50, 0, { fun: 10, energy: -15 }], ["放风筝", 60, 20, { fun: 18 }]],
  zj: [["去科技公司面试", 180, 0, { energy: -15, fun: -5 }, "interview"], ["吃园区食堂", 30, 18, { hunger: 40 }]],
};

// 在某处能做的事：住的地方能睡觉；没住的房子只能看房、租下
export function actsAt(s: State | null, at: PlaceId): Act[] {
  const extra: Act[] = [];
  if (s && JOBS[s.job].place === at) {
    const p = basePay(s);
    extra.push([`上班（日薪约¥${p}，税前）`, 480, 0, { energy: -32, hunger: -22, fun: -10 }, "work"], [`上班+加班（约¥${Math.round(p * 1.5)}）`, 720, 0, { energy: -55, hunger: -32, fun: -22 }, "overtime"]);
  }
  if (s) (Object.keys(JOBS) as JobId[]).forEach((j) => { if (JOBS[j].place === at && j !== s.job && j !== "engineer") extra.push([`应聘：${JOBS[j].title}（日薪¥${JOBS[j].pay}${JOBS[j].req ? `，要${reqText(j)}` : ""}）`, 60, 0, { energy: -5 }, "apply", j]); });
  (GIGS[at] || []).forEach((g, k) => extra.push([`副业：${g.label}`, g.mins, g.cost, g.eff, "gig", `${at}:${k}`]));
  const base = actsAtBase(s, at);
  return extra.length ? [...extra, ...base] : base;
}
function actsAtBase(s: State | null, at: PlaceId): Act[] {
  // 自家房子：住在这里就能在家做事；房子在这里但没住进来，可以搬进来
  if (s && s.home === "sjxc" && s.homeAt === at) return isHome(at) ? HOME_ACTS : [...HOME_ACTS, ...ACTS[at]];
  if (s && ownsHouseAt(s, at).length) return [["搬进自己的房子", 120, 0, { fun: 15 }, "movein"], ...(isHome(at) ? [] : ACTS[at])];
  if (!isHome(at) || !s || homeOf(s) === at) return ACTS[at];
  const r = HOMES[at].rent;
  return [[`租下这里（押一付一 ¥${(r * 2).toLocaleString()}）`, 90, r * 2, { fun: 10 }, "rent"], ["看看房", 30, 0, { fun: 3 }]];
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

export const START_GRANT = 5000; // 市政府发的落户补贴
export function newGame(name: string, job: JobId): State {
  if (!ENTRY_JOBS.includes(job)) job = ENTRY_JOBS[0];
  const s: State = { v: 2, name, job, at: "hostel", home: "hostel", day: 1, min: 420, month: new Date().getMonth() + 1, money: START_GRANT, energy: 80, hunger: 70, fun: 60, social: 30, worked: {}, friends: {}, flags: {}, log: [] };
  log(s, `${name}拖着行李箱到了上海火车站，领到市政府的落户补贴¥${START_GRANT.toLocaleString()}，先在青年旅舍住下。找到了份工作：${JOBS[job].title}。`);
  return s;
}

export function log(s: State, t: string) { s.log.unshift([stamp(s), t]); s.log = s.log.slice(0, 40); }
export function apply(s: State, eff: Partial<Stats>) { for (const k in eff) { const key = k as keyof Stats; s[key] = clamp(s[key] + (eff[key] || 0)); } }

export function advance(s: State, mins: number) {
  const before = s.day;
  s.min += mins;
  while (s.min >= 1440) { s.min -= 1440; s.day++; }
  const h = mins / 60;
  s.hunger = clamp(s.hunger - h * 3);
  s.energy = clamp(s.energy - h * 1.5);
  if (s.day !== before) {
    if (s.day >= (s.costDay ?? 8)) {
      const c = weeklyCost(s); s.money -= c; s.costDay = s.day + 7;
      log(s, `这周生活开销（话费、水电、日用品）¥${c}。`);
    }
    if (HOMES[homeOf(s)].rent > 0 && s.day >= (s.rentDay ?? 31)) {
      const rent = HOMES[homeOf(s)].rent; s.money -= rent; s.rentDay = s.day + 30;
      log(s, `交房租¥${rent.toLocaleString()}。上海居，大不易。`);
    }
    if (Math.random() < 0.6) { const ev = EVENTS.filter((e) => e.when(s)); const e = ev[Math.floor(Math.random() * ev.length)]; apply(s, e.eff); log(s, e.text); }
  }
}

export function check(s: State) {
  if (s.hunger <= 0) { const h = nearestHospital(s); s.hunger = 30; s.money -= 500; s.at = h; log(s, `饿昏了头，被 120 送到${PLACES[h].name}挂了水，花了¥500。`); }
  if (s.energy <= 0) { s.energy = 40; s.at = homePlace(s); advance(s, 600); log(s, "累到在地铁上困着，坐过了五站。回家困了一整夜。"); }
  if (s.money < -3000) log(s, "欠了一屁股债，只好卷铺盖回老家。点“重新开始”再来一局。");
}

export function mood(s: State) { const v = (s.energy + s.hunger + s.fun + s.social) / 4; return v > 70 ? "开心" : v > 45 ? "还可以" : v > 25 ? "有点吃力" : "快撑不牢了"; }
export const crossRiver = (a: PlaceId, b: PlaceId) => (PLACES[a].x > 8) !== (PLACES[b].x > 8);
export function trip(a: PlaceId, b: PlaceId) {
  const d = Math.hypot(PLACES[a].x - PLACES[b].x, PLACES[a].z - PLACES[b].z);
  return { cost: (crossRiver(a, b) ? 5 : 3) + (d > 150 ? 12 : d > 60 ? 3 : d > 35 ? 1 : 0), mins: Math.round(15 + Math.min(d, 150) * 1.1 + Math.max(0, d - 150) * 0.5) };
}

export type Result = { state: State; toast?: string; label?: string };

export function travel(prev: State, to: PlaceId): Result {
  if (to === prev.at) return { state: prev };
  const s = structuredClone(prev);
  const { cost } = trip(s.at, to), mins = Math.round(trip(s.at, to).mins * (1 - sBonus(s, "drive")));
  if (s.money < cost) {
    // 没钱坐地铁也能走回家，只是慢
    if (to !== homePlace(s)) return { state: prev, toast: "钞票不够买地铁票了，只能先走回家" };
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
  const [label, mins, cost, eff0, kind, npc] = a;
  // 体能：所有掉精力的事少掉一点
  const eff: Partial<Stats> = { ...eff0 }; if ((eff.energy || 0) < 0) eff.energy = (eff.energy || 0) / (1 + sBonus(prev, "fit"));
  if (cost > 0 && prev.money < cost) return { state: prev, toast: "钞票不够" };
  const s = structuredClone(prev);
  let toast: string | undefined;
  if (kind === "work" || kind === "overtime") {
    if (JOBS[s.job].place !== s.at) return { state: prev, toast: `侬不在这里上班` };
    if (s.worked[s.day]) return { state: prev, toast: "今天已经上过班了" };
    if (s.energy < (kind === "overtime" ? 45 : 25)) return { state: prev, toast: kind === "overtime" ? "这点精力加不动班了" : "太累了，先回去困一觉" };
    // 绩效：精力和开心都好就有奖金，状态差容易出错
    const form = (s.energy + s.fun) / 2;
    let pay = basePay(s) * (kind === "overtime" ? 1.5 : 1) * (1 + sBonus(s, "pro")), note = "";
    if (form >= 70) { pay *= 1.2; note = "状态好，拿了绩效奖金"; } else if (form < 35) { pay *= 0.6; note = "状态太差出了错，被扣了钱"; }
    pay = Math.round(pay);
    s.worked[s.day] = 1; const net = earn(s, pay); gainSkills(s, kind === "overtime" ? { pro: 2, fit: 1 } : { pro: 1 });
    const gain = (kind === "overtime" ? 2 : 1) + (form >= 70 ? 1 : 0);
    s.xp = (s.xp || 0) + gain;
    log(s, `${kind === "overtime" ? "上班加班到很晚" : "上了一天班"}，工资¥${pay}，扣税后到手¥${net}${note ? `，${note}` : ""}。经验+${gain}。`);
    const need = nextLvXp(s);
    if (need != null && s.xp >= need) {
      s.lv = lvOf(s) + 1;
      log(s, `升职了！现在是${LEVELS[s.job][s.lv - 1]}，基本日薪涨到¥${basePay(s)}。`);
      toast = `升职加薪！成为${LEVELS[s.job][s.lv - 1]} 🎉`;
    }
  }
  if (kind === "gig") {
    const [pl, k] = String(npc).split(":"); const g = GIGS[pl as PlaceId]?.[Number(k)];
    if (!g) return { state: prev };
    const h = Math.floor(s.min / 60);
    if (!inHours(h, g.from, g.to)) return { state: prev, toast: `现在没这个活，${g.from}点到${g.to}点才有` };
    if (s.energy < 15) return { state: prev, toast: "太累了，干不动了" };
    if (DRIVE_GIGS.has(pl as PlaceId) && sLv(s, "drive") < LICENSE_LV) return { state: prev, toast: `要先考出驾照（驾驶 ${LICENSE_LV} 级，去五角场驾校练车）` };
    let pay = g.pay[0] + Math.random() * (g.pay[1] - g.pay[0]);
    let note = "";
    if (g.peak?.some(([a, b]) => inHours(h, a, b))) { pay *= 1.5; note = "正赶上高峰"; }
    if (pl === "njl" && rainy(s) && Math.random() < 0.5) { pay *= 1.4; note = "下雨天单价高"; }
    if (pl === "chp" && rainy(s) && Math.random() < 0.5) { pay *= 0.4; note = "下雨没什么人"; }
    if (TALK_GIGS.has(pl as PlaceId)) pay *= 1 + sBonus(s, "talk");
    if (DRIVE_GIGS.has(pl as PlaceId)) pay *= 1 + sBonus(s, "drive");
    pay = Math.round(pay);
    const net = earn(s, pay); s.money -= cost; apply(s, eff); advance(s, mins); gainSkills(s, GIG_SKILLS[pl as PlaceId] || {});
    log(s, `${g.label}，${cost ? `扣掉成本¥${cost}，` : ""}赚了¥${pay}，扣税后¥${net}${note ? `（${note}）` : ""}。`);
    check(s);
    return { state: s, toast: `${g.label}到手¥${net}（已扣税）`, label: g.label };
  }
  if (kind === "movein") {
    const id = ownsHouseAt(s, s.at)[0]; if (id == null) return { state: prev };
    const back = s.deposit || 0; s.money += back; s.deposit = undefined;
    s.home = "sjxc"; s.homeAt = s.at; s.ownPlot = id; s.rentDay = undefined; advance(s, mins); apply(s, eff);
    log(s, `搬进了${PLACES[s.at].name}旁边自己的房子，从此不用交房租。`);
    check(s);
    return { state: s, toast: "住进自己的房子了 🏡", label: "搬进自己的房子" };
  }
  if (kind === "rent") {
    const h = s.at as HomeId, back = s.deposit || 0;
    s.money += back - cost; s.home = h; s.deposit = HOMES[h].rent; s.rentDay = s.day + 30; s.homeAt = undefined; advance(s, mins); apply(s, eff);
    log(s, `搬进了${PLACES[h].name}，押一付一交了¥${cost.toLocaleString()}（押金¥${HOMES[h].rent.toLocaleString()}退租时退）${back ? `，上一处的押金¥${back.toLocaleString()}退回来了` : ""}。下次交租是第${s.rentDay}天。`);
    check(s);
    return { state: s, toast: `搬家成功！欢迎入住${PLACES[h].name} 🔑`, label: "搬新家" };
  }
  if (kind === "apply") {
    const j = npc as JobId, miss = missingFor(s, j);
    if (!JOBS[j] || j === s.job) return { state: prev };
    if (miss.length) return { state: prev, toast: `还不够格：要${miss.join("、")}` };
    apply(s, eff); advance(s, mins); s.job = j; s.lv = 1; s.xp = 0;
    log(s, `应聘成功，换工作当上了${JOBS[j].title}，基本日薪¥${JOBS[j].pay}。`);
    check(s);
    return { state: s, toast: `换工作了：${JOBS[j].title} 🎉`, label: `应聘${JOBS[j].title}` };
  }
  if (kind === "interview") {
    if (s.job === "engineer") return { state: prev, toast: "侬已经在张江上班了" };
    { const miss = missingFor(s, "engineer"); if (miss.length) return { state: prev, toast: `简历没过：要${miss.join("、")}` }; }
    s.money -= cost; apply(s, eff); advance(s, mins);
    if (s.energy >= 30 && s.fun >= 25 && Math.random() < Math.min(0.95, 0.45 * (1 + sBonus(s, "pro")))) { s.job = "engineer"; s.lv = 1; s.xp = 0; log(s, "面试通过！换工作当上了张江算法工程师，基本日薪¥560。"); toast = "面试通过，换新工作了！"; }
    else log(s, "面试没过。HR 说再沉淀沉淀，状态好点再来。");
    check(s);
    return { state: s, toast, label };
  }
  if (kind === "trip") { const net = earn(s, 3000); log(s, `出差回来，公司报销还发了¥3000补贴，扣税后¥${net}。`); }
  s.money -= cost; apply(s, eff); advance(s, mins);
  if (label.startsWith("困觉")) apply(s, HOMES[homeOf(s)].perk);
  if (npc) {
    const ids = npc === "any" ? Object.keys(s.friends) : [npc];
    ids.forEach((id) => (s.friends[id] = Math.min(100, (s.friends[id] || 0) + 12 * (1 + sBonus(s, "sh")))));
    if (npc !== "any") gainSkills(s, LOCAL_NPCS.has(npc) ? { talk: 1, sh: 2 } : { talk: 1 });
    if (npc !== "any") {
      const n = NPCS[npc]; log(s, `${n.name}：${n.line}`);
      if (s.friends[npc] >= 60 && !s.flags["f_" + npc]) { s.flags["f_" + npc] = 1; toast = `侬和${n.name}成了好朋友！`; }
    }
  }
  if (kind !== "work" && kind !== "overtime") log(s, `${label}${cost ? `，花了¥${cost}` : ""}。`);
  if (!kind) for (const [re, g] of LABEL_SKILLS) if (re.test(label)) { const ups = gainSkills(s, g); if (ups.length && !toast) toast = `能力提升：${ups[0]}`; break; }
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
  // i 是公共活动列表 ACTS[地点] 里的序号；每个人自己的列表前面还有上班、副业，所以按名字找
  const a = ACTS[prev.at][i];
  if (!a || a[4] || isHome(prev.at)) return { state: prev, toast: "这件事没法一起做" };
  if (a[2] > 0 && prev.money < a[2]) return { state: prev, toast: "钞票不够" };
  const mine = actsAt(prev, prev.at).findIndex((x) => x[0] === a[0]);
  if (mine < 0) return { state: prev, toast: "这件事没法一起做" };
  const r = act(prev, mine);
  const s = r.state;
  s.social = clamp(s.social + 15); s.fun = clamp(s.fun + 5);
  s.pals = { ...(s.pals || {}) };
  const p = (s.pals[partnerId] = { name: partnerName, n: (s.pals[partnerId]?.n || 0) + 1 });
  s.log[0] = [s.log[0][0], `和${partnerName}一起${a[0].replace(/（.*?）/, "")}，开心多了。`];
  gainSkills(s, { talk: 1 });
  return { state: s, label: `和${partnerName}一起${a[0]}`, toast: p.n === 3 ? `侬和${partnerName}成了好朋友！` : r.toast };
}

export function coopable(at: PlaceId) {
  if (isHome(at)) return []; // 别人家里不一起做事，避免两边能做的事对不上
  return ACTS[at].map((a, i) => ({ i, label: a[0], cost: a[2], kind: a[4] })).filter((x) => !x.kind);
}

/* ---------- 买住宅地（归属由服务器的 plots 表决定，这里只改存档） ---------- */
export const MAX_HOUSES = 2;
export function buyPlot(prev: State, id: number, place: PlaceId, price: number, name: string): Result {
  if (prev.at !== place) return { state: prev, toast: `先到${PLACES[place].name}` };
  if (Object.keys(prev.houses || {}).length >= MAX_HOUSES) return { state: prev, toast: `每人最多 ${MAX_HOUSES} 块住宅地` };
  if (prev.money < price) return { state: prev, toast: `还差¥${(price - prev.money).toLocaleString()}` };
  const s = structuredClone(prev);
  s.money -= price; s.houses = { ...(s.houses || {}), [id]: place }; s.fun = clamp(s.fun + 25);
  const moveIn = s.home !== "sjxc";
  if (moveIn) { s.money += s.deposit || 0; s.deposit = undefined; s.home = "sjxc"; s.homeAt = place; s.ownPlot = id; s.rentDay = undefined; }
  log(s, `买下${name}，花了¥${price.toLocaleString()}${moveIn ? "，直接盖房搬了进去。从此不用交房租！" : "。"}`);
  return { state: s, toast: `买下${name}了！🏡`, label: `买下${name}` };
}

export function sellPlot(prev: State, id: number, price: number, name: string): Result {
  if (!prev.houses?.[id]) return { state: prev, toast: "这块不是侬的" };
  const s = structuredClone(prev);
  const back = Math.round(price * 0.7); // 卖回给市政府只给七成
  s.money += back; const h = { ...s.houses }; delete h[id]; s.houses = h;
  if (s.ownPlot === id) { s.ownPlot = undefined; s.homeAt = undefined; s.home = "hostel"; s.rentDay = undefined; }
  log(s, `卖掉了${name}，到手¥${back.toLocaleString()}（市政府按七成回收）${prev.ownPlot === id ? "，先回青年旅舍住" : ""}。`);
  return { state: s, toast: `卖掉了，到手¥${back.toLocaleString()}` };
}

export function isState(x: unknown): x is State {
  return !!x && typeof x === "object" && (x as State).v === 2 && typeof (x as State).name === "string";
}
