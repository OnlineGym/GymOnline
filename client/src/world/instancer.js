import * as THREE from 'three';

/**
 * Gom vật thể lặp lại (tủ locker, tạ đơn, đèn trần, cây cảnh, ghế...) thành InstancedMesh:
 * 1 draw call cho hàng trăm bản sao. Template là 1 Group dựng sẵn, mỗi mesh con thành 1 InstancedMesh.
 */
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();

export class Instancer {
  constructor() {
    this.buckets = new Map(); // key -> { geo, mat, cast, receive, matrices: [] }
  }

  // Thêm 1 bản sao của template tại (x, y, z) xoay ry, tỉ lệ scale
  add(template, x, y, z, ry = 0, scale = 1) {
    template.updateMatrixWorld(true);
    _p.set(x, y, z);
    _q.setFromEuler(_e.set(0, ry, 0));
    _s.set(scale, scale, scale);
    const placement = new THREE.Matrix4().compose(_p, _q, _s);
    template.traverse((o) => {
      if (!o.isMesh) return;
      const key = `${o.geometry.uuid}|${o.material.uuid}|${o.castShadow}`;
      let b = this.buckets.get(key);
      if (!b) this.buckets.set(key, (b = { geo: o.geometry, mat: o.material, cast: o.castShadow, receive: o.receiveShadow, matrices: [] }));
      b.matrices.push(_m.multiplyMatrices(placement, o.matrixWorld).clone());
    });
  }

  get count() {
    let n = 0;
    for (const b of this.buckets.values()) n += b.matrices.length;
    return n;
  }

  /**
   * Tạo InstancedMesh. route(x, z) trả về Group cha theo vị trí (để chia theo khu culling),
   * hoặc truyền thẳng 1 Group.
   */
  build(route) {
    const pick = typeof route === 'function' ? route : () => route;
    const meshes = [];
    const pos = new THREE.Vector3();
    for (const b of this.buckets.values()) {
      const groups = new Map();
      for (const m of b.matrices) {
        pos.setFromMatrixPosition(m);
        const parent = pick(pos.x, pos.z);
        if (!groups.has(parent)) groups.set(parent, []);
        groups.get(parent).push(m);
      }
      for (const [parent, list] of groups) {
        const im = new THREE.InstancedMesh(b.geo, b.mat, list.length);
        list.forEach((m, i) => im.setMatrixAt(i, m));
        im.instanceMatrix.needsUpdate = true;
        im.castShadow = b.cast;
        im.receiveShadow = b.receive;
        im.computeBoundingSphere();
        im.matrixAutoUpdate = false;
        parent.add(im);
        meshes.push(im);
      }
    }
    this.buckets.clear();
    return meshes;
  }
}
