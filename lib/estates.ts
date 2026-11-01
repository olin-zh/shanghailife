// 前滩商业地块：买地 → 盖健身房 / 咖啡馆 / 超市 / 服装店 → 挂招牌 → 雇玩家来打工。
// 规则前后端共用；谁买了、账上多少钱存在 estates 表。
import { onGrid } from "./geo";
import { PLACES, advance, apply, check, gainSkills, log, sBonus, type PlaceId, type SkillId, type State } from "./game";

// 12 块商业地分散在全市，各自挂在一个地点旁边；地段越好越贵、客流越大
export const LOTS: { place: PlaceId; dx: number; dz: number; price: number; traffic: number }[] = [
  { place: "ljz", dx: 6, dz: 5, price: 180000, traffic: 1.6 },
  { place: "njl", dx: -5, dz: -5, price: 165000, traffic: 1.55 },
  { place: "xtd", dx: 5, dz: 5, price: 150000, traffic: 1.45 },
  { place: "jas", dx: -6, dz: -4, price: 140000, traffic: 1.4 },
  { place: "xjh", dx: -6, dz: 4, price: 120000, traffic: 1.3 },
  { place: "wjc", dx: 6, dz: 4, price: 100000, traffic: 1.2 },
  { place: "qt", dx: 0, dz: 6, price: 95000, traffic: 1.15 },
  { place: "zj", dx: 6, dz: -5, price: 85000, traffic: 1.05 },
  { place: "hq", dx: -6, dz: 5, price: 80000, traffic: 1.0 },
  { place: "sjgy", dx: 6, dz: 6, price: 70000, traffic: 0.9 },
  { place: "sjxc", dx: -26, dz: 4, price: 45000, traffic: 0.65 },
  { place: "dsh", dx: 8, dz: -20, price: 40000, traffic: 0.55 },
];
export const ESTATE_COUNT = LOTS.length;
export const MAX_ESTATES = 2; // 每人最多 2 块
export const MAX_STAFF = 3; // 每家最多雇 3 人
export const SIGN_MAX_BYTES = 300 * 1024;
export const HIDE_AFTER_REPORTS = 3;
export const estatePrice = (id: number) => LOTS[id].price;
export const estatePlace = (id: number) => LOTS[id].place;
export const estatePos = (id: number) => onGrid({ x: PLACES[LOTS[id].place].x + LOTS[id].dx, z: PLACES[LOTS[id].place].z + LOTS[id].dz });
export const estateName = (id: number) => `${PLACES[LOTS[id].place].name}商业地块`;
export const estateAt = (place: PlaceId) => LOTS.findIndex((l) => l.place === place);

export type EstateKind = "gym" | "cafe" | "market" | "clothes";
type Eff = Partial<Record<"energy" | "hunger" | "fun" | "social", number>>;
export const EKINDS: Record<EstateKind, {
  name: string; ic: string; build: number; ref: number; eff: Eff; sk?: Partial<Record<SkillId, number>>;
  upkeep: number; shift: number; boost: SkillId; color: number; staffSkill: SkillId; desc: string;
}> = {
  gym: { name: "健身房", ic: "🏋️", build: 60000, ref: 80, eff: { fun: 10, energy: -10, social: 4 }, sk: { fit: 3 }, upkeep: 900, shift: 520, boost: "fit", staffSkill: "fit", color: 0x2f86c9, desc: "玩家来练一次体能 +3" },
  cafe: { name: "咖啡馆", ic: "☕", build: 30000, ref: 35, eff: { energy: 14, fun: 8 }, upkeep: 500, shift: 380, boost: "cook", staffSkill: "cook", color: 0x6b4a33, desc: "提神又开心" },
  market: { name: "超市", ic: "🛒", build: 80000, ref: 30, eff: { hunger: 55 }, upkeep: 1100, shift: 600, boost: "pro", staffSkill: "pro", color: 0x4aa65a, desc: "买菜回家，填饱肚皮最划算" },
  clothes: { name: "服装店", ic: "👗", build: 45000, ref: 220, eff: { fun: 18, social: 10 }, upkeep: 700, shift: 450, boost: "talk", staffSkill: "talk", color: 0xd4568a, desc: "买身新衣服，心情和社交都好" },
};
export const WAGE_MIN = 150, WAGE_MAX = 900;
export const SHIFT_MINS = 240;
const COST_RATE = 0.45;
const NPC_PER_HOUR = 2.2;

export const priceOk = (k: EstateKind, p: number) => Number.isInteger(p) && p >= Math.ceil(EKINDS[k].ref * 0.3) && p <= EKINDS[k].ref * 4;
export const wageOk = (w: number) => Number.isInteger(w) && w >= WAGE_MIN && w <= WAGE_MAX;

// 散客：价格越低人越多；每多一名员工客流 +20%；店主相关能力再加成
export function npcPerHour(id: number, k: EstateKind, price: number, staff: number, boost = 0) {
  const traffic = LOTS[id].traffic;
  const customers = traffic * NPC_PER_HOUR * Math.min(2.5, Math.pow(EKINDS[k].ref / price, 1.6)) * (1 + staff * 0.2) * (1 + boost);
  return { customers, profit: customers * (price - EKINDS[k].ref * COST_RATE) };
}
export function settle(id: number, k: EstateKind, price: number, staff: number, till: number, npc: number, since: number, now: number, boost = 0) {
  const h = Math.max(0, (now - since) / 3600_000);
  const { customers, profit } = npcPerHour(id, k, price, staff, boost);
  return { till: till + h * (profit - EKINDS[k].upkeep / 24), npc: npc + customers * h };
}
export const perDay = (id: number, k: EstateKind, price: number, staff: number, boost = 0) => Math.round(npcPerHour(id, k, price, staff, boost).profit * 24 - EKINDS[k].upkeep);

export type Staff = { id: string; name: string };
export type Estate = {
  id: number; price: number; ownerName: string | null; kind: EstateKind | null; name: string | null; sell: number | null;
  wage: number | null; openings: number; staff: Staff[]; sign: number; mine?: boolean; till?: number; visits?: number; npc?: number;
};

// 玩家进店消费
export function visitEstate(prev: State, e: { kind: EstateKind; name: string; price: number; ownerName: string }) {
  if (prev.money < e.price) return { state: prev, toast: "钞票不够" };
  const k = EKINDS[e.kind], s = structuredClone(prev);
  const eff = { ...k.eff }; if ((eff.energy || 0) < 0) eff.energy = eff.energy! / (1 + sBonus(s, "fit"));
  s.money -= e.price; apply(s, eff); advance(s, e.kind === "gym" ? 90 : 40);
  log(s, `在${e.ownerName}的${k.name}「${e.name}」消费了¥${e.price}。`);
  if (k.sk) gainSkills(s, k.sk);
  check(s);
  return { state: s, toast: `${k.ic} 在「${e.name}」消费了¥${e.price}` };
}
// 员工上一班：每个游戏日一次，花 4 小时、掉精力，练对应能力
export function canShift(s: State) {
  if (s.shiftDay === s.day) return "今天已经在店里上过班了";
  if (s.energy < 20) return "太累了，先休息一下";
  return null;
}
export function doShift(prev: State, e: { kind: EstateKind; name: string; wage: number; ownerName: string }) {
  const s = structuredClone(prev), k = EKINDS[e.kind];
  s.shiftDay = s.day; s.money += e.wage;
  apply(s, { energy: -18 / (1 + sBonus(s, "fit")), hunger: -12, social: 6 }); advance(s, SHIFT_MINS);
  log(s, `在${e.ownerName}的${k.name}「${e.name}」上了一班，拿到工资¥${e.wage}。`);
  gainSkills(s, { [k.staffSkill]: 1 });
  check(s);
  return { state: s, toast: `下班了，工资¥${e.wage} 到手` };
}
// 这一班给店里带来的营业额：员工相关能力越高越多
export const shiftRevenue = (staff: State, k: EstateKind) => Math.round(EKINDS[k].shift * (1 + sBonus(staff, EKINDS[k].staffSkill)));
