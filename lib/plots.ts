// 住宅地块：任何住宅格子都能买（编号 = 格子编号），谁买了存在 plots 表。
export type Plot = { id: number; ownerName: string; mine?: boolean };
