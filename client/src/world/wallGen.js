/**
 * Sinh tường tự động từ danh sách phòng: mỗi phòng có `walls: true` tạo 4 cạnh,
 * cạnh chung giữa 2 phòng được gộp làm 1, cạnh trùng tường bao bị bỏ (tường bao dựng riêng).
 * Cửa (doors) nằm trên đường tường nào thì đoạn đó được khoét lỗ.
 * Kết quả cùng định dạng tường cũ: { x1, z1, x2, z2, doors: [{ c, w, type, color }] }
 */
const EPS = 0.01;

export function generateWalls(rooms, doors, bounds) {
  const lines = new Map(); // "x:12" | "z:-4" -> [[a, b]...]
  const push = (axis, fixed, a, b) => {
    const onOuter = axis === 'z' ? Math.abs(fixed - bounds.minZ) < EPS || Math.abs(fixed - bounds.maxZ) < EPS : Math.abs(fixed - bounds.minX) < EPS || Math.abs(fixed - bounds.maxX) < EPS;
    if (onOuter) return;
    const k = `${axis}:${fixed}`;
    if (!lines.has(k)) lines.set(k, []);
    lines.get(k).push([Math.min(a, b), Math.max(a, b)]);
  };
  for (const r of rooms) {
    if (!r.walls) continue;
    push('z', r.z1, r.x1, r.x2); // cạnh bắc
    push('z', r.z2, r.x1, r.x2); // cạnh nam
    push('x', r.x1, r.z1, r.z2); // cạnh tây
    push('x', r.x2, r.z1, r.z2); // cạnh đông
  }
  const walls = [];
  for (const [k, segs] of lines) {
    const [axis, fixedStr] = k.split(':');
    const fixed = Number(fixedStr);
    segs.sort((p, q) => p[0] - q[0]);
    // gộp đoạn chồng lấn
    const merged = [];
    for (const s of segs) {
      const last = merged[merged.length - 1];
      if (last && s[0] <= last[1] + EPS) last[1] = Math.max(last[1], s[1]);
      else merged.push([...s]);
    }
    for (const [a, b] of merged) {
      const ds = doors
        .filter((d) => (axis === 'z' ? Math.abs(d.z - fixed) < EPS && d.x > a && d.x < b : Math.abs(d.x - fixed) < EPS && d.z > a && d.z < b))
        .map((d) => ({ c: axis === 'z' ? d.x : d.z, w: d.w, type: d.type || 'open', color: d.color }));
      walls.push(axis === 'z' ? { x1: a, z1: fixed, x2: b, z2: fixed, doors: ds } : { x1: fixed, z1: a, x2: fixed, z2: b, doors: ds });
    }
  }
  return walls;
}

// Tường bao 4 phía của tầng (có thể có cửa trên từng phía)
export function outerWalls(bounds, outerDoors = []) {
  const { minX, maxX, minZ, maxZ } = bounds;
  const sideDoors = (side) => outerDoors.filter((d) => d.side === side).map((d) => ({ c: d.c, w: d.w, type: d.type || 'sliding', color: d.color }));
  return [
    { x1: minX, z1: minZ, x2: maxX, z2: minZ, doors: sideDoors('n'), outer: true },
    { x1: minX, z1: maxZ, x2: maxX, z2: maxZ, doors: sideDoors('s'), outer: true },
    { x1: minX, z1: minZ, x2: minX, z2: maxZ, doors: sideDoors('w'), outer: true },
    { x1: maxX, z1: minZ, x2: maxX, z2: maxZ, doors: sideDoors('e'), outer: true },
  ];
}
