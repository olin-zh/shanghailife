// 开店：10 个铺面，所有玩家共享。收入和铺租按真实时间结算，结果存在 shops 表。
import type { PlaceId, State } from "./game";

export type ShopKind = "cafe" | "shengjian" | "bar" | "tea";
export const KINDS: Record<ShopKind, { name: string; ic: string; ref: number; eff: Partial<Record<"energy" | "hunger" | "fun" | "social", number>>; color: number }> = {
  cafe: { name: "咖啡馆", ic: "☕", ref: 32, eff: { energy: 12, fun: 8 }, color: 0x6b4a33 },
  shengjian: { name: "生煎铺", ic: "🥟", ref: 18, eff: { hunger: 40, fun: 3 }, color: 0xc4472f },
  bar: { name: "小酒馆", ic: "🍻", ref: 68, eff: { fun: 20, social: 10, energy: -5 }, color: 0x2f3a6b },
  tea: { name: "奶茶店", ic: "🧋", ref: 22, eff: { fun: 10, hunger: 8 }, color: 0xd4568a },
};
// 铺面：地段客流系数、每天铺租（真实一天）
export const SLOTS: { place: PlaceId; traffic: number; rent: number }[] = [
  { place: "xtd", traffic: 1.4, rent: 420 }, { place: "njl", traffic: 1.5, rent: 460 }, { place: "ljz", traffic: 1.3, rent: 440 },
  { place: "chp", traffic: 1.4, rent: 400 }, { place: "wk", traffic: 1.2, rent: 340 }, { place: "tzf", traffic: 1.1, rent: 300 },
  { place: "jas", traffic: 1.1, rent: 320 }, { place: "ykl", traffic: 1.0, rent: 260 }, { place: "wjc", traffic: 1.0, rent: 240 },
  { place: "dsh", traffic: 0.6, rent: 120 },
];
export const DEPOSIT = 6000;
export const COST_RATE = 0.45; // 每卖出一份的成本 = 参考价 × 45%
const NPC_PER_HOUR = 2.0;

// NPC 客流：价格越低人越多，但每份赚得越少；大约在参考价的 1.2 倍时最赚
export function npcPerHour(slot: number, kind: ShopKind, price: number) {
  const k = KINDS[kind], ref = k.ref;
  const customers = SLOTS[slot].traffic * NPC_PER_HOUR * Math.min(2.5, Math.pow(ref / price, 1.6));
  return { customers, profit: customers * (price - ref * COST_RATE) };
}
export function settle(slot: number, kind: ShopKind, price: number, till: number, npc: number, since: number, now: number, boost = 0) {
  const h = Math.max(0, (now - since) / 3600_000);
  const base = npcPerHour(slot, kind, price), customers = base.customers * (1 + boost), profit = base.profit * (1 + boost); // boost = 店主厨艺加成
  return { till: till + h * (profit - SLOTS[slot].rent / 24), npc: npc + customers * h };
}
export const priceOk = (kind: ShopKind, p: number) => Number.isInteger(p) && p >= Math.ceil(KINDS[kind].ref * 0.3) && p <= KINDS[kind].ref * 4;
export const slotAt = (place: PlaceId) => SLOTS.findIndex((s) => s.place === place);

export type Shop = { id: number; place: PlaceId; ownerName: string | null; kind: ShopKind | null; name: string | null; price: number | null; mine?: boolean; till?: number; sold?: number; npc?: number; openedAt?: number | null };

// 玩家进店消费：扣钱、加状态、记一笔
export function visitShop(prev: State, shop: { kind: ShopKind; name: string; price: number; ownerName: string }) {
  if (prev.money < shop.price) return { state: prev, toast: "钞票不够" };
  const s = structuredClone(prev);
  const k = KINDS[shop.kind];
  s.money -= shop.price;
  for (const key in k.eff) { const kk = key as keyof typeof k.eff; s[kk] = Math.max(0, Math.min(100, s[kk] + (k.eff[kk] || 0))); }
  s.min += 30; while (s.min >= 1440) { s.min -= 1440; s.day++; }
  s.log.unshift([`第${s.day}天`, `在${shop.ownerName}开的「${shop.name}」消费了¥${shop.price}。`]); s.log = s.log.slice(0, 40);
  return { state: s, toast: `${k.ic} 在「${shop.name}」消费了¥${shop.price}` };
}
