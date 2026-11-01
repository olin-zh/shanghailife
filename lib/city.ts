// 3D 上海地图：Three.js 低多边形场景 + HTML 图钉/名字层。
import * as THREE from "three";
import { PLACES, type PlaceId } from "./game";
import { PLOT_COUNT, SUBURB, plotName, plotPos, type Plot } from "./plots";

export type Other = { id: string; name: string; at: PlaceId; color: number; act?: string };
export type City = {
  setSelected(id: PlaceId | null): void;
  setHere(id: PlaceId | null): void;
  setMine(id: PlaceId | null): void;
  setPlots(list: Plot[]): void;
  setPlayers(list: Other[]): void;
  bubble(id: string, text: string): void;
  focus(id: PlaceId): void;
  zoomBy(f: number): void;
  dispose(): void;
};

export function createCity(root: HTMLElement, onPick: (id: PlaceId) => void, onPickPlayer: (id: string) => void): City {
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
  const target = new THREE.Vector3(-4, 0, 2);
  const camDir = new THREE.Vector3(1, 1.25, 1).normalize();
  const placeCam = () => { cam.position.copy(target).addScaledVector(camDir, 120); cam.lookAt(target); };
  const resize = () => {
    const w = root.clientWidth, h = root.clientHeight, a = w / h, v = VIEW / zoom;
    cam.left = -v * a; cam.right = v * a; cam.top = v; cam.bottom = -v; cam.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    root.classList.toggle("zoomed", zoom > 1.5);
  };
  addEventListener("resize", resize);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8aa070, 0.75 * Math.PI));
  const sun = new THREE.DirectionalLight(0xffffff, 0.75 * Math.PI);
  sun.position.set(-40, 80, 30); sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, far: 400 });
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

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mats.grass);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  const ribbon = (pts: number[][], w: number) => {
    const L: number[][] = [], R: number[][] = [];
    pts.forEach(([x, z], i) => {
      const [nx, nz] = pts[Math.min(i + 1, pts.length - 1)], [px, pz] = pts[Math.max(i - 1, 0)];
      let dx = nx - px, dz = nz - pz; const l = Math.hypot(dx, dz); dx /= l; dz /= l;
      L.push([x + dz * w / 2, z - dx * w / 2]); R.push([x - dz * w / 2, z + dx * w / 2]);
    });
    const s = new THREE.Shape(); const all = [...L, ...R.reverse()];
    s.moveTo(all[0][0], -all[0][1]); all.slice(1).forEach((p) => s.lineTo(p[0], -p[1]));
    const g = new THREE.Mesh(new THREE.ShapeGeometry(s), mats.water); g.rotation.x = -Math.PI / 2; g.position.y = 0.05; g.receiveShadow = true; scene.add(g);
  };
  ribbon([[4, 70], [6, 40], [8, 20], [9, 6], [8, -6], [10, -16], [18, -24], [30, -30], [50, -36], [90, -44]], 7);
  ribbon([[-70, -20], [-40, -17], [-20, -19], [-5, -18], [7, -16]], 2.6);

  const road = (x1: number, z1: number, x2: number, z2: number, w = 1.6) => {
    const l = Math.hypot(x2 - x1, z2 - z1); const g = new THREE.Mesh(new THREE.BoxGeometry(l, 0.08, w), mats.road);
    g.position.set((x1 + x2) / 2, 0.04, (z1 + z2) / 2); g.rotation.y = -Math.atan2(z2 - z1, x2 - x1); g.receiveShadow = true; scene.add(g);
  };
  road(-75, 0, 4, 0); road(-75, -12, 4, -12); road(-75, 22, 4, 22); road(-36, -30, -36, 50); road(-14, -30, -14, 50); road(-56, -30, -56, 50); road(1, -14, 3, 40, 1.4);
  road(14, 4, 60, 4); road(14, -12, 22, -20, 1.4); road(30, -20, 30, 30); road(14, 18, 60, 18);
  const bridge = (z: number) => { box(12, 0.4, 1.8, mats.white, 7, 1.6, z); cyl(0.25, 0.25, 6, mats.white, 4, 0, z); cyl(0.25, 0.25, 6, mats.white, 10, 0, z); };
  bridge(30); bridge(46);
  // 外围道路：通往虹桥、五角场、徐家汇、浦东各处
  road(-125, 6, -75, 6); road(-100, -12, -75, -12); road(-100, 22, -75, 22); road(-36, -70, -36, -30); road(-56, -70, -56, -30); road(-56, 50, -56, 60); road(-90, -20, -90, 50);
  road(-60, -40, 2, -40); road(60, 4, 110, 4); road(14, 18, 110, 18); road(30, 30, 30, 62); road(14, 46, 60, 46); road(70, -24, 70, 40);

  /* ---- 松江新城：售楼处、湖、24 块地 ---- */
  road(-125, 6, -152, 6); road(-152, 6, -152, 52); road(-172, 52, -128, 52); road(-172, 85, -128, 85);
  { const { x, z } = SUBURB;
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

  /* ---- 新地标 ---- */
  // 南京路步行街：一排霓虹店招
  for (let i = 0; i < 5; i++) { const x = -14 + i * 2.6; box(2.2, 3 + (i % 2), 2.2, i % 2 ? mats.white : mats.stone, x, 0, -7.6); box(2.3, 0.6, 0.15, [mats.red, mats.yellow, mats.pink][i % 3], x, 2.2, -6.45); }
  plot(-9, -4.2, 13, 1.6, mats.stone);
  // 静安寺：金顶
  { const x = -64, z = -7; plot(x, z, 9, 8, mats.stone); box(5, 2.2, 4, mats.yellow, x, 0, z - 1); box(5.6, 0.4, 4.6, mats.gold, x, 2.2, z - 1); cyl(0, 1.6, 2.2, mats.gold, x, 2.6, z - 1, 4); cyl(0.12, 0.12, 2, mats.gold, x, 4.8, z - 1, 6);
    [[-3, 2], [3, 2]].forEach(([dx, dz]) => { box(1, 3, 1, mats.yellow, x + dx, 0, z + dz); cyl(0, 0.8, 1.2, mats.gold, x + dx, 3, z + dz, 4); });
    box(3, 9, 3, mats.glass, x + 7, 0, z - 3); box(3, 7, 3, mats.white, x - 7, 0, z - 4); }
  // 新天地：低矮石库门 + 阳伞
  { const x = -14, z = 36; plot(x, z, 12, 8, mats.stone); for (let i = 0; i < 4; i++) { box(2.6, 2.2, 2.4, i % 2 ? mats.brick : mats.grey, x - 4.5 + i * 3, 0, z - 2); box(2.8, 0.4, 2.6, mats.roofTile, x - 4.5 + i * 3, 2.2, z - 2); }
    for (let i = 0; i < 4; i++) { cyl(0.05, 0.05, 1.4, mats.dk, x - 4 + i * 2.6, 0, z + 1.6, 6); cyl(0, 0.9, 0.4, [mats.red, mats.white][i % 2], x - 4 + i * 2.6, 1.3, z + 1.6, 8); } }
  // 徐家汇天主教堂：红砖双尖塔
  { const x = -76, z = 34; plot(x, z, 10, 10, mats.park); box(3.4, 4, 7, mats.brick, x, 0, z); cyl(0, 2.2, 1.6, mats.roofTile, x, 4, z, 4).scale.set(1, 1, 2.2);
    [[-1.1], [1.1]].forEach(([dx]) => { box(1.2, 7, 1.2, mats.brick, x + dx, 0, z - 3.6); cyl(0, 0.85, 3.4, mats.dk, x + dx, 7, z - 3.6, 4); });
    box(6, 6, 6, mats.glass2, x + 9, 0, z - 4); }
  // 虹桥火车站：长条站房 + 高铁
  { const x = -118, z = 6; plot(x, z, 16, 12, mats.grey); box(14, 3, 7, mats.white, x, 0, z - 1.5); box(14.6, 0.5, 7.6, mats.glass2, x, 3, z - 1.5);
    const hsr = new THREE.Group(); for (let i = 0; i < 5; i++) box(2.6, 0.9, 1, mats.white, i * 2.7, 0, 0, hsr); box(13.5, 0.12, 1.02, mats.glass2, 5.4, 0.45, 0, hsr); hsr.position.set(x - 7, 0.1, z + 4.2); scene.add(hsr); }
  // 五角场：彩蛋 + 大学楼
  { const x = -30, z = -58; plot(x, z, 12, 12, mats.grey); sphere(2.2, mats.yellow, x, 4.2, z).scale.set(1.3, 0.8, 1.3); [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]].forEach(([dx, dz]) => cyl(0.15, 0.15, 3.6, mats.white, x + dx, 0, z + dz, 6));
    box(4, 6, 3, mats.brick, x - 8, 0, z + 3); box(4, 5, 3, mats.brick, x - 8, 0, z - 2); box(5, 4, 4, mats.white, x + 8, 0, z); for (let i = 0; i < 6; i++) tree(x - 11 + i * 1.6, z + 7, 0.9); }
  // 世博中国馆：红色倒斗拱
  { const x = 28, z = 52; plot(x, z, 12, 12, mats.grey); box(2.4, 4, 2.4, mats.red, x, 0, z); [5, 6, 7, 8, 9].forEach((w, i) => box(w, 1.2, w, mats.red, x, 4 + i * 1.2, z)); box(10, 1.2, 10, mats.red, x, 10, z); }
  // 世纪公园：大草坪 + 湖
  { const x = 66, z = -6; plot(x, z, 22, 16, mats.park); const lake = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.1, 24), mats.water); lake.position.set(x + 4, 0.15, z - 2); lake.scale.set(1.4, 1, 1); scene.add(lake);
    for (let i = 0; i < 22; i++) tree(x - 10 + rand() * 20, z - 7 + rand() * 14, 1); }
  // 张江：科技园 + 张江之尚
  { const x = 96, z = 24; plot(x, z, 16, 14, mats.grey); box(3, 14, 3, mats.glass, x, 0, z - 3); box(4, 6, 6, mats.white, x - 6, 0, z + 2); box(4, 8, 4, mats.glass2, x + 6, 0, z + 1); box(6, 3, 3, mats.white, x, 0, z + 4); for (let i = 0; i < 6; i++) tree(x - 8 + i * 3, z + 7.5, 0.9); }
  // 杨浦老公房：六层灰楼
  { const x = -44, z = -50; plot(x, z, 12, 10, mats.stone); [[-3.5, -2], [3.5, -2], [0, 3]].forEach(([dx, dz]) => { box(5.5, 5, 3, mats.grey, x + dx, 0, z + dz); box(5.7, 0.3, 3.2, mats.brick, x + dx, 5, z + dz); }); }
  // 陆家嘴江景公寓：两栋高层
  { const x = 44, z = -24; plot(x, z, 10, 8, mats.grey); box(3, 16, 3, mats.glass, x - 2, 0, z); box(3, 13, 3, mats.white, x + 2.5, 0, z - 1); }
  // 徐汇老洋房：坡屋顶 + 花园
  { const x = -60, z = 24; plot(x, z, 10, 9, mats.park); box(4.4, 3, 3.6, mats.white, x, 0, z - 1.5); cyl(0, 3.2, 1.8, mats.red, x, 3, z - 1.5, 4); box(0.6, 1.4, 0.6, mats.brick, x + 1.2, 3.6, z - 1.5);
    for (let i = 0; i < 6; i++) tree(x - 4 + i * 1.6, z + 3.5, 0.8); }


  // 东方明珠
  { const x = 15, z = -10; plot(x, z, 6, 6, mats.grey);
    [[-1.2, -1.2], [1.2, -1.2], [0, 1.4]].forEach(([dx, dz]) => { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 9, 8), mats.white); l.position.set(x + dx * 0.6, 4.3, z + dz * 0.6); l.castShadow = true; scene.add(l); });
    sphere(2, mats.pink, x, 6, z); cyl(0.4, 0.4, 10, mats.white, x, 6, z); sphere(1.3, mats.pink, x, 16, z); cyl(0.25, 0.3, 3, mats.white, x, 16, z); sphere(0.6, mats.pink, x, 19.6, z); cyl(0.06, 0.12, 4, mats.grey, x, 20, z, 6); }
  // 上海中心
  { const x = 24, z = -2; plot(x, z, 7, 7, mats.grey); for (let i = 0; i < 14; i++) { const s = 2.4 - i * 0.11; box(s, 2.2, s, i % 2 ? mats.glass : mats.glass2, x, i * 2.2, z).rotation.y = i * 0.12; } }
  // 金茂
  { const x = 30, z = -6; plot(x, z, 6, 6, mats.grey); [2.6, 2.3, 2, 1.7, 1.4, 1.1, 0.8].forEach((s, i) => box(s, 3.2, s, mats.bronze, x, i * 3.2, z)); cyl(0, 0.4, 3, mats.gold, x, 22.4, z, 4); }
  // 环球金融中心
  { const x = 30, z = 4; plot(x, z, 6, 6, mats.grey); box(2.6, 22, 2.2, mats.glass, x, 0, z); box(1.2, 1.6, 2.4, mats.glass2, x, 19.5, z); }
  [[20, 8, 8], [36, -14, 10], [38, 2, 12], [22, -16, 7], [42, 12, 8], [36, 14, 6]].forEach(([x, z, h]) => { plot(x, z, 4, 4, mats.grey); box(2.6, h, 2.6, rand() < 0.5 ? mats.glass : mats.white, x, 0, z); });
  // 外滩
  for (let i = 0; i < 8; i++) { const z = -22 + i * 3.6, x = 2, h = 3 + ((i * 7) % 4); box(2.4, h, 3, i % 3 ? mats.stone : mats.white, x, 0, z);
    if (i === 3) { cyl(0.5, 0.5, 2, mats.stone, x, h, z); cyl(0, 0.6, 1, mats.green, x, h + 2, z, 8); } if (i === 5) cyl(0, 0.8, 1.6, mats.green, x, h, z, 4); }
  plot(4.5, -10, 1.4, 30, mats.stone);
  // 人民广场
  plot(-24, -10, 16, 12, mats.park); cyl(2, 2.4, 2, mats.stone, -22, 0, -12, 16); sphere(1.6, mats.stone, -22, 2, -12); box(4, 1.2, 3, mats.white, -28, 0, -12); box(5, 0.3, 4, mats.white, -28, 1.2, -12);
  for (let i = 0; i < 14; i++) tree(-32 + rand() * 16, -15 + rand() * 10, 0.8);
  box(2.2, 0.9, 1.2, mats.red, -18, 0, -12); box(0.2, 1.6, 0.2, mats.dk, -16.6, 0, -12);
  // 石库门
  plot(-22, 14, 14, 10, mats.stone);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { const x = -27 + c * 3.4, z = 10.5 + r * 3.4; box(2.8, 2.4, 2.6, mats.grey, x, 0, z); box(3, 0.5, 2.8, mats.roofTile, x, 2.4, z); box(0.9, 1.4, 0.15, mats.dk, x, 0, z + 1.3); }
  // 城隍庙
  { const x = -8, z = 16; plot(x, z, 10, 9, mats.stone); box(4, 2, 3, mats.red, x, 0, z - 1); box(5, 0.4, 4, mats.roofTile, x, 2, z - 1); box(3.6, 0.6, 2.8, mats.roofTile, x, 2.4, z - 1);
    const pond = new THREE.Mesh(new THREE.BoxGeometry(5, 0.1, 3), mats.water); pond.position.set(x, 0.13, z + 2.5); scene.add(pond);
    [[-2, 0], [-1, 1], [0, 0], [1, 1], [2, 0]].forEach(([dx, dz]) => box(1.1, 0.25, 0.4, mats.wood, x + dx, 0.15, z + 2.2 + dz * 0.4)); tree(x - 4, z + 3, 0.8); tree(x + 4, z - 3, 0.8); }
  // 田子坊
  plot(-30, 26, 10, 8, mats.stone);
  [[-33, 24], [-30, 24], [-27, 24], [-33, 28], [-30, 28], [-27, 28]].forEach(([x, z], i) => { box(2.4, 2 + (i % 2), 2.4, [mats.grey, mats.brick, mats.white][i % 3], x, 0, z); box(2.6, 0.3, 2.6, mats.roofTile, x, 2 + (i % 2), z); });
  for (let i = 0; i < 5; i++) box(0.9, 0.05, 0.6, [mats.red, mats.yellow, mats.pink][i % 3], -34 + i * 2, 2.8, 26);
  // 武康路
  plot(-50, 12, 14, 14, mats.park); box(3, 5, 8, mats.brick, -55, 0, 8).rotation.y = 0.5; box(3, 0.4, 8.2, mats.white, -55, 5, 8).rotation.y = 0.5;
  [[-48, 16], [-52, 18], [-45, 10]].forEach(([x, z]) => { box(2.6, 2.4, 2.4, mats.white, x, 0, z); cyl(0, 1.9, 1.4, mats.red, x, 2.4, z, 4); });
  for (let i = 0; i < 12; i++) tree(-57 + i * 1.4, 4 + (i % 2) * 2, 1.1);
  for (let i = 0; i < 8; i++) tree(-56 + rand() * 12, 18 + rand() * 4, 1);
  // 永康路
  plot(-42, 30, 10, 6, mats.stone);
  for (let i = 0; i < 4; i++) { box(2.2, 2.2, 2, mats.grey, -46 + i * 2.6, 0, 29); box(2, 0.15, 1, [mats.yellow, mats.red][i % 2], -46 + i * 2.6, 1.4, 30.4); }
  for (let i = 0; i < 5; i++) tree(-47 + i * 2.4, 32.5, 0.7);
  // 轮渡
  box(3, 0.4, 2, mats.wood, 5, 0, 6); box(1.5, 1.2, 1.2, mats.white, 5, 0.4, 6);
  const ferry = new THREE.Group(); box(3, 0.6, 1.4, mats.white, 0, 0, 0, ferry); box(1.6, 0.8, 1.1, mats.yellow, 0, 0.6, 0, ferry); ferry.position.set(8, 0.1, 6); scene.add(ferry);
  const train = new THREE.Group(); for (let i = 0; i < 4; i++) box(2.6, 0.9, 1, mats.white, i * 2.8, 0, 0, train); box(11, 0.08, 1.02, mats.red, 4.2, 0.55, 0, train); train.position.set(-70, 0.1, -12.6); scene.add(train);

  const free = (x: number, z: number) => {
    for (const k in PLACES) { const p = PLACES[k as PlaceId]; if (Math.hypot(p.x - x, p.z - z) < 9) return false; }
    if (x > 12 && z < -22 && z > -0.2 * x - 32 && z < -0.2 * x - 22) return false; // 黄浦江向东拐的那段
    if (Math.abs(z - 6) < 1.5 && x < -75) return false;
    if (x > -1 && x < 15 && z > -30) return false;
    if (Math.abs(z) < 1.5 || Math.abs(z + 12) < 1.5 || Math.abs(z - 22) < 1.5) return false;
    if (Math.abs(z + 18) < 2.5 && x < 8) return false;
    return true;
  };
  for (let i = 0; i < 220; i++) { const x = rnd(-128, -2), z = rnd(-70, 62); if (free(x, z)) box(rnd(1.8, 3), rnd(1.5, 6), rnd(1.8, 3), rand() < 0.3 ? mats.white : mats.grey, x, 0, z); }
  for (let i = 0; i < 110; i++) { const x = rnd(16, 110), z = rnd(-30, 62); if (free(x, z) && Math.hypot(x - 26, z + 2) >= 12) box(rnd(2, 3), rnd(3, 12), rnd(2, 3), rand() < 0.5 ? mats.glass : mats.white, x, 0, z); }
  for (let i = 0; i < 200; i++) { const x = rnd(-128, 110), z = rnd(-70, 62); if (free(x, z) && !(x > -1 && x < 16)) tree(x, z, rnd(0.6, 1)); }
  const cars: THREE.Mesh[] = [];
  for (let i = 0; i < 10; i++) { const c = box(1.2, 0.6, 0.7, [mats.red, mats.yellow, mats.white, mats.glass2][i % 4], 0, 0.08, 0); c.userData = { lane: [0, 22, -12][i % 3], sp: rnd(0.08, 0.18) * (i % 2 ? 1 : -1), x: rnd(-70, 0) }; cars.push(c); }

  /* ---- 覆盖层 ---- */
  const labels: HTMLElement[] = [];
  ([["黄浦江", 8, 22, ""], ["浦 西", -40, -26, "land"], ["浦 东", 46, 26, "land"], ["苏州河", -50, -18, ""], ["静 安", -78, -14, "land"], ["徐 汇", -90, 44, "land"], ["杨 浦", -12, -62, "land"], ["闵 行", -116, 20, "land"], ["张 江", 100, 40, "land"]] as const).forEach(([t, x, z, c]) => {
    const d = document.createElement("div"); d.className = "lbl " + c; d.textContent = t; d.dataset.x = String(x); d.dataset.z = String(z); overlay.appendChild(d); labels.push(d);
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
  const SPOTS: Record<PlaceId, [number, number]> = { home: [-22, 19.6], rmgy: [-28, -7], metro: [-18, -9.6], bund: [4.6, -9], chp: [-9, 21], tzf: [-30, 26.1], wk: [-47, 13], ykl: [-42, 32.2], ljz: [19, 4], ferry: [4.5, 8.2],
    sjxc: [SUBURB.x + 4, SUBURB.z - 3.5], njl: [-9, -4.2], jas: [-64, -1.5], xtd: [-14, 39], xjh: [-72, 39], hq: [-118, 12.5], wjc: [-28, -51.5], expo: [28, 46], sjgy: [62, 3], zj: [94, 30], gongfang: [-44, -44.5], jiangjing: [44, -19.5], yangfang: [-60, 28.5] };
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

  /* ---- 拖动和缩放 ---- */
  let drag: { x: number; y: number; t: THREE.Vector3 } | null = null;
  canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, t: target.clone() }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; const s = (cam.right - cam.left) / root.clientWidth;
    target.copy(drag.t).addScaledVector(new THREE.Vector3(1, 0, -1).normalize(), -dx * s).addScaledVector(new THREE.Vector3(1, 0, 1).normalize(), -dy * s * 1.35);
    target.x = Math.max(-175, Math.min(105, target.x)); target.z = Math.max(-66, Math.min(88, target.z)); placeCam();
  });
  canvas.addEventListener("pointerup", () => (drag = null));
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
  let raf = 0, t0 = 0;
  const frame = (t: number) => {
    const dt = Math.min(50, t - t0) / 16; t0 = t;
    if (!reduce) {
      ferry.position.x = 8 + Math.sin(t / 2600) * 2.6;
      train.position.x += 0.35 * dt; if (train.position.x > 2) train.position.x = -80;
      cars.forEach((c) => { const u = c.userData; u.x += u.sp * dt; if (u.x > 2) u.x = -72; if (u.x < -72) u.x = 2; c.position.set(u.x, 0.38, u.lane + (u.sp > 0 ? 0.4 : -0.4)); });
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
    renderer.render(scene, cam);
    labels.forEach((el) => project(el, +el.dataset.x!, 0.2, +el.dataset.z!, "-50%,-50%"));
    (Object.keys(pins) as PlaceId[]).forEach((k) => project(pins[k], PLACES[k].x, PLACES[k].h, PLACES[k].z));
    lots.forEach((L, id) => { const { x, z } = plotPos(id); project(L.tag, x, L.house ? 4.2 : 1.8, z); });
    raf = requestAnimationFrame(frame);
  };
  placeCam(); resize(); raf = requestAnimationFrame(frame);

  return {
    setSelected(id) { (Object.keys(pins) as PlaceId[]).forEach((k) => pins[k].classList.toggle("sel", k === id)); },
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
