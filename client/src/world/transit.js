/**
 * Sảnh thang (x 24..40, z -10..10, giống nhau mọi tầng) – các tầng xếp chồng thật, cao FLOOR_H mỗi tầng.
 *
 *   z -9.6..-7.6  Thang bộ nối (tầng chẵn ↔ tầng+1)    ┐ đường dốc chạy theo trục X:
 *   z -6.6..-4.6  Thang bộ nối (tầng lẻ ↔ tầng+1)      │ chân dốc x=26 (tầng dưới) → đỉnh x=37 (tầng trên)
 *   z -3.6..3.6   2 cabin thang máy (tường Đông) + điểm đến
 *   z  4.4..7.0   Thang cuốn nối 2↔3 (làn lên + làn xuống)
 *   z  7.2..9.8   Thang cuốn nối 1↔2
 * Ở tầng trên, phần đường dốc là "giếng" (lỗ trên sàn có lan can) – nhìn xuyên xuống tầng dưới.
 */
export const FLOOR_H = 4.45;
export const RAMP_X1 = 26; // chân dốc
export const RAMP_X2 = 37; // đỉnh dốc
export const RAMP_LEN = RAMP_X2 - RAMP_X1;
export const ESC_SPEED = 1.1; // m/s – tốc độ băng thang cuốn

const STAIR_STRIPS = [
  { z1: -9.6, z2: -7.6 },
  { z1: -6.6, z2: -4.6 },
];

/**
 * Danh sách đường dốc nối tầng `lower` với `lower + 1`
 *  kind: 'stairs' (đi bộ 2 chiều) | 'escUp' (băng chạy lên) | 'escDown' (băng chạy xuống)
 */
export const RAMPS = [];
for (let f = 0; f < 4; f++) RAMPS.push({ kind: 'stairs', lower: f, ...STAIR_STRIPS[f % 2] });
// Thang cuốn chỉ nối 1↔2 và 2↔3 (tầng có nhiều người qua lại)
RAMPS.push({ kind: 'escUp', lower: 1, z1: 7.2, z2: 8.4 }, { kind: 'escDown', lower: 1, z1: 8.6, z2: 9.8 });
RAMPS.push({ kind: 'escUp', lower: 2, z1: 4.4, z2: 5.6 }, { kind: 'escDown', lower: 2, z1: 5.8, z2: 7.0 });

// Đường dốc đi lên từ tầng f / đường dốc đi xuống (giếng) ở tầng f
export const rampsUpFrom = (f) => RAMPS.filter((r) => r.lower === f);
export const rampsDownFrom = (f) => RAMPS.filter((r) => r.lower === f - 1);

// Lỗ trên sàn tầng f (giếng của đường dốc từ tầng dưới) và trên trần tầng f (đường dốc đi lên)
export const floorHoles = (f) => rampsDownFrom(f).map((r) => ({ x1: RAMP_X1, x2: RAMP_X2, z1: r.z1, z2: r.z2 }));
export const ceilingHoles = (f) => rampsUpFrom(f).map((r) => ({ x1: RAMP_X1 - 0.5, x2: RAMP_X2, z1: r.z1, z2: r.z2 }));

// Cabin thang máy (cửa quay về -X tại x = CAB_X1)
export const CAB_X1 = 37.4;
export const CAB_X2 = 39.85;
export const ELEVATORS = [
  { id: 'A', z1: -3.6, z2: -1.0 },
  { id: 'B', z1: 1.0, z2: 3.6 },
];
export const elevatorAt = (x, z) => ELEVATORS.find((e) => x > CAB_X1 + 0.25 && x < CAB_X2 && z > e.z1 + 0.2 && z < e.z2 - 0.2) || null;

// Chiều cao trên đường dốc theo vị trí x (0 ở chân, FLOOR_H ở đỉnh)
export const rampHeight = (x) => (Math.max(0, Math.min(RAMP_LEN, x - RAMP_X1)) / RAMP_LEN) * FLOOR_H;

export const inHub = (x, z) => x > 22 && x < 41 && Math.abs(z) < 12;

// Trừ các hình chữ nhật "lỗ" khỏi 1 hình chữ nhật -> danh sách hình chữ nhật còn lại
export function subtractRects(rect, holes) {
  let rects = [rect];
  for (const h of holes) {
    const next = [];
    for (const r of rects) {
      if (h.x2 <= r.x1 || h.x1 >= r.x2 || h.z2 <= r.z1 || h.z1 >= r.z2) {
        next.push(r);
        continue;
      }
      const ix1 = Math.max(r.x1, h.x1);
      const ix2 = Math.min(r.x2, h.x2);
      if (h.z1 > r.z1) next.push({ x1: r.x1, x2: r.x2, z1: r.z1, z2: h.z1 });
      if (h.z2 < r.z2) next.push({ x1: r.x1, x2: r.x2, z1: h.z2, z2: r.z2 });
      const zz1 = Math.max(r.z1, h.z1);
      const zz2 = Math.min(r.z2, h.z2);
      if (ix1 > r.x1) next.push({ x1: r.x1, x2: ix1, z1: zz1, z2: zz2 });
      if (ix2 < r.x2) next.push({ x1: ix2, x2: r.x2, z1: zz1, z2: zz2 });
    }
    rects = next;
  }
  return rects;
}
