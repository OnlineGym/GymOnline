import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, cyl, sphere, torus, cushion, lathe } from './helpers.js';
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
  // Chậu gốm + đất + chùm lá hình bầu dục xếp xoắn ốc
  plant.add(lathe([[0, 0], [0.17, 0], [0.235, 0.36], [0.25, 0.4], [0.22, 0.4], [0.2, 0.36], [0, 0.36]], mat('#d8d4cc', { rough: 0.5 }), 0, 0, 0, 24));
  plant.add(cyl(0.012, 0.018, 0.8, mat('#4b3a24', { rough: 0.9 }), 0, 0.76, 0, 8));
  const leafMat = [mat('#2f7d3b', { rough: 0.5 }), mat('#3f9a4b', { rough: 0.5 }), mat('#245f30', { rough: 0.55 })];
  const leafGeo = new THREE.SphereGeometry(0.14, 8, 6);
  for (let i = 0; i < 12; i++) {
    const a = i * 2.4;
    const h = 0.5 + (i / 12) * 0.72;
    const r = 0.26 - (i / 12) * 0.13;
    const lf = new THREE.Mesh(leafGeo, leafMat[i % 3]);
    lf.castShadow = true;
    lf.position.set(Math.cos(a) * r, h, Math.sin(a) * r);
    lf.scale.set(0.62, 0.1, 1.15);
    lf.rotation.set(0.25, -a + Math.PI / 2, 0);
    plant.add(lf);
  }
  const lamp = new THREE.Group();
  // Đèn LED dài âm trần có viền nhôm
  lamp.add(box(3.1, 0.03, 0.22, mat('#3a3d42', { rough: 0.4, metal: 0.8 }), 0, 0.015, 0, { cast: false, receive: false }));
  lamp.add(box(2.98, 0.02, 0.13, mat('#ffffff', { emissive: '#fff4e2', emissiveIntensity: 3.4 }), 0, -0.012, 0, { cast: false, receive: false }));
  const locker = buildLockerColumn(new THREE.Group(), '#14b8a6');
  const locker2 = buildLockerColumn(new THREE.Group(), '#0d9488');
  const lockerPink = buildLockerColumn(new THREE.Group(), '#db2777');
  const dumbbell = (color) => {
    const g = new THREE.Group();
    // Tạ đơn lục giác bọc cao su, tay cầm khía, nắp đầu tạ màu theo cỡ
    const h = cyl(0.014, 0.014, 0.2, mat('#c5c9cf', { metal: 1, rough: 0.35 }), 0, 0, 0, 10);
    h.rotation.x = HALF_PI;
    g.add(h);
    const hex = new THREE.CylinderGeometry(0.058, 0.058, 0.07, 6);
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(hex, mat('#17181b', { rough: 0.72 }));
      w.position.z = s * 0.125;
      w.rotation.x = HALF_PI;
      w.castShadow = true;
      g.add(w);
      const cap = cyl(0.028, 0.028, 0.006, mat(color, { rough: 0.35, metal: 0.4 }), 0, 0, s * 0.162, 16, { cast: false });
      cap.rotation.x = HALF_PI;
      g.add(cap);
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
  // Cây tán tròn: thân thuôn + nhiều khối lá lồi lõm, mượt
  tree.add(lathe([[0, 0], [0.27, 0], [0.16, 0.3], [0.12, 1.1], [0.09, 1.9], [0, 1.9]], mat('#6b4a2e', { rough: 0.95 }), 0, 0, 0, 12));
  // Gộp đỉnh trùng để pháp tuyến mượt (khối lá tròn, không gãy cạnh)
  const blobRaw = new THREE.IcosahedronGeometry(1, 2);
  blobRaw.deleteAttribute('normal');
  blobRaw.deleteAttribute('uv');
  const blob = mergeVertices(blobRaw, 1e-3);
  {
    const P = blob.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(P, i);
      const n = 1 + Math.sin(v.x * 7.1) * 0.05 + Math.sin(v.y * 8.3 + 1) * 0.05 + Math.sin(v.z * 9.2 + 2) * 0.05;
      v.multiplyScalar(n);
      P.setXYZ(i, v.x, v.y, v.z);
    }
    blob.computeVertexNormals();
  }
  const foliage = [mat('#2f7d32', { rough: 0.8 }), mat('#3c9440', { rough: 0.8 }), mat('#276a2b', { rough: 0.85 })];
  [[0, 2.5, 0, 1.15], [0.75, 2.2, 0.2, 0.75], [-0.7, 2.25, 0.25, 0.8], [0.15, 2.3, -0.75, 0.75], [-0.1, 3.15, 0.1, 0.8], [0.3, 2.85, 0.5, 0.62]].forEach(([x, y, z, s], i) => {
    const m = new THREE.Mesh(blob, foliage[i % 3]);
    m.position.set(x, y, z);
    m.scale.setScalar(s);
    m.castShadow = true;
    m.receiveShadow = true;
    tree.add(m);
  });
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
  // Giá thép 2 tầng có ray đỡ: lộ tạ, không phải kệ đặc
  const steel = mat('#26292e', { metal: 0.6, rough: 0.42 });
  for (const lz of [-0.15, 0.15]) {
    const ly = lz < 0 ? 0.52 : 0.92;
    for (const dz of [-0.13, 0.13]) g.add(box(len, 0.04, 0.03, steel, 0, ly, lz + dz));
  }
  for (const lx of [-len / 2, 0, len / 2]) {
    g.add(box(0.06, 1.0, 0.06, steel, lx, 0.5, 0.2));
    g.add(box(0.06, 0.6, 0.06, steel, lx, 0.3, -0.2));
    g.add(box(0.06, 0.04, 0.56, steel, lx, 0.52, 0));
    g.add(box(0.06, 0.04, 0.3, steel, lx, 0.92, 0.15));
    g.add(box(0.1, 0.03, 0.72, steel, lx, 0.015, 0));
  }
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
  // Sofa bọc vải: đệm rời, tựa lưng, tay ghế, chân kim loại
  const fabric = mat(color, { rough: 0.9 });
  g.add(cushion(2.4, 0.22, 0.88, fabric, 0, 0.22, 0));
  for (const s of [-1, 1]) {
    g.add(cushion(0.96, 0.16, 0.66, fabric, s * 0.49, 0.42, 0.08));
    g.add(cushion(0.96, 0.5, 0.2, fabric, s * 0.49, 0.72, -0.28));
    g.add(cushion(0.24, 0.5, 0.88, fabric, s * 1.08, 0.46, 0));
    for (const q of [-1, 1]) g.add(cyl(0.02, 0.012, 0.12, mat('#b8bcc2', { rough: 0.3, metal: 1 }), s * 1.05, 0.06, q * 0.34, 10));
  }
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
