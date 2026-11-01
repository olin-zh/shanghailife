// 地图网格：每格 4 个地图单位（市区约 300 米）。前后端共用，纯数据，不依赖 three.js。
// 道路、河流按真实走向折成 0°/45°/90° 的折线，再把经过的格子标成对应用途。
import { geo, HUANGPU, SUZHOU_CREEK, CELL, XMIN, ZMIN } from "./geo";
import { PLACES, type PlaceId } from "./game";

export { CELL, XMIN, ZMIN };
export const COLS = 96, ROWS = 84; // x: -152..232, z: -132..204
export const XMAX = XMIN + COLS * CELL, ZMAX = ZMIN + ROWS * CELL;

export const enum T { Land = 0, Sea = 1, River = 2, Road = 3, Park = 4, Reserved = 5 }
export type Zone = "res" | "com";

type Pt = [number, number];
const G = (lon: number, lat: number): Pt => { const p = geo(lon, lat); return [p.x, p.z]; };
export const cellOf = (x: number, z: number): Pt => [Math.floor((x - XMIN) / CELL), Math.floor((z - ZMIN) / CELL)];
export const centerOf = (i: number, j: number): Pt => [XMIN + (i + 0.5) * CELL, ZMIN + (j + 0.5) * CELL];
export const snap = (x: number, z: number): Pt => { const [i, j] = cellOf(x, z); return centerOf(i, j); };
const inside = (i: number, j: number) => i >= 0 && j >= 0 && i < COLS && j < ROWS;

// 把一串点吸附到格心，并把每段拆成“直—斜—直”，只留 0°/45°/90°
export function octilinear(pts: Pt[]): Pt[] {
  const s = pts.map(([x, z]) => snap(x, z)).filter((p, k, a) => !k || p[0] !== a[k - 1][0] || p[1] !== a[k - 1][1]);
  const out: Pt[] = s.length ? [s[0]] : [];
  for (let k = 1; k < s.length; k++) {
    const [ax, az] = s[k - 1], [bx, bz] = s[k];
    const dx = (bx - ax) / CELL, dz = (bz - az) / CELL, ad = Math.abs(dx), bd = Math.abs(dz);
    const diag = Math.min(ad, bd), sx = Math.sign(dx), sz = Math.sign(dz);
    const straight = Math.max(ad, bd) - diag, h1 = Math.floor(straight / 2);
    const st = ad > bd ? [sx, 0] : [0, sz];
    const p1: Pt = [ax + st[0] * h1 * CELL, az + st[1] * h1 * CELL];
    const p2: Pt = [p1[0] + sx * diag * CELL, p1[1] + sz * diag * CELL];
    for (const p of [p1, p2, [bx, bz] as Pt]) { const l = out[out.length - 1]; if (p[0] !== l[0] || p[1] !== l[1]) out.push(p); }
  }
  // 去掉共线的中间点
  return out.filter((p, k, a) => k === 0 || k === a.length - 1 || (p[0] - a[k - 1][0]) * (a[k + 1][1] - p[1]) !== (p[1] - a[k - 1][1]) * (a[k + 1][0] - p[0]));
}

/* ---------- 数据 ---------- */
export type Road = { name: string; w: number; ring?: boolean; pts: Pt[] };
const ROAD_DEFS: { name: string; w: number; ring?: boolean; ll: number[][] }[] = [
  { name: "内环高架", w: 2, ring: true, ll: [[121.405, 31.205], [121.415, 31.235], [121.44, 31.255], [121.47, 31.262], [121.495, 31.268], [121.535, 31.257], [121.552, 31.24], [121.555, 31.215], [121.54, 31.19], [121.515, 31.18], [121.49, 31.185], [121.46, 31.18], [121.43, 31.185], [121.405, 31.205]] },
  { name: "中环路", w: 2, ring: true, ll: [[121.37, 31.19], [121.375, 31.24], [121.395, 31.27], [121.44, 31.285], [121.49, 31.29], [121.53, 31.305], [121.575, 31.28], [121.6, 31.24], [121.585, 31.19], [121.55, 31.16], [121.49, 31.155], [121.43, 31.16], [121.39, 31.17], [121.37, 31.19]] },
  { name: "外环高速", w: 2.2, ring: true, ll: [[121.33, 31.15], [121.32, 31.22], [121.34, 31.29], [121.38, 31.335], [121.45, 31.35], [121.52, 31.355], [121.59, 31.33], [121.635, 31.27], [121.64, 31.2], [121.61, 31.13], [121.53, 31.08], [121.45, 31.065], [121.38, 31.09], [121.33, 31.15]] },
  { name: "延安高架", w: 2, ll: [[121.32, 31.197], [121.40, 31.206], [121.445, 31.2215], [121.475, 31.2262], [121.4915, 31.2305]] },
  { name: "南北高架", w: 2, ll: [[121.462, 31.33], [121.462, 31.235], [121.464, 31.18]] },
  { name: "南京路", w: 1.6, ll: [[121.44, 31.2245], [121.465, 31.231], [121.4765, 31.2345], [121.4905, 31.2398]] },
  { name: "淮海路", w: 1.6, ll: [[121.43, 31.205], [121.455, 31.213], [121.476, 31.2205], [121.494, 31.2255]] },
  { name: "肇嘉浜路", w: 1.6, ll: [[121.435, 31.193], [121.455, 31.199], [121.48, 31.207]] },
  { name: "中山东一路", w: 1.6, ll: [[121.4895, 31.20], [121.4915, 31.222], [121.4905, 31.2445], [121.497, 31.252]] },
  { name: "四平路", w: 1.6, ll: [[121.494, 31.2505], [121.505, 31.27], [121.514, 31.299]] },
  { name: "黄兴路", w: 1.6, ll: [[121.514, 31.299], [121.53, 31.28], [121.545, 31.27]] },
  { name: "世纪大道", w: 2, ll: [[121.502, 31.2395], [121.525, 31.229], [121.5527, 31.2183], [121.596, 31.204]] },
  { name: "浦东大道", w: 1.6, ll: [[121.503, 31.2445], [121.515, 31.247], [121.53, 31.253]] },
  { name: "杨高路", w: 1.6, ll: [[121.565, 31.30], [121.53, 31.258], [121.522, 31.22], [121.515, 31.18], [121.50, 31.14]] },
  { name: "世博大道", w: 1.6, ll: [[121.478, 31.19], [121.505, 31.185], [121.52, 31.18]] },
  { name: "G60 沪昆高速", w: 2, ll: [[121.435, 31.193], [121.38, 31.15], [121.30, 31.08], [121.228, 31.04], [121.15, 31.0]] },
  { name: "迎宾高速", w: 2, ll: [[121.596, 31.204], [121.70, 31.17], [121.795, 31.145]] },
  { name: "S2 沪芦高速", w: 2, ll: [[121.596, 31.204], [121.68, 31.10], [121.80, 30.98], [121.915, 30.91]] },
  { name: "G2 京沪高速", w: 2, ll: [[121.40, 31.206], [121.33, 31.25], [121.25, 31.30], [121.15, 31.34]] },
  { name: "S20 往宝山", w: 1.6, ll: [[121.462, 31.33], [121.40, 31.36], [121.33, 31.38]] },
];
export const ROADS: Road[] = ROAD_DEFS.map((r) => ({ name: r.name, w: r.w, ring: r.ring, pts: octilinear(r.ll.map(([a, b]) => G(a, b))) }));

export const RIVER_PTS = octilinear(HUANGPU.map(([a, b]) => G(a, b)));
export const CREEK_PTS = octilinear(SUZHOU_CREEK.map(([a, b]) => G(a, b)));
export const COAST_PTS = octilinear([[121.62, 31.45], [121.76, 31.32], [121.86, 31.2], [121.905, 31.1], [121.965, 31.0], [121.985, 30.9], [121.95, 30.84], [121.84, 30.83], [121.6, 30.81], [121.2, 30.76], [120.9, 30.72]].map(([a, b]) => G(a, b)));
// 海面多边形：海岸线 + 外侧角点
export const SEA_POLY: Pt[] = [...COAST_PTS, [-80, 260], [420, 260], [420, -220], [COAST_PTS[0][0] + 60, -220]];

export type Green = { name: string; i: number; j: number; w: number; h: number; hill?: boolean };
const GREEN_DEFS: [string, number, number, number, number, boolean?][] = [
  ["人民公园", 121.471, 31.2335, 2, 1], ["复兴公园", 121.468, 31.217, 1, 1], ["中山公园", 121.418, 31.222, 2, 2], ["鲁迅公园", 121.481, 31.272, 2, 2],
  ["静安雕塑公园", 121.461, 31.238, 1, 1], ["徐家汇公园", 121.443, 31.199, 1, 1], ["世纪公园", 121.5527, 31.2183, 4, 3], ["前滩公园", 121.478, 31.145, 1, 2],
  ["陆家嘴中心绿地", 121.505, 31.241, 1, 1], ["共青森林公园", 121.535, 31.322, 3, 3], ["顾村公园", 121.37, 31.35, 3, 3], ["炮台湾湿地", 121.50, 31.40, 2, 2],
  ["上海植物园", 121.445, 31.15, 2, 2], ["辰山植物园", 121.18, 31.08, 3, 2], ["佘山", 121.19, 31.105, 2, 2, true],
];
export const GREENS: Green[] = GREEN_DEFS.map(([name, lon, lat, w, h, hill]) => { const [x, z] = G(lon, lat); const [i, j] = cellOf(x, z); return { name, i: i - Math.floor((w - 1) / 2), j: j - Math.floor((h - 1) / 2), w, h, hill }; });

// 区：用各区中心点就近划分；黄浦江以东只能归浦东（闵行南部除外）
export type District = { name: string; east?: boolean; seeds: number[][]; label: number[] };
export const DISTRICTS: District[] = [
  { name: "黄浦", seeds: [[121.483, 31.228], [121.49, 31.205]], label: [121.483, 31.222] },
  { name: "静安", seeds: [[121.452, 31.234], [121.455, 31.27], [121.455, 31.30]], label: [121.45, 31.245] },
  { name: "徐汇", seeds: [[121.437, 31.185], [121.44, 31.15]], label: [121.43, 31.17] },
  { name: "长宁", seeds: [[121.40, 31.215], [121.36, 31.205]], label: [121.39, 31.215] },
  { name: "普陀", seeds: [[121.41, 31.25], [121.38, 31.265]], label: [121.40, 31.255] },
  { name: "虹口", seeds: [[121.49, 31.27], [121.48, 31.30]], label: [121.485, 31.28] },
  { name: "杨浦", seeds: [[121.53, 31.28], [121.52, 31.31]], label: [121.53, 31.29] },
  { name: "浦东", east: true, seeds: [[121.55, 31.22], [121.62, 31.25], [121.65, 31.15], [121.75, 31.12], [121.80, 31.03], [121.88, 30.93], [121.55, 31.30]], label: [121.6, 31.19] },
  { name: "闵行", seeds: [[121.38, 31.11], [121.33, 31.16], [121.45, 31.05]], label: [121.38, 31.12] },
  { name: "宝山", seeds: [[121.42, 31.36], [121.48, 31.37]], label: [121.42, 31.37] },
  { name: "嘉定", seeds: [[121.25, 31.36], [121.20, 31.30]], label: [121.24, 31.35] },
  { name: "青浦", seeds: [[121.12, 31.15], [121.20, 31.18]], label: [121.12, 31.16] },
  { name: "松江", seeds: [[121.22, 31.03], [121.18, 31.08]], label: [121.17, 31.04] },
  { name: "奉贤", seeds: [[121.47, 30.92], [121.60, 30.92]], label: [121.48, 30.94] },
  { name: "金山", seeds: [[121.25, 30.80], [121.10, 30.85]], label: [121.22, 30.84] },
];

export type Metro = { name: string; color: number; pts: Pt[] };
const METRO_DEFS: { name: string; color: number; ll: number[][] }[] = [
  { name: "1号线", color: 0xe4002b, ll: [[121.385, 31.111], [121.43, 31.155], [121.437, 31.193], [121.447, 31.205], [121.459, 31.215], [121.4745, 31.233], [121.455, 31.249], [121.448, 31.32], [121.42, 31.39]] },
  { name: "2号线", color: 0x97d700, ll: [[121.32, 31.195], [121.36, 31.218], [121.418, 31.222], [121.4453, 31.2232], [121.459, 31.229], [121.4745, 31.233], [121.484, 31.238], [121.502, 31.238], [121.527, 31.229], [121.552, 31.211], [121.59, 31.202], [121.62, 31.21], [121.70, 31.20], [121.80, 31.15]] },
  { name: "9号线", color: 0x71c5e8, ll: [[121.23, 30.99], [121.22, 31.03], [121.21, 31.10], [121.35, 31.155], [121.40, 31.17], [121.437, 31.193], [121.468, 31.207], [121.493, 31.21], [121.517, 31.234], [121.527, 31.229], [121.556, 31.233], [121.66, 31.27]] },
  { name: "10号线", color: 0xc6afd4, ll: [[121.32, 31.195], [121.35, 31.195], [121.432, 31.20], [121.459, 31.215], [121.4745, 31.218], [121.485, 31.218], [121.488, 31.227], [121.484, 31.238], [121.48, 31.248], [121.485, 31.255], [121.505, 31.282], [121.514, 31.299], [121.51, 31.33]] },
  { name: "16号线", color: 0x2cd5c4, ll: [[121.557, 31.204], [121.62, 31.12], [121.75, 31.04], [121.88, 30.92], [121.92, 30.905]] },
];
export const METROS: Metro[] = METRO_DEFS.map((m) => ({ name: m.name, color: m.color, pts: octilinear(m.ll.map(([a, b]) => G(a, b))) }));

/* ---------- 计算格子 ---------- */
const segDist = (x: number, z: number, a: Pt, b: Pt) => { const vx = b[0] - a[0], vz = b[1] - a[1], l2 = vx * vx + vz * vz || 1; const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / l2)); return Math.hypot(x - a[0] - t * vx, z - a[1] - t * vz); };
export const pathDist = (pts: Pt[], x: number, z: number) => { let d = 1e9; for (let k = 1; k < pts.length; k++) d = Math.min(d, segDist(x, z, pts[k - 1], pts[k])); return d; };
function inPoly(poly: Pt[], x: number, z: number) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; }
  return c;
}
// 点在黄浦江哪一边：+1 东岸（浦东），-1 西岸；超出江的南北范围返回 0
function riverSide(x: number, z: number) {
  if (z > RIVER_PTS[0][1] + 2 || z < RIVER_PTS[RIVER_PTS.length - 1][1] - 2) return 0;
  let best = 1e9, side = 0;
  for (let k = 1; k < RIVER_PTS.length; k++) {
    const a = RIVER_PTS[k - 1], b = RIVER_PTS[k], d = segDist(x, z, a, b);
    if (d < best) { best = d; side = Math.sign((b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0])); }
  }
  return -side || 0; // 江水自南向北流（z 变小），右手边是东岸
}

// 地标、机场、松江住宅区等预留的区域（不随机盖楼）
const RESERVE: { x: number; z: number; r: number }[] = [];
// 每个地标占的范围（半径，单位）：大的占好几格
const FOOT: Partial<Record<PlaceId, number>> = { ljz: 15, home: 10, wk: 11, zj: 11, hq: 11, xjh: 9, jas: 9, wjc: 10, expo: 9, gongfang: 9, jiangjing: 7, yangfang: 8, chp: 8, xtd: 9, njl: 8, tzf: 7, ykl: 7, metro: 5, ferry: 5, rmgy: 6, bund: 6, qt: 6, sjgy: 6 };
for (const k in PLACES) { const p = PLACES[k as PlaceId]; RESERVE.push({ x: p.x, z: p.z, r: FOOT[k as PlaceId] ?? 8 }); }
{ const [x0, z0] = G(121.4737, 31.2304); RESERVE.push({ x: x0, z: z0, r: 9 }); } // 人民广场
for (let i = 0; i < 9; i++) { const [x, z] = G(121.4897, 31.2318 + i * 0.0015); RESERVE.push({ x, z, r: 3.5 }); } // 外滩万国建筑
{ const s = PLACES.sjxc; RESERVE.push({ x: s.x, z: s.z + 10, r: 30 }); }
RESERVE.push({ x: PLACES.pvg.x, z: PLACES.pvg.z, r: 24 }, { x: PLACES.sha.x + 1, z: PLACES.sha.z, r: 17 }, { x: PLACES.dsh.x + 6, z: PLACES.dsh.z, r: 30 });

export type Grid = { type: Uint8Array; zone: Uint8Array; district: Int8Array; roadDist: Float32Array };
let cached: Grid | null = null;
export function buildGrid(): Grid {
  if (cached) return cached;
  const N = COLS * ROWS;
  const type = new Uint8Array(N), zone = new Uint8Array(N), district = new Int8Array(N).fill(-1), roadDist = new Float32Array(N);
  const seeds = DISTRICTS.flatMap((d, di) => d.seeds.map(([a, b]) => ({ di, east: !!d.east, p: G(a, b) })));
  const majorPts = ROADS.map((r) => r.pts);
  const outer = ROADS.find((r) => r.name === "外环高速")!.pts;
  const greenwayRiver = RIVER_PTS.filter(([, z]) => z > -40 && z < 60);
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
    const n = j * COLS + i, [x, z] = centerOf(i, j);
    if (inPoly(SEA_POLY, x, z)) { type[n] = T.Sea; continue; }
    const dr = pathDist(RIVER_PTS, x, z), dc = pathDist(CREEK_PTS, x, z);
    if (dr < 3.5 || dc < 1.6) { type[n] = T.River; continue; }
    let rd = 1e9; for (const p of majorPts) rd = Math.min(rd, pathDist(p, x, z));
    roadDist[n] = rd;
    if (rd < 1.2) type[n] = T.Road;
    else if (RESERVE.some((r) => Math.hypot(r.x - x, r.z - z) < r.r)) type[n] = T.Reserved;
    else if (dr < 7.5 && greenwayRiver.length && pathDist(greenwayRiver, x, z) < 7.5) type[n] = T.Park; // 滨江绿道
    else if (pathDist(outer, x, z) < 5.5) type[n] = T.Park; // 外环绿带
    // 区
    const side = riverSide(x, z);
    let bd = 1e9, bi = -1;
    for (const s of seeds) { if (side === 1 && !s.east && z < 40) continue; if (side === -1 && s.east) continue; const d = Math.hypot(s.p[0] - x, s.p[1] - z); if (d < bd) { bd = d; bi = s.di; } }
    district[n] = bi;
    // 分区：市中心、主干道两侧、几个副中心是商业，其余住宅
    const r = Math.hypot(x, z), hub = ["xjh", "wjc", "zj", "ljz", "njl", "jas", "xtd", "qt", "hq"].some((k) => { const p = PLACES[k as PlaceId]; return Math.hypot(p.x - x, p.z - z) < 14; });
    zone[n] = r < 22 || hub || (rd < 5 && r < 70) ? 1 : 0;
  }
  for (const g of GREENS) for (let j = g.j; j < g.j + g.h; j++) for (let i = g.i; i < g.i + g.w; i++) if (inside(i, j)) { const n = j * COLS + i; if (type[n] !== T.Sea && type[n] !== T.River && type[n] !== T.Road) type[n] = T.Park; }
  cached = { type, zone, district, roadDist };
  return cached;
}
export const zoneAt = (g: Grid, i: number, j: number): Zone => (g.zone[j * COLS + i] ? "com" : "res");
