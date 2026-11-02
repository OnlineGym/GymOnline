/**
 * Lưới không gian (spatial hash) cho Area of Interest: mỗi ô `cell` mét chứa tập người chơi.
 * Truy vấn bán kính chỉ duyệt các ô lân cận thay vì toàn bộ channel.
 */
export class SpatialHash {
  constructor(cell = 16) {
    this.cell = cell;
    this.cells = new Map();
  }

  key(x, z) {
    return `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`;
  }

  insert(p) {
    const k = this.key(p.x, p.z);
    p._cell = k;
    let s = this.cells.get(k);
    if (!s) this.cells.set(k, (s = new Set()));
    s.add(p);
  }

  remove(p) {
    if (!p._cell) return;
    const s = this.cells.get(p._cell);
    if (s) {
      s.delete(p);
      if (!s.size) this.cells.delete(p._cell);
    }
    p._cell = null;
  }

  move(p) {
    const k = this.key(p.x, p.z);
    if (k === p._cell) return;
    this.remove(p);
    this.insert(p);
  }

  // Gọi fn(q) cho mọi người trong bán kính r quanh (x, z)
  query(x, z, r, fn) {
    const c = this.cell;
    const x0 = Math.floor((x - r) / c);
    const x1 = Math.floor((x + r) / c);
    const z0 = Math.floor((z - r) / c);
    const z1 = Math.floor((z + r) / c);
    const r2 = r * r;
    for (let i = x0; i <= x1; i++) {
      for (let j = z0; j <= z1; j++) {
        const s = this.cells.get(`${i},${j}`);
        if (!s) continue;
        for (const q of s) {
          const dx = q.x - x;
          const dz = q.z - z;
          const d2 = dx * dx + dz * dz;
          if (d2 <= r2) fn(q, d2);
        }
      }
    }
  }
}
