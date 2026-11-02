/**
 * Va chạm 2D trên mặt phẳng XZ: danh sách hộp AABB, nhân vật là hình tròn bán kính r.
 * Dùng lưới không gian (spatial hash) để chỉ kiểm tra các hộp ở gần.
 */
const CELL = 4;

export class Collision {
  constructor() {
    this.boxes = [];
    this.grid = new Map();
  }

  _cells(b, fn) {
    const x0 = Math.floor(b.minX / CELL);
    const x1 = Math.floor(b.maxX / CELL);
    const z0 = Math.floor(b.minZ / CELL);
    const z1 = Math.floor(b.maxZ / CELL);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) fn(`${x},${z}`);
  }

  addBox(minX, maxX, minZ, maxZ, tag) {
    const b = { minX: Math.min(minX, maxX), maxX: Math.max(minX, maxX), minZ: Math.min(minZ, maxZ), maxZ: Math.max(minZ, maxZ), tag };
    this.boxes.push(b);
    this._cells(b, (k) => {
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(b);
    });
    return b;
  }

  // Hộp theo tâm + kích thước, có xoay (chỉ hỗ trợ góc bội số 90°)
  addRect(cx, cz, w, d, ry = 0, tag) {
    const rot = Math.round(ry / (Math.PI / 2)) % 2 !== 0;
    const hw = (rot ? d : w) / 2;
    const hd = (rot ? w : d) / 2;
    return this.addBox(cx - hw, cx + hw, cz - hd, cz + hd, tag);
  }

  _nearby(x, z, r) {
    const set = new Set();
    this._cells({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r }, (k) => {
      const list = this.grid.get(k);
      if (list) list.forEach((b) => set.add(b));
    });
    return set;
  }

  // Đẩy vị trí pos {x,z} ra khỏi các hộp (lặp 2 lần để xử lý góc tường)
  resolve(pos, r) {
    for (let iter = 0; iter < 2; iter++) {
      for (const b of this._nearby(pos.x, pos.z, r + 0.5)) {
        const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
        const dx = pos.x - cx;
        const dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          pos.x += (dx / d) * (r - d);
          pos.z += (dz / d) * (r - d);
        } else {
          // Tâm nằm trong hộp: đẩy ra cạnh gần nhất
          const pushes = [
            [b.minX - r - pos.x, 0],
            [b.maxX + r - pos.x, 0],
            [0, b.minZ - r - pos.z],
            [0, b.maxZ + r - pos.z],
          ];
          pushes.sort((p, q) => Math.abs(p[0] + p[1]) - Math.abs(q[0] + q[1]));
          pos.x += pushes[0][0];
          pos.z += pushes[0][1];
        }
      }
    }
    return pos;
  }
}
