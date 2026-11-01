// 游船广告：规则写在这里，前后端共用。
export const BOAT_COUNT = 150;
export const HUANGPU_BOATS = 120; // 0–119 在黄浦江，120–149 在苏州河
export const AD_PRICE = 2000; // 游戏币
export const AD_DAYS = 7; // 真实天数
export const AD_MAX_PER_PLAYER = 3;
export const AD_MAX_BYTES = 300 * 1024;
export const HIDE_AFTER_REPORTS = 3;
export const boatName = (id: number) => (id < HUANGPU_BOATS ? `黄浦江 ${id + 1} 号游船` : `苏州河 ${id - HUANGPU_BOATS + 1} 号小船`);
export type Boat = { id: number; ownerName: string | null; caption: string | null; version: number; expiresAt: number | null; mine?: boolean };

// 只认 JPEG / PNG / WebP 的文件头
export function sniffImage(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}
