// 3D 上海地图：Three.js 低多边形场景 + HTML 图钉/名字层。
import * as THREE from "three";
import { PLACES, type PlaceId } from "./game";
import { PLOT_COUNT, SUBURB, plotName, plotPos, type Plot } from "./plots";
import { geo } from "./geo";
import { CELL, COLS, ROWS, XMIN, ZMIN, XMAX, ZMAX, T, buildGrid, centerOf, ROADS, RIVER_PTS, CREEK_PTS, COAST_PTS, SEA_POLY, GREENS, DISTRICTS, METROS } from "./grid";
import { BOAT_COUNT, HUANGPU_BOATS, type Boat } from "./boats";
import { KINDS, SLOTS, type Shop } from "./shops";
import { EKINDS, ESTATE_COUNT, LOTS, estatePos, type Estate } from "./estates";
const LOT_PLACE = LOTS.map((l) => l.place);

export type Other = { id: string; name: string; at: PlaceId; color: number; act?: string };
export type City = {
  setSelected(id: PlaceId | null): void;
  setHere(id: PlaceId | null): void;
  setMine(id: PlaceId | null): void;
  setPlots(list: Plot[]): void;
  setBoats(list: Boat[]): void;
  setShops(list: Shop[]): void;
  setEstates(list: Estate[]): void;
  setPlayers(list: Other[]): void;
  bubble(id: string, text: string): void;
  focus(id: PlaceId): void;
  zoomBy(f: number): void;
  dispose(): void;
};

export function createCity(root: HTMLElement, onPick: (id: PlaceId) => void, onPickPlayer: (id: string) => void, onPickBoat: (id: number) => void = () => {}): City {
  const canvas = document.createElement("canvas");
  canvas.className = "map";
  root.appendChild(canvas);
  const overlay = document.createElement("div");
  root.appendChild(overlay);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xa9c98f);
  let zoom = 1;
  const VIEW = 50;
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -200, 400);
  const target = new THREE.Vector3(10, 0, -2);
  const camDir = new THREE.Vector3(1, 1.25, 1).normalize();
  const placeCam = () => { cam.position.copy(target).addScaledVector(camDir, 120); cam.lookAt(target); };
  const resize = () => {
    const w = root.clientWidth, h = root.clientHeight, a = w / h, v = VIEW / zoom;
    cam.left = -v * a; cam.right = v * a; cam.top = v; cam.bottom = -v; cam.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    root.classList.toggle("zoomed", zoom > 1.5); if (typeof gridLines !== "undefined") gridLines.visible = zoom > 1.5;
  };
  addEventListener("resize", resize);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8aa070, 0.75 * Math.PI));
  const sun = new THREE.DirectionalLight(0xffffff, 0.75 * Math.PI);
  sun.position.set(-40, 80, 30); sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -260, right: 260, top: 260, bottom: -260, far: 600 });
  scene.add(sun);

  const M = (c: number) => new THREE.MeshLambertMaterial({ color: c });
  const mats = { grass: M(0xa9c98f), road: M(0x9aa09c), water: M(0x5aa7c9), stone: M(0xd8d2c4), grey: M(0xc9ccc8), white: M(0xf3f1ea), brick: M(0x9c5a43), roofTile: M(0x5b5550), red: M(0xb6402d), green: M(0x4f9a4c), dkgreen: M(0x3c7e3e), glass: M(0x9fc3d6), glass2: M(0x7fa6bd), pink: M(0xd4568a), bronze: M(0x8f7a55), gold: M(0xd1a94a), park: M(0x8fc27a), wood: M(0x8a6240), yellow: M(0xe9c44c), dk: M(0x3b4240), skin: M(0xf1c9a5) };
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = scene) => {
    const g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); g.position.set(x, y + h / 2, z); g.castShadow = g.receiveShadow = true; parent.add(g); return g;
  };
  const cyl = (rt: number, rb: number, h: number, m: THREE.Material, x: number, y: number, z: number, seg = 12, parent: THREE.Object3D = scene) => {
    const g = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); g.position.set(x, y + h / 2, z); g.castShadow = true; parent.add(g); return g;
  };
  const sphere = (r: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = scene) => {
    const g = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), m); g.position.set(x, y, z); g.castShadow = true; parent.add(g); return g;
  };
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const rnd = (a: number, b: number) => a + rand() * (b - a);
  const tree = (x: number, z: number, s = 1) => {
    cyl(0.15 * s, 0.2 * s, 1 * s, mats.wood, x, 0, z, 6);
    const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9 * s, 0), rand() < 0.5 ? mats.green : mats.dkgreen);
    c.position.set(x, 1.5 * s, z); c.castShadow = true; scene.add(c);
  };
  const plot = (x: number, z: number, w: number, d: number, m: THREE.Material = mats.stone) => {
    const g = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), m); g.position.set(x, 0.06, z); g.receiveShadow = true; scene.add(g);
  };

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), mats.grass);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  const ribbon = (pts: number[][], w: number, m: THREE.Material = mats.water, y = 0.05) => {
    const L: number[][] = [], R: number[][] = [];
    pts.forEach(([x, z], i) => {
      const [nx, nz] = pts[Math.min(i + 1, pts.length - 1)], [px, pz] = pts[Math.max(i - 1, 0)];
      let dx = nx - px, dz = nz - pz; const l = Math.hypot(dx, dz); dx /= l; dz /= l;
      // 折角处按斜接展宽，保证 45° 拐弯时宽度不变
      let k = 1; if (i > 0 && i < pts.length - 1) { const ax = x - px, az = z - pz, al = Math.hypot(ax, az), bx = nx - x, bz = nz - z, bl = Math.hypot(bx, bz); const c = (ax * bx + az * bz) / (al * bl); k = 1 / Math.max(0.5, Math.sqrt((1 + c) / 2)); }
      L.push([x + dz * w / 2 * k, z - dx * w / 2 * k]); R.push([x - dz * w / 2 * k, z + dx * w / 2 * k]);
    });
    const s = new THREE.Shape(); const all = [...L, ...R.reverse()];
    s.moveTo(all[0][0], -all[0][1]); all.slice(1).forEach((p) => s.lineTo(p[0], -p[1]));
    const g = new THREE.Mesh(new THREE.ShapeGeometry(s), m); g.rotation.x = -Math.PI / 2; g.position.y = y; g.receiveShadow = true; scene.add(g); return g;
  };
  const G = (lon: number, lat: number) => { const p = geo(lon, lat); return [p.x, p.z]; };
  const grid = buildGrid();
  const riverPts = RIVER_PTS as number[][], creekPts = CREEK_PTS as number[][];
  const coastPts = COAST_PTS as number[][];
  ribbon(riverPts, 7.5); ribbon(creekPts, 2.6);
  { const sh = new THREE.Shape(); sh.moveTo(SEA_POLY[0][0], -SEA_POLY[0][1]); SEA_POLY.slice(1).forEach((p) => sh.lineTo(p[0], -p[1]));
    const sea = new THREE.Mesh(new THREE.ShapeGeometry(sh), M(0x4f9fc4)); sea.rotation.x = -Math.PI / 2; sea.position.y = 0.04; sea.receiveShadow = true; scene.add(sea); }

  const road = (x1: number, z1: number, x2: number, z2: number, w = 1.6) => {
    const l = Math.hypot(x2 - x1, z2 - z1); const g = new THREE.Mesh(new THREE.BoxGeometry(l + w * 0.42, 0.08, w), mats.road);
    g.position.set((x1 + x2) / 2, 0.04, (z1 + z2) / 2); g.rotation.y = -Math.atan2(z2 - z1, x2 - x1); g.receiveShadow = true; scene.add(g);
  };
  // 主要道路：按真实走向折成 0°/45°/90°
  const roadMat = mats.road;
  ROADS.forEach((r) => ribbon(r.pts, r.w, roadMat, 0.07));
  const segs: number[][][] = ROADS.flatMap((r) => r.pts.slice(1).map((q, i) => [r.pts[i], q]));
  // 地铁线：细彩线，几条线在同一格时左右错开
  METROS.forEach((m, k) => { const off = (k - 2) * 0.32; ribbon(m.pts.map(([x, z]) => [x + off, z + off]), 0.42, new THREE.MeshBasicMaterial({ color: m.color }), 0.1); });

  /* ---- 网格：公园、绿带、行道树、街区楼 ---- */
  const dummy = new THREE.Object3D();
  const instanced = (geo3: THREE.BufferGeometry, m: THREE.Material, list: number[][], shadow = true) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo3, m, list.length);
    list.forEach(([x, y, z, sx, sy, sz, ry = 0], k) => { dummy.position.set(x, y, z); dummy.scale.set(sx, sy, sz); dummy.rotation.set(0, ry, 0); dummy.updateMatrix(); im.setMatrixAt(k, dummy.matrix); });
    im.castShadow = shadow; im.receiveShadow = true; scene.add(im); return im;
  };
  const unitBox = new THREE.BoxGeometry(1, 1, 1); unitBox.translate(0, 0.5, 0);
  const parkTiles: number[][] = [], trunks: number[][] = [], crowns: number[][] = [], crowns2: number[][] = [];
  const towers: Record<string, number[][]> = { white: [], grey: [], glass: [], glass2: [], brick: [] };
  const nearPlace = (x: number, z: number, r: number) => { for (const k in PLACES) { const p = PLACES[k as PlaceId]; if (Math.hypot(p.x - x, p.z - z) < r) return true; } return false; };
  const addTree = (x: number, z: number, sc: number) => { trunks.push([x, 0, z, 0.35 * sc, 1 * sc, 0.35 * sc]); (rand() < 0.5 ? crowns : crowns2).push([x, 1.5 * sc, z, sc, sc, sc]); };
  const lotSet = new Set<string>(); for (let i = 0; i < ESTATE_COUNT; i++) { const e = estatePos(i); lotSet.add(`${Math.floor((e.x - XMIN) / CELL)},${Math.floor((e.z - ZMIN) / CELL)}`); }
  const riverXAt = (z: number) => { let best = riverPts[0]; for (const p of riverPts) if (Math.abs(p[1] - z) < Math.abs(best[1] - z)) best = p; return best[0]; };
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
    const n = j * COLS + i, t = grid.type[n], [x, z] = centerOf(i, j);
    if (t === T.Park) {
      parkTiles.push([x, 0.02, z, CELL, 0.06, CELL]);
      for (let k = 0; k < 2; k++) { const tx = x + rnd(-1.5, 1.5), tz = z + rnd(-1.5, 1.5); if (!nearPlace(tx, tz, 6)) addTree(tx, tz, rnd(0.7, 1.05)); }
      continue;
    }
    if (t !== T.Land || lotSet.has(`${i},${j}`)) continue;
    const r = Math.hypot(x, z), com = grid.zone[n] === 1;
    const p = r < 25 ? 0.92 : r < 50 ? 0.75 : r < 80 ? 0.45 : com ? 0.25 : 0.07;
    if (rand() > p) { if (r > 60 && rand() < 0.5) addTree(x + rnd(-1.4, 1.4), z + rnd(-1.4, 1.4), rnd(0.6, 1)); continue; }
    const east = x > riverXAt(z) && z > -40 && z < 60;
    const base = com ? (r < 30 ? 6 : 3.5) : 1.6, h = rnd(1.5, 4) + base + Math.max(0, 40 - r) / (east ? 2.5 : 8);
    const w = rnd(2, 3.1), d = rnd(2, 3.1), key = east && com ? (rand() < 0.6 ? "glass" : "glass2") : com ? (rand() < 0.5 ? "white" : "glass2") : r < 35 && !east ? (rand() < 0.35 ? "brick" : "grey") : rand() < 0.5 ? "white" : "grey";
    towers[key].push([x + rnd(-0.4, 0.4), 0, z + rnd(-0.4, 0.4), w, Math.min(h, com ? 18 : 7), d]);
  }
  instanced(unitBox, mats.park, parkTiles, false);
  const trunkG = new THREE.CylinderGeometry(0.4, 0.55, 1, 6); trunkG.translate(0, 0.5, 0);
  instanced(trunkG, mats.wood, trunks); instanced(new THREE.IcosahedronGeometry(0.9, 0), mats.green, crowns); instanced(new THREE.IcosahedronGeometry(0.9, 0), mats.dkgreen, crowns2);
  instanced(unitBox, mats.white, towers.white); instanced(unitBox, mats.grey, towers.grey); instanced(unitBox, mats.glass, towers.glass); instanced(unitBox, mats.glass2, towers.glass2); instanced(unitBox, mats.brick, towers.brick);
  // 佘山：一座小山
  for (const g of GREENS) if (g.hill) { const [cx, cz] = centerOf(g.i, g.j); const hill = new THREE.Mesh(new THREE.ConeGeometry(CELL * g.w * 0.6, 7, 9), mats.dkgreen); hill.position.set(cx + CELL * (g.w - 1) / 2, 3.5, cz + CELL * (g.h - 1) / 2); hill.castShadow = true; scene.add(hill); }
  // 区界：相邻两格属于不同区，就在它们之间画一段线
  { const pts: number[] = [];
    const land = (n: number) => grid.type[n] !== T.Sea && grid.type[n] !== T.River;
    for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
      const n = j * COLS + i; if (!land(n)) continue;
      if (i + 1 < COLS && land(n + 1) && grid.district[n + 1] !== grid.district[n]) { const x = XMIN + (i + 1) * CELL, z = ZMIN + j * CELL; pts.push(x, 0.12, z, x, 0.12, z + CELL); }
      if (j + 1 < ROWS && land(n + COLS) && grid.district[n + COLS] !== grid.district[n]) { const x = XMIN + i * CELL, z = ZMIN + (j + 1) * CELL; pts.push(x, 0.12, z, x + CELL, 0.12, z); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x6d7f5f, transparent: true, opacity: 0.55 }))); }
  // 格子线：放大时才显示
  const gridLines = (() => { const pts: number[] = [];
    for (let i = 0; i <= COLS; i++) { const x = XMIN + i * CELL; pts.push(x, 0.11, ZMIN, x, 0.11, ZMAX); }
    for (let j = 0; j <= ROWS; j++) { const z = ZMIN + j * CELL; pts.push(XMIN, 0.11, z, XMAX, 0.11, z); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x3d5a3a, transparent: true, opacity: 0.3, depthWrite: false })); l.visible = false; l.renderOrder = 2; scene.add(l); return l; })();

  // 跨江大桥  // 跨江大桥：沿桥位处江的法线方向架桥
  const bridgeAt = (lon: number, lat: number) => {
    const [x, z] = G(lon, lat);
    let best = 0, bd = 1e9; riverPts.forEach(([px, pz], i) => { const d = Math.hypot(px - x, pz - z); if (d < bd) { bd = d; best = i; } });
    const a = riverPts[Math.max(0, best - 1)], b = riverPts[Math.min(riverPts.length - 1, best + 1)];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2;
    const g = new THREE.Group(); box(11, 0.4, 1.8, mats.white, 0, 1.6, 0, g); cyl(0.25, 0.25, 6, mats.white, -2.6, 0, 0, 8, g); cyl(0.25, 0.25, 6, mats.white, 2.6, 0, 0, 8, g);
    g.position.set(x, 0, z); g.rotation.y = -ang; scene.add(g);
  };
  bridgeAt(121.502, 31.205); bridgeAt(121.4855, 31.186); bridgeAt(121.535, 31.256);

  const P = PLACES;
  let maglev: { a: number[]; b: number[]; ang: number } | null = null;
  const mills: THREE.Group[] = [];
  const LM = { pearl: geo(121.4998, 31.2397), jinmao: { x: 33, z: -11.5 }, swfc: { x: 37, z: -10.5 }, tower: { x: 40.5, z: -7.5 }, rps: geo(121.4737, 31.2304) };
  const shiftSince = (m0: number, dx: number, dz: number) => { for (let i = m0; i < scene.children.length; i++) { scene.children[i].position.x += dx; scene.children[i].position.z += dz; } };

  /* ---- 松江新城：售楼处、湖、24 块地 ---- */
  { const { x, z } = SUBURB;
    road(x - 22, z - 6, x + 22, z - 6); road(x - 22, z + 27, x + 22, z + 27); road(x - 22, z - 6, x - 22, z + 27); road(x + 22, z - 6, x + 22, z + 27);
    plot(x, z - 2, 8, 5, mats.stone); box(6, 2.6, 3, mats.white, x, 0, z - 2.5); box(6.4, 0.3, 3.4, mats.glass2, x, 2.6, z - 2.5); box(4, 0.8, 0.15, mats.red, x, 1.6, z - 0.9);
    const lake = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 0.1, 28), mats.water); lake.position.set(x + 24, 0.12, z + 12); lake.scale.set(0.8, 1, 2); scene.add(lake);
    for (let i = 0; i < 18; i++) tree(x - 18 + i * 2.1, z + 31, 0.9);
    for (let i = 0; i < 4; i++) road(x - 18, z + 3 + i * 6 + 6, x + 18, z + 3 + i * 6 + 6, 0.8); }
  type Lot = { base: THREE.Mesh; sign: THREE.Group; house: THREE.Group | null; tag: HTMLButtonElement; owner: string | null };
  const lots: Lot[] = [];
  const lotMat = M(0xb9d49c), lotMine = M(0xf2d27a), fence = M(0xf6f3ea);
  for (let id = 0; id < PLOT_COUNT; id++) {
    const { x, z } = plotPos(id);
    const base = new THREE.Mesh(new THREE.BoxGeometry(5, 0.14, 5), lotMat); base.position.set(x, 0.07, z); base.receiveShadow = true; scene.add(base);
    [[0, -2.5, 5, 0.12], [0, 2.5, 5, 0.12], [-2.5, 0, 0.12, 5], [2.5, 0, 0.12, 5]].forEach(([dx, dz, w, d]) => box(w, 0.35, d, fence, x + dx, 0, z + dz));
    const sign = new THREE.Group(); box(0.12, 1.4, 0.12, mats.wood, 0, 0, 0, sign); box(1.2, 0.7, 0.08, mats.red, 0, 1.2, 0, sign); sign.position.set(x + 1.4, 0, z + 1.4); scene.add(sign);
    const tag = document.createElement("button"); tag.className = "lot"; tag.textContent = plotName(id); overlay.appendChild(tag);
    tag.onclick = (e) => { e.stopPropagation(); onPick("sjxc"); };
    lots.push({ base, sign, house: null, tag, owner: null });
  }
  const HOUSE_COLORS = [0xe0533d, 0x2f86c9, 0xe8a530, 0x4aa65a, 0x9a5cc4, 0xd4568a, 0x2fa8a0];
  const buildHouse = (id: number, seed: string) => {
    let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const g = new THREE.Group(); const wall = M([0xf3f1ea, 0xe9e1d0, 0xd9e2e8][h % 3]), roof = M(HOUSE_COLORS[h % HOUSE_COLORS.length]);
    box(3, 2.2, 2.6, wall, 0, 0, -0.3, g); const r = cyl(0, 2.4, 1.3, roof, 0, 2.2, -0.3, 4, g); r.rotation.y = Math.PI / 4; r.scale.set(1, 1, 0.9);
    box(0.7, 1.2, 0.08, M(0x6b4a33), 0, 0, 1.0, g); box(0.6, 0.5, 0.08, mats.glass, -0.9, 1, 1.0, g); box(0.6, 0.5, 0.08, mats.glass, 0.9, 1, 1.0, g);
    if (h % 2) box(0.4, 0.9, 0.4, mats.brick, 0.8, 2.6, -0.6, g);
    const { x, z } = plotPos(id); g.position.set(x, 0.14, z); scene.add(g); return g;
  };

  /* ---- 机场和滴水湖 ---- */
  // 磁悬浮：龙阳路 → 浦东机场，白色高架轨道
  { const [a, b] = [G(121.557, 31.204), G(121.80, 31.148)]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const track = new THREE.Mesh(new THREE.BoxGeometry(l, 0.3, 0.9), mats.white); track.position.set((a[0] + b[0]) / 2, 1.6, (a[1] + b[1]) / 2); track.rotation.y = -ang; track.castShadow = true; scene.add(track);
    for (let i = 1; i < l / 5; i++) cyl(0.2, 0.2, 1.5, mats.white, a[0] + Math.cos(ang) * i * 5, 0, a[1] + Math.sin(ang) * i * 5, 6);
    maglev = { a, b, ang }; }
  const airport = (x: number, z: number, big: boolean) => {
    plot(x, z, big ? 26 : 18, big ? 34 : 26, M(0xb7bdb6));
    [-1, 1].forEach((sgn) => { const rw = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, big ? 30 : 22), mats.dk); rw.position.set(x + sgn * (big ? 9 : 6), 0.16, z); scene.add(rw);
      for (let i = -5; i <= 5; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 1), mats.white); m.position.set(x + sgn * (big ? 9 : 6), 0.17, z + i * (big ? 2.6 : 1.9)); scene.add(m); } });
    // 航站楼：弧形屋顶的长条
    const tw = big ? 10 : 7; box(tw, 1.8, 4, mats.white, x, 0, z - 2); const roof = cyl(2.2, 2.2, tw, mats.glass2, x, 1.8, z - 2, 16); roof.rotation.z = Math.PI / 2; roof.position.y = 1.8; roof.scale.set(0.35, 1, 1);
    if (big) { box(tw, 1.8, 4, mats.white, x, 0, z + 6); const r2 = cyl(2.2, 2.2, tw, mats.glass2, x, 1.8, z + 6, 16); r2.rotation.z = Math.PI / 2; r2.position.y = 1.8; r2.scale.set(0.35, 1, 1); }
    cyl(0.5, 0.6, 6, mats.white, x + tw / 2 + 2, 0, z + 2, 8); box(1.6, 1, 1.6, mats.glass, x + tw / 2 + 2, 6, z + 2); // 塔台
  };
  airport(P.pvg.x, P.pvg.z, true);
  airport(P.sha.x + 1, P.sha.z, false); // 跑道在虹桥火车站东边
  // 飞机：两架绕着机场起降
  const planes: { g: THREE.Group; cx: number; cz: number; r: number; ph: number }[] = [];
  [[P.pvg.x, P.pvg.z, 22], [P.sha.x + 1, P.sha.z, 16]].forEach(([cx, cz, r], i) => {
    const g = new THREE.Group(); box(0.6, 0.6, 3.6, mats.white, 0, 0, 0, g); box(4.2, 0.12, 0.9, mats.white, 0, 0.25, 0.2, g); box(1.6, 0.1, 0.5, mats.white, 0, 0.3, -1.6, g); box(0.1, 0.8, 0.6, mats.red, 0, 0.5, -1.6, g);
    scene.add(g); planes.push({ g, cx, cz, r, ph: i * 2 });
  });
  // 滴水湖：同心圆的湖、湖心岛、风车
  { const { x, z } = P.dsh;
    const ring = (r: number, m: THREE.Material, y: number) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.1, 40), m); c.position.set(x, y, z); c.receiveShadow = true; scene.add(c); };
    ring(16, mats.park, 0.06); ring(13, mats.stone, 0.08); ring(12, mats.water, 0.1); ring(3, mats.park, 0.14);
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; tree(x + Math.cos(a) * 14.5, z + Math.sin(a) * 14.5, 0.8); }
    for (let i = 0; i < 4; i++) tree(x - 1 + (i % 2) * 2, z - 1 + Math.floor(i / 2) * 2, 0.7);
    for (let i = 0; i < 3; i++) { const wx = x + 22 + i * 4, wz = z - 6 + i * 5; cyl(0.2, 0.3, 7, mats.white, wx, 0, wz, 8); const hub = new THREE.Group(); [0, 1, 2].forEach((k) => { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3, 0.1), mats.white); bl.position.y = 1.5; const arm = new THREE.Group(); arm.add(bl); arm.rotation.z = (k * Math.PI * 2) / 3; hub.add(arm); }); hub.position.set(wx, 7, wz + 0.3); scene.add(hub); mills.push(hub); }
  }

  /* ---- 新地标 ---- */
  { const m0 = scene.children.length;
  // 南京路步行街：一排霓虹店招
  for (let i = 0; i < 5; i++) { const x = -14 + i * 2.6; box(2.2, 3 + (i % 2), 2.2, i % 2 ? mats.white : mats.stone, x, 0, -7.6); box(2.3, 0.6, 0.15, [mats.red, mats.yellow, mats.pink][i % 3], x, 2.2, -6.45); }
  plot(-9, -4.2, 13, 1.6, mats.stone);
  shiftSince(m0, P.njl.x - (-9), P.njl.z - (-5)); }
  { const m0 = scene.children.length;
  // 静安寺：金顶
  { const x = -64, z = -7; plot(x, z, 9, 8, mats.stone); box(5, 2.2, 4, mats.yellow, x, 0, z - 1); box(5.6, 0.4, 4.6, mats.gold, x, 2.2, z - 1); cyl(0, 1.6, 2.2, mats.gold, x, 2.6, z - 1, 4); cyl(0.12, 0.12, 2, mats.gold, x, 4.8, z - 1, 6);
    [[-3, 2], [3, 2]].forEach(([dx, dz]) => { box(1, 3, 1, mats.yellow, x + dx, 0, z + dz); cyl(0, 0.8, 1.2, mats.gold, x + dx, 3, z + dz, 4); });
    box(3, 9, 3, mats.glass, x + 7, 0, z - 3); box(3, 7, 3, mats.white, x - 7, 0, z - 4); }
  shiftSince(m0, P.jas.x - (-64), P.jas.z - (-7)); }
  { const m0 = scene.children.length;
  // 新天地：低矮石库门 + 阳伞
  { const x = -14, z = 36; plot(x, z, 12, 8, mats.stone); for (let i = 0; i < 4; i++) { box(2.6, 2.2, 2.4, i % 2 ? mats.brick : mats.grey, x - 4.5 + i * 3, 0, z - 2); box(2.8, 0.4, 2.6, mats.roofTile, x - 4.5 + i * 3, 2.2, z - 2); }
    for (let i = 0; i < 4; i++) { cyl(0.05, 0.05, 1.4, mats.dk, x - 4 + i * 2.6, 0, z + 1.6, 6); cyl(0, 0.9, 0.4, [mats.red, mats.white][i % 2], x - 4 + i * 2.6, 1.3, z + 1.6, 8); } }
  shiftSince(m0, P.xtd.x - (-14), P.xtd.z - (36)); }
  { const m0 = scene.children.length;
  // 徐家汇天主教堂：红砖双尖塔
  { const x = -76, z = 34; plot(x, z, 10, 10, mats.park); box(3.4, 4, 7, mats.brick, x, 0, z); cyl(0, 2.2, 1.6, mats.roofTile, x, 4, z, 4).scale.set(1, 1, 2.2);
    [[-1.1], [1.1]].forEach(([dx]) => { box(1.2, 7, 1.2, mats.brick, x + dx, 0, z - 3.6); cyl(0, 0.85, 3.4, mats.dk, x + dx, 7, z - 3.6, 4); });
    box(6, 6, 6, mats.glass2, x + 9, 0, z - 4); }
  shiftSince(m0, P.xjh.x - (-76), P.xjh.z - (34)); }
  { const m0 = scene.children.length;
  // 虹桥火车站：长条站房 + 高铁
  { const x = -118, z = 6; plot(x, z, 16, 12, mats.grey); box(14, 3, 7, mats.white, x, 0, z - 1.5); box(14.6, 0.5, 7.6, mats.glass2, x, 3, z - 1.5);
    const hsr = new THREE.Group(); for (let i = 0; i < 5; i++) box(2.6, 0.9, 1, mats.white, i * 2.7, 0, 0, hsr); box(13.5, 0.12, 1.02, mats.glass2, 5.4, 0.45, 0, hsr); hsr.position.set(x - 7, 0.1, z + 4.2); scene.add(hsr); }
  shiftSince(m0, P.hq.x - (-118), P.hq.z - (6)); }
  { const m0 = scene.children.length;
  // 五角场：彩蛋 + 大学楼
  { const x = -30, z = -58; plot(x, z, 12, 12, mats.grey); sphere(2.2, mats.yellow, x, 4.2, z).scale.set(1.3, 0.8, 1.3); [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]].forEach(([dx, dz]) => cyl(0.15, 0.15, 3.6, mats.white, x + dx, 0, z + dz, 6));
    box(4, 6, 3, mats.brick, x - 8, 0, z + 3); box(4, 5, 3, mats.brick, x - 8, 0, z - 2); box(5, 4, 4, mats.white, x + 8, 0, z); for (let i = 0; i < 6; i++) tree(x - 11 + i * 1.6, z + 7, 0.9); }
  shiftSince(m0, P.wjc.x - (-30), P.wjc.z - (-58)); }
  { const m0 = scene.children.length;
  // 世博中国馆：红色倒斗拱
  { const x = 28, z = 52; plot(x, z, 12, 12, mats.grey); box(2.4, 4, 2.4, mats.red, x, 0, z); [5, 6, 7, 8, 9].forEach((w, i) => box(w, 1.2, w, mats.red, x, 4 + i * 1.2, z)); box(10, 1.2, 10, mats.red, x, 10, z); }
  shiftSince(m0, P.expo.x - (28), P.expo.z - (52)); }
  { const m0 = scene.children.length;
  // 世纪公园：大草坪 + 湖
  { const x = 66, z = -6; plot(x, z, 22, 16, mats.park); const lake = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.1, 24), mats.water); lake.position.set(x + 4, 0.15, z - 2); lake.scale.set(1.4, 1, 1); scene.add(lake);
    for (let i = 0; i < 22; i++) tree(x - 10 + rand() * 20, z - 7 + rand() * 14, 1); }
  shiftSince(m0, P.sjgy.x - (66), P.sjgy.z - (-6)); }
  { const m0 = scene.children.length;
  // 张江：科技园 + 张江之尚
  { const x = 96, z = 24; plot(x, z, 16, 14, mats.grey); box(3, 14, 3, mats.glass, x, 0, z - 3); box(4, 6, 6, mats.white, x - 6, 0, z + 2); box(4, 8, 4, mats.glass2, x + 6, 0, z + 1); box(6, 3, 3, mats.white, x, 0, z + 4); for (let i = 0; i < 6; i++) tree(x - 8 + i * 3, z + 7.5, 0.9); }
  shiftSince(m0, P.zj.x - (96), P.zj.z - (24)); }
  { const m0 = scene.children.length;
  // 杨浦老公房：六层灰楼
  { const x = -44, z = -50; plot(x, z, 12, 10, mats.stone); [[-3.5, -2], [3.5, -2], [0, 3]].forEach(([dx, dz]) => { box(5.5, 5, 3, mats.grey, x + dx, 0, z + dz); box(5.7, 0.3, 3.2, mats.brick, x + dx, 5, z + dz); }); }
  shiftSince(m0, P.gongfang.x - (-44), P.gongfang.z - (-50)); }
  { const m0 = scene.children.length;
  // 陆家嘴江景公寓：两栋高层
  { const x = 44, z = -24; plot(x, z, 10, 8, mats.grey); box(3, 16, 3, mats.glass, x - 2, 0, z); box(3, 13, 3, mats.white, x + 2.5, 0, z - 1); }
  shiftSince(m0, P.jiangjing.x - (44), P.jiangjing.z - (-24)); }
  { const m0 = scene.children.length;
  // 徐汇老洋房：坡屋顶 + 花园
  { const x = -60, z = 24; plot(x, z, 10, 9, mats.park); box(4.4, 3, 3.6, mats.white, x, 0, z - 1.5); cyl(0, 3.2, 1.8, mats.red, x, 3, z - 1.5, 4); box(0.6, 1.4, 0.6, mats.brick, x + 1.2, 3.6, z - 1.5);
    for (let i = 0; i < 6; i++) tree(x - 4 + i * 1.6, z + 3.5, 0.8); }


  shiftSince(m0, P.yangfang.x - (-60), P.yangfang.z - (24)); }
  { const m0 = scene.children.length;
  // 东方明珠
  { const x = 15, z = -10; plot(x, z, 6, 6, mats.grey);
    [[-1.2, -1.2], [1.2, -1.2], [0, 1.4]].forEach(([dx, dz]) => { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 9, 8), mats.white); l.position.set(x + dx * 0.6, 4.3, z + dz * 0.6); l.castShadow = true; scene.add(l); });
    sphere(2, mats.pink, x, 6, z); cyl(0.4, 0.4, 10, mats.white, x, 6, z); sphere(1.3, mats.pink, x, 16, z); cyl(0.25, 0.3, 3, mats.white, x, 16, z); sphere(0.6, mats.pink, x, 19.6, z); cyl(0.06, 0.12, 4, mats.grey, x, 20, z, 6); }
  shiftSince(m0, LM.pearl.x - (15), LM.pearl.z - (-10)); }
  { const m0 = scene.children.length;
  // 上海中心
  { const x = 24, z = -2; plot(x, z, 7, 7, mats.grey); for (let i = 0; i < 14; i++) { const s = 2.4 - i * 0.11; box(s, 2.2, s, i % 2 ? mats.glass : mats.glass2, x, i * 2.2, z).rotation.y = i * 0.12; } }
  shiftSince(m0, LM.tower.x - (24), LM.tower.z - (-2)); }
  { const m0 = scene.children.length;
  // 金茂
  { const x = 30, z = -6; plot(x, z, 6, 6, mats.grey); [2.6, 2.3, 2, 1.7, 1.4, 1.1, 0.8].forEach((s, i) => box(s, 3.2, s, mats.bronze, x, i * 3.2, z)); cyl(0, 0.4, 3, mats.gold, x, 22.4, z, 4); }
  shiftSince(m0, LM.jinmao.x - (30), LM.jinmao.z - (-6)); }
  { const m0 = scene.children.length;
  // 环球金融中心
  { const x = 30, z = 4; plot(x, z, 6, 6, mats.grey); box(2.6, 22, 2.2, mats.glass, x, 0, z); box(1.2, 1.6, 2.4, mats.glass2, x, 19.5, z); }
  shiftSince(m0, LM.swfc.x - (30), LM.swfc.z - (4)); }
  { const m0 = scene.children.length;
  // 陆家嘴其他楼
  [[20, 8, 8], [36, -14, 10], [38, 2, 12], [22, -16, 7], [42, 12, 8], [36, 14, 6]].forEach(([x, z, h]) => { plot(x, z, 4, 4, mats.grey); box(2.6, h, 2.6, rand() < 0.5 ? mats.glass : mats.white, x, 0, z); });
  shiftSince(m0, P.ljz.x - (22), P.ljz.z - (-6)); }
  // 外滩：沿黄浦江西岸一排万国建筑
  for (let i = 0; i < 9; i++) { const lat = 31.2318 + i * 0.0015; const [x, z] = G(121.4897, lat); const h = 3 + ((i * 7) % 4);
    box(2.4, h, 3, i % 3 ? mats.stone : mats.white, x, 0, z);
    if (i === 4) { cyl(0.5, 0.5, 2, mats.stone, x, h, z); cyl(0, 0.6, 1, mats.green, x, h + 2, z, 8); } if (i === 6) cyl(0, 0.8, 1.6, mats.green, x, h, z, 4); }
  { const [x1, z1] = G(121.4922, 31.2312), [x2, z2] = G(121.4918, 31.2448); road(x1, z1, x2, z2, 1.2); }
  { const m0 = scene.children.length;
  // 人民广场
  plot(-24, -10, 16, 12, mats.park); cyl(2, 2.4, 2, mats.stone, -22, 0, -12, 16); sphere(1.6, mats.stone, -22, 2, -12); box(4, 1.2, 3, mats.white, -28, 0, -12); box(5, 0.3, 4, mats.white, -28, 1.2, -12);
  for (let i = 0; i < 14; i++) tree(-32 + rand() * 16, -15 + rand() * 10, 0.8);
  shiftSince(m0, LM.rps.x - (-24), LM.rps.z - (-10)); }
  { const m0 = scene.children.length;
  // 地铁站口
  box(2.2, 0.9, 1.2, mats.red, -18, 0, -12); box(0.2, 1.6, 0.2, mats.dk, -16.6, 0, -12);
  shiftSince(m0, P.metro.x - (-18), P.metro.z - (-12)); }
  { const m0 = scene.children.length;
  // 石库门
  plot(-22, 14, 14, 10, mats.stone);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { const x = -27 + c * 3.4, z = 10.5 + r * 3.4; box(2.8, 2.4, 2.6, mats.grey, x, 0, z); box(3, 0.5, 2.8, mats.roofTile, x, 2.4, z); box(0.9, 1.4, 0.15, mats.dk, x, 0, z + 1.3); }
  shiftSince(m0, P.home.x - (-22), P.home.z - (14)); }
  { const m0 = scene.children.length;
  // 城隍庙
  { const x = -8, z = 16; plot(x, z, 10, 9, mats.stone); box(4, 2, 3, mats.red, x, 0, z - 1); box(5, 0.4, 4, mats.roofTile, x, 2, z - 1); box(3.6, 0.6, 2.8, mats.roofTile, x, 2.4, z - 1);
    const pond = new THREE.Mesh(new THREE.BoxGeometry(5, 0.1, 3), mats.water); pond.position.set(x, 0.13, z + 2.5); scene.add(pond);
    [[-2, 0], [-1, 1], [0, 0], [1, 1], [2, 0]].forEach(([dx, dz]) => box(1.1, 0.25, 0.4, mats.wood, x + dx, 0.15, z + 2.2 + dz * 0.4)); tree(x - 4, z + 3, 0.8); tree(x + 4, z - 3, 0.8); }
  shiftSince(m0, P.chp.x - (-8), P.chp.z - (16)); }
  { const m0 = scene.children.length;
  // 田子坊
  plot(-30, 26, 10, 8, mats.stone);
  [[-33, 24], [-30, 24], [-27, 24], [-33, 28], [-30, 28], [-27, 28]].forEach(([x, z], i) => { box(2.4, 2 + (i % 2), 2.4, [mats.grey, mats.brick, mats.white][i % 3], x, 0, z); box(2.6, 0.3, 2.6, mats.roofTile, x, 2 + (i % 2), z); });
  for (let i = 0; i < 5; i++) box(0.9, 0.05, 0.6, [mats.red, mats.yellow, mats.pink][i % 3], -34 + i * 2, 2.8, 26);
  shiftSince(m0, P.tzf.x - (-30), P.tzf.z - (26)); }
  { const m0 = scene.children.length;
  // 武康路
  plot(-50, 12, 14, 14, mats.park); box(3, 5, 8, mats.brick, -55, 0, 8).rotation.y = 0.5; box(3, 0.4, 8.2, mats.white, -55, 5, 8).rotation.y = 0.5;
  [[-48, 16], [-52, 18], [-45, 10]].forEach(([x, z]) => { box(2.6, 2.4, 2.4, mats.white, x, 0, z); cyl(0, 1.9, 1.4, mats.red, x, 2.4, z, 4); });
  for (let i = 0; i < 12; i++) tree(-57 + i * 1.4, 4 + (i % 2) * 2, 1.1);
  for (let i = 0; i < 8; i++) tree(-56 + rand() * 12, 18 + rand() * 4, 1);
  shiftSince(m0, P.wk.x - (-50), P.wk.z - (12)); }
  { const m0 = scene.children.length;
  // 永康路
  plot(-42, 30, 10, 6, mats.stone);
  for (let i = 0; i < 4; i++) { box(2.2, 2.2, 2, mats.grey, -46 + i * 2.6, 0, 29); box(2, 0.15, 1, [mats.yellow, mats.red][i % 2], -46 + i * 2.6, 1.4, 30.4); }
  for (let i = 0; i < 5; i++) tree(-47 + i * 2.4, 32.5, 0.7);
  shiftSince(m0, P.ykl.x - (-42), P.ykl.z - (30)); }
  // 轮渡
  const FERRY = { x: P.ferry.x, z: P.ferry.z };
  box(3, 0.4, 2, mats.wood, FERRY.x - 2.5, 0, FERRY.z); box(1.5, 1.2, 1.2, mats.white, FERRY.x - 2.5, 0.4, FERRY.z);
  const ferry = new THREE.Group(); box(3, 0.6, 1.4, mats.white, 0, 0, 0, ferry); box(1.6, 0.8, 1.1, mats.yellow, 0, 0.6, 0, ferry); ferry.position.set(FERRY.x, 0.1, FERRY.z); ferry.rotation.y = Math.PI / 2; scene.add(ferry);
  const mag = new THREE.Group(); box(5, 0.7, 0.8, mats.white, 0, 0, 0, mag); box(5.02, 0.12, 0.82, mats.glass2, 0, 0.35, 0, mag); if (maglev) mag.rotation.y = -maglev.ang; scene.add(mag);
  // 高铁从虹桥往外开：沿延安路高架的第一段跑
  const [tA, tB] = [G(121.32, 31.197), G(121.40, 31.206)];
  const train = new THREE.Group(); for (let i = 0; i < 4; i++) box(2.6, 0.9, 1, mats.white, i * 2.8, 0, 0, train); box(11, 0.08, 1.02, mats.red, 4.2, 0.55, 0, train); train.rotation.y = -Math.atan2(tB[1] - tA[1], tB[0] - tA[0]); scene.add(train);

  const cars: THREE.Mesh[] = [];
  const longSegs = segs.filter(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]) > 15);
  for (let i = 0; i < 18; i++) { const c = box(1.2, 0.6, 0.7, [mats.red, mats.yellow, mats.white, mats.glass2][i % 4], 0, 0.08, 0); const sg = longSegs[i % longSegs.length]; c.userData = { a: sg[0], b: sg[1], t: rand(), sp: rnd(0.0015, 0.004) * (i % 2 ? 1 : -1) }; c.rotation.y = -Math.atan2(sg[1][1] - sg[0][1], sg[1][0] - sg[0][0]); cars.push(c); }

  /* ---- 覆盖层 ---- */
  const labels: HTMLElement[] = [];
  ([["黄浦江", 121.4985, 31.214, ""], ["苏州河", 121.43, 31.2405, ""], ["东 海", 122.05, 31.05, ""], ...DISTRICTS.map((d) => [d.name.split("").join(" "), d.label[0], d.label[1], "land"]), ...GREENS.map((g) => [g.name, null, g, "park"])] as const).forEach(([t, lon, lat, c]) => {
    let x: number, z: number;
    if (lon === null) { const g = lat as unknown as { i: number; j: number; w: number; h: number }; [x, z] = centerOf(g.i, g.j); x += CELL * (g.w - 1) / 2; z += CELL * (g.h - 1) / 2; } else [x, z] = G(lon as number, lat as number);
    const d = document.createElement("div"); d.className = "lbl " + c; d.textContent = t as string; d.dataset.x = String(x); d.dataset.z = String(z); overlay.appendChild(d); labels.push(d);
  });
  const pins = {} as Record<PlaceId, HTMLButtonElement>;
  (Object.keys(PLACES) as PlaceId[]).forEach((k) => {
    const p = PLACES[k]; const d = document.createElement("button"); d.className = "pin";
    d.innerHTML = `<span class="ic">${p.ic}</span><span class="nm">${p.name}</span>`;
    d.setAttribute("aria-label", p.name); d.onclick = (e) => { e.stopPropagation(); onPick(k); };
    overlay.appendChild(d); pins[k] = d;
  });

  // 其他玩家：小人 + 名字牌
  type Fig = { obj: THREE.Group; limbs: THREE.Object3D[]; tag: HTMLButtonElement; bubble: HTMLDivElement; at: PlaceId; pos: THREE.Vector3; goal: THREE.Vector3; slot: number; bubbleUntil: number };
  const figs = new Map<string, Fig>();
  // 低多边形小人：头、头发、上衣、手臂、裤子、腿，四肢可摆动
  const HAIR = [0x2b2622, 0x4a3324, 0x1c1c1c, 0x7a4b2a, 0xd9b26b];
  const PANTS = [0x2e3a4f, 0x3d3d3d, 0x5a4a3a, 0x24466b];
  const person = (id: string, color: number) => {
    let h = 0; for (const c of id) h = (h * 33 + c.charCodeAt(0)) >>> 0;
    const g = new THREE.Group(); const shirt = M(color), pants = M(PANTS[h % PANTS.length]), hair = M(HAIR[(h >> 3) % HAIR.length]), shoe = M(0x222222);
    const part = (w: number, ht: number, d: number, m: THREE.Material, x: number, y: number, z: number, pivotTop = false) => {
      const pivot = new THREE.Group(); pivot.position.set(x, y, z);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, ht, d), m); mesh.castShadow = true; mesh.position.y = pivotTop ? -ht / 2 : ht / 2;
      pivot.add(mesh); g.add(pivot); return pivot;
    };
    const legL = part(0.26, 0.75, 0.3, pants, -0.17, 0.78, 0, true), legR = part(0.26, 0.75, 0.3, pants, 0.17, 0.78, 0, true);
    [legL, legR].forEach((l) => { const f = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.42), shoe); f.position.set(0, -0.76, 0.06); l.add(f); });
    part(0.62, 0.72, 0.36, shirt, 0, 0.76, 0);
    const armL = part(0.18, 0.66, 0.2, shirt, -0.42, 1.44, 0, true), armR = part(0.18, 0.66, 0.2, shirt, 0.42, 1.44, 0, true);
    [armL, armR].forEach((a) => { const hand = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.16), mats.skin); hand.position.y = -0.72; a.add(hand); });
    const head = part(0.5, 0.48, 0.46, mats.skin, 0, 1.5, 0);
    const hr = new THREE.Mesh(new THREE.BoxGeometry(0.54, (h % 3) === 0 ? 0.32 : 0.18, 0.5), hair); hr.position.set(0, (h % 3) === 0 ? 0.42 : 0.5, -0.02); head.add(hr);
    if ((h >> 5) % 2) { const back = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.42, 0.14), hair); back.position.set(0, 0.26, -0.22); head.add(back); }
    const eyeM = M(0x1d1d1d); [-0.11, 0.11].forEach((x) => { const e = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.02), eyeM); e.position.set(x, 0.28, 0.235); head.add(e); });
    g.scale.setScalar(1.15);
    return { g, limbs: [legL, legR, armL, armR] };
  };
  // 每个地点前面一块空地，人排成两行站
  // 每个地点前面一块空地（相对地点的偏移），人排成两行站
  const SPOT_OFF: Partial<Record<PlaceId, [number, number]>> = { home: [0, 5.6], rmgy: [2, -1], metro: [0, 2.4], bund: [-2, 3], chp: [-1, 5], tzf: [0, 0.1], wk: [3, 1], ykl: [0, 2.2], ljz: [3, 9], ferry: [-4.5, 2.2],
    sjxc: [4, -3.5], pvg: [0, -8], sha: [1, -8], dsh: [0, -17], njl: [0, 1], jas: [0, 5.5], xtd: [0, 3], xjh: [4, 5], hq: [0, 6.5], wjc: [2, 6.5], expo: [4, 5], sjgy: [-4, 9], zj: [-2, 6], gongfang: [0, 5.5], jiangjing: [0, 4.5], yangfang: [0, 4.5] };
  const SPOTS = Object.fromEntries((Object.keys(PLACES) as PlaceId[]).map((k) => [k, [PLACES[k].x + (SPOT_OFF[k]?.[0] ?? 0), PLACES[k].z + (SPOT_OFF[k]?.[1] ?? 3)]])) as Record<PlaceId, [number, number]>;
  const slotPos = (at: PlaceId, slot: number) => { const [x, z] = SPOTS[at]; const col = slot % 6, row = Math.floor(slot / 6) % 2; return new THREE.Vector3(x + (col - 2.5) * 1.3 + row * 0.6, 0, z + row * 1.2); };
  const makeFig = (o: Other, slot: number): Fig => {
    const { g, limbs } = person(o.id, o.color); scene.add(g);
    const tag = document.createElement("button"); tag.className = "ptag" + (o.id === "me" ? " me" : ""); tag.textContent = o.name;
    tag.onclick = (e) => { e.stopPropagation(); if (o.id !== "me") onPickPlayer(o.id); }; overlay.appendChild(tag);
    const bubble = document.createElement("div"); bubble.className = "bubble"; bubble.hidden = true; overlay.appendChild(bubble);
    const pos = slotPos(o.at, slot); g.position.copy(pos);
    return { obj: g, limbs, tag, bubble, at: o.at, pos, goal: pos.clone(), slot, bubbleUntil: 0 };
  };
  const removeFig = (id: string) => { const f = figs.get(id); if (!f) return; scene.remove(f.obj); f.tag.remove(); f.bubble.remove(); figs.delete(id); };

  /* ---- 游船和广告板 ---- */
  type Path = { pts: number[][]; cum: number[]; len: number };
  const mkPath = (pts: number[][]): Path => { const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return { pts, cum, len: cum[cum.length - 1] }; };
  const along = (p: Path, d: number) => {
    let i = 1; while (i < p.pts.length - 1 && p.cum[i] < d) i++;
    const a = p.pts[i - 1], b = p.pts[i], k = (d - p.cum[i - 1]) / (p.cum[i] - p.cum[i - 1] || 1);
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    return { x: a[0] + dx * k, z: a[1] + dz * k, nx: -dz / l, nz: dx / l, ang: Math.atan2(dz, dx) };
  };
  // 黄浦江只用市区这一段（太远的上下游船开过去也看不到）
  const hpPath = mkPath(riverPts.slice(1, 16)), ckPath = mkPath(creekPts.slice(1));
  const adCanvas = document.createElement("canvas"); adCanvas.width = 256; adCanvas.height = 128;
  { const c = adCanvas.getContext("2d")!; c.fillStyle = "#f6f3ea"; c.fillRect(0, 0, 256, 128); c.strokeStyle = "#c4472f"; c.lineWidth = 8; c.strokeRect(4, 4, 248, 120);
    c.fillStyle = "#c4472f"; c.font = "bold 34px sans-serif"; c.textAlign = "center"; c.fillText("广告位招租", 128, 62); c.fillStyle = "#5d6b63"; c.font = "22px sans-serif"; c.fillText("点我上传图片", 128, 98); }
  const adFree = new THREE.CanvasTexture(adCanvas); adFree.colorSpace = THREE.SRGBColorSpace;
  const freeMat = new THREE.MeshBasicMaterial({ map: adFree, side: THREE.DoubleSide });
  const loader = new THREE.TextureLoader();
  type B = { hull: THREE.Group; board: THREE.Group; face: THREE.Mesh; path: Path; d: number; dir: number; lane: number; sp: number; ver: number; tex: THREE.Texture | null };
  const boats: B[] = []; const pickables: THREE.Object3D[] = [];
  const hullColors = [0xf3f1ea, 0xe9c44c, 0x2f86c9, 0xc4472f, 0x4aa65a];
  for (let i = 0; i < BOAT_COUNT; i++) {
    const big = i < HUANGPU_BOATS, path = big ? hpPath : ckPath, sc = big ? 1.6 : 0.9;
    const hull = new THREE.Group();
    box(2.8 * sc, 0.5 * sc, 1.1 * sc, M(hullColors[i % hullColors.length]), 0, 0, 0, hull); box(1.4 * sc, 0.5 * sc, 0.9 * sc, mats.white, -0.2 * sc, 0.5 * sc, 0, hull);
    const board = new THREE.Group(); const bw = 2.6 * sc, bh = 1.3 * sc;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.16, bh + 0.16, 0.06), mats.dk); board.add(frame);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), freeMat); face.position.z = 0.04; board.add(face);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9 * sc, 0.08), mats.dk); pole.position.y = -(bh / 2 + 0.45 * sc); board.add(pole);
    scene.add(hull); scene.add(board);
    hull.traverse((o) => (o.userData.boatId = i)); board.traverse((o) => (o.userData.boatId = i)); pickables.push(hull, board);
    const dir = big ? (i % 2 ? 1 : -1) : i % 2 ? 1 : -1;
    boats.push({ hull, board, face, path, d: ((big ? i / HUANGPU_BOATS : (i - HUANGPU_BOATS) / (BOAT_COUNT - HUANGPU_BOATS)) + 0.05) * path.len, dir, lane: big ? dir * 1.5 : 0, sp: (big ? 0.012 : 0.008) * (0.7 + ((i * 37) % 10) / 20), ver: 0, tex: null });
  }
  const moveBoats = (dt: number) => {
    boats.forEach((b) => {
      b.d += b.sp * b.dir * dt;
      if (b.d > b.path.len) { b.d = b.path.len; b.dir = -1; } if (b.d < 0) { b.d = 0; b.dir = 1; }
      const p = along(b.path, b.d), lane = b.path === hpPath ? b.dir * 1.5 : 0;
      b.hull.position.set(p.x + p.nx * lane, 0.1, p.z + p.nz * lane); b.hull.rotation.y = -p.ang + (b.dir < 0 ? Math.PI : 0);
      b.board.position.set(b.hull.position.x, b.path === hpPath ? 3.6 : 2.1, b.hull.position.z); b.board.quaternion.copy(cam.quaternion);
    });
  };
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const pickBoat = (cx: number, cy: number) => {
    const r = canvas.getBoundingClientRect(); ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, cam); const hit = ray.intersectObjects(pickables, true)[0];
    if (hit) onPickBoat(hit.object.userData.boatId as number);
  };

  /* ---- 玩家开的店：每个铺面一个位置，开了店才盖小店面 ---- */
  const shopViews = SLOTS.map((sl) => {
    const p = PLACES[sl.place]; const x = p.x - 5, z = p.z - 3;
    const tag = document.createElement("button"); tag.className = "shoptag"; tag.hidden = true; tag.onclick = (e) => { e.stopPropagation(); onPick(sl.place); }; overlay.appendChild(tag);
    return { x, z, tag, obj: null as THREE.Group | null, key: "" };
  });

  /* ---- 前滩商业地块：12 块，盖好的店顶上挂招牌 ---- */
  const signTexOf = (text: string, color: string) => {
    const cv = document.createElement("canvas"); cv.width = 256; cv.height = 128;
    const c = cv.getContext("2d")!; c.fillStyle = color; c.fillRect(0, 0, 256, 128); c.fillStyle = "#fff"; c.font = "bold 40px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(text.slice(0, 6), 128, 64);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const forSale = new THREE.MeshBasicMaterial({ map: signTexOf("待售", "#c4472f"), side: THREE.DoubleSide });
  type ES = { base: THREE.Mesh; obj: THREE.Group | null; sign: THREE.Mesh; tag: HTMLButtonElement; key: string; ver: number; tex: THREE.Texture | null };
  const estates: ES[] = [];
  for (let id = 0; id < ESTATE_COUNT; id++) {
    const { x, z } = estatePos(id);
    const base = new THREE.Mesh(new THREE.BoxGeometry(6, 0.14, 6), M(0xc9c3b4)); base.position.set(x, 0.07, z); base.receiveShadow = true; scene.add(base);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), forSale); sign.position.set(x + 1.6, 1.4, z + 1.6); sign.quaternion.copy(cam.quaternion); scene.add(sign);
    const tag = document.createElement("button"); tag.className = "lot"; tag.textContent = "商业地块"; tag.classList.add("estag"); overlay.appendChild(tag);
    tag.onclick = (e) => { e.stopPropagation(); onPick(LOT_PLACE[id]); };
    estates.push({ base, obj: null, sign, tag, key: "", ver: -1, tex: null });
  }

  /* ---- 拖动和缩放 ---- */
  let drag: { x: number; y: number; t: THREE.Vector3 } | null = null;
  let downAt: { x: number; y: number } | null = null;
  canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, t: target.clone() }; downAt = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; const s = (cam.right - cam.left) / root.clientWidth;
    target.copy(drag.t).addScaledVector(new THREE.Vector3(1, 0, -1).normalize(), -dx * s).addScaledVector(new THREE.Vector3(1, 0, 1).normalize(), -dy * s * 1.35);
    target.x = Math.max(-150, Math.min(230, target.x)); target.z = Math.max(-128, Math.min(200, target.z)); placeCam();
  });
  canvas.addEventListener("pointerup", (e) => { drag = null; if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 6) pickBoat(e.clientX, e.clientY); downAt = null; });
  const setZoom = (z: number) => { zoom = Math.max(0.6, Math.min(3, z)); resize(); };
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.12 : 0.89)); }, { passive: false });
  let pinch: number | null = null;
  canvas.addEventListener("touchmove", (e) => { if (e.touches.length === 2) { const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); if (pinch) setZoom(zoom * d / pinch); pinch = d; drag = null; } }, { passive: true });
  canvas.addEventListener("touchend", () => (pinch = null));

  /* ---- 每帧 ---- */
  const v3 = new THREE.Vector3();
  const project = (el: HTMLElement, x: number, y: number, z: number, anchor = "-50%,-100%") => {
    v3.set(x, y, z).project(cam); const w = root.clientWidth, h = root.clientHeight;
    const sx = ((v3.x + 1) / 2) * w, sy = ((1 - v3.y) / 2) * h;
    el.style.transform = `translate(${sx}px,${sy}px) translate(${anchor})`;
    el.style.visibility = sx < -60 || sx > w + 60 || sy < -60 || sy > h + 60 ? "hidden" : "visible";
  };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let raf = 0, t0 = 0, t0b = 0;
  const frame = (t: number) => {
    const dt = Math.min(50, t - t0) / 16; t0 = t;
    if (!reduce) {
      ferry.position.x = FERRY.x + Math.sin(t / 2600) * 2.4;
      planes.forEach((p) => { const a = t / 6000 + p.ph; p.g.position.set(p.cx + Math.cos(a) * p.r, 4 + Math.sin(a * 2) * 1.5, p.cz + Math.sin(a) * p.r * 1.3); p.g.rotation.y = -a; });
      mills.forEach((m, i) => (m.rotation.z = t / 700 + i));
      if (maglev) { const k = (t / 5000) % 1; mag.position.set(maglev.a[0] + (maglev.b[0] - maglev.a[0]) * k, 1.9, maglev.a[1] + (maglev.b[1] - maglev.a[1]) * k); }
      const tt = (t / 9000) % 1; train.position.set(tA[0] + (tB[0] - tA[0]) * tt, 0.1, tA[1] + (tB[1] - tA[1]) * tt);
      cars.forEach((c) => { const u = c.userData; u.t = (u.t + u.sp * dt + 1) % 1; c.position.set(u.a[0] + (u.b[0] - u.a[0]) * u.t, 0.38, u.a[1] + (u.b[1] - u.a[1]) * u.t); });
    }
    const now = Date.now();
    figs.forEach((f) => {
      const dist = f.pos.distanceTo(f.goal), moving = dist > 0.15;
      if (moving) { const step = Math.min(dist, 0.09 * dt); const dir = f.goal.clone().sub(f.pos).normalize(); f.pos.addScaledVector(dir, step); f.obj.rotation.y = Math.atan2(dir.x, dir.z); }
      else if (Math.abs(f.obj.rotation.y - 0.8) > 0.01) f.obj.rotation.y += (0.8 - f.obj.rotation.y) * 0.1; // 站定时面向镜头
      f.obj.position.copy(f.pos);
      const sw = reduce ? 0 : moving ? Math.sin(t / 110 + f.slot) * 0.7 : Math.sin(t / 900 + f.slot) * 0.04;
      f.limbs[0].rotation.x = sw; f.limbs[1].rotation.x = -sw; f.limbs[2].rotation.x = -sw * 0.8; f.limbs[3].rotation.x = sw * 0.8;
      if (!reduce && moving) f.obj.position.y = Math.abs(Math.sin(t / 110 + f.slot)) * 0.08;
      project(f.tag, f.pos.x, 2.6, f.pos.z);
      if (!f.bubble.hidden) { if (now > f.bubbleUntil) f.bubble.hidden = true; else project(f.bubble, f.pos.x, 3.6, f.pos.z); }
    });
    if (!reduce) moveBoats(dt); else if (!t0b) { moveBoats(0); t0b = 1; }
    renderer.render(scene, cam);
    labels.forEach((el) => project(el, +el.dataset.x!, 0.2, +el.dataset.z!, "-50%,-50%"));
    (Object.keys(pins) as PlaceId[]).forEach((k) => project(pins[k], PLACES[k].x, PLACES[k].h, PLACES[k].z));
    shopViews.forEach((v) => { if (!v.tag.hidden) project(v.tag, v.x, 3.2, v.z); });
    lots.forEach((L, id) => { const { x, z } = plotPos(id); project(L.tag, x, L.house ? 4.2 : 1.8, z); });
    estates.forEach((E, id) => { const { x, z } = estatePos(id); project(E.tag, x, E.obj ? 5.6 : 2.4, z); });
    raf = requestAnimationFrame(frame);
  };
  placeCam(); resize(); raf = requestAnimationFrame(frame);

  return {
    setSelected(id) { (Object.keys(pins) as PlaceId[]).forEach((k) => pins[k].classList.toggle("sel", k === id)); },
    setShops(list) {
      list.forEach((sh) => {
        const k = sh.ownerName ? `${sh.kind}|${sh.name}|${sh.ownerName}` : "";
        const st = shopViews[sh.id]; if (!st || st.key === k) return;
        st.key = k; if (st.obj) { scene.remove(st.obj); st.obj = null; }
        st.tag.hidden = !k;
        if (!k) return;
        const kd = KINDS[sh.kind!]; const g = new THREE.Group();
        box(2.4, 1.8, 2, mats.white, 0, 0, 0, g); box(2.8, 0.2, 2.6, M(kd.color), 0, 1.8, 0.3, g); box(2.6, 0.45, 0.12, M(kd.color), 0, 1.35, 1.35, g);
        box(0.8, 1.1, 0.06, mats.glass, -0.5, 0, 1.02, g); box(0.5, 1.2, 0.06, M(0x6b4a33), 0.6, 0, 1.02, g);
        g.position.set(st.x, 0.1, st.z); scene.add(g); st.obj = g;
        st.tag.textContent = `${kd.ic} ${sh.name}`;
      });
    },
    setEstates(list) {
      list.forEach((e) => {
        const E = estates[e.id]; if (!E) return;
        const key = `${e.ownerName || ""}|${e.kind || ""}|${e.name || ""}`;
        if (E.key !== key) {
          E.key = key; if (E.obj) { scene.remove(E.obj); E.obj = null; }
          const { x, z } = estatePos(e.id);
          E.tag.textContent = e.kind ? `${EKINDS[e.kind].ic} ${e.name}` : e.ownerName ? `${e.ownerName}的地` : `商业地 ¥${(e.price / 10000).toFixed(0)}万`;
          E.tag.classList.toggle("sold", !!e.ownerName);
          if (e.kind) {
            const k = EKINDS[e.kind], g = new THREE.Group(), col = M(k.color), h = e.kind === "market" ? 2.6 : e.kind === "gym" ? 3.4 : 2.4;
            box(5, h, 4.2, mats.white, 0, 0, -0.4, g); box(5.2, 0.25, 4.4, col, 0, h, -0.4, g); box(4.6, 0.5, 0.14, col, 0, h - 0.7, 1.75, g);
            box(1.8, 1.4, 0.06, mats.glass, -1.2, 0, 1.72, g); box(1.2, 1.5, 0.06, M(0x6b4a33), 1.2, 0, 1.72, g);
            if (e.kind === "gym") box(5, 0.9, 0.06, mats.glass2, 0, 1.8, 1.72, g);
            g.position.set(x, 0.14, z); scene.add(g); E.obj = g;
            E.sign.position.set(x, h + 1.4, z); E.sign.scale.set(1.6, 1.6, 1);
          } else { E.sign.position.set(x + 1.6, 1.4, z + 1.6); E.sign.scale.set(1, 1, 1); }
          E.ver = -1; // 重新决定招牌
        }
        const ver = e.kind ? e.sign : -2;
        if (E.ver === ver) return;
        E.ver = ver; E.tex?.dispose(); E.tex = null;
        if (!e.kind) { E.sign.material = e.ownerName ? new THREE.MeshBasicMaterial({ map: signTexOf("已售", "#5d6b63"), side: THREE.DoubleSide }) : forSale; return; }
        const k = EKINDS[e.kind];
        const fallback = () => { const t = signTexOf(e.name || k.name, "#" + k.color.toString(16).padStart(6, "0")); E.tex = t; E.sign.material = new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }); };
        if (!e.sign) return fallback();
        loader.load(`/api/estates/${e.id}/sign?v=${e.sign}`, (tex) => { if (E.ver !== ver) return tex.dispose(); tex.colorSpace = THREE.SRGBColorSpace; E.tex = tex; E.sign.material = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }); }, undefined, fallback);
      });
    },
    setBoats(list) {
      list.forEach((b) => {
        const B = boats[b.id]; if (!B || B.ver === b.version) return;
        B.ver = b.version; B.tex?.dispose(); B.tex = null;
        if (!b.version) { B.face.material = freeMat; return; }
        const ver = b.version;
        loader.load(`/api/boats/${b.id}/image?v=${ver}`, (tex) => {
          if (B.ver !== ver) { tex.dispose(); return; }
          tex.colorSpace = THREE.SRGBColorSpace; B.tex = tex; B.face.material = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
        }, undefined, () => { B.face.material = freeMat; });
      });
    },
    setPlots(list) {
      list.forEach((p) => {
        const L = lots[p.id]; if (!L) return;
        const key = p.ownerName ? `${p.ownerName}#${p.id}` : null;
        if (key !== L.owner) { if (L.house) { scene.remove(L.house); L.house = null; } if (key) L.house = buildHouse(p.id, key); L.owner = key; }
        L.sign.visible = !p.ownerName; L.base.material = p.mine ? lotMine : lotMat;
        L.tag.textContent = p.ownerName ? `${p.mine ? "🔑 " : ""}${p.ownerName}家` : `${plotName(p.id)} ¥${Math.round(p.price / 1000)}k`;
        L.tag.classList.toggle("sold", !!p.ownerName); L.tag.classList.toggle("mine", !!p.mine);
      });
    },
    setMine(id) { (Object.keys(pins) as PlaceId[]).forEach((k) => pins[k].classList.toggle("mine", k === id)); },
    setHere(id) { (Object.keys(pins) as PlaceId[]).forEach((k) => pins[k].classList.toggle("here", k === id)); },
    setPlayers(list) {
      const keep = new Set(list.map((o) => o.id));
      [...figs.keys()].forEach((id) => { if (!keep.has(id)) removeFig(id); });
      const count: Record<string, number> = {};
      list.forEach((o) => {
        const slot = (count[o.at] = (count[o.at] ?? -1) + 1);
        let f = figs.get(o.id);
        if (!f) { f = makeFig(o, slot); figs.set(o.id, f); }
        f.slot = slot; f.at = o.at; f.goal = slotPos(o.at, slot);
        f.tag.textContent = o.act ? `${o.name} · ${o.act}` : o.name;
      });
    },
    bubble(id, text) { const f = figs.get(id); if (!f) return; f.bubble.textContent = text; f.bubble.hidden = false; f.bubbleUntil = Date.now() + 6000; },
    focus(id) { const p = PLACES[id]; target.set(p.x, 0, p.z); placeCam(); },
    zoomBy(f) { setZoom(zoom * f); },
    dispose() { cancelAnimationFrame(raf); removeEventListener("resize", resize); renderer.dispose(); root.innerHTML = ""; },
  };
}
