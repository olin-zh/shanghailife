// 松江新城：24 块地，6 列 × 4 行。价格和位置写在代码里，谁买了存在数据库 plots 表。
export const PLOT_COUNT = 24;
export const SUBURB = { x: -152, z: 58 }; // 售楼处位置，和 PLACES.sjxc 一致

export function plotPrice(id: number) {
  const row = Math.floor(id / 6), col = id % 6;
  // 靠湖（第一排）、靠路口（中间两列）更贵
  return 28000 + (3 - row) * 12000 + (col === 2 || col === 3 ? 8000 : 0);
}
export function plotPos(id: number) {
  const row = Math.floor(id / 6), col = id % 6;
  return { x: SUBURB.x - 15 + col * 6, z: SUBURB.z + 6 + row * 6 };
}
export const plotName = (id: number) => `${String.fromCharCode(65 + Math.floor(id / 6))}${(id % 6) + 1}号地`;
export type Plot = { id: number; price: number; owner: string | null; ownerName: string | null; mine?: boolean };
