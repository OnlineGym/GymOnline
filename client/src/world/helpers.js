import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { settings } from '../core/settings.js';

// Cache geometry dùng chung giúp tiết kiệm bộ nhớ
const geoCache = new Map();
function cachedGeo(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}

// Mức Thấp (máy yếu/điện thoại) giữ hình khối đơn giản để chạy mượt
const hd = () => settings.quality !== 'low';
const unitBox = () => cachedGeo('box', () => new THREE.BoxGeometry(1, 1, 1));
const r3 = (v) => Math.round(v * 1000) / 1000;

/**
 * Hộp vát cạnh chỉ 24 đỉnh: 6 mặt phẳng + dải vát nối các mặt với pháp tuyến nội suy.
 * Cạnh hộp bắt được ánh sáng như vật thật mà gần như không tốn thêm hiệu năng.
 * Geometry chuẩn hóa về khối đơn vị (mesh.scale = kích thước) nên code cũ đổi scale vẫn đúng.
 */
function bevelBoxGeo(w, h, d, worldUV) {
  const dims = [w, h, d];
  const half = dims.map((v) => v / 2);
  const b = Math.min(0.018, Math.min(w, h, d) * 0.22);
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  const vid = new Map();
  const key = (a, sx, sy, sz) => a + '|' + sx + '|' + sy + '|' + sz;
  for (let a = 0; a < 3; a++) {
    const [i, j] = dims[(a + 1) % 3] <= dims[(a + 2) % 3] ? [(a + 1) % 3, (a + 2) % 3] : [(a + 2) % 3, (a + 1) % 3];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const s = [sx, sy, sz];
      const p = [0, 1, 2].map((k) => (k === a ? s[k] * half[k] : s[k] * (half[k] - b)));
      vid.set(key(a, sx, sy, sz), pos.length / 3);
      pos.push(p[0] / w, p[1] / h, p[2] / d);
      const n = [0, 0, 0];
      n[a] = s[a] * dims[a];
      const len = Math.hypot(n[0], n[1], n[2]);
      nor.push(n[0] / len, n[1] / len, n[2] / len);
      if (worldUV) uv.push(p[i], p[j]);
      else uv.push(p[i] / dims[i] + 0.5, p[j] / dims[j] + 0.5);
    }
  }
  const tri = (x, y, z) => {
    const v = (n) => new THREE.Vector3(pos[n * 3] * w, pos[n * 3 + 1] * h, pos[n * 3 + 2] * d);
    const cross = v(y).sub(v(x)).cross(v(z).sub(v(x)));
    const c = v(x).add(v(y)).add(v(z));
    if (cross.dot(c) < 0) idx.push(x, z, y);
    else idx.push(x, y, z);
  };
  const quad = (q, r, t, u) => {
    tri(q, r, t);
    tri(q, t, u);
  };
  const S = [-1, 1];
  // 6 mặt
  for (let a = 0; a < 3; a++) for (const s of S) {
    const i = (a + 1) % 3;
    const j = (a + 2) % 3;
    const v = (si, sj) => {
      const t = [0, 0, 0];
      t[a] = s;
      t[i] = si;
      t[j] = sj;
      return vid.get(key(a, t[0], t[1], t[2]));
    };
    quad(v(-1, -1), v(1, -1), v(1, 1), v(-1, 1));
  }
  // 12 dải vát cạnh
  for (let k = 0; k < 3; k++) {
    const i = (k + 1) % 3;
    const j = (k + 2) % 3;
    for (const si of S) for (const sj of S) {
      const v = (face, sk) => {
        const t = [0, 0, 0];
        t[i] = si;
        t[j] = sj;
        t[k] = sk;
        return vid.get(key(face, t[0], t[1], t[2]));
      };
      quad(v(i, -1), v(i, 1), v(j, 1), v(j, -1));
    }
  }
  // 8 góc
  for (const sx of S) for (const sy of S) for (const sz of S) tri(vid.get(key(0, sx, sy, sz)), vid.get(key(1, sx, sy, sz)), vid.get(key(2, sx, sy, sz)));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// Hộp có tâm tại (x, y, z)
export function box(w, h, d, material, x = 0, y = 0, z = 0, { cast = true, receive = true, plain = false } = {}) {
  const lo = Math.min(w, h, d);
  const hi = Math.max(w, h, d);
  const worldUV = !!material?.userData?.worldUV;
  const bevel = !plain && hd() && lo >= 0.012 && hi <= 3;
  const geo = bevel ? cachedGeo('bb' + r3(w) + '_' + r3(h) + '_' + r3(d) + (worldUV ? 'w' : ''), () => bevelBoxGeo(r3(w), r3(h), r3(d), worldUV)) : unitBox();
  const m = new THREE.Mesh(geo, material);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = cast && lo >= 0.025; // chi tiết mảnh không cần bóng đổ (đỡ tốn pass bóng)
  m.receiveShadow = receive;
  return m;
}

// Khối bo tròn mượt (đệm, vỏ nhựa). crown > 0: phồng ở giữa như đệm bọc da
function roundedGeo(w, h, d, r, crown) {
  const dims = [w, h, d];
  const half = dims.map((v) => v / 2);
  const rad = Math.min(r, Math.min(w, h, d) * 0.45);
  const seg = 4;
  const g = new THREE.BoxGeometry(2, 2, 2, seg, seg, seg);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const merged = mergeVertices(g, 1e-4);
  g.dispose();
  const P = merged.attributes.position;
  const thin = dims.indexOf(Math.min(w, h, d));
  const remap = (t, hf) => {
    const k = Math.round(((t + 1) / 2) * seg);
    return [-hf, -(hf - rad), 0, hf - rad, hf][k];
  };
  const v = [0, 0, 0];
  for (let n = 0; n < P.count; n++) {
    v[0] = remap(P.getX(n), half[0]);
    v[1] = remap(P.getY(n), half[1]);
    v[2] = remap(P.getZ(n), half[2]);
    const inner = v.map((c, k) => THREE.MathUtils.clamp(c, -(half[k] - rad), half[k] - rad));
    const dir = v.map((c, k) => c - inner[k]);
    const len = Math.hypot(dir[0], dir[1], dir[2]);
    if (len > 1e-6) for (let k = 0; k < 3; k++) v[k] = inner[k] + (dir[k] / len) * rad;
    if (crown) {
      const a = (thin + 1) % 3;
      const b = (thin + 2) % 3;
      const f = Math.max(0, 1 - (v[a] / half[a]) ** 2) * Math.max(0, 1 - (v[b] / half[b]) ** 2);
      v[thin] *= 1 + crown * f;
    }
    P.setXYZ(n, v[0], v[1], v[2]);
  }
  merged.computeVertexNormals();
  const N = merged.attributes.normal;
  const uv = new Float32Array(P.count * 2);
  for (let n = 0; n < P.count; n++) {
    const ax = Math.abs(N.getX(n));
    const ay = Math.abs(N.getY(n));
    const az = Math.abs(N.getZ(n));
    if (ay >= ax && ay >= az) (uv[n * 2] = P.getX(n)), (uv[n * 2 + 1] = P.getZ(n));
    else if (ax >= az) (uv[n * 2] = P.getZ(n)), (uv[n * 2 + 1] = P.getY(n));
    else (uv[n * 2] = P.getX(n)), (uv[n * 2 + 1] = P.getY(n));
  }
  merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return merged;
}

function roundedMesh(w, h, d, material, x, y, z, r, crown) {
  const key = 'rd' + r3(w) + '_' + r3(h) + '_' + r3(d) + '_' + r3(r) + '_' + crown;
  const m = new THREE.Mesh(cachedGeo(key, () => roundedGeo(r3(w), r3(h), r3(d), r, crown)), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Đệm bọc da
export function cushion(w, h, d, material, x = 0, y = 0, z = 0) {
  if (!hd()) return box(w, h, d, material, x, y, z);
  const thin = Math.min(w, h, d);
  return roundedMesh(w, h, d, material, x, y, z, Math.min(0.045, thin * 0.42), Math.min(0.3, 0.014 / (thin / 2)));
}

// Vỏ nhựa / khối bo tròn
export function shell(w, h, d, material, x = 0, y = 0, z = 0, r = 0.05) {
  if (!hd()) return box(w, h, d, material, x, y, z);
  return roundedMesh(w, h, d, material, x, y, z, r, 0);
}

export function cyl(rTop, rBot, h, material, x = 0, y = 0, z = 0, seg = 16, { cast = true, receive = true } = {}) {
  const big = Math.max(rTop, rBot);
  const n = !hd() ? Math.min(seg, 12) : big < 0.012 ? 5 : big < 0.03 ? 8 : big < 0.06 ? 10 : big < 0.1 ? 14 : big < 0.25 ? 22 : 32;
  // Trụ đủ lớn được vát 2 mép để bắt sáng; thanh mảnh / thanh co giãn giữ trụ thường
  const bevel = hd() && big >= 0.06 && h !== 1 && h > 0.012;
  const g = cachedGeo('cy' + rTop + '_' + rBot + '_' + h + '_' + n + (bevel ? 'b' : ''), () => {
    if (!bevel) return new THREE.CylinderGeometry(rTop, rBot, h, n);
    const b = Math.min(0.012, big * 0.12, h * 0.2);
    const pts = [
      [0, -h / 2],
      [Math.max(0, rBot - b), -h / 2],
      [rBot, -h / 2 + b],
      [rTop, h / 2 - b],
      [Math.max(0, rTop - b), h / 2],
      [0, h / 2],
    ].map(([a, c]) => new THREE.Vector2(a, c));
    return new THREE.LatheGeometry(pts, n);
  });
  const m = new THREE.Mesh(g, material);
  m.position.set(x, y, z);
  m.castShadow = cast && big >= 0.025;
  m.receiveShadow = receive;
  return m;
}

export function sphere(r, material, x = 0, y = 0, z = 0, seg = 16) {
  const n = hd() ? (r < 0.03 ? 8 : r < 0.1 ? 10 : r < 0.3 ? 16 : 20) : Math.min(seg, 10);
  const g = cachedGeo(`sph${r}_${n}`, () => new THREE.SphereGeometry(r, n, Math.max(8, Math.round(n * 0.75))));
  const m = new THREE.Mesh(g, material);
  m.position.set(x, y, z);
  m.castShadow = r >= 0.03;
  m.receiveShadow = true;
  return m;
}

export function capsule(r, len, material, seg = 8) {
  const g = cachedGeo(`cap${r}_${len}_${seg}`, () => new THREE.CapsuleGeometry(r, len, 4, seg));
  const m = new THREE.Mesh(g, material);
  m.castShadow = true;
  return m;
}

export function torus(r, tube, material, arc = Math.PI * 2, seg = 24) {
  const n = hd() ? (r > 0.3 ? 32 : 18) : Math.min(seg, 16);
  const g = cachedGeo(`tor${r}_${tube}_${arc}_${n}`, () => new THREE.TorusGeometry(r, tube, tube > 0.05 ? 12 : 6, n, arc));
  const m = new THREE.Mesh(g, material);
  m.castShadow = true;
  return m;
}

// Ống uốn cong qua các điểm (tay vịn, khung cong)
export function tube(points, radius, material, tubular = 10, radial = 8) {
  if (radius < 0.02) radial = 6;
  tubular = Math.min(tubular, 10);
  const key = 'tb' + points.flat().map(r3).join(',') + '_' + radius + '_' + tubular + '_' + radial;
  const g = cachedGeo(key, () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))), tubular, radius, radial, false));
  const m = new THREE.Mesh(g, material);
  m.castShadow = radius >= 0.025;
  m.receiveShadow = true;
  return m;
}

// Khối tròn xoay từ biên dạng [[r, y], ...] quanh trục Y (đĩa tạ, chân đế...)
export function lathe(profile, material, x = 0, y = 0, z = 0, seg = 24) {
  seg = Math.min(seg, 28);
  const key = 'lt' + profile.flat().map(r3).join(',') + '_' + seg;
  const g = cachedGeo(key, () => new THREE.LatheGeometry(profile.map(([a, b]) => new THREE.Vector2(a, b)), seg));
  const m = new THREE.Mesh(g, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Thanh nối 2 điểm (dùng cho khung máy, cáp)
export function bar(a, b, radius, material, seg = 8) {
  const start = new THREE.Vector3(...a);
  const end = new THREE.Vector3(...b);
  const len = start.distanceTo(end);
  const m = cyl(radius, radius, 1, material, 0, 0, 0, seg);
  m.scale.y = len;
  m.position.copy(start).add(end).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
  return m;
}

export function group(...children) {
  const g = new THREE.Group();
  children.forEach((c) => c && g.add(c));
  return g;
}

/**
 * Gộp toàn bộ mesh tĩnh dưới `root` thành ít mesh nhất có thể (theo material + shadow flags).
 * Bỏ qua các nhánh có userData.dynamic = true (bộ phận chuyển động, cửa...).
 * Giảm draw call từ hàng nghìn xuống vài chục => chạy mượt trên máy yếu/mobile.
 *  - cell   : chia theo ô lưới (mét) để phần ngoài khung hình/ngoài vùng bóng không phải vẽ
 *  - details: mảng nhận các mesh chi tiết nhỏ (núm, chốt, thanh mảnh) để ẩn khi ở xa
 *  - mesh có userData.idleOf: ghi lại vùng đỉnh để ẩn/hiện riêng 1 máy mà không tách draw call
 */
const DETAIL_SIZE = 0.14;
const _bb = new THREE.Vector3();
export function bakeStatic(root, mergeGeometries, { cell = 0, details = null } = {}) {
  root.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const toRemove = [];

  const visit = (obj) => {
    if (obj.userData.dynamic && obj !== root) return;
    if (obj.isMesh && !obj.isInstancedMesh && obj.geometry.index && !Array.isArray(obj.material) && !obj.userData.noBake) {
      const g = new THREE.BufferGeometry();
      const src = obj.geometry;
      g.setIndex(src.index.clone());
      g.setAttribute('position', src.attributes.position.clone());
      g.setAttribute('normal', src.attributes.normal.clone());
      if (src.attributes.uv) g.setAttribute('uv', src.attributes.uv.clone());
      else g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(src.attributes.position.count * 2), 2));
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(rootInv, obj.matrixWorld));
      let key = `${obj.material.uuid}|${obj.castShadow}|${obj.receiveShadow}`;
      let detail = false;
      if (cell || details) {
        g.computeBoundingBox();
        g.boundingBox.getSize(_bb);
        detail = !!details && Math.max(_bb.x, _bb.y, _bb.z) < DETAIL_SIZE;
        if (cell) {
          g.boundingBox.getCenter(_bb);
          key += `|${Math.floor(_bb.x / cell)}|${Math.floor(_bb.z / cell)}`;
        }
        if (detail) key += '|d';
      }
      if (!buckets.has(key)) buckets.set(key, { material: obj.material, cast: obj.castShadow, receive: obj.receiveShadow, geos: [], owners: [], detail });
      const b = buckets.get(key);
      b.geos.push(g);
      b.owners.push(obj.userData.idleOf || null);
      toRemove.push(obj);
    }
    obj.children.forEach(visit);
  };
  visit(root);

  toRemove.forEach((m) => m.parent.remove(m));
  const merged = [];
  for (const b of buckets.values()) {
    const geo = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
    if (!geo) continue;
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    const mesh = new THREE.Mesh(geo, b.material);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    mesh.matrixAutoUpdate = false;
    root.add(mesh);
    merged.push(mesh);
    if (b.detail) details.push(mesh);
    let start = 0;
    b.geos.forEach((g, i) => {
      const count = g.attributes.position.count;
      if (b.owners[i]) (b.owners[i].proxy ||= []).push({ mesh, start, count, saved: null });
      start += count;
    });
  }
  return merged;
}

// Ẩn/hiện bản sao "máy đang nghỉ" trong khối đã gộp: chỉ sửa đúng vùng đỉnh của máy đó
export function setProxyVisible(owner, visible) {
  for (const r of owner.proxy || []) {
    const attr = r.mesh.geometry.attributes.position;
    const from = r.start * 3;
    const len = r.count * 3;
    if (visible) {
      if (!r.saved) continue;
      attr.array.set(r.saved, from);
    } else {
      r.saved ||= attr.array.slice(from, from + len);
      attr.array.fill(0, from, from + len);
    }
    attr.addUpdateRange(from, len);
    attr.needsUpdate = true;
  }
}
