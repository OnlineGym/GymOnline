// Mặt bằng tòa nhà gym (đơn vị mét). Trục +Z hướng ra cửa chính, -Z vào sâu bên trong.
//
//  z=-24 ┌──────────────┬────────────┬────────────┐
//        │   AEROBIC    │  TỰ DO     │  XÔNG HƠI  │
//  z=-10 ├──────────────┴────────────┼────────────┤
//        │        KHU MÁY TẬP        │ THAY ĐỒ    │
//  z=8   ├──────┬──────┬─────────────┴────────────┤
//        │ WC♂  │ WC♀  │        SẢNH / LỄ TÂN     │
//  z=20  └──────┴──────┴───────────[cửa]──────────┘
//       x=-24  -16    -8           0             24

export const WALL_H = 4;
export const WALL_T = 0.3;
export const DOOR_H = 2.6;

export const ROOMS = [
  { id: 'lobby', name: 'Sảnh / Lễ tân', icon: '🏠', x1: -8, x2: 24, z1: 8, z2: 20, floor: 'lobby', map: '#334155' },
  { id: 'machines', name: 'Khu máy tập', icon: '🏋️', x1: -24, x2: 10, z1: -10, z2: 8, floor: 'rubber', map: '#1e293b' },
  { id: 'aerobic', name: 'Phòng Aerobic', icon: '💃', x1: -24, x2: -6, z1: -24, z2: -10, floor: 'wood', map: '#4c1d95' },
  { id: 'free', name: 'Khu tập tự do', icon: '🤸', x1: -6, x2: 10, z1: -24, z2: -10, floor: 'mats', map: '#1e3a8a' },
  { id: 'locker', name: 'Phòng thay đồ', icon: '🧥', x1: 10, x2: 24, z1: -10, z2: 8, floor: 'lockerTile', map: '#0f766e' },
  { id: 'sauna', name: 'Phòng xông hơi', icon: '♨️', x1: 10, x2: 24, z1: -24, z2: -10, floor: 'sauna', map: '#9a3412' },
  { id: 'wc_male', name: 'Toilet Nam', icon: '🚹', x1: -24, x2: -16, z1: 8, z2: 20, floor: 'wcTile', map: '#1d4ed8' },
  { id: 'wc_female', name: 'Toilet Nữ', icon: '🚺', x1: -16, x2: -8, z1: 8, z2: 20, floor: 'wcTile', map: '#be185d' },
];

export const OUTSIDE = { id: 'outside', name: 'Sân trước', icon: '🌳' };

// Tường: đoạn thẳng song song trục, doors = các khoảng trống (c: tâm, w: rộng, type: loại cửa)
export const WALLS = [
  // Tường bao ngoài
  { x1: -24, z1: -24, x2: 24, z2: -24 },
  { x1: -24, z1: 20, x2: 24, z2: 20, doors: [{ c: 0, w: 3.2, type: 'sliding' }], outer: true },
  { x1: -24, z1: -24, x2: -24, z2: 20 },
  { x1: 24, z1: -24, x2: 24, z2: 20 },
  // Tường bên trong
  { x1: -24, z1: -10, x2: -6, z2: -10, doors: [{ c: -15, w: 3, type: 'double' }] },
  { x1: -6, z1: -10, x2: 10, z2: -10, doors: [{ c: 2, w: 7, type: 'open' }] },
  { x1: 10, z1: -10, x2: 24, z2: -10, doors: [{ c: 17, w: 1.8, type: 'swing', color: '#8a5a33' }] },
  { x1: -6, z1: -24, x2: -6, z2: -10, doors: [{ c: -17, w: 2.6, type: 'open' }] },
  { x1: 10, z1: -24, x2: 10, z2: -10 },
  { x1: 10, z1: -10, x2: 10, z2: 8, doors: [{ c: -1, w: 2.6, type: 'open' }] },
  { x1: -24, z1: 8, x2: -8, z2: 8, doors: [{ c: -20, w: 1.8, type: 'swing', color: '#3b82f6' }, { c: -12, w: 1.8, type: 'swing', color: '#ec4899' }] },
  { x1: -8, z1: 8, x2: 24, z2: 8, doors: [{ c: 0, w: 6, type: 'open' }, { c: 17, w: 2.2, type: 'swing', color: '#14b8a6' }] },
  { x1: -16, z1: 8, x2: -16, z2: 20 },
  { x1: -8, z1: 8, x2: -8, z2: 20 },
];

// Bảng chỉ dẫn đặt trên các lối vào (x, z, hướng xoay ry, chữ)
export const SIGNS = [
  { x: 0, z: 8, ry: 0, text: 'KHU MÁY TẬP', sub: 'Training Area', color: '#22d3ee', both: true, back: 'SẢNH / LỄ TÂN' },
  { x: -15, z: -10, ry: 0, text: 'PHÒNG AEROBIC', sub: 'Dance & Cardio', color: '#f472b6', both: true, back: 'KHU MÁY TẬP' },
  { x: 2, z: -10, ry: 0, text: 'KHU TẬP TỰ DO', sub: 'Functional', color: '#60a5fa', both: true, back: 'KHU MÁY TẬP' },
  { x: 17, z: -10, ry: 0, text: 'XÔNG HƠI', sub: 'Sauna 80°C', color: '#fb923c', both: true, back: 'PHÒNG THAY ĐỒ' },
  { x: 10, z: -1, ry: -Math.PI / 2, text: 'PHÒNG THAY ĐỒ', sub: 'Locker Room', color: '#2dd4bf', both: true, back: 'KHU MÁY TẬP' },
  { x: 17, z: 8, ry: 0, text: 'PHÒNG THAY ĐỒ', sub: 'Locker Room', color: '#2dd4bf', both: true, back: 'SẢNH / LỄ TÂN' },
  { x: -20, z: 8, ry: Math.PI, text: 'WC NAM', sub: 'Men', color: '#3b82f6', both: false },
  { x: -12, z: 8, ry: Math.PI, text: 'WC NỮ', sub: 'Women', color: '#ec4899', both: false },
  { x: -6, z: -17, ry: Math.PI / 2, text: 'AEROBIC', sub: '', color: '#f472b6', both: true, back: 'TỰ DO' },
];

export const SPAWN = { x: 0, z: 15.5 };

export function roomAt(x, z) {
  for (const r of ROOMS) if (x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2) return r;
  return OUTSIDE;
}
