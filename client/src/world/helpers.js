import * as THREE from 'three';

// Cache geometry dùng chung (đơn vị chuẩn, scale bằng mesh.scale) giúp tiết kiệm bộ nhớ
const geoCache = new Map();
function cachedGeo(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}

const unitBox = () => cachedGeo('box', () => new THREE.BoxGeometry(1, 1, 1));

// Hộp có tâm tại (x, y, z)
export function box(w, h, d, material, x = 0, y = 0, z = 0, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(unitBox(), material);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

export function cyl(rTop, rBot, h, material, x = 0, y = 0, z = 0, seg = 16, { cast = true, receive = true } = {}) {
  const g = cachedGeo(`cyl${rTop}_${rBot}_${h}_${seg}`, () => new THREE.CylinderGeometry(rTop, rBot, h, seg));
  const m = new THREE.Mesh(g, material);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

export function sphere(r, material, x = 0, y = 0, z = 0, seg = 16) {
  const g = cachedGeo(`sph${r}_${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(8, seg * 0.75)));
  const m = new THREE.Mesh(g, material);
  m.position.set(x, y, z);
  m.castShadow = true;
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
  const g = cachedGeo(`tor${r}_${tube}_${arc}_${seg}`, () => new THREE.TorusGeometry(r, tube, 8, seg, arc));
  const m = new THREE.Mesh(g, material);
  m.castShadow = true;
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
 */
export function bakeStatic(root, mergeGeometries) {
  root.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const toRemove = [];

  const visit = (obj) => {
    if (obj.userData.dynamic) return;
    if (obj.isMesh && !obj.isInstancedMesh && obj.geometry.index && !Array.isArray(obj.material) && !obj.userData.noBake) {
      const key = `${obj.material.uuid}|${obj.castShadow}|${obj.receiveShadow}`;
      if (!buckets.has(key)) buckets.set(key, { material: obj.material, cast: obj.castShadow, receive: obj.receiveShadow, geos: [] });
      const g = new THREE.BufferGeometry();
      const src = obj.geometry;
      g.setIndex(src.index.clone());
      g.setAttribute('position', src.attributes.position.clone());
      g.setAttribute('normal', src.attributes.normal.clone());
      if (src.attributes.uv) g.setAttribute('uv', src.attributes.uv.clone());
      else g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(src.attributes.position.count * 2), 2));
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(rootInv, obj.matrixWorld));
      buckets.get(key).geos.push(g);
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
  }
  return merged;
}
