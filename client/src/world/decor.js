import * as THREE from 'three';
import { box, cyl, sphere, torus } from './helpers.js';
import { mat, C, textTexture } from './materials.js';
import { buildLockerColumn } from '../equipment/builders.js';

/**
 * Đồ trang trí dùng chung. Các vật lặp nhiều lần có template để đưa vào Instancer.
 * Mọi hàm nhận ctx = { S: nhóm tĩnh, col(x,z,w,d), inst: Instancer }
 */
const HALF_PI = Math.PI / 2;

// ---- Template cho instancing (tạo 1 lần) ----
let T = null;
function templates() {
  if (T) return T;
  const plant = new THREE.Group();
  plant.add(cyl(0.22, 0.17, 0.4, mat('#e2e8f0', { rough: 0.4 }), 0, 0.2, 0, 12));
  plant.add(sphere(0.32, mat('#22c55e', { rough: 0.9, flat: true }), 0, 0.65, 0, 7));
  plant.add(sphere(0.24, mat('#4ade80', { rough: 0.9, flat: true }), 0.12, 0.9, -0.05, 7));
  const lamp = new THREE.Group();
  lamp.add(box(1.6, 0.06, 0.5, mat('#ffffff', { emissive: '#fffbe8', emissiveIntensity: 1.6 }), 0, 0, 0, { cast: false, receive: false }));
  const locker = buildLockerColumn(new THREE.Group(), '#14b8a6');
  const locker2 = buildLockerColumn(new THREE.Group(), '#0d9488');
  const lockerPink = buildLockerColumn(new THREE.Group(), '#db2777');
  const dumbbell = (color) => {
    const g = new THREE.Group();
    const h = cyl(0.015, 0.015, 0.22, mat(C.chrome, { metal: 0.9, rough: 0.2 }), 0, 0, 0, 6);
    h.rotation.x = HALF_PI;
    g.add(h);
    for (const s of [-1, 1]) {
      const w = cyl(0.05, 0.05, 0.06, mat(color, { rough: 0.5 }), 0, 0, s * 0.11, 8);
      w.rotation.x = HALF_PI;
      g.add(w);
    }
    return g;
  };
  const chair = new THREE.Group();
  chair.add(box(0.45, 0.06, 0.45, mat('#475569'), 0, 0.45, 0));
  chair.add(box(0.45, 0.45, 0.06, mat('#475569'), 0, 0.7, -0.2));
  for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) chair.add(box(0.04, 0.45, 0.04, mat(C.metal), x, 0.22, z));
  const lounger = new THREE.Group();
  lounger.add(box(0.7, 0.08, 1.7, mat('#f8fafc', { rough: 0.6 }), 0, 0.3, 0));
  const back = box(0.7, 0.08, 0.6, mat('#f8fafc', { rough: 0.6 }), 0, 0.5, -0.75);
  back.rotation.x = 0.7;
  lounger.add(back);
  lounger.add(box(0.72, 0.04, 1.72, mat('#38bdf8'), 0, 0.25, 0));
  const tree = new THREE.Group();
  tree.add(cyl(0.15, 0.22, 1.4, mat('#8b5a2b', { rough: 1 }), 0, 0.7, 0, 7));
  const c1 = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2, 7), mat('#16a34a', { rough: 0.9, flat: true }));
  c1.position.y = 2.2;
  c1.castShadow = true;
  const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.5, 7), mat('#4ade80', { rough: 0.9, flat: true }));
  c2.position.y = 3.1;
  c2.castShadow = true;
  tree.add(c1, c2);
  const plate = new THREE.Group();
  const pl = cyl(0.22, 0.22, 0.05, mat('#111827', { rough: 0.5, metal: 0.4 }), 0, 0, 0, 18);
  pl.rotation.x = HALF_PI;
  plate.add(pl);
  T = {
    plant,
    lamp,
    locker,
    locker2,
    lockerPink,
    chair,
    lounger,
    tree,
    plate,
    dumbbells: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'].map(dumbbell),
  };
  return T;
}
export const tpl = () => templates();

export function plant(ctx, x, z, s = 1) {
  ctx.inst.add(templates().plant, x, 0, z, 0, s);
  ctx.col(x, z, 0.5 * s, 0.5 * s);
}

export function tree(ctx, x, z) {
  ctx.inst.add(templates().tree, x, 0, z, Math.random() * 3);
  ctx.col(x, z, 0.6, 0.6);
}

export function chairRow(ctx, x, z, n, dx = 0.6, ry = 0) {
  for (let i = 0; i < n; i++) ctx.inst.add(templates().chair, x + i * dx, 0, z, ry);
  ctx.col(x + ((n - 1) * dx) / 2, z, n * dx, 0.5);
}

export function lockerRow(ctx, x, z, n, ry, step = 0.62, color = 0, skip = []) {
  const t = templates();
  const tplList = color === 'pink' ? [t.lockerPink, t.lockerPink] : [t.locker, t.locker2];
  const alongX = Math.abs(Math.sin(ry)) < 0.5; // tủ xếp dọc theo X khi mặt tủ quay theo Z
  const positions = [];
  for (let i = 0; i < n; i++) {
    const px = alongX ? x + i * step : x;
    const pz = alongX ? z : z + i * step;
    positions.push({ x: px, z: pz });
    if (skip.includes(i)) continue;
    ctx.inst.add(tplList[i % 2], px, 0, pz, ry);
  }
  const len = n * step;
  if (alongX) ctx.col(x + (len - step) / 2, z, len, 0.5);
  else ctx.col(x, z + (len - step) / 2, 0.5, len);
  return positions;
}

// Kệ tạ đơn (instanced) dọc trục X
export function dumbbellRack(ctx, x, z, len = 4.5, ry = 0) {
  const S = ctx.S;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  g.add(box(len, 0.08, 0.7, mat(C.metal, { metal: 0.6, rough: 0.35 }), 0, 0.5, 0));
  g.add(box(len, 0.08, 0.7, mat(C.metal, { metal: 0.6, rough: 0.35 }), 0, 0.9, 0));
  for (const s of [-1, 1]) g.add(box(0.08, 1, 0.7, mat(C.metal, { metal: 0.6 }), (s * len) / 2, 0.5, 0));
  S.add(g);
  const t = templates();
  const n = Math.floor(len / 0.5);
  const cos = Math.cos(ry);
  const sin = Math.sin(ry);
  for (let i = 0; i < n; i++) {
    const lx = -len / 2 + 0.25 + i * 0.5;
    for (const [ly, lz] of [[0.6, -0.15], [1.0, 0.15]]) {
      const wx = x + lx * cos + lz * sin;
      const wz = z - lx * sin + lz * cos;
      ctx.inst.add(t.dumbbells[i % 6], wx, ly, wz, ry, 0.9 + (i % 6) * 0.1);
    }
  }
  const rot90 = Math.abs(Math.sin(ry)) > 0.5;
  ctx.col(x, z, rot90 ? 0.75 : len, rot90 ? len : 0.75);
}

export function bench(ctx, x, z, len, alongX = true, color = '#475569') {
  const w = alongX ? len : 0.45;
  const d = alongX ? 0.45 : len;
  ctx.S.add(box(w, 0.08, d, mat(color, { rough: 0.6 }), x, 0.42, z));
  const legs = alongX ? [[x - len / 2 + 0.15, z], [x + len / 2 - 0.15, z]] : [[x, z - len / 2 + 0.15], [x, z + len / 2 - 0.15]];
  for (const [lx, lz] of legs) ctx.S.add(box(alongX ? 0.06 : 0.36, 0.4, alongX ? 0.36 : 0.06, mat(C.metal, { metal: 0.6, rough: 0.4 }), lx, 0.2, lz));
  ctx.col(x, z, w, d);
}

export function poster(ctx, x, y, z, ry, lines, accent, w = 2.2, h = 1.1) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: textTexture(lines, { w: 512, h: Math.round((512 * h) / w), accent, size: 46 }) })
  );
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.userData.noBake = true;
  ctx.S.add(m);
  return m;
}

export function mirror(ctx, x, y, z, ry, w, h) {
  const m = box(w, h, 0.04, mat('#d6ecff', { rough: 0.05, metal: 0.95 }), x, y, z, { cast: false });
  m.rotation.y = ry;
  ctx.S.add(m);
}

export function sofa(ctx, x, z, ry = 0, color = '#7c3aed') {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  g.add(box(2.4, 0.4, 0.9, mat(color, { rough: 0.8 }), 0, 0.2, 0));
  g.add(box(2.4, 0.6, 0.25, mat(color, { rough: 0.85 }), 0, 0.6, -0.35));
  g.add(box(0.25, 0.55, 0.9, mat(color, { rough: 0.85 }), -1.1, 0.4, 0));
  g.add(box(0.25, 0.55, 0.9, mat(color, { rough: 0.85 }), 1.1, 0.4, 0));
  ctx.S.add(g);
  const rot = Math.abs(Math.sin(ry)) > 0.5;
  ctx.col(x, z, rot ? 0.9 : 2.4, rot ? 2.4 : 0.9);
}

export function counterDesk(ctx, x, z, len, alongX, color = '#0f172a', glow = C.cyan) {
  const w = alongX ? len : 0.9;
  const d = alongX ? 0.9 : len;
  ctx.S.add(box(w, 1.1, d, mat(color, { rough: 0.4 }), x, 0.55, z));
  ctx.S.add(box(w + 0.15, 0.06, d + 0.15, mat('#f8fafc', { rough: 0.3 }), x, 1.13, z));
  ctx.S.add(box(alongX ? w : 0.05, 0.08, alongX ? 0.05 : d, mat(glow, { emissive: glow, emissiveIntensity: 1.5 }), x + (alongX ? 0 : 0.47), 0.9, z + (alongX ? 0.47 : 0), { cast: false }));
  ctx.col(x, z, w + 0.1, d + 0.1);
}

export function waterCooler(ctx, x, z) {
  ctx.S.add(box(0.4, 1, 0.4, mat('#f1f5f9'), x, 0.5, z));
  ctx.S.add(cyl(0.16, 0.16, 0.45, mat('#7dd3fc', { transparent: true, opacity: 0.7, rough: 0.1 }), x, 1.23, z, 12));
  ctx.col(x, z, 0.45, 0.45);
}

export function neonRing(ctx, x, z, r, color) {
  const t = torus(r, 0.03, mat(color, { emissive: color, emissiveIntensity: 1.4 }), Math.PI * 2, 40);
  t.rotation.x = -HALF_PI;
  t.position.set(x, 0.012, z);
  t.castShadow = false;
  ctx.S.add(t);
}
