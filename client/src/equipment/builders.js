import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box as rawBox, cyl as rawCyl, cushion, shell, sphere, bar, torus, tube, lathe, bakeStatic } from '../world/helpers.js';
import { mat, textures, normalMapFrom } from '../world/materials.js';
import { surf, contactShadow } from '../world/surfaces.js';

/**
 * Dựng thiết bị theo "kiểu khung" (model.kind) + tham số trong shared/equipment.js, mô phỏng máy tập thật:
 * khung thép sơn tĩnh điện, đệm bọc da, thanh chrome, cột tạ có thanh dẫn hướng + chốt, tay nắm cao su, màn hình LCD.
 * Quy ước toạ độ cục bộ: người tập nhìn về +Z, thiết bị đặt tại gốc.
 * Mỗi builder trả về:
 *  - group     : toàn bộ mesh (phần tĩnh sẽ được gộp geometry; phần động đánh dấu userData.dynamic)
 *  - seat      : vị trí gốc nhân vật khi tập {x, y, z}
 *  - footprint : {w, d, ox, oz} vùng va chạm (null = đi xuyên được), extraColliders: thêm vùng va chạm
 *  - exit      : vị trí đứng dậy sau khi tập
 *  - update(p, active, dt, t, phase): chuyển động bộ phận theo độ gắng sức p (0..1)
 */

const metal = () => surf.frame();
const silver = () => surf.frameLight();
const chrome = () => surf.chrome();
const pad = () => surf.leather();
const accent = (stat) => surf.accent(stat);
const plateMat = () => surf.bumper('#17181b');
const rubber = () => surf.rubber();
const plastic = () => surf.plastic();

// Vật liệu quyết định hình khối: hộp "da" thành đệm phồng, hộp "chrome" mảnh thành thanh tròn
function box(w, h, d, m, x = 0, y = 0, z = 0, o) {
  if (m?.userData?.cushion && Math.min(w, h, d) >= 0.03) return cushion(w, h, d, m, x, y, z);
  if (m?.userData?.rod) {
    const [lo, mid, hi] = [w, h, d].sort((a, b) => a - b);
    if (mid <= 0.07 && hi >= mid * 3 && mid - lo < 0.012) {
      const r = mid / 2;
      if (h === hi) return rawCyl(r, r, h, m, x, y, z, 14, o);
      const holder = new THREE.Group();
      holder.position.set(x, y, z);
      holder.add(rot(rawCyl(r, r, hi, m, 0, 0, 0, 14, o), w === hi ? 'z' : 'x', Math.PI / 2));
      return holder;
    }
  }
  return rawBox(w, h, d, m, x, y, z, o);
}

// Tay nắm màu nhấn nhỏ -> cao su đen; con lăn đệm chân -> mút bọc da (như máy thật)
function cyl(rt, rb, h, m, x = 0, y = 0, z = 0, seg = 16, o) {
  let material = m;
  if (m?.userData?.accent) {
    if (rt <= 0.04) material = surf.grip();
    else if (rt <= 0.07) material = surf.foam();
  }
  return rawCyl(rt, rb, h, material, x, y, z, seg, o);
}

// Gốc nhân vật khi ngồi: đỉnh ghế - 0.26 (hông cao 0.34, mông thấp hơn hông 0.08)
const seatY = (top) => top - 0.26;
const rot = (m, axis, v) => ((m.rotation[axis] = v), m);
const at = (m, x, y, z) => (m.position.set(x, y, z), m);

function dynamicGroup() {
  const g = new THREE.Group();
  g.userData.dynamic = true;
  return g;
}

// Gộp 1 nhóm chuyển động như 1 khối thành ít draw call nhất
function solid(g) {
  bakeStatic(g, mergeGeometries);
  return g;
}

const result = (group, seat, footprint, exit, update = () => {}, extra = {}) => ({ group, seat, footprint, exit, update, ...extra });

// Khung đế bằng ống thép có chân cao su (thay cho tấm phẳng)
function baseFrame(g, w, d, oz = 0) {
  const hw = w / 2 - 0.05;
  const hd = d / 2 - 0.05;
  for (const s of [-1, 1]) {
    g.add(box(0.07, 0.06, d, metal(), s * hw, 0.05, oz));
    g.add(box(w, 0.06, 0.07, metal(), 0, 0.05, oz + s * hd));
    for (const q of [-1, 1]) g.add(rawCyl(0.035, 0.04, 0.025, rubber(), s * hw, 0.0125, oz + q * hd, 12));
  }
  g.add(box(w - 0.1, 0.05, 0.07, metal(), 0, 0.05, oz));
}

function seatUnit(g, stat, { z = 0, top = 0.46, back = true, backAngle = 0, backH = 0.65 } = {}) {
  // Trụ ghế 2 lớp + chốt chỉnh độ cao màu đỏ
  g.add(box(0.07, top - 0.16, 0.05, metal(), 0, (top - 0.16) / 2 + 0.03, z));
  g.add(box(0.045, top - 0.1, 0.03, chrome(), 0, (top - 0.1) / 2 + 0.03, z));
  g.add(rot(rawCyl(0.012, 0.012, 0.09, chrome(), 0.07, top * 0.55, z, 10), 'z', Math.PI / 2));
  g.add(sphere(0.022, mat('#dc2626', { rough: 0.35 }), 0.12, top * 0.55, z, 12));
  // Mặt đệm + đế nhựa dưới đệm
  g.add(box(0.5, 0.1, 0.46, pad(), 0, top - 0.05, z));
  g.add(box(0.44, 0.02, 0.4, plastic(), 0, top - 0.11, z));
  if (back) {
    const b = new THREE.Group();
    b.position.set(0, top, z - 0.27);
    b.rotation.x = backAngle;
    b.add(box(0.46, backH, 0.1, pad(), 0, backH / 2 + 0.03, 0));
    b.add(box(0.4, backH * 0.9, 0.02, plastic(), 0, backH / 2 + 0.03, -0.06));
    b.add(box(0.2, 0.06, 0.012, accent(stat), 0, backH * 0.9, -0.073));
    b.add(box(0.07, backH + 0.1, 0.05, metal(), 0, backH / 2 - 0.02, -0.09));
    g.add(b);
  }
}

// Cột tạ thật: thanh dẫn hướng chrome, các tấm tạ có nhãn kg, đầu tạ + chốt đỏ, cáp qua ròng rọc.
// Trả về nhóm chuyển động (đầu tạ và các tấm phía trên chốt)
function weightStack(g, x, z, height = 1.5) {
  // Khung bao ngoài
  for (const s of [-1, 1]) g.add(box(0.05, height, 0.07, metal(), x + s * 0.24, height / 2 + 0.03, z));
  g.add(box(0.53, 0.06, 0.2, metal(), x, height + 0.03, z));
  g.add(box(0.53, 0.05, 0.24, metal(), x, 0.05, z));
  g.add(box(0.44, height - 0.1, 0.012, plastic(), x, height / 2 + 0.03, z - 0.095));
  // Thanh dẫn hướng + đệm cao su ở đáy
  for (const s of [-1, 1]) {
    g.add(rawCyl(0.011, 0.011, height - 0.05, chrome(), x + s * 0.11, height / 2 + 0.04, z, 12));
    g.add(rawCyl(0.026, 0.026, 0.03, rubber(), x + s * 0.11, 0.09, z, 12));
  }
  // Tấm tạ tĩnh
  for (let i = 0; i < 8; i++) g.add(rawBox(0.34, 0.052, 0.16, surf.stackPlate(), x, 0.135 + i * 0.058, z, { plain: true }));
  // Nhãn số kg in ở mặt trước + sau cột tạ
  for (const s of [-1, 1]) {
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.46), surf.stackLabel());
    label.position.set(x + 0.13, 0.34, z + s * 0.0815);
    if (s < 0) label.rotation.y = Math.PI;
    g.add(label);
  }
  // Ròng rọc đỉnh cột
  g.add(rot(rawCyl(0.05, 0.05, 0.022, mat('#3f434a', { rough: 0.3, metal: 0.8 }), x, height - 0.1, z, 20), 'z', Math.PI / 2));
  const moving = dynamicGroup();
  moving.add(rawBox(0.34, 0.052, 0.16, surf.stackPlate(), x, 0.6, z, { plain: true }));
  moving.add(rawBox(0.34, 0.052, 0.16, surf.stackPlate(), x, 0.658, z, { plain: true }));
  moving.add(rawBox(0.34, 0.03, 0.16, mat('#b91c1c', { rough: 0.4, metal: 0.2 }), x, 0.705, z));
  // Chốt chọn tạ
  moving.add(rot(rawCyl(0.008, 0.008, 0.2, chrome(), x, 0.6, z + 0.09, 8), 'x', Math.PI / 2));
  moving.add(sphere(0.02, mat('#dc2626', { rough: 0.3 }), x, 0.6, z + 0.19, 12));
  moving.add(rawCyl(0.006, 0.006, height - 0.82, surf.cable(), x, 0.72 + (height - 0.82) / 2, z, 6));
  g.add(solid(moving));
  return moving;
}

// Đĩa tạ cao su có lõi thép, trục Y
function bumperPlate(r, t, color = '#17181b') {
  const hub = Math.max(0.03, r * 0.2);
  const g = new THREE.Group();
  g.add(lathe([[hub, -t / 2], [r * 0.9, -t / 2], [r * 0.97, -t * 0.42], [r, -t * 0.28], [r, t * 0.28], [r * 0.97, t * 0.42], [r * 0.9, t / 2], [hub, t / 2]], surf.bumper(color), 0, 0, 0, r > 0.15 ? 26 : 16));
  g.add(rawCyl(hub * 1.1, hub * 1.1, t + 0.004, surf.chrome(), 0, 0, 0, 12, { cast: false }));
  return g;
}

// Thanh đòn Olympic: thân có vân khía, tay áo chrome, đĩa cao su + kẹp khóa, trục X
function barbell(len = 1.5, plateR = 0.2, color = '#17181b') {
  const g = new THREE.Group();
  g.add(rot(rawCyl(0.014, 0.014, len * 0.7, chrome(), 0, 0, 0, 12), 'z', Math.PI / 2));
  for (const s of [-1, 1]) {
    g.add(rot(rawCyl(0.0145, 0.0145, len * 0.2, surf.knurl(), s * len * 0.2, 0, 0, 12), 'z', Math.PI / 2));
    g.add(rot(rawCyl(0.025, 0.025, len * 0.17, chrome(), s * (len / 2 - len * 0.085), 0, 0, 16), 'z', Math.PI / 2));
    g.add(rot(rawCyl(0.03, 0.03, 0.02, chrome(), s * (len / 2 - len * 0.175), 0, 0, 16), 'z', Math.PI / 2));
    const a = bumperPlate(plateR, 0.05, color);
    a.position.x = s * (len / 2 - 0.13);
    a.rotation.z = Math.PI / 2;
    g.add(a);
    const b = bumperPlate(plateR * 0.78, 0.035, plateR > 0.15 ? '#b91c1c' : '#334155');
    b.position.x = s * (len / 2 - 0.085);
    b.rotation.z = Math.PI / 2;
    g.add(b);
    g.add(rot(rawCyl(0.034, 0.034, 0.026, mat('#d97706', { rough: 0.4 }), s * (len / 2 - 0.055), 0, 0, 14), 'z', Math.PI / 2));
  }
  return solid(g);
}

// Cụm màn hình: vỏ nhựa + màn LCD phát sáng + hàng nút, mặt màn hình quay về phía người tập (-Z)
function consoleUnit(g, x, y, z, tilt = 0.35, w = 0.46, h = 0.26) {
  const c = new THREE.Group();
  c.position.set(x, y, z);
  c.rotation.x = tilt;
  c.add(shell(w, h, 0.09, plastic(), 0, 0, 0, 0.035));
  const s = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.56, h * 0.78), surf.screen());
  s.rotation.y = Math.PI;
  s.position.set(0, 0, -0.047);
  s.userData.noBake = true;
  c.add(s);
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) c.add(rawBox(0.03, 0.022, 0.006, mat(i ? '#374151' : '#0ea5e9', { rough: 0.4 }), side * w * 0.38, h * 0.26 - i * h * 0.26, -0.047));
  g.add(c);
  return c;
}

function rubberFoot(g, x, z, w = 0.62) {
  g.add(rot(rawCyl(0.034, 0.034, w, metal(), x, 0.05, z, 14), 'z', Math.PI / 2));
  for (const s of [-1, 1]) g.add(rot(rawCyl(0.042, 0.042, 0.06, rubber(), x + (s * w) / 2, 0.05, z, 14), 'z', Math.PI / 2));
}


// ======================= MÁY NGỒI CỔ ĐIỂN =======================
function chestPress(stat) {
  const g = new THREE.Group();
  baseFrame(g, 1.2, 1.5, -0.3);
  seatUnit(g, stat, { z: 0.05, backH: 0.75 });
  g.add(box(0.08, 1.6, 0.08, metal(), -0.45, 0.8, -0.45));
  g.add(box(0.08, 1.6, 0.08, metal(), 0.45, 0.8, -0.45));
  g.add(box(0.98, 0.08, 0.08, metal(), 0, 1.6, -0.45));
  const stack = weightStack(g, 0, -0.85);
  const handles = dynamicGroup();
  for (const s of [-1, 1]) {
    handles.add(rot(cyl(0.025, 0.025, 0.7, chrome(), s * 0.42, 0.9, -0.25, 8), 'x', Math.PI / 2));
    handles.add(cyl(0.03, 0.03, 0.2, accent(stat), s * 0.33, 0.9, 0.1, 8));
    handles.add(bar([s * 0.42, 0.9, 0.1], [s * 0.33, 0.9, 0.1], 0.022, chrome()));
  }
  g.add(handles);
  return result(g, { x: 0, y: seatY(0.46), z: 0.05 }, { w: 1.2, d: 1.55, ox: 0, oz: -0.3 }, { x: 0.95, z: 0.3 }, (p) => {
    handles.position.z = 0.1 + p * 0.22;
    stack.position.y = p * 0.25;
  });
}

function pecDeck(stat) {
  const g = new THREE.Group();
  baseFrame(g, 1.4, 1.3, -0.3);
  seatUnit(g, stat, { z: 0.05, backH: 0.8 });
  g.add(box(0.1, 1.8, 0.1, metal(), 0, 0.9, -0.5));
  g.add(box(0.9, 0.08, 0.1, metal(), 0, 1.75, -0.5));
  g.add(bar([0, 1.75, -0.5], [0, 1.75, -0.1], 0.04, metal()));
  const stack = weightStack(g, 0.65, -0.6, 1.4);
  const arms = [];
  for (const s of [-1, 1]) {
    const pivot = dynamicGroup();
    pivot.position.set(s * 0.25, 1.15, -0.1);
    pivot.add(bar([0, 0, 0], [s * 0.45, 0, 0], 0.025, chrome()));
    pivot.add(bar([s * 0.45, 0, 0], [s * 0.45, -0.3, 0], 0.025, chrome()));
    pivot.add(box(0.08, 0.36, 0.1, accent(stat), s * 0.45, -0.22, 0.04));
    pivot.userData.side = s;
    g.add(pivot);
    arms.push(pivot);
  }
  return result(g, { x: 0, y: seatY(0.46), z: 0.05 }, { w: 1.4, d: 1.3, ox: 0, oz: -0.25 }, { x: -1.0, z: 0.4 }, (p) => {
    for (const a of arms) a.rotation.y = a.userData.side * -(p * 1.25);
    stack.position.y = p * 0.25;
  });
}

function latPulldown(stat) {
  const g = new THREE.Group();
  baseFrame(g, 1.0, 1.6, 0.25);
  seatUnit(g, stat, { z: 0, back: false });
  g.add(box(0.5, 0.1, 0.12, pad(), 0, 0.72, 0.22));
  g.add(box(0.06, 0.3, 0.06, metal(), 0, 0.58, 0.28));
  g.add(box(0.14, 2.3, 0.14, metal(), 0, 1.15, 0.75));
  g.add(bar([0, 2.25, 0.75], [0, 2.25, 0.08], 0.05, metal()));
  const stack = weightStack(g, 0, 1.05, 1.7);
  const moving = dynamicGroup();
  const handle = new THREE.Group();
  handle.add(rot(cyl(0.022, 0.022, 1.0, chrome(), 0, 0, 0, 8), 'z', Math.PI / 2));
  handle.add(rot(cyl(0.03, 0.03, 0.18, accent(stat), -0.42, 0, 0, 8), 'z', Math.PI / 2));
  handle.add(rot(cyl(0.03, 0.03, 0.18, accent(stat), 0.42, 0, 0, 8), 'z', Math.PI / 2));
  moving.add(handle);
  const cable = cyl(0.008, 0.008, 1, mat('#0f172a'), 0, 0, 0, 5);
  moving.add(cable);
  g.add(moving);
  const setBar = (y) => {
    handle.position.set(0, y, 0.08);
    cable.scale.y = 2.15 - y;
    cable.position.set(0, (2.15 + y) / 2, 0.08);
  };
  setBar(1.3);
  return result(g, { x: 0, y: seatY(0.46), z: 0 }, { w: 1.0, d: 1.4, ox: 0, oz: 0.35 }, { x: 0.85, z: -0.2 }, (p) => {
    setBar(1.3 - p * 0.42);
    stack.position.y = p * 0.3;
  });
}

function seatedRow(stat) {
  const g = new THREE.Group();
  baseFrame(g, 0.9, 1.9, 0.4);
  seatUnit(g, stat, { z: -0.05, back: false });
  g.add(box(0.36, 0.4, 0.08, pad(), 0, 0.82, 0.32));
  g.add(box(0.06, 0.4, 0.06, metal(), 0, 0.5, 0.36));
  g.add(rot(box(0.6, 0.05, 0.2, metal(), 0, 0.25, 0.42), 'x', -0.6));
  g.add(box(0.12, 1.5, 0.12, metal(), 0, 0.75, 1.15));
  const stack = weightStack(g, 0, 1.35, 1.5);
  const moving = dynamicGroup();
  const handle = new THREE.Group();
  handle.add(rot(cyl(0.02, 0.02, 0.5, chrome(), 0, 0, 0, 8), 'z', Math.PI / 2));
  handle.add(cyl(0.03, 0.03, 0.16, accent(stat), -0.25, 0, 0, 8));
  handle.add(cyl(0.03, 0.03, 0.16, accent(stat), 0.25, 0, 0, 8));
  moving.add(handle);
  const cable = cyl(0.008, 0.008, 1, mat('#0f172a'), 0, 0, 0, 5);
  cable.rotation.x = Math.PI / 2;
  moving.add(cable);
  g.add(moving);
  const setZ = (z) => {
    handle.position.set(0, 0.95, z);
    cable.scale.y = 1.05 - z;
    cable.position.set(0, 0.95, (1.05 + z) / 2);
  };
  setZ(0.42);
  return result(g, { x: 0, y: seatY(0.46), z: -0.05 }, { w: 0.9, d: 1.9, ox: 0, oz: 0.45 }, { x: 0.85, z: -0.2 }, (p) => {
    setZ(0.44 - p * 0.18);
    stack.position.y = p * 0.28;
  });
}

function legPress(stat) {
  const g = new THREE.Group();
  baseFrame(g, 1.0, 1.8, 0.2);
  seatUnit(g, stat, { z: -0.05, backAngle: -0.35, backH: 0.85 });
  g.add(box(0.06, 0.06, 0.9, chrome(), -0.3, 0.42, 0.65));
  g.add(box(0.06, 0.06, 0.9, chrome(), 0.3, 0.42, 0.65));
  g.add(box(0.7, 0.9, 0.08, metal(), 0, 0.45, 1.12));
  const stack = weightStack(g, -0.75, -0.2, 1.4);
  const plate = dynamicGroup();
  plate.add(box(0.62, 0.5, 0.06, accent(stat), 0, 0.5, 0));
  plate.add(box(0.66, 0.54, 0.03, metal(), 0, 0.5, 0.04));
  g.add(plate);
  return result(g, { x: 0, y: seatY(0.46), z: -0.05 }, { w: 1.0, d: 1.7, ox: -0.1, oz: 0.3 }, { x: 0.85, z: -0.3 }, (p) => {
    plate.position.z = 0.36 + p * 0.14;
    stack.position.y = p * 0.3;
  });
}

function legExtension(stat) {
  const g = new THREE.Group();
  baseFrame(g, 1.0, 1.1, -0.1);
  seatUnit(g, stat, { z: 0, top: 0.5, backH: 0.7 });
  g.add(box(0.08, 0.5, 0.08, metal(), -0.32, 0.28, 0.2));
  g.add(box(0.08, 0.5, 0.08, metal(), 0.32, 0.28, 0.2));
  const stack = weightStack(g, 0.7, -0.35, 1.3);
  const pivot = dynamicGroup();
  pivot.position.set(0, 0.55, 0.22);
  pivot.add(box(0.05, 0.3, 0.05, chrome(), 0.3, -0.15, 0));
  pivot.add(rot(cyl(0.06, 0.06, 0.5, accent(stat), 0, -0.3, 0.05, 12), 'z', Math.PI / 2));
  pivot.add(rot(cyl(0.035, 0.035, 0.62, chrome(), 0, 0, 0, 8), 'z', Math.PI / 2));
  g.add(pivot);
  return result(g, { x: 0, y: seatY(0.5), z: 0 }, { w: 1.0, d: 1.0, ox: 0.1, oz: -0.1 }, { x: -0.85, z: 0.3 }, (p) => {
    pivot.rotation.x = -p * 1.35;
    stack.position.y = p * 0.25;
  });
}

function bicepMachine(stat) {
  const g = new THREE.Group();
  baseFrame(g, 0.9, 1.1, 0.1);
  seatUnit(g, stat, { z: -0.05, back: false });
  const padG = new THREE.Group();
  padG.position.set(0, 0.74, 0.3);
  padG.rotation.x = -0.7;
  padG.add(box(0.62, 0.06, 0.32, pad(), 0, 0, 0));
  padG.add(box(0.64, 0.02, 0.34, accent(stat), 0, -0.04, 0));
  g.add(padG);
  g.add(box(0.1, 0.72, 0.1, metal(), 0, 0.36, 0.42));
  const stack = weightStack(g, 0, 0.75, 1.3);
  const lever = dynamicGroup();
  lever.position.set(0, 0.68, 0.45);
  lever.add(rot(cyl(0.022, 0.022, 0.6, chrome(), 0, 0, 0, 8), 'z', Math.PI / 2));
  lever.add(bar([-0.26, 0, 0], [-0.26, 0.05, -0.2], 0.02, chrome()));
  lever.add(bar([0.26, 0, 0], [0.26, 0.05, -0.2], 0.02, chrome()));
  lever.add(rot(cyl(0.03, 0.03, 0.56, accent(stat), 0, 0.05, -0.2, 8), 'z', Math.PI / 2));
  g.add(lever);
  return result(g, { x: 0, y: seatY(0.46), z: -0.05 }, { w: 0.9, d: 1.2, ox: 0, oz: 0.25 }, { x: 0.85, z: -0.3 }, (p) => {
    lever.rotation.x = 0.4 - p * 1.6;
    stack.position.y = p * 0.25;
  });
}

function tricepMachine(stat) {
  const g = new THREE.Group();
  baseFrame(g, 1.1, 1.2, -0.25);
  seatUnit(g, stat, { z: 0, backH: 0.75 });
  g.add(box(0.08, 1.4, 0.08, metal(), -0.48, 0.7, -0.15));
  g.add(box(0.08, 1.4, 0.08, metal(), 0.48, 0.7, -0.15));
  g.add(box(1.0, 0.08, 0.08, metal(), 0, 1.4, -0.15));
  const stack = weightStack(g, 0, -0.75, 1.4);
  const handles = dynamicGroup();
  for (const s of [-1, 1]) {
    handles.add(cyl(0.03, 0.03, 0.2, accent(stat), s * 0.36, 0, 0.05, 8));
    handles.add(bar([s * 0.36, 0.1, 0.05], [s * 0.48, 0.1, -0.15], 0.02, chrome()));
  }
  g.add(handles);
  return result(g, { x: 0, y: seatY(0.46), z: 0 }, { w: 1.1, d: 1.2, ox: 0, oz: -0.3 }, { x: 0, z: 0.8 }, (p) => {
    handles.position.y = 0.88 - p * 0.32;
    stack.position.y = p * 0.25;
  });
}

function treadmill(stat) {
  const g = new THREE.Group();
  // Khung sàn + nắp ray nhôm hai bên + dải cao su đặt chân
  g.add(shell(0.86, 0.1, 1.88, metal(), 0, 0.09, -0.02, 0.03));
  for (const s of [-1, 1]) {
    g.add(box(0.075, 0.03, 1.72, surf.alu(), s * 0.4, 0.155, -0.08));
    g.add(box(0.05, 0.008, 1.68, rubber(), s * 0.4, 0.173, -0.08, { cast: false }));
  }
  // Băng chạy
  const beltTex = textures.belt();
  beltTex.repeat.set(1, 6);
  const belt = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 1.74), new THREE.MeshStandardMaterial({ map: beltTex, normalMap: normalMapFrom(beltTex, 1.6), roughness: 0.82 }));
  belt.rotation.x = -Math.PI / 2;
  belt.position.set(0, 0.165, -0.08);
  belt.receiveShadow = true;
  belt.userData.dynamic = true;
  g.add(belt);
  // Nắp motor phía trước + con lăn sau + chân
  g.add(shell(0.86, 0.2, 0.34, plastic(), 0, 0.2, 0.78, 0.07));
  g.add(box(0.2, 0.006, 0.05, accent(stat), 0, 0.302, 0.72, { cast: false }));
  g.add(rot(rawCyl(0.05, 0.05, 0.86, plastic(), 0, 0.1, -0.95, 18), 'z', Math.PI / 2));
  for (const s of [-1, 1]) g.add(rawCyl(0.04, 0.045, 0.05, rubber(), s * 0.36, 0.025, -0.86, 12));
  // 2 cột đứng cong
  for (const s of [-1, 1]) g.add(tube([[s * 0.38, 0.25, 0.82], [s * 0.38, 0.7, 0.86], [s * 0.34, 1.2, 0.84]], 0.034, surf.alu(), 12));
  // Màn hình + tay vịn
  g.add(shell(0.82, 0.22, 0.09, plastic(), 0, 1.22, 0.86, 0.04));
  consoleUnit(g, 0, 1.33, 0.85, 0.35, 0.68, 0.3);
  for (const s of [-1, 1]) {
    g.add(tube([[s * 0.36, 1.12, 0.82], [s * 0.42, 1.03, 0.68], [s * 0.42, 1.0, 0.3]], 0.02, surf.alu(), 14));
    g.add(rawCyl(0.024, 0.024, 0.26, surf.grip(), s * 0.42, 1.0, 0.44, 12).rotateX(Math.PI / 2));
  }
  return result(g, { x: 0, y: 0.17, z: -0.1 }, { w: 0.9, d: 1.95, ox: 0, oz: 0 }, { x: 0.9, z: -0.5 }, (_p, active, dt) => {
    if (active) beltTex.offset.y += dt * 3.2;
  });
}

function dumbbellBench(stat) {
  const g = new THREE.Group();
  g.add(box(0.36, 0.1, 1.25, pad(), 0, 0.37, -0.15));
  g.add(box(0.38, 0.03, 1.27, accent(stat), 0, 0.31, -0.15));
  g.add(box(0.06, 0.3, 0.3, metal(), 0, 0.15, 0.3));
  g.add(box(0.06, 0.3, 0.3, metal(), 0, 0.15, -0.6));
  g.add(box(0.5, 0.05, 0.08, metal(), 0, 0.03, 0.3));
  g.add(box(0.5, 0.05, 0.08, metal(), 0, 0.03, -0.6));
  return result(g, { x: 0, y: seatY(0.42), z: 0.15 }, { w: 0.45, d: 1.25, ox: 0, oz: -0.2 }, { x: 0.75, z: 0.2 });
}

function pullupBar(stat) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    g.add(box(0.1, 2.4, 0.1, metal(), s * 0.6, 1.2, 0));
    g.add(box(0.12, 0.06, 0.8, metal(), s * 0.6, 0.03, 0));
    g.add(box(0.12, 0.06, 0.12, accent(stat), s * 0.6, 2.0, 0));
  }
  g.add(rot(cyl(0.025, 0.025, 1.2, chrome(), 0, 1.68, 0.02, 10), 'z', Math.PI / 2));
  g.add(box(1.3, 0.08, 0.1, metal(), 0, 2.4, 0));
  g.add(box(0.5, 0.18, 0.4, accent(stat), 0, 0.09, 0.55));
  return result(g, { x: 0, y: 0.6, z: 0.02 }, null, { x: 0, z: 0.7 }, undefined, {
    extraColliders: [
      { w: 0.14, d: 0.8, ox: -0.6, oz: 0 },
      { w: 0.14, d: 0.8, ox: 0.6, oz: 0 },
    ],
  });
}

function battleRope(stat) {
  const g = new THREE.Group();
  // Neo sàn: khối gang + khuyên chrome, tấm cao su đứng tập
  g.add(shell(0.32, 0.5, 0.32, metal(), 0, 0.25, 3.0, 0.03));
  g.add(at(torus(0.08, 0.016, chrome(), Math.PI * 2, 18), 0, 0.3, 2.84));
  g.add(box(1.1, 0.025, 1.1, rubber(), 0, 0.012, 0, { cast: false }));
  const ropeMat = mat('#20242b', { rough: 0.95, normalMap: surf.foam().normalMap, normalScale: 0.8 });
  const N = 18;
  const ropes = [-1, 1].map((s) => {
    const beads = [];
    const rg = dynamicGroup();
    for (let i = 0; i < N; i++) {
      const b = sphere(0.05, ropeMat, 0, 0, 0, 8);
      b.castShadow = false;
      rg.add(b);
      beads.push(b);
    }
    g.add(rg);
    return { s, beads };
  });
  const layout = (t, amp) => {
    for (const { s, beads } of ropes) {
      for (let i = 0; i < N; i++) {
        const k = i / (N - 1);
        const x = s * 0.22 * (1 - k) + s * 0.05 * k;
        const z = 0.32 + k * 2.5;
        const baseY = 0.62 * (1 - k) + 0.3 * k - Math.sin(k * Math.PI) * 0.25;
        const wave = Math.sin(t * 10 - k * 9 + (s > 0 ? Math.PI : 0)) * amp * (1 - k) * Math.min(1, k * 4 + 0.2);
        beads[i].position.set(x, Math.max(0.04, baseY + wave), z);
      }
    }
  };
  layout(0, 0);
  return result(g, { x: 0, y: 0, z: 0 }, null, { x: 0.9, z: 0 }, (_p, active, _dt, t) => layout(t, active ? 0.2 : 0), {
    extraColliders: [{ w: 0.4, d: 0.4, ox: 0, oz: 3 }],
  });
}

function medicineBall(stat) {
  const g = new THREE.Group();
  g.add(cyl(0.45, 0.45, 0.015, accent(stat), 0, 0.008, 0, 24));
  return result(g, { x: 0, y: 0, z: 0 }, null, { x: 0.8, z: 0 });
}

function aerobicSpot() {
  const g = new THREE.Group();
  const ring = torus(0.42, 0.025, mat('#f472b6', { emissive: '#f472b6', emissiveIntensity: 1.4 }), Math.PI * 2, 32);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.012;
  ring.castShadow = false;
  g.add(ring);
  return result(g, { x: 0, y: 0, z: 0 }, null, { x: 0, z: 0.8 });
}

// ======================= KIỂU KHUNG MỚI =======================

// Máy ngồi tổng quát: handles quyết định bộ phận chuyển động
function seat(stat, m) {
  const g = new THREE.Group();
  const top = 0.46;
  baseFrame(g, 1.2, 1.4, -0.2);
  seatUnit(g, stat, { z: 0, back: m.back !== false, backAngle: m.backAngle || 0, backH: 0.75 });
  const stack = weightStack(g, 0.78, -0.45, 1.5);
  g.add(box(0.09, 1.9, 0.09, metal(), -0.5, 0.95, -0.55));
  g.add(box(0.09, 0.09, 1.0, metal(), -0.5, 1.9, -0.1));
  const mv = dynamicGroup();
  g.add(mv);
  let fp = { w: 1.3, d: 1.4, ox: 0.1, oz: -0.2 };
  let upd = () => {};
  const grip = (x, y, z, len = 0.18, axis = 'x') => {
    const h = cyl(0.03, 0.03, len, accent(stat), x, y, z, 8);
    if (axis === 'z') h.rotation.x = Math.PI / 2;
    return h;
  };
  switch (m.handles) {
    case 'press': {
      for (const s of [-1, 1]) {
        mv.add(grip(s * 0.33, 0, 0, 0.2));
        mv.add(bar([s * 0.33, 0, 0], [s * 0.5, 0.05, -0.55], 0.02, chrome()));
      }
      upd = (p) => mv.position.set(0, 1.0 + p * 0.25, 0.12 + p * 0.18);
      break;
    }
    case 'overhead': {
      for (const s of [-1, 1]) {
        mv.add(grip(s * 0.32, 0, 0.05, 0.2, 'z'));
        mv.add(bar([s * 0.32, 0, 0.05], [s * 0.5, 0, -0.45], 0.02, chrome()));
      }
      upd = (p) => (mv.position.y = 1.02 + p * 0.38);
      break;
    }
    case 'lateral': {
      const pads = [-1, 1].map((s) => {
        const pv = dynamicGroup();
        pv.position.set(s * 0.26, 0.98, 0);
        pv.add(box(0.06, 0.32, 0.1, accent(stat), s * 0.04, -0.18, 0));
        pv.add(box(0.03, 0.03, 0.03, chrome(), 0, 0, 0));
        pv.userData.s = s;
        g.add(pv);
        return pv;
      });
      upd = (p) => pads.forEach((pv) => (pv.rotation.z = pv.userData.s * p * 1.1));
      break;
    }
    case 'reverseFly': {
      g.add(box(0.36, 0.5, 0.08, pad(), 0, 0.85, 0.32));
      const arms = [-1, 1].map((s) => {
        const pv = dynamicGroup();
        pv.position.set(s * 0.12, 1.1, 0.62);
        pv.add(bar([0, 0, 0], [s * 0.4, 0, 0], 0.022, chrome()));
        pv.add(grip(s * 0.4, -0.08, 0, 0.18));
        pv.userData.s = s;
        g.add(pv);
        return pv;
      });
      upd = (p) => arms.forEach((a) => (a.rotation.y = a.userData.s * (0.9 - p * 1.4)));
      fp = { w: 1.3, d: 1.7, ox: 0.1, oz: 0 };
      break;
    }
    case 'preacher': {
      const padG = new THREE.Group();
      padG.position.set(0, 0.76, 0.32);
      padG.rotation.x = -0.75;
      padG.add(box(0.62, 0.06, 0.34, pad(), 0, 0, 0));
      padG.add(box(0.64, 0.02, 0.36, accent(stat), 0, -0.04, 0));
      g.add(padG);
      g.add(box(0.1, 0.72, 0.1, metal(), 0, 0.36, 0.45));
      const lever = dynamicGroup();
      lever.position.set(0, 0.7, 0.48);
      const ez = barbell(0.9, 0.11, '#334155');
      ez.position.set(0, 0, -0.18);
      lever.add(ez);
      g.add(lever);
      upd = (p) => (lever.rotation.x = 0.4 - p * 1.6);
      break;
    }
    case 'legCurl': {
      g.add(box(0.5, 0.08, 0.14, pad(), 0, 0.68, 0.18));
      const pv = dynamicGroup();
      pv.position.set(0, 0.5, 0.24);
      pv.add(rot(cyl(0.06, 0.06, 0.5, accent(stat), 0, -0.02, 0.16, 12), 'z', Math.PI / 2));
      pv.add(box(0.04, 0.04, 0.2, chrome(), 0.28, 0, 0.08));
      g.add(pv);
      upd = (p) => (pv.rotation.x = 0.4 + p * 1.1);
      break;
    }
    case 'abduct': {
      const pads = [-1, 1].map((s) => {
        const pv = dynamicGroup();
        pv.position.set(s * 0.12, 0.52, 0.22);
        pv.add(box(0.06, 0.2, 0.24, accent(stat), s * 0.1, 0, 0));
        pv.userData.s = s;
        g.add(pv);
        return pv;
      });
      const inward = m.inward;
      upd = (p) => pads.forEach((pv) => (pv.position.x = pv.userData.s * (0.12 + (inward ? 1 - p : p) * 0.18)));
      break;
    }
    case 'calf': {
      const pv = dynamicGroup();
      pv.position.set(0, 0.62, 0.2);
      pv.add(box(0.5, 0.08, 0.16, pad(), 0, 0, 0));
      pv.add(box(0.06, 0.4, 0.06, chrome(), 0.3, -0.2, 0));
      g.add(pv);
      g.add(box(0.5, 0.06, 0.2, rubber(), 0, 0.12, 0.38));
      upd = (p) => (pv.position.y = 0.62 + p * 0.07);
      break;
    }
    case 'crunch': {
      for (const s of [-1, 1]) {
        mv.add(grip(s * 0.18, 0, 0, 0.18, 'z'));
        mv.add(bar([s * 0.18, 0, 0], [s * 0.3, 0.1, -0.3], 0.02, chrome()));
      }
      upd = (p) => mv.position.set(0, 1.12 - p * 0.28, 0.06 + p * 0.12);
      break;
    }
    case 'rotation': {
      const pv = dynamicGroup();
      pv.position.set(0, 0.95, 0.22);
      pv.add(box(0.5, 0.3, 0.06, pad(), 0, 0, 0));
      pv.add(box(0.6, 0.04, 0.04, chrome(), 0, 0.2, 0));
      g.add(pv);
      upd = (_p, _a, _dt, _t, phase) => (pv.rotation.y = Math.sin(phase * Math.PI * 2) * 0.7);
      break;
    }
    default:
      break;
  }
  if (m.chestPad && m.handles !== 'reverseFly') g.add(box(0.36, 0.5, 0.08, pad(), 0, 0.85, 0.32));
  return result(g, { x: 0, y: seatY(top), z: 0 }, fp, { x: -0.95, z: 0.4 }, (p, a, dt, t, ph) => {
    upd(p, a, dt, t, ph);
    stack.position.y = p * 0.25;
  });
}

// Ghế tạ đòn: đẩy ngực phẳng/dốc + giá đỡ + thanh đòn chuyển động; hip thrust (thấp)
function bench(stat, m) {
  const g = new THREE.Group();
  if (m.low) {
    g.add(box(1.3, 0.1, 0.4, pad(), 0, 0.42, -0.55));
    g.add(box(1.32, 0.03, 0.42, accent(stat), 0, 0.36, -0.55));
    g.add(box(0.08, 0.36, 0.3, metal(), -0.5, 0.18, -0.55));
    g.add(box(0.08, 0.36, 0.3, metal(), 0.5, 0.18, -0.55));
    g.add(box(1.4, 0.02, 1.6, rubber(), 0, 0.01, 0.1, { cast: false }));
    const bb = dynamicGroup();
    const b = barbell(1.6, 0.2);
    bb.add(b);
    g.add(bb);
    const upd = (p) => b.position.set(0, 0.3 + p * 0.28, 0.12);
    upd(0);
    return result(g, { x: 0, y: 0, z: 0 }, { w: 1.4, d: 0.5, ox: 0, oz: -0.55 }, { x: 0, z: 1.0 }, upd);
  }
  const top = 0.45;
  const angle = m.angle || 0;
  g.add(box(0.36, 0.1, 0.6, pad(), 0, top - 0.05, 0.25));
  g.add(box(0.06, top - 0.1, 0.06, metal(), 0, (top - 0.1) / 2, 0.45));
  const back = new THREE.Group();
  back.position.set(0, top - 0.05, 0);
  back.rotation.x = angle;
  back.add(box(0.36, 0.1, 0.75, pad(), 0, 0, -0.37));
  back.add(box(0.38, 0.03, 0.77, accent(stat), 0, -0.07, -0.37));
  g.add(back);
  g.add(box(0.06, top, 0.06, metal(), 0, top / 2, -0.5));
  g.add(box(0.6, 0.05, 0.08, metal(), 0, 0.03, -0.5));
  g.add(box(0.5, 0.05, 0.08, metal(), 0, 0.03, 0.45));
  let bb = null;
  if (m.rack) {
    for (const s of [-1, 1]) {
      g.add(box(0.07, 1.25, 0.07, metal(), s * 0.55, 0.62, -0.72));
      g.add(box(0.12, 0.05, 0.12, accent(stat), s * 0.55, 1.15, -0.66));
      g.add(box(0.3, 0.05, 0.3, metal(), s * 0.55, 0.03, -0.72));
    }
    bb = dynamicGroup();
    bb.add(barbell(1.7, 0.21));
    g.add(bb);
  }
  const baseY = 1.18 + angle * 0.3;
  const update = (p, active) => {
    if (!bb) return;
    if (!active) bb.position.set(0, 1.18, -0.68);
    else bb.position.set(0, baseY - 0.32 + p * 0.3, -0.22 + angle * 0.2);
  };
  update(0, false);
  return result(g, { x: 0, y: top, z: 0.12 }, { w: 1.25, d: 1.5, ox: 0, oz: -0.2 }, { x: 0.9, z: 0.3 }, update);
}

// Tháp cáp đơn / đôi (crossover)
function cable(stat, m) {
  const g = new THREE.Group();
  // Tháp cáp: cột tạ thật + vỏ che nhấn màu + ròng rọc chỉnh độ cao + cáp đen
  const tower = (x, z) => {
    g.add(box(0.5, 0.05, 0.42, metal(), x, 0.03, z));
    weightStack(g, x, z, 2.1);
    g.add(box(0.12, 2.3, 0.1, metal(), x, 1.15, z - 0.17));
    g.add(box(0.12, 0.5, 0.012, accent(stat), x, 1.6, z - 0.226));
    for (const y of [0.25, 2.05]) g.add(rot(rawCyl(0.05, 0.05, 0.03, mat('#3f434a', { rough: 0.3, metal: 0.8 }), x, y, z + 0.14, 20), 'z', Math.PI / 2));
  };
  const handles = [];
  const cables = [];
  const mkHandle = () => {
    const h = dynamicGroup();
    h.add(rot(rawCyl(0.02, 0.02, 0.17, surf.grip(), 0, 0, 0, 12), 'z', Math.PI / 2));
    for (const s of [-1, 1]) h.add(bar([s * 0.09, 0, 0], [0, 0.07, 0], 0.005, chrome()));
    g.add(solid(h));
    const c = rawCyl(0.006, 0.006, 1, surf.cable(), 0, 0, 0, 6);
    c.userData.dynamic = true;
    g.add(c);
    handles.push(h);
    cables.push(c);
  };
  const link = (c, a, b) => {
    const len = a.distanceTo(b);
    c.scale.y = Math.max(0.01, len);
    c.position.copy(a).add(b).multiplyScalar(0.5);
    c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  };
  if (m.double) {
    tower(-1.5, 0.15);
    tower(1.5, 0.15);
    g.add(box(3.1, 0.08, 0.08, metal(), 0, 2.3, -0.02));
    mkHandle();
    mkHandle();
    const pul = [new THREE.Vector3(-1.4, 2.0, 0.29), new THREE.Vector3(1.4, 2.0, 0.29)];
    const upd = (p) => {
      handles.forEach((h, i) => {
        const s = i ? 1 : -1;
        h.position.set(s * (0.75 - p * 0.6), 1.2 - p * 0.25, 0.35 + p * 0.1);
        link(cables[i], pul[i], h.position);
      });
    };
    upd(0);
    return result(g, { x: 0, y: 0, z: 0 }, null, { x: 0, z: 0.9 }, upd, {
      extraColliders: [
        { w: 0.5, d: 0.4, ox: -1.5, oz: 0.15 },
        { w: 0.5, d: 0.4, ox: 1.5, oz: 0.15 },
      ],
    });
  }
  tower(0, 0.85);
  mkHandle();
  const high = m.height !== 'low';
  const pul = new THREE.Vector3(0, high ? 2.05 : 0.25, 0.99);
  const upd = (p) => {
    if (high) handles[0].position.set(0, 1.18 - p * 0.42, 0.42 - p * 0.05);
    else handles[0].position.set(0, 0.55 + p * 0.45, 0.35 - p * 0.1);
    link(cables[0], pul, handles[0].position);
  };
  upd(0);
  return result(g, { x: 0, y: 0, z: 0 }, { w: 0.5, d: 0.4, ox: 0, oz: 0.85 }, { x: 0.8, z: 0 }, upd);
}

// Các trạm tập đứng/nằm đặc thù
function station(stat, m) {
  const g = new THREE.Group();
  switch (m.type) {
    case 'dip': {
      for (const s of [-1, 1]) {
        g.add(box(0.08, 1.15, 0.08, metal(), s * 0.32, 0.58, 0.25));
        g.add(box(0.08, 1.15, 0.08, metal(), s * 0.32, 0.58, -0.25));
        g.add(rot(cyl(0.03, 0.03, 0.6, accent(stat), s * 0.32, 1.15, 0, 8), 'x', Math.PI / 2));
        g.add(box(0.12, 0.05, 0.7, metal(), s * 0.32, 0.03, 0));
      }
      return result(g, { x: 0, y: 0.38, z: 0 }, null, { x: 0, z: 0.8 }, undefined, {
        extraColliders: [
          { w: 0.12, d: 0.6, ox: -0.32, oz: 0 },
          { w: 0.12, d: 0.6, ox: 0.32, oz: 0 },
        ],
      });
    }
    case 'tbar': {
      g.add(box(1.0, 0.05, 1.6, rubber(), 0, 0.025, 0.3, { cast: false }));
      g.add(box(0.2, 0.15, 0.2, metal(), 0, 0.08, 1.1));
      const lever = dynamicGroup();
      lever.position.set(0, 0.12, 1.1);
      lever.add(bar([0, 0, 0], [0, 0, -1.0], 0.025, chrome()));
      lever.add(rot(cyl(0.2, 0.2, 0.05, plateMat(), 0, 0, -0.75, 16), 'x', Math.PI / 2));
      lever.add(rot(cyl(0.025, 0.025, 0.5, accent(stat), 0, 0, -0.98, 8), 'z', Math.PI / 2));
      g.add(lever);
      return result(g, { x: 0, y: 0, z: -0.05 }, null, { x: 0.8, z: 0 }, (p) => (lever.rotation.x = -0.25 - p * 0.32));
    }
    case 'assisted': {
      baseFrame(g, 1.2, 1.2, 0.15);
      for (const s of [-1, 1]) g.add(box(0.1, 2.3, 0.1, metal(), s * 0.55, 1.15, 0.45));
      g.add(box(1.2, 0.08, 0.1, metal(), 0, 2.3, 0.45));
      for (const s of [-1, 1]) g.add(rot(cyl(0.03, 0.03, 0.22, accent(stat), s * 0.35, 1.95, 0.3, 8), 'x', Math.PI / 2));
      const knee = dynamicGroup();
      knee.add(box(0.5, 0.08, 0.3, pad(), 0, 0, 0));
      knee.add(box(0.06, 0.6, 0.06, chrome(), 0, -0.3, 0.1));
      g.add(knee);
      weightStack(g, 0, 0.8, 1.6);
      return result(g, { x: 0, y: 0.82, z: 0.05 }, { w: 1.2, d: 0.5, ox: 0, oz: 0.6 }, { x: 0, z: -0.8 }, (p) => knee.position.set(0, 0.62 + p * 0.3, 0.05));
    }
    case 'hyper': {
      const frame = new THREE.Group();
      frame.rotation.x = 0.7;
      frame.position.set(0, 0.55, 0.1);
      frame.add(box(0.5, 0.08, 0.5, pad(), 0, 0.3, 0.25));
      frame.add(box(0.1, 0.1, 1.4, metal(), 0, 0, -0.2));
      g.add(frame);
      g.add(rot(cyl(0.06, 0.06, 0.45, accent(stat), 0, 0.25, -0.6, 10), 'z', Math.PI / 2));
      g.add(box(0.6, 0.05, 1.3, metal(), 0, 0.03, -0.2));
      return result(g, { x: 0, y: 0.15, z: -0.55 }, { w: 0.6, d: 1.2, ox: 0, oz: -0.2 }, { x: 0.8, z: 0 });
    }
    case 'legCurl': {
      g.add(box(0.42, 0.1, 1.5, pad(), 0, 0.6, 0));
      g.add(box(0.44, 0.03, 1.52, accent(stat), 0, 0.54, 0));
      g.add(box(0.08, 0.55, 0.08, metal(), 0, 0.28, -0.5));
      g.add(box(0.08, 0.55, 0.08, metal(), 0, 0.28, 0.5));
      g.add(box(0.5, 0.05, 1.5, metal(), 0, 0.03, 0));
      weightStack(g, 0.7, -0.3, 1.3);
      const pv = dynamicGroup();
      pv.position.set(0, 0.62, -0.8);
      pv.add(rot(cyl(0.06, 0.06, 0.45, accent(stat), 0, 0.08, -0.02, 10), 'z', Math.PI / 2));
      pv.add(box(0.04, 0.04, 0.12, chrome(), 0.25, 0.04, 0));
      g.add(pv);
      return result(g, { x: 0, y: 0.65, z: 0.2 }, { w: 0.6, d: 1.6, ox: 0, oz: 0 }, { x: 0.8, z: 0 }, (p) => (pv.rotation.x = p * 1.6));
    }
    case 'hack': {
      baseFrame(g, 1.2, 1.8, 0);
      const rail = new THREE.Group();
      rail.rotation.x = -0.35;
      rail.position.set(0, 0.2, -0.45);
      for (const s of [-1, 1]) rail.add(box(0.07, 2.0, 0.07, chrome(), s * 0.4, 1.0, 0));
      g.add(rail);
      g.add(rot(box(0.8, 0.06, 0.6, rubber(), 0, 0.22, 0.25), 'x', -0.2));
      const sled = dynamicGroup();
      sled.add(rot(box(0.45, 0.7, 0.1, pad(), 0, 0, 0), 'x', -0.35));
      for (const s of [-1, 1]) sled.add(box(0.12, 0.08, 0.2, accent(stat), s * 0.22, 0.4, 0.1));
      g.add(sled);
      return result(g, { x: 0, y: 0.18, z: 0.15 }, { w: 1.2, d: 1.6, ox: 0, oz: -0.2 }, { x: 0.9, z: 0.3 }, (p) => sled.position.set(0, 0.85 - p * 0.32, -0.32 - p * 0.1));
    }
    case 'calf': {
      baseFrame(g, 0.9, 1.0, -0.1);
      g.add(box(0.6, 0.12, 0.25, rubber(), 0, 0.1, 0.12));
      for (const s of [-1, 1]) g.add(box(0.08, 1.7, 0.08, metal(), s * 0.42, 0.85, -0.35));
      weightStack(g, 0, -0.45, 1.6);
      const pads = dynamicGroup();
      for (const s of [-1, 1]) pads.add(box(0.16, 0.08, 0.22, pad(), s * 0.2, 0, 0));
      pads.add(box(0.5, 0.05, 0.05, chrome(), 0, 0, -0.15));
      g.add(pads);
      return result(g, { x: 0, y: 0.15, z: 0.0 }, { w: 0.9, d: 0.5, ox: 0, oz: -0.4 }, { x: 0, z: 0.8 }, (p) => pads.position.set(0, 1.07 + p * 0.08, 0.0));
    }
    case 'glute': {
      baseFrame(g, 1.0, 1.0, 0);
      g.add(box(0.12, 1.3, 0.12, metal(), 0, 0.65, 0.4));
      g.add(box(0.6, 0.06, 0.06, chrome(), 0, 1.0, 0.35));
      g.add(box(0.4, 0.1, 0.4, rubber(), 0, 0.06, -0.05));
      const lever = dynamicGroup();
      lever.position.set(0.2, 0.62, 0.05);
      lever.add(box(0.05, 0.5, 0.05, chrome(), 0, -0.25, 0));
      lever.add(rot(cyl(0.06, 0.06, 0.25, accent(stat), 0, -0.42, -0.06, 10), 'z', Math.PI / 2));
      g.add(lever);
      weightStack(g, -0.55, 0.3, 1.3);
      return result(g, { x: 0, y: 0.06, z: -0.05 }, { w: 1.0, d: 0.5, ox: 0, oz: 0.4 }, { x: 0, z: -0.8 }, (p) => (lever.rotation.x = p * 0.9));
    }
    case 'roman': {
      const frame = new THREE.Group();
      frame.rotation.x = -0.35;
      frame.position.set(0, 0.45, 0);
      frame.add(box(0.4, 0.08, 1.3, pad(), 0, 0, 0));
      frame.add(box(0.42, 0.03, 1.32, accent(stat), 0, -0.05, 0));
      g.add(frame);
      g.add(rot(cyl(0.06, 0.06, 0.4, pad(), 0, 0.85, 0.75, 10), 'z', Math.PI / 2));
      g.add(box(0.08, 0.85, 0.08, metal(), 0, 0.42, 0.7));
      g.add(box(0.08, 0.3, 0.08, metal(), 0, 0.15, -0.55));
      g.add(box(0.5, 0.05, 1.5, metal(), 0, 0.03, 0.1));
      return result(g, { x: 0, y: 0.5, z: 0.0 }, { w: 0.5, d: 1.5, ox: 0, oz: 0.1 }, { x: 0.8, z: 0 });
    }
    case 'trx': {
      for (const s of [-1, 1]) g.add(box(0.08, 2.4, 0.08, metal(), s * 0.6, 1.2, 0.8));
      g.add(box(1.3, 0.08, 0.08, metal(), 0, 2.4, 0.8));
      const straps = [];
      for (const s of [-1, 1]) {
        const st = cyl(0.012, 0.012, 1, mat('#facc15'), 0, 0, 0, 5);
        st.userData.dynamic = true;
        g.add(st);
        const h = cyl(0.025, 0.025, 0.14, mat('#111827'), 0, 0, 0, 6);
        h.rotation.z = Math.PI / 2;
        h.userData.dynamic = true;
        g.add(h);
        straps.push({ s, st, h });
      }
      const top = new THREE.Vector3(0, 2.38, 0.8);
      const upd = (p) => {
        for (const { s, st, h } of straps) {
          const hp = new THREE.Vector3(s * 0.25, 0.95 + p * 0.15, 0.25 + p * 0.2);
          h.position.copy(hp);
          st.scale.y = top.distanceTo(hp);
          st.position.copy(top).add(hp).multiplyScalar(0.5);
          st.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), hp.clone().sub(top).normalize());
        }
      };
      upd(0);
      return result(g, { x: 0, y: 0, z: -0.15 }, null, { x: 0, z: -0.8 }, upd, {
        extraColliders: [
          { w: 0.12, d: 0.12, ox: -0.6, oz: 0.8 },
          { w: 0.12, d: 0.12, ox: 0.6, oz: 0.8 },
        ],
      });
    }
    default:
      return result(g, { x: 0, y: 0, z: 0 }, null, { x: 0.8, z: 0 });
  }
}

// Power rack / Smith machine với thanh đòn lên xuống theo động tác squat
function rack(stat, m) {
  const g = new THREE.Group();
  // Bục nâng tạ: viền cao su + tấm gỗ giữa
  g.add(box(2.0, 0.04, 2.0, rubber(), 0, 0.02, 0, { cast: false }));
  g.add(box(1.0, 0.012, 1.96, surf.ply(), 0, 0.044, 0, { cast: false }));
  const posts = [
    [-0.75, -0.6],
    [0.75, -0.6],
    [-0.75, 0.55],
    [0.75, 0.55],
  ];
  const steel = surf.rackSteel();
  for (const [x, z] of posts) {
    g.add(box(0.075, 2.3, 0.075, steel, x, 1.19, z));
    g.add(box(0.15, 0.015, 0.15, metal(), x, 0.05, z));
  }
  g.add(box(1.6, 0.075, 0.075, metal(), 0, 2.34, -0.6));
  g.add(box(1.6, 0.075, 0.075, metal(), 0, 2.34, 0.55));
  for (const s of [-1, 1]) g.add(box(0.075, 0.075, 1.2, metal(), s * 0.75, 2.34, -0.025));
  if (m.type === 'smith') {
    // Máy Smith: 2 thanh dẫn hướng chrome, móc khóa, tạ đối trọng
    for (const s of [-1, 1]) {
      g.add(rawCyl(0.02, 0.02, 2.25, chrome(), s * 0.7, 1.17, -0.05, 14));
      g.add(rawBox(0.05, 0.06, 0.07, metal(), s * 0.7, 2.28, -0.05));
    }
  } else {
    // Power rack: thanh xà đơn có vân khía, móc J đỡ đòn, tay an toàn, chốt treo đĩa
    g.add(rot(rawCyl(0.016, 0.016, 1.5, surf.knurl(), 0, 2.26, 0.55, 12), 'z', Math.PI / 2));
    for (const s of [-1, 1]) {
      g.add(box(0.08, 0.1, 0.075, plastic(), s * 0.75, 1.3, -0.52));
      g.add(box(0.05, 0.02, 0.09, surf.bumper('#d4d4d8'), s * 0.75, 1.27, -0.46));
      g.add(box(0.05, 0.05, 1.05, metal(), s * 0.75, 0.82, -0.03));
    }
    for (const s of [-1, 1]) {
      g.add(rot(rawCyl(0.024, 0.024, 0.24, chrome(), s * 0.88, 0.32, -0.6, 12), 'z', Math.PI / 2));
      g.add(at(rot(bumperPlate(0.22, 0.05), 'z', Math.PI / 2), s * 0.87, 0.32, -0.6));
      g.add(at(rot(bumperPlate(0.17, 0.04, '#1d4ed8'), 'z', Math.PI / 2), s * 0.93, 0.32, -0.6));
    }
  }
  const bb = dynamicGroup();
  bb.add(barbell(1.9, 0.22));
  g.add(bb);
  const upd = (p, active) => {
    if (active) bb.position.set(0, 1.27 - p * 0.33, -0.08);
    else bb.position.set(0, 1.32, -0.5);
  };
  upd(0, false);
  return result(g, { x: 0, y: 0.05, z: 0 }, null, { x: 0, z: 1.2 }, upd, {
    extraColliders: posts.map(([x, z]) => ({ w: 0.12, d: 0.12, ox: x, oz: z })),
  });
}

// Bục tập + dụng cụ cầm tay / đặt sàn
function platform(stat, m) {
  const g = new THREE.Group();
  // Thảm cao su có viền vát, sọc màu sơn trên sàn thay vì đèn phát sáng
  g.add(box(1.8, 0.03, 1.8, rubber(), 0, 0.015, 0.2, { cast: false }));
  g.add(box(1.82, 0.004, 0.05, accent(stat), 0, 0.032, 1.08, { cast: false }));
  const mv = dynamicGroup();
  g.add(mv);
  let upd = () => {};
  let fp = null;
  const kettlebell = (x, y, z, s = 1, color = '#1a1b1f') => {
    const k = new THREE.Group();
    k.add(sphere(0.1 * s, mat(color, { rough: 0.5, metal: 0.45 }), 0, 0.1 * s, 0, 22));
    k.add(at(torus(0.065 * s, 0.014 * s, mat('#2a2c31', { rough: 0.4, metal: 0.7 }), Math.PI * 2, 22), 0, 0.235 * s, 0));
    k.position.set(x, y, z);
    return k;
  };
  switch (m.prop) {
    case 'kettlebell':
      ['#7f1d1d', '#1e3a8a', '#14532d', '#1a1b1f'].forEach((c, i) => g.add(kettlebell(-0.7 + i * 0.28, 0.03, 0.92, 0.8 + i * 0.13, c)));
      break;
    case 'sled': {
      const sl = new THREE.Group();
      // Xe trượt thật: 2 ván trượt, cột chất tạ, tay đẩy
      for (const s of [-1, 1]) {
        sl.add(box(0.1, 0.05, 1.05, surf.alu(), s * 0.3, 0.05, 0));
        sl.add(box(0.05, 0.98, 0.05, metal(), s * 0.28, 0.54, -0.35));
        sl.add(rot(rawCyl(0.018, 0.018, 0.36, surf.grip(), s * 0.42, 1.02, -0.35, 12), 'z', Math.PI / 2));
      }
      sl.add(box(0.6, 0.06, 0.9, metal(), 0, 0.09, 0));
      sl.add(rawCyl(0.024, 0.024, 0.42, chrome(), 0, 0.33, 0.12, 12));
      for (let i = 0; i < 3; i++) sl.add(at(bumperPlate(0.22 - i * 0.03, 0.05, i ? '#1d4ed8' : '#17181b'), 0, 0.15 + i * 0.055, 0.12));
      mv.add(sl);
      g.add(box(1.4, 0.006, 5, mat('#3f6212', { rough: 1 }), 0, 0.03, 2.5, { cast: false }));
      upd = (_p, active, _dt, t) => (sl.position.z = 0.85 + (active ? Math.sin(t * 2) * 0.15 : 0));
      upd(0, false, 0, 0);
      break;
    }
    case 'box': {
      // Hộp plyo gỗ dán 3 chiều cao
      g.add(box(0.7, 0.55, 0.6, surf.ply(), 0, 0.3, 0.75));
      for (const s of [-1, 1]) g.add(rawBox(0.18, 0.03, 0.012, mat('#3a2a18', { rough: 0.8 }), 0, 0.42, 0.75 + s * 0.301, { cast: false }));
      fp = { w: 0.7, d: 0.6, ox: 0, oz: 0.75 };
      break;
    }
    case 'slamball': {
      const b = sphere(0.17, mat('#17181b', { rough: 0.85, normalMap: surf.foam().normalMap, normalScale: 0.8 }), 0.7, 0.2, 0.9, 24);
      g.add(b);
      g.add(at(rot(torus(0.17, 0.004, mat('#b91c1c', { rough: 0.6 }), Math.PI * 2, 30), 'x', Math.PI / 2), 0.7, 0.2, 0.9));
      break;
    }
    case 'tire': {
      const tire = torus(0.42, 0.18, mat('#121316', { rough: 0.92, normalMap: surf.grip().normalMap, normalScale: 1.2 }), Math.PI * 2, 36);
      mv.add(tire);
      upd = (p) => {
        tire.position.set(0, 0.2 + p * 0.5, 0.75 + p * 0.1);
        tire.rotation.x = -Math.PI / 2 + p * 1.2;
      };
      upd(0);
      break;
    }
    case 'farmer':
      for (const s of [-1, 1]) {
        g.add(rot(rawCyl(0.018, 0.018, 0.54, surf.knurl(), s * 0.6, 0.2, 0.95, 12), 'x', Math.PI / 2));
        for (const q of [-1, 1]) g.add(at(rot(bumperPlate(0.14, 0.09), 'x', Math.PI / 2), s * 0.6, 0.17, 0.95 + q * 0.2));
      }
      break;
    case 'trapbar': {
      // Thanh đòn hình thoi (hex bar) thật
      const tb = new THREE.Group();
      const hexPts = [[-0.36, -0.2], [0, -0.32], [0.36, -0.2], [0.36, 0.2], [0, 0.32], [-0.36, 0.2]];
      hexPts.forEach(([x, z], i) => {
        const [nx, nz] = hexPts[(i + 1) % 6];
        tb.add(bar([x, 0, z], [nx, 0, nz], 0.017, chrome()));
      });
      for (const s of [-1, 1]) {
        tb.add(rot(rawCyl(0.025, 0.025, 0.42, chrome(), s * 0.56, 0, 0, 14), 'z', Math.PI / 2));
        tb.add(bar([s * 0.36, 0, -0.2], [s * 0.36, 0, 0.2], 0.018, chrome()));
        tb.add(bar([s * 0.36, 0, 0], [s * 0.38, 0, 0], 0.024, chrome()));
        tb.add(at(rot(bumperPlate(0.22, 0.05), 'z', Math.PI / 2), s * 0.64, 0, 0));
        tb.add(at(rot(bumperPlate(0.17, 0.04, '#b91c1c'), 'z', Math.PI / 2), s * 0.7, 0, 0));
        tb.add(rawCyl(0.02, 0.02, 0.14, surf.grip(), s * 0.22, 0, 0, 12).rotateX(Math.PI / 2));
        tb.add(bar([s * 0.22, 0, -0.16], [s * 0.36, 0, -0.16], 0.014, chrome()));
        tb.add(bar([s * 0.22, 0, 0.16], [s * 0.36, 0, 0.16], 0.014, chrome()));
      }
      mv.add(solid(tb));
      upd = (p) => tb.position.set(0, 0.24 + p * 0.38, 0.02);
      upd(0);
      break;
    }
    case 'landmine': {
      g.add(box(0.28, 0.03, 0.28, metal(), 0, 0.045, 1.2));
      g.add(rawCyl(0.035, 0.05, 0.12, metal(), 0, 0.11, 1.2, 16));
      const lever = dynamicGroup();
      lever.position.set(0, 0.14, 1.2);
      lever.add(bar([0, 0, 0], [0, 0, -1.3], 0.02, chrome()));
      lever.add(at(rot(bumperPlate(0.2, 0.05), 'x', Math.PI / 2), 0, 0, -1.0));
      lever.add(rot(rawCyl(0.026, 0.026, 0.2, chrome(), 0, 0, -1.14, 14), 'x', Math.PI / 2));
      g.add(lever);
      upd = (p) => (lever.rotation.x = -0.75 - p * 0.35);
      upd(0);
      break;
    }
    case 'barRack': {
      // Giá dựng thanh đòn EZ
      g.add(box(0.8, 0.03, 0.25, metal(), 0, 0.15, 1.0));
      for (const s of [-1, 1]) g.add(box(0.05, 1.05, 0.2, metal(), s * 0.38, 0.55, 1.0));
      g.add(box(0.8, 0.05, 0.05, metal(), 0, 1.05, 1.0));
      for (let i = 0; i < 3; i++) {
        const b = barbell(1.1, 0.1, '#334155');
        b.position.set(0, 0.35 + i * 0.25, 0.85);
        g.add(b);
      }
      fp = { w: 1.2, d: 0.3, ox: 0, oz: 1.0 };
      break;
    }
    case 'rope': {
      // Dây nhảy cuộn tròn + 2 tay cầm
      g.add(at(rot(torus(0.12, 0.006, mat('#1f2937', { rough: 0.6 }), Math.PI * 2, 24), 'x', -Math.PI / 2), 0.7, 0.04, 0.9));
      for (const s of [-1, 1]) g.add(rot(rawCyl(0.016, 0.016, 0.16, surf.grip(), 0.7 + s * 0.06, 0.05, 1.04, 12), 'x', Math.PI / 2));
      break;
    }
    default:
      break;
  }
  return result(g, { x: 0, y: 0.04, z: 0 }, fp, { x: 1.1, z: 0 }, upd);
}

// Thiết bị cardio
function cardio(stat, m) {
  const g = new THREE.Group();
  const flywheel = (r, x, y, z, color = '#3a3e45') => {
    const w = dynamicGroup();
    w.position.set(x, y, z);
    w.add(rot(rawCyl(r, r, 0.05, mat(color, { rough: 0.22, metal: 0.95 }), 0, 0, 0, 40), 'z', Math.PI / 2));
    w.add(rot(rawCyl(r * 0.3, r * 0.3, 0.07, surf.frame(), 0, 0, 0, 20), 'z', Math.PI / 2));
    for (let i = 0; i < 3; i++) w.add(rot(rawBox(0.054, r * 1.7, r * 0.1, plastic(), 0, 0, 0), 'x', (i * Math.PI) / 3));
    g.add(solid(w));
    return w;
  };
  const cranks = (y, z) => {
    const c = dynamicGroup();
    c.position.set(0, y, z);
    c.add(rot(rawCyl(0.012, 0.012, 0.36, chrome(), 0, 0, 0, 10), 'z', Math.PI / 2));
    c.add(rot(rawCyl(0.09, 0.09, 0.012, mat('#1a1b1f', { rough: 0.4, metal: 0.7 }), 0.15, 0, 0, 24), 'z', Math.PI / 2));
    for (const s of [-1, 1]) {
      c.add(rawBox(0.02, 0.17, 0.03, surf.alu(), s * 0.16, -s * 0.085, 0));
      c.add(rawBox(0.1, 0.022, 0.08, plastic(), s * 0.21, -s * 0.17, 0));
    }
    g.add(solid(c));
    return c;
  };
  // Yên xe: đuôi rộng, mũi hẹp
  const saddle = (y, z) => {
    g.add(shell(0.24, 0.07, 0.2, pad(), 0, y, z - 0.05, 0.03));
    g.add(shell(0.1, 0.055, 0.2, pad(), 0, y + 0.003, z + 0.12, 0.024));
  };
  const link = (rod, a, b) => {
    rod.scale.y = Math.max(0.01, a.distanceTo(b));
    rod.position.copy(a).add(b).multiplyScalar(0.5);
    rod.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
  };
  const UP = new THREE.Vector3(0, 1, 0);
  switch (m.type) {
    case 'elliptical': {
      // Khung sàn 2 thanh dẫn, chân trước/sau
      rubberFoot(g, 0, -0.82, 0.62);
      rubberFoot(g, 0, 0.82, 0.62);
      g.add(box(0.1, 0.05, 1.7, metal(), 0, 0.09, 0));
      for (const s of [-1, 1]) g.add(box(0.05, 0.03, 0.9, surf.alu(), s * 0.14, 0.125, -0.32));
      // Vỏ bánh đà + thân máy cong
      g.add(shell(0.3, 0.56, 0.5, plastic(), 0, 0.36, 0.68, 0.11));
      g.add(tube([[0, 0.55, 0.72], [0, 0.95, 0.72], [0, 1.3, 0.66]], 0.05, surf.frame(), 12));
      consoleUnit(g, 0, 1.38, 0.66, 0.4, 0.42, 0.26);
      g.add(tube([[-0.22, 1.14, 0.56], [-0.1, 1.2, 0.66], [0.1, 1.2, 0.66], [0.22, 1.14, 0.56]], 0.016, surf.grip(), 12));
      const wheel = flywheel(0.22, 0.17, 0.36, 0.68);
      const pedals = [-1, 1].map((s) => {
        const pd = dynamicGroup();
        pd.add(rawBox(0.16, 0.025, 0.4, surf.alu(), 0, 0, 0));
        pd.add(rawBox(0.14, 0.012, 0.36, rubber(), 0, 0.017, 0));
        g.add(solid(pd));
        const rod = rawCyl(0.016, 0.016, 1, surf.alu(), 0, 0, 0, 10);
        rod.userData.dynamic = true;
        g.add(rod);
        return { s, pd, rod };
      });
      const arms = [-1, 1].map((s) => {
        const a = dynamicGroup();
        a.position.set(s * 0.32, 0.6, 0.65);
        a.add(tube([[0, 0, 0], [0, 0.5, -0.04], [0, 1.0, -0.14]], 0.018, surf.alu(), 10));
        a.add(rawCyl(0.024, 0.024, 0.2, surf.grip(), 0, 0.96, -0.12, 12));
        g.add(solid(a));
        return { s, a };
      });
      const fromP = new THREE.Vector3();
      const toP = new THREE.Vector3();
      const upd = (_p, active, dt, t) => {
        const w = active ? t * 6 : 0;
        wheel.rotation.x = -w;
        for (const { s, pd, rod } of pedals) {
          const ph = w + (s > 0 ? Math.PI : 0);
          pd.position.set(s * 0.14, 0.22 + Math.sin(ph) * 0.08, -0.1 + Math.cos(ph) * 0.18);
          fromP.copy(pd.position);
          toP.set(s * 0.17, 0.36 + Math.sin(ph) * 0.09, 0.62 + Math.cos(ph) * 0.09);
          link(rod, fromP, toP);
        }
        for (const { s, a } of arms) a.rotation.x = Math.sin(w + (s > 0 ? 0 : Math.PI)) * 0.3;
      };
      upd(0, false, 0, 0);
      return result(g, { x: 0, y: 0.2, z: -0.1 }, { w: 0.7, d: 1.8, ox: 0, oz: 0 }, { x: 0.8, z: 0 }, upd);
    }
    case 'upright':
    case 'spin':
    case 'assault': {
      const spin = m.type === 'spin';
      const assault = m.type === 'assault';
      rubberFoot(g, 0, -0.42, 0.56);
      rubberFoot(g, 0, 0.62, 0.56);
      g.add(box(0.07, 0.07, 1.08, spin ? chrome() : metal(), 0, 0.09, 0.1));
      // Cột yên chéo + cột tay lái, cả hai có ống chỉnh độ cao
      g.add(bar([0, 0.1, -0.02], [0, 0.82, -0.2], 0.036, surf.frame()));
      g.add(bar([0, 0.78, -0.19], [0, 0.9, -0.2], 0.018, chrome()));
      g.add(bar([0, 0.1, 0.3], [0, 1.0, 0.46], 0.036, surf.frame()));
      g.add(bar([0, 0.98, 0.455], [0, 1.15, 0.49], 0.018, chrome()));
      saddle(0.92, -0.2);
      // Tay lái sừng trâu quấn cao su
      if (!assault) {
        g.add(tube([[-0.25, 1.14, 0.3], [-0.26, 1.17, 0.44], [-0.12, 1.16, 0.52], [0.12, 1.16, 0.52], [0.26, 1.17, 0.44], [0.25, 1.14, 0.3]], 0.016, surf.grip(), 22));
      }
      if (!spin && !assault) {
        // Xe đạp thẳng đứng: vỏ che kín bánh đà + màn hình
        g.add(shell(0.26, 0.62, 0.62, plastic(), 0, 0.42, 0.25, 0.12));
        consoleUnit(g, 0, 1.26, 0.5, 0.45, 0.36, 0.22);
      }
      if (assault) consoleUnit(g, 0, 1.28, 0.55, 0.45, 0.32, 0.22);
      let wheel;
      if (assault) {
        // Bánh quạt gió có lồng lưới
        wheel = dynamicGroup();
        wheel.position.set(0, 0.5, 0.7);
        for (let i = 0; i < 10; i++) wheel.add(rot(rawBox(0.11, 0.7, 0.03, mat('#23252a', { rough: 0.5 }), 0, 0, 0), 'x', (i * Math.PI) / 10));
        g.add(solid(wheel));
        for (const s of [-1, 1]) {
          g.add(at(rot(torus(0.43, 0.014, surf.alu(), Math.PI * 2, 40), 'y', Math.PI / 2), s * 0.09, 0.5, 0.7));
          for (let i = 0; i < 10; i++) g.add(at(rot(rawCyl(0.003, 0.003, 0.86, surf.frameLight(), 0, 0, 0, 5), 'x', (i * Math.PI) / 10), s * 0.09, 0.5, 0.7));
        }
      } else {
        // Spin: bánh đà nặng lộ ra phía trước + núm chỉnh lực
        wheel = flywheel(spin ? 0.24 : 0.2, 0, 0.35, spin ? 0.55 : 0.3, spin ? '#d4d7dc' : '#3a3e45');
        if (spin) {
          g.add(tube([[0.06, 0.1, 0.34], [0.06, 0.4, 0.42], [0.06, 0.62, 0.56]], 0.018, surf.frame(), 10));
          g.add(tube([[-0.06, 0.1, 0.34], [-0.06, 0.4, 0.42], [-0.06, 0.62, 0.56]], 0.018, surf.frame(), 10));
          g.add(rawCyl(0.03, 0.03, 0.04, mat('#b91c1c', { rough: 0.4 }), 0, 0.72, 0.42, 16));
        }
      }
      const cr = cranks(0.38, 0.12);
      let arms = [];
      if (assault) {
        arms = [-1, 1].map((s) => {
          const a = dynamicGroup();
          a.position.set(s * 0.3, 0.45, 0.5);
          a.add(tube([[0, 0, 0], [0, 0.45, 0.02], [0, 0.85, -0.05]], 0.018, surf.alu(), 10));
          a.add(rawCyl(0.024, 0.024, 0.2, surf.grip(), 0, 0.82, -0.05, 12));
          g.add(solid(a));
          return { s, a };
        });
      }
      return result(g, { x: 0, y: seatY(0.95), z: -0.18 }, { w: 0.6, d: 1.2, ox: 0, oz: 0.15 }, { x: 0.8, z: 0 }, (_p, active, dt, t) => {
        const w = active ? t * (spin ? 13 : 9) : 0;
        cr.rotation.x = -w;
        wheel.rotation.x = -w * 2;
        for (const { s, a } of arms) a.rotation.x = Math.sin(w + (s > 0 ? 0 : Math.PI)) * 0.35;
      });
    }
    case 'recumbent': {
      rubberFoot(g, 0, -0.65, 0.56);
      rubberFoot(g, 0, 0.82, 0.56);
      g.add(box(0.12, 0.07, 1.6, silver(), 0, 0.09, 0.08));
      // Ghế tựa lưng + tay vịn hai bên
      g.add(box(0.48, 0.1, 0.45, pad(), 0, 0.5, -0.3));
      g.add(rot(box(0.46, 0.6, 0.1, pad(), 0, 0.82, -0.58), 'x', -0.35));
      g.add(box(0.08, 0.38, 0.1, surf.frame(), 0, 0.28, -0.3));
      for (const s of [-1, 1]) {
        g.add(tube([[s * 0.2, 0.42, -0.5], [s * 0.3, 0.55, -0.42], [s * 0.3, 0.6, -0.15]], 0.016, surf.alu(), 10));
        g.add(rawCyl(0.022, 0.022, 0.18, surf.grip(), s * 0.3, 0.6, -0.2, 12).rotateX(Math.PI / 2));
      }
      // Thân máy cong + màn hình
      g.add(shell(0.26, 0.62, 0.5, plastic(), 0, 0.4, 0.72, 0.11));
      g.add(tube([[0, 0.65, 0.76], [0, 0.85, 0.8], [0, 0.98, 0.76]], 0.034, surf.frame(), 10));
      consoleUnit(g, 0, 1.02, 0.74, 0.5, 0.36, 0.22);
      const cr = cranks(0.45, 0.42);
      const wheel = flywheel(0.2, 0.15, 0.36, 0.72);
      return result(g, { x: 0, y: seatY(0.54), z: -0.3 }, { w: 0.6, d: 1.7, ox: 0, oz: 0.1 }, { x: 0.8, z: -0.3 }, (_p, active, dt, t) => {
        const w = active ? t * 8 : 0;
        cr.rotation.x = -w;
        wheel.rotation.x = -w * 2;
      });
    }
    case 'rower': {
      // Máy chèo thuyền kiểu thanh ray đơn nhôm
      g.add(box(0.11, 0.045, 2.28, surf.alu(), 0, 0.235, -0.02));
      rubberFoot(g, 0, -1.08, 0.5);
      g.add(bar([0, 0.08, -1.08], [0, 0.22, -1.08], 0.03, surf.frame()));
      rubberFoot(g, 0, 1.12, 0.56);
      // Lồng bánh quạt
      const fw = dynamicGroup();
      fw.position.set(0, 0.42, 1.08);
      for (let i = 0; i < 8; i++) fw.add(rot(rawBox(0.09, 0.5, 0.03, mat('#23252a', { rough: 0.5 }), 0, 0, 0), 'x', (i * Math.PI) / 8));
      g.add(solid(fw));
      for (const s of [-1, 1]) {
        g.add(at(rot(rawCyl(0.28, 0.28, 0.02, mat('#1a1b1f', { rough: 0.5, transparent: true, opacity: 0.42 }), 0, 0, 0, 36), 'z', Math.PI / 2), s * 0.08, 0.42, 1.08));
        g.add(at(rot(torus(0.28, 0.012, surf.frame(), Math.PI * 2, 36), 'y', Math.PI / 2), s * 0.08, 0.42, 1.08));
      }
      g.add(bar([0, 0.25, 0.9], [0, 0.42, 1.08], 0.03, surf.frame()));
      // Bàn đạp chân có đai
      for (const s of [-1, 1]) {
        g.add(rot(box(0.16, 0.26, 0.03, plastic(), s * 0.1, 0.38, 0.72), 'x', 0.55));
        g.add(rot(rawBox(0.14, 0.03, 0.05, mat('#7f1d1d', { rough: 0.8 }), s * 0.1, 0.4, 0.68), 'x', 0.55));
      }
      // Tay đòn gắn màn hình
      g.add(tube([[0, 0.45, 1.0], [0, 0.7, 1.05], [0, 0.82, 0.98]], 0.018, surf.frame(), 10));
      consoleUnit(g, 0, 0.88, 0.96, 0.35, 0.26, 0.2);
      const s = dynamicGroup();
      s.add(box(0.32, 0.075, 0.3, pad(), 0, 0, 0));
      s.add(rawBox(0.2, 0.03, 0.2, surf.alu(), 0, -0.05, 0));
      s.position.set(0, 0.29, -0.45);
      g.add(s);
      const handle = dynamicGroup();
      handle.add(tube([[-0.24, -0.01, -0.02], [-0.12, 0, 0], [0.12, 0, 0], [0.24, -0.01, -0.02]], 0.015, surf.grip(), 14));
      g.add(handle);
      const chain = rawCyl(0.006, 0.006, 1, surf.cable(), 0, 0, 0, 6);
      chain.userData.dynamic = true;
      g.add(chain);
      const toFan = new THREE.Vector3(0, 0.42, 0.86);
      const upd = (p, active, dt) => {
        handle.position.set(0, 0.55 + p * 0.05, 0.35 - p * 0.5);
        link(chain, handle.position, toFan);
        if (active) fw.rotation.x -= dt * 6;
      };
      upd(0, false, 0);
      return result(g, { x: 0, y: seatY(0.32), z: -0.45 }, { w: 0.5, d: 2.4, ox: 0, oz: 0 }, { x: 0.8, z: -0.4 }, upd);
    }
    case 'stair': {
      rubberFoot(g, 0, -0.44, 0.76);
      rubberFoot(g, 0, 0.44, 0.76);
      g.add(shell(0.54, 0.34, 0.66, plastic(), 0, 0.26, 0.26, 0.08));
      for (const s of [-1, 1]) {
        g.add(tube([[s * 0.32, 0.08, 0.42], [s * 0.34, 0.7, 0.44], [s * 0.3, 1.32, 0.42]], 0.03, surf.frameLight(), 12));
        g.add(tube([[s * 0.3, 1.05, 0.42], [s * 0.36, 1.08, 0.2], [s * 0.36, 1.02, -0.1]], 0.018, surf.alu(), 12));
        g.add(rawCyl(0.024, 0.024, 0.24, surf.grip(), s * 0.36, 1.05, 0.04, 12).rotateX(Math.PI / 2));
      }
      consoleUnit(g, 0, 1.4, 0.45, 0.4, 0.44, 0.24);
      const steps = [-1, 1].map((sd) => {
        const st = dynamicGroup();
        st.add(rawBox(0.3, 0.03, 0.36, surf.alu(), 0, 0, 0));
        st.add(rawBox(0.27, 0.012, 0.32, rubber(), 0, 0.02, 0));
        st.add(rawBox(0.04, 0.03, 0.3, surf.frame(), 0, -0.03, 0.2));
        g.add(solid(st));
        return { sd, st };
      });
      const upd = (_p, active, dt, t) => {
        const w = active ? t * 7 : 0;
        for (const { sd, st } of steps) st.position.set(sd * 0.14, 0.25 + Math.sin(w + (sd > 0 ? Math.PI : 0)) * 0.1, 0);
      };
      upd(0, false, 0, 0);
      return result(g, { x: 0, y: 0.25, z: -0.05 }, { w: 0.8, d: 1.0, ox: 0, oz: 0.05 }, { x: 0, z: -0.8 }, upd);
    }
    case 'ski': {
      // Máy trượt tuyết: tháp đứng, bánh quạt lồng phía trên, bục đứng cao su
      g.add(box(0.72, 0.035, 0.92, rubber(), 0, 0.018, -0.1));
      g.add(box(0.3, 0.012, 0.5, surf.ply(), 0, 0.04, -0.15, { cast: false }));
      g.add(shell(0.26, 2.05, 0.18, plastic(), 0, 1.06, 0.46, 0.05));
      g.add(rot(rawCyl(0.22, 0.22, 0.1, mat('#23252a', { rough: 0.5 }), 0, 1.75, 0.6, 36), 'x', Math.PI / 2));
      g.add(at(torus(0.22, 0.014, surf.alu(), Math.PI * 2, 36), 0, 1.75, 0.66));
      consoleUnit(g, 0, 1.42, 0.32, 0.1, 0.24, 0.2);
      const hands = [-1, 1].map((s) => {
        const h = dynamicGroup();
        h.add(rawCyl(0.022, 0.022, 0.15, surf.grip(), 0, 0, 0, 12));
        g.add(h);
        const c = rawCyl(0.005, 0.005, 1, surf.cable(), 0, 0, 0, 6);
        c.userData.dynamic = true;
        g.add(c);
        return { s, h, c };
      });
      const upd = (p) => {
        for (const { s, h, c } of hands) {
          h.position.set(s * 0.18, 1.8 - p * 0.95, 0.3 - p * 0.1);
          link(c, new THREE.Vector3(s * 0.08, 1.95, 0.35), h.position);
        }
      };
      upd(0);
      return result(g, { x: 0, y: 0.05, z: -0.15 }, { w: 0.4, d: 0.35, ox: 0, oz: 0.45 }, { x: 0.8, z: 0 }, upd);
    }
    default:
      return result(g, { x: 0, y: 0, z: 0 }, null, { x: 0.8, z: 0 });
  }
}

// Bao cát / bóng tốc độ
function bag(stat, m) {
  const g = new THREE.Group();
  if (m.type === 'speed') {
    // Bóng đấm tốc độ: mặt gỗ tròn, trụ thép, quả bóng da
    g.add(lathe([[0, 0.03], [0.36, 0.03], [0.38, 0], [0.36, -0.03], [0, -0.03]], surf.ply(), 0, 1.95, 0.4, 36));
    g.add(box(0.08, 1.95, 0.08, metal(), 0, 0.98, 0.65));
    g.add(box(0.1, 0.05, 0.3, metal(), 0, 1.9, 0.52));
    g.add(box(0.5, 0.03, 0.5, metal(), 0, 0.035, 0.65));
    const b = dynamicGroup();
    b.position.set(0, 1.92, 0.35);
    const ball = sphere(0.1, mat('#8f1d1d', { rough: 0.5, normalMap: surf.foam().normalMap, normalScale: 0.5 }), 0, -0.14, 0, 22);
    ball.scale.set(1, 1.4, 1);
    b.add(ball);
    b.add(rawCyl(0.006, 0.006, 0.06, surf.cable(), 0, -0.02, 0, 6));
    g.add(b);
    return result(g, { x: 0, y: 0, z: -0.05 }, { w: 0.5, d: 0.3, ox: 0, oz: 0.65 }, { x: 0, z: -0.8 }, (_p, active, dt, t) => {
      b.rotation.x = active ? Math.sin(t * 28) * 0.7 : 0;
    });
  }
  // Bao cát da treo bằng 4 dây xích
  const leather = mat('#6b1414', { rough: 0.6, normalMap: surf.foam().normalMap, normalScale: 0.5 });
  const b = dynamicGroup();
  b.position.set(0, 2.6, 0.55);
  b.add(lathe([[0, -1.8], [0.17, -1.8], [0.2, -1.74], [0.205, -1.3], [0.2, -0.95], [0.17, -0.87], [0, -0.87]], leather, 0, 0, 0, 30));
  for (const y of [-1.72, -0.96]) b.add(rawCyl(0.206, 0.206, 0.05, mat('#121316', { rough: 0.55 }), 0, y, 0, 30));
  const chainMat = mat('#9aa0a8', { rough: 0.3, metal: 1 });
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    b.add(bar([0, -0.45, 0], [Math.cos(a) * 0.14, -0.88, Math.sin(a) * 0.14], 0.005, chainMat));
  }
  b.add(rawCyl(0.008, 0.008, 0.45, chainMat, 0, -0.22, 0, 8));
  g.add(solid(b));
  g.add(box(0.3, 0.05, 0.3, metal(), 0, 2.62, 0.55));
  return result(g, { x: 0, y: 0, z: -0.15 }, { w: 0.4, d: 0.4, ox: 0, oz: 0.55 }, { x: 0.8, z: -0.3 }, (_p, active, dt, t, phase) => {
    b.rotation.x = active ? Math.max(0, Math.sin(phase * Math.PI * 2)) * 0.12 : b.rotation.x * 0.9;
  });
}

function mat_(stat, m) {
  const g = new THREE.Group();
  g.add(box(0.75, 0.02, 1.7, mat(m.color || '#c084fc', { rough: 0.9 }), 0, 0.01, 0, { cast: false }));
  if (m.roller) g.add(rot(cyl(0.08, 0.08, 0.6, mat('#f97316', { rough: 0.9 }), 0.5, 0.08, -0.6, 12), 'z', Math.PI / 2));
  else if (!m.pads) g.add(rot(cyl(0.06, 0.06, 0.75, mat(m.color || '#c084fc', { rough: 0.9 }), 0, 0.06, -0.9, 12), 'z', Math.PI / 2));
  if (m.pads) g.add(box(1.6, 0.02, 2.8, mat('#1f2937', { rough: 0.9 }), 0, 0.012, 0.55, { cast: false }));
  return result(g, { x: 0, y: 0.02, z: 0 }, null, { x: 0.9, z: 0 });
}

// Giường Pilates Reformer: khung gỗ + ray, xe trượt có lò xo, thanh đạp chân ở phía +Z
function reformer(stat) {
  const g = new THREE.Group();
  const wood = mat('#b98a52', { rough: 0.55 });
  const Z1 = -1.0; // đầu giường
  const Z2 = 0.55; // cuối giường (phía chân)
  const L = Z2 - Z1;
  const ZC = (Z1 + Z2) / 2;
  for (const s of [-1, 1]) {
    g.add(box(0.07, 0.15, L, wood, s * 0.32, 0.24, ZC));
    g.add(box(0.03, 0.03, L - 0.1, chrome(), s * 0.2, 0.3, ZC));
    for (const z of [Z1 + 0.08, Z2 - 0.08]) g.add(box(0.08, 0.17, 0.08, wood, s * 0.32, 0.085, z));
  }
  for (const z of [Z1, Z2]) g.add(box(0.71, 0.15, 0.07, wood, 0, 0.24, z));
  // Thanh đạp chân: bàn chân nhân vật tì vào đây
  for (const s of [-1, 1]) g.add(box(0.035, 0.3, 0.035, chrome(), s * 0.32, 0.45, 0.28));
  g.add(rot(cyl(0.022, 0.022, 0.68, accent(stat), 0, 0.6, 0.28, 10), 'z', Math.PI / 2));
  // Lò xo nối xe trượt với cuối giường
  const springs = dynamicGroup();
  for (const x of [-0.12, 0, 0.12]) springs.add(box(0.018, 0.018, 1, mat(x === 0 ? '#facc15' : '#ef4444', { rough: 0.4, metal: 0.4 }), x, 0.27, 0.5));
  g.add(springs);
  // Xe trượt: đệm nằm, gối đầu, 2 chặn vai
  const carriage = dynamicGroup();
  carriage.add(box(0.5, 0.07, 0.8, pad(), 0, 0.33, -0.2));
  carriage.add(box(0.52, 0.03, 0.82, accent(stat), 0, 0.29, -0.2));
  carriage.add(box(0.26, 0.05, 0.2, pad(), 0, 0.39, -0.5));
  for (const s of [-1, 1]) carriage.add(box(0.08, 0.14, 0.08, pad(), s * 0.2, 0.42, -0.3));
  g.add(carriage);
  const upd = (p) => {
    const z = -p * 0.24;
    carriage.position.z = z;
    springs.position.z = z + 0.2;
    springs.scale.z = Math.max(0.05, Z2 - springs.position.z);
  };
  upd(0);
  return result(g, { x: 0, y: 0.36, z: 0 }, { w: 0.74, d: L + 0.08, ox: 0, oz: ZC }, { x: 0.85, z: -0.2 }, upd);
}

function spot(_stat, m) {
  const g = new THREE.Group();
  if (m.marker) {
    const ring = torus(0.38, 0.02, mat(m.marker, { emissive: m.marker, emissiveIntensity: 1.2 }), Math.PI * 2, 28);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.015;
    ring.castShadow = false;
    g.add(ring);
  }
  // top: chiều cao mặt ghế (ghế sauna) -> nhân vật ngồi lên
  return result(g, { x: 0, y: m.top ? seatY(m.top) : 0, z: 0 }, null, { x: 0, z: m.exitZ ?? 0.9 });
}

function massage(stat, m) {
  const g = new THREE.Group();
  if (m.type === 'chair') {
    g.add(box(0.7, 0.4, 0.8, mat('#3f3f46', { rough: 0.6 }), 0, 0.2, -0.1));
    g.add(box(0.6, 0.12, 0.6, mat('#78350f', { rough: 0.5 }), 0, 0.46, -0.05));
    g.add(rot(box(0.6, 0.8, 0.14, mat('#78350f', { rough: 0.5 }), 0, 0.85, -0.42), 'x', -0.35));
    for (const s of [-1, 1]) g.add(box(0.1, 0.25, 0.6, mat('#3f3f46'), s * 0.36, 0.6, -0.05));
    g.add(rot(box(0.5, 0.1, 0.45, mat('#78350f'), 0, 0.25, 0.42), 'x', 0.6));
    return result(g, { x: 0, y: seatY(0.52), z: 0 }, { w: 0.8, d: 1.0, ox: 0, oz: -0.05 }, { x: 0.8, z: 0.3 });
  }
  g.add(box(0.7, 0.1, 1.9, mat('#f5f5f4', { rough: 0.7 }), 0, 0.72, 0));
  g.add(box(0.72, 0.04, 1.92, mat('#a16207'), 0, 0.65, 0));
  for (const [x, z] of [[-0.3, -0.85], [0.3, -0.85], [-0.3, 0.85], [0.3, 0.85]]) g.add(box(0.06, 0.65, 0.06, mat('#a16207'), x, 0.33, z));
  g.add(box(0.5, 0.06, 0.4, mat('#fde68a'), 0, 0.79, 0.75));
  return result(g, { x: 0, y: 0.77, z: -0.15 }, { w: 0.75, d: 1.95, ox: 0, oz: 0 }, { x: 0.8, z: 0 });
}

function inbody() {
  const g = new THREE.Group();
  g.add(box(0.6, 0.08, 0.7, mat('#e2e8f0', { rough: 0.3 }), 0, 0.04, 0));
  g.add(box(0.12, 1.1, 0.12, mat('#cbd5e1', { metal: 0.3 }), 0, 0.6, 0.38));
  g.add(rot(box(0.45, 0.32, 0.06, mat('#0ea5e9', { emissive: '#22d3ee', emissiveIntensity: 1 }), 0, 1.25, 0.35, { cast: false }), 'x', 0.3));
  for (const s of [-1, 1]) g.add(rot(cyl(0.025, 0.025, 0.3, chrome(), s * 0.28, 1.0, 0.25, 6), 'z', Math.PI / 2));
  return result(g, { x: 0, y: 0.08, z: -0.05 }, { w: 0.3, d: 0.2, ox: 0, oz: 0.4 }, { x: 0, z: -0.8 });
}

function counter(_stat, m) {
  const g = new THREE.Group();
  const juice = m.type === 'juice';
  g.add(box(2.4, 1.05, 0.6, mat(juice ? '#f97316' : '#0f172a', { rough: 0.4 }), 0, 0.53, 0.75));
  g.add(box(2.5, 0.06, 0.7, mat('#f8fafc', { rough: 0.2 }), 0, 1.08, 0.75));
  g.add(box(2.42, 0.05, 0.62, mat(juice ? '#facc15' : '#22d3ee', { emissive: juice ? '#facc15' : '#22d3ee', emissiveIntensity: 1 }), 0, 0.85, 0.44, { cast: false }));
  g.add(box(2.4, 1.8, 0.35, mat('#334155'), 0, 0.9, 1.5));
  const colors = juice ? ['#f97316', '#84cc16', '#ef4444', '#facc15', '#a855f7'] : ['#ef4444', '#22d3ee', '#a3e635', '#f8fafc', '#facc15'];
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 8; i++) {
      const cx = -1.0 + i * 0.28;
      const color = colors[(i + r) % colors.length];
      if (juice) g.add(cyl(0.05, 0.05, 0.18, mat(color, { rough: 0.3 }), cx, 0.55 + r * 0.5, 1.3, 8));
      else g.add(cyl(0.08, 0.08, 0.22, mat(color, { rough: 0.4 }), cx, 0.56 + r * 0.5, 1.3, 10));
    }
  }
  if (juice) {
    g.add(cyl(0.08, 0.1, 0.3, mat('#e2e8f0', { transparent: true, opacity: 0.6 }), 0.6, 1.26, 0.8, 10));
    g.add(cyl(0.06, 0.06, 0.25, mat('#84cc16'), -0.6, 1.24, 0.8, 8));
  }
  return result(g, { x: 0, y: 0, z: 0 }, { w: 2.5, d: 1.4, ox: 0, oz: 1.1 }, { x: 0, z: -0.8 });
}

function locker(_stat, opts = {}) {
  const g = new THREE.Group();
  const color = opts.color || '#14b8a6';
  const unit = new THREE.Group();
  unit.position.z = 0.6;
  buildLockerColumn(unit, color, true);
  g.add(unit);
  const door = dynamicGroup();
  door.position.set(-0.27, 1.37, 0.6 - 0.24);
  door.add(box(0.54, 0.84, 0.03, mat(color, { rough: 0.45, metal: 0.3 }), 0.27, 0, 0));
  door.add(box(0.04, 0.12, 0.04, mat('#e2e8f0', { metal: 0.8 }), 0.48, 0, -0.03));
  for (let i = 0; i < 3; i++) door.add(box(0.3, 0.02, 0.01, mat('#0f172a'), 0.27, 0.3 - i * 0.05, -0.02));
  g.add(door);
  let open = 0;
  return result(g, { x: 0, y: 0, z: 0 }, { w: 0.6, d: 0.5, ox: 0, oz: 0.6 }, { x: 0, z: -0.4 }, (_p, active, dt) => {
    open += ((active ? 1 : 0) - open) * (1 - Math.exp(-dt * 5));
    door.rotation.y = open * 1.7;
  });
}

function toilet() {
  const g = new THREE.Group();
  const white = mat('#ffffff', { rough: 0.25 });
  g.add(cyl(0.16, 0.12, 0.32, white, 0, 0.16, 0.02, 16));
  const seatRing = torus(0.16, 0.04, white, Math.PI * 2, 20);
  seatRing.rotation.x = -Math.PI / 2;
  seatRing.position.set(0, 0.36, 0.02);
  g.add(seatRing);
  g.add(box(0.42, 0.42, 0.18, white, 0, 0.55, -0.25));
  g.add(box(0.44, 0.04, 0.2, mat('#e2e8f0'), 0, 0.78, -0.25));
  return result(g, { x: 0, y: seatY(0.4), z: 0.02 }, { w: 0.45, d: 0.4, ox: 0, oz: -0.25 }, { x: 0, z: 0.75 });
}

function sink() {
  const g = new THREE.Group();
  const white = mat('#ffffff', { rough: 0.25 });
  g.add(box(0.7, 0.08, 0.45, mat('#cbd5e1', { rough: 0.3 }), 0, 0.82, 0.45));
  g.add(box(0.12, 0.8, 0.12, mat('#94a3b8'), 0, 0.4, 0.55));
  g.add(cyl(0.2, 0.14, 0.12, white, 0, 0.84, 0.42, 16));
  g.add(bar([0, 0.86, 0.62], [0, 1.02, 0.62], 0.02, chrome()));
  g.add(bar([0, 1.02, 0.62], [0, 1.0, 0.5], 0.018, chrome()));
  g.add(box(0.7, 0.75, 0.03, mat('#cfe8ff', { rough: 0.05, metal: 0.9 }), 0, 1.55, 0.66, { cast: false }));
  g.add(box(0.76, 0.81, 0.02, mat('#475569'), 0, 1.55, 0.675, { cast: false }));
  const water = cyl(0.012, 0.012, 0.14, mat('#7dd3fc', { transparent: true, opacity: 0.7, emissive: '#7dd3fc', emissiveIntensity: 0.3 }), 0, 0.93, 0.5, 6, { cast: false });
  water.userData.dynamic = true;
  water.visible = false;
  g.add(water);
  return result(g, { x: 0, y: 0, z: 0 }, { w: 0.7, d: 0.45, ox: 0, oz: 0.48 }, { x: 0, z: -0.5 }, (_p, active) => (water.visible = active));
}

// Tủ locker 2 ngăn (dùng cho cả tủ trang trí / instancing)
export function buildLockerColumn(g, color = '#14b8a6', skipUpperDoor = false) {
  const body = mat('#334155', { rough: 0.6, metal: 0.3 });
  const doorMat = mat(color, { rough: 0.45, metal: 0.3 });
  const handle = mat('#e2e8f0', { metal: 0.8, rough: 0.3 });
  g.add(box(0.6, 1.9, 0.5, body, 0, 0.95, 0));
  g.add(box(0.54, 0.84, 0.03, doorMat, 0, 0.5, -0.255));
  g.add(box(0.04, 0.12, 0.04, handle, 0.21, 0.5, -0.28));
  if (!skipUpperDoor) {
    g.add(box(0.54, 0.84, 0.03, doorMat, 0, 1.37, -0.255));
    g.add(box(0.04, 0.12, 0.04, handle, 0.21, 1.37, -0.28));
  } else {
    g.add(box(0.5, 0.8, 0.01, mat('#0f172a'), 0, 1.37, -0.252));
    g.add(box(0.3, 0.06, 0.01, mat('#f97316'), 0, 1.2, -0.258));
  }
  return g;
}

const BUILDERS = {
  chestPress,
  pecDeck,
  latPulldown,
  seatedRow,
  legPress,
  legExtension,
  bicepMachine,
  tricepMachine,
  treadmill,
  dumbbellBench,
  pullupBar,
  battleRope,
  medicineBall,
  aerobicSpot,
  seat,
  bench,
  cable,
  station,
  rack,
  platform,
  cardio,
  bag,
  mat: mat_,
  reformer,
  spot,
  massage,
  inbody,
  counter,
  locker,
  toilet,
  sink,
};

// Dựng thiết bị theo cấu hình model trong shared/equipment.js
export function buildEquipmentMesh(model, stat, opts = {}) {
  const fn = BUILDERS[model.kind];
  if (!fn) throw new Error(`Không có kiểu khung thiết bị: ${model.kind}`);
  const built = fn(stat || 'stamina', { ...model, ...opts });
  addContactShadow(built.group);
  return built;
}

// Bóng mềm dưới chân máy giúp máy "bám" xuống sàn (bọc theo kích thước thật của máy)
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();
const _bbox = new THREE.Box3();
function addContactShadow(group) {
  _bbox.setFromObject(group);
  if (_bbox.isEmpty()) return;
  _bbox.getSize(_size);
  _bbox.getCenter(_center);
  if (_size.y < 0.25 || _size.x > 3.2 || _size.z > 3.4) return;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(_size.x * 1.5 + 0.2, _size.z * 1.5 + 0.2), contactShadow());
  m.rotation.x = -Math.PI / 2;
  m.position.set(_center.x, 0.01, _center.z);
  m.castShadow = false;
  m.receiveShadow = false;
  m.renderOrder = 1;
  group.add(m);
}
