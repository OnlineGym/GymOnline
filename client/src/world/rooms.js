import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { box, cyl, sphere, bar, torus } from './helpers.js';
import { mat, C, textures, textTexture } from './materials.js';
import { SteamSystem } from './effects.js';
import { buildLockerColumn } from '../equipment/builders.js';
import { quality, onSettingsChange } from '../core/settings.js';
import { audio } from '../core/audio.js';

const HALF_PI = Math.PI / 2;

/**
 * Bày nội thất + đặt máy tập cho từng khu. Trả về đối tượng có update() cho các hiệu ứng động.
 */
export function buildRooms({ scene, staticRoot, collision, equipment }) {
  const S = staticRoot;
  const col = (cx, cz, w, d, ry = 0) => collision.addRect(cx, cz, w, d, ry, 'decor');
  const updaters = [];

  buildLobby(S, col);
  buildMachineArea(S, col, equipment);
  updaters.push(buildAerobic(scene, S, col, equipment));
  buildFreeArea(S, col, equipment);
  buildLockerRoom(S, col, equipment);
  updaters.push(buildSauna(scene, S, col, equipment));
  buildToilets(S, col, equipment);

  return {
    update(dt, t) {
      for (const u of updaters) u(dt, t);
    },
  };
}

// ---------- Đồ dùng chung ----------
function plant(root, col, x, z, s = 1) {
  root.add(cyl(0.22 * s, 0.17 * s, 0.4 * s, mat('#e2e8f0', { rough: 0.4 }), x, 0.2 * s, z, 12));
  root.add(sphere(0.32 * s, mat('#22c55e', { rough: 0.9, flat: true }), x, 0.65 * s, z, 7));
  root.add(sphere(0.24 * s, mat('#4ade80', { rough: 0.9, flat: true }), x + 0.12 * s, 0.9 * s, z - 0.05, 7));
  col(x, z, 0.5 * s, 0.5 * s);
}

function bench(root, col, x, z, len, alongX = true, color = '#475569') {
  const w = alongX ? len : 0.45;
  const d = alongX ? 0.45 : len;
  root.add(box(w, 0.08, d, mat(color, { rough: 0.6 }), x, 0.42, z));
  const legs = alongX ? [[x - len / 2 + 0.15, z], [x + len / 2 - 0.15, z]] : [[x, z - len / 2 + 0.15], [x, z + len / 2 - 0.15]];
  for (const [lx, lz] of legs) root.add(box(alongX ? 0.06 : 0.36, 0.4, alongX ? 0.36 : 0.06, mat(C.metal, { metal: 0.6, rough: 0.4 }), lx, 0.2, lz));
  col(x, z, w, d);
}

function poster(root, x, y, z, ry, lines, accent, w = 2.2, h = 1.1) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: textTexture(lines, { w: 512, h: Math.round((512 * h) / w), accent, size: 46 }) })
  );
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.userData.noBake = true;
  root.add(m);
}

function dumbbellPair(root, x, y, z, color, size = 1) {
  const handle = mat(C.chrome, { metal: 0.9, rough: 0.2 });
  const weight = mat(color, { rough: 0.5 });
  const m = cyl(0.015, 0.015, 0.22, handle, x, y, z, 6);
  m.rotation.x = HALF_PI;
  root.add(m);
  for (const s of [-1, 1]) {
    const w = cyl(0.045 * size, 0.045 * size, 0.06, weight, x, y, z + s * 0.11, 8);
    w.rotation.x = HALF_PI;
    root.add(w);
  }
}

// ---------- SẢNH / LỄ TÂN ----------
function buildLobby(R, col) {
  // Quầy lễ tân
  const deskMat = mat('#0f172a', { rough: 0.4 });
  const topMat = mat('#f8fafc', { rough: 0.3 });
  R.add(box(0.9, 1.1, 4, deskMat, -5, 0.55, 14));
  R.add(box(1.1, 0.06, 4.2, topMat, -5, 1.13, 14));
  R.add(box(0.05, 0.08, 4, mat(C.cyan, { emissive: C.cyan, emissiveIntensity: 1.5 }), -4.52, 0.9, 14, { cast: false }));
  R.add(box(0.5, 0.35, 0.05, mat('#111827'), -5.2, 1.35, 13.2));
  R.add(box(0.46, 0.3, 0.02, mat('#38bdf8', { emissive: '#38bdf8', emissiveIntensity: 0.6 }), -5.17, 1.35, 13.2, { cast: false }));
  col(-5, 14, 1.1, 4.2);
  // Bảng logo sau quầy
  poster(R, -7.83, 2.5, 14, HALF_PI, ['GYM ONLINE', 'Khỏe hơn mỗi ngày 💪'], '#22d3ee', 4.2, 1.2);

  // Khu sofa chờ
  const sofaMat = mat('#7c3aed', { rough: 0.8 });
  const sofaMat2 = mat('#6d28d9', { rough: 0.8 });
  for (const [x, z, ry] of [[14, 18.8, 0], [18.5, 18.8, 0]]) {
    R.add(box(2.4, 0.4, 0.9, sofaMat, x, 0.2, z));
    R.add(box(2.4, 0.6, 0.25, sofaMat2, x, 0.6, z + 0.35));
    R.add(box(0.25, 0.55, 0.9, sofaMat2, x - 1.1, 0.4, z));
    R.add(box(0.25, 0.55, 0.9, sofaMat2, x + 1.1, 0.4, z));
    col(x, z, 2.4, 0.9, ry);
  }
  R.add(box(1.6, 0.06, 0.8, mat('#f1f5f9', { rough: 0.2 }), 16.25, 0.45, 16.9));
  R.add(cyl(0.05, 0.05, 0.42, mat(C.metal), 16.25, 0.21, 16.9, 8));
  R.add(box(0.8, 0.04, 0.5, mat('#cbd5e1'), 16.25, 0.02, 16.9));
  col(16.25, 16.9, 1.6, 0.8);
  // Cốc nước + tạp chí trên bàn
  R.add(cyl(0.05, 0.04, 0.12, mat('#fca5a5'), 16.0, 0.54, 16.8, 8));
  R.add(box(0.3, 0.02, 0.22, mat('#fde047'), 16.5, 0.49, 17.0));

  // Máy bán nước
  R.add(box(1, 2, 0.8, mat('#dc2626', { rough: 0.4 }), 23.45, 1, 12));
  R.add(box(0.05, 1.2, 0.6, mat('#bae6fd', { rough: 0.05, emissive: '#e0f2fe', emissiveIntensity: 0.5 }), 22.94, 1.25, 12, { cast: false }));
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      R.add(cyl(0.05, 0.05, 0.16, mat(['#facc15', '#22c55e', '#3b82f6'][j]), 23.1, 0.85 + i * 0.35, 11.8 + j * 0.2 - 0.0, 8));
  col(23.45, 12, 1, 0.8);
  // Bình nước
  R.add(box(0.4, 1, 0.4, mat('#f1f5f9'), 23.5, 0.5, 14.5));
  R.add(cyl(0.16, 0.16, 0.45, mat('#7dd3fc', { transparent: true, opacity: 0.7, rough: 0.1 }), 23.5, 1.23, 14.5, 12));
  col(23.5, 14.5, 0.45, 0.45);

  // Màn hình chào mừng trên tường
  poster(R, 8.5, 2.4, 8.17, 0, ['CHÀO MỪNG!', 'Tập luyện – Kết bạn – Lên level'], '#a78bfa', 4, 1.3);
  poster(R, 23.83, 2.6, 17, -HALF_PI, ['GIỜ MỞ CỬA', '24/7 – Online mọi lúc'], '#facc15', 3, 1);

  // Cây cảnh
  plant(R, col, -7.2, 19.2);
  plant(R, col, 2.6, 19.2);
  plant(R, col, -2.6, 19.2);
  plant(R, col, 23.2, 19.2);
  plant(R, col, 23.2, 8.8);
  plant(R, col, 4, 8.8, 0.8);
  plant(R, col, -4, 8.8, 0.8);

  // Thảm chùi chân trước cửa
  R.add(box(3, 0.015, 1.6, mat('#334155', { rough: 1 }), 0, 0.008, 19, { cast: false }));
  // Kệ giày
  R.add(box(2.2, 0.6, 0.4, mat('#a16207', { rough: 0.7 }), 10, 0.3, 19.6));
  col(10, 19.6, 2.2, 0.4);
}

// ---------- KHU MÁY TẬP ----------
function buildMachineArea(R, col, eqm) {
  // Máy chạy bộ dọc tường Tây, nhìn ra tường (có cửa sổ trang trí)
  for (const z of [-6.5, -4, -1.5, 1, 3.5]) eqm.add('treadmill', -21, z, -HALF_PI);
  // "Cửa sổ" phát sáng trên tường Tây
  for (const z of [-5.25, -0.25, 4.5]) {
    R.add(box(0.05, 1.4, 3.2, mat('#bfe9ff', { emissive: '#d9f3ff', emissiveIntensity: 0.9 }), -23.83, 2.3, z, { cast: false }));
    R.add(box(0.06, 1.5, 0.08, mat('#475569'), -23.82, 2.3, z, { cast: false }));
  }

  // Máy lưng / ngực / chân
  eqm.add('lat_pulldown', -18.2, -7.4, 0);
  eqm.add('seated_row', -11.5, -7.9, 0);
  eqm.add('chest_press', -15, -1.5, 0);
  eqm.add('pec_deck', -11.5, -1.5, 0);
  eqm.add('leg_press', -15, 3.6, 0);
  eqm.add('leg_extension', -11.5, 3.8, 0);
  // Máy tay
  eqm.add('bicep_machine', -5.5, -7.3, 0);
  eqm.add('tricep_machine', -2, -7.0, 0);

  // Khu tạ đơn: kệ tạ + gương + 2 ghế
  const rackX = 9.3;
  R.add(box(0.7, 0.08, 4.5, mat(C.metal, { metal: 0.6, rough: 0.35 }), rackX, 0.5, 4.2));
  R.add(box(0.7, 0.08, 4.5, mat(C.metal, { metal: 0.6, rough: 0.35 }), rackX, 0.9, 4.2));
  for (const z of [2.05, 6.35]) R.add(box(0.7, 1, 0.08, mat(C.metal, { metal: 0.6 }), rackX, 0.5, z));
  const dbColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'];
  for (let i = 0; i < 6; i++) {
    dumbbellPair(R, rackX - 0.12, 0.6, 2.5 + i * 0.68, dbColors[i], 1 + i * 0.12);
    dumbbellPair(R, rackX + 0.15, 1.0, 2.5 + i * 0.68, dbColors[5 - i], 0.9 + i * 0.1);
  }
  col(rackX, 4.2, 0.75, 4.5);
  // gương tường Đông
  R.add(box(0.04, 2.2, 5.6, mat('#d6ecff', { rough: 0.05, metal: 0.95 }), 9.83, 1.5, 4.6, { cast: false }));
  eqm.add('dumbbell_bench', 6.2, 3.0, HALF_PI);
  eqm.add('dumbbell_bench', 6.2, 5.6, HALF_PI);

  // Khu kettlebell & đĩa tạ trang trí
  for (let i = 0; i < 5; i++) {
    const x = 4.2 + i * 0.5;
    R.add(sphere(0.12 + i * 0.015, mat('#1f2937', { rough: 0.5 }), x, 0.14, 6.9, 10));
    const handle = torus(0.06, 0.018, mat('#1f2937'), Math.PI, 10);
    handle.position.set(x, 0.26 + i * 0.015, 6.9);
    R.add(handle);
  }
  col(5.2, 6.9, 2.6, 0.5);
  const plateTree = new THREE.Group();
  plateTree.position.set(-5.5, 0, 6.8);
  plateTree.add(cyl(0.04, 0.04, 1.2, mat(C.metal, { metal: 0.7 }), 0, 0.6, 0, 8));
  plateTree.add(box(0.6, 0.05, 0.6, mat(C.metal), 0, 0.03, 0));
  for (let i = 0; i < 4; i++) {
    const p = cyl(0.25 - i * 0.03, 0.25 - i * 0.03, 0.05, mat('#111827'), 0, 0.3 + i * 0.22, 0.08, 18);
    p.rotation.x = HALF_PI;
    plateTree.add(p);
  }
  R.add(plateTree);
  col(-5.5, 6.8, 0.6, 0.6);

  // Bình nước + kệ khăn ở giữa khu
  R.add(box(0.4, 1, 0.4, mat('#f1f5f9'), -7.5, 0.5, 7.5));
  R.add(cyl(0.16, 0.16, 0.45, mat('#7dd3fc', { transparent: true, opacity: 0.7 }), -7.5, 1.23, 7.5, 12));
  col(-7.5, 7.5, 0.45, 0.45);
  R.add(box(1.2, 1.1, 0.4, mat('#e2e8f0'), 8.8, 0.55, -8.5));
  for (let i = 0; i < 4; i++) R.add(box(0.25, 0.12, 0.3, mat(['#f472b6', '#22d3ee', '#a3e635', '#facc15'][i]), 8.4 + i * 0.27, 1.17, -8.5));
  col(8.8, -8.5, 1.2, 0.4);

  plant(R, col, -23.2, 7.2);
  plant(R, col, 9.2, 7.3);

  // Poster động lực
  poster(R, -20.5, 2.4, -9.83, 0, ['NO PAIN', 'NO GAIN'], '#ff5d7a', 2.4, 1);
  poster(R, -23.83, 2.9, -8.4, HALF_PI, ['CARDIO', 'Đốt mỡ thừa'], '#22d3ee', 1.6, 0.7);
  poster(R, 9.83, 2.5, -5, -HALF_PI, ['TAY TO', 'Arms Day'], '#fcc419', 2.2, 1);
  poster(R, -5.5, 2.4, 7.83, Math.PI, ['LEG DAY', 'Đừng bỏ ngày chân!'], '#51cf66', 2.4, 1);
}

// ---------- PHÒNG AEROBIC ----------
function buildAerobic(scene, R, col, eqm) {
  // Sân khấu huấn luyện viên
  R.add(box(4.5, 0.25, 1.8, mat('#1e1b4b', { rough: 0.5 }), -15, 0.125, -22.6));
  R.add(box(4.6, 0.04, 1.9, mat('#f472b6', { emissive: '#f472b6', emissiveIntensity: 1.2 }), -15, 0.26, -22.6, { cast: false }));
  col(-15, -22.6, 4.5, 1.8);

  // Gương lớn (Reflector khi đồ họa cao, mặt bóng khi thấp)
  const mirrorW = 16.5;
  const mirrorH = 2.6;
  const frame = box(mirrorW + 0.2, mirrorH + 0.2, 0.05, mat('#475569'), -15, 1.75, -23.82, { cast: false });
  R.add(frame);
  const fallback = new THREE.Mesh(
    new THREE.PlaneGeometry(mirrorW, mirrorH),
    new THREE.MeshStandardMaterial({ color: '#dbeafe', roughness: 0.05, metalness: 0.95 })
  );
  fallback.position.set(-15, 1.75, -23.78);
  fallback.userData.dynamic = true;
  scene.add(fallback);
  let reflector = null;
  const applyMirror = () => {
    const want = quality().mirror;
    if (want && !reflector) {
      const pr = Math.min(window.devicePixelRatio, 1.5);
      reflector = new Reflector(new THREE.PlaneGeometry(mirrorW, mirrorH), {
        textureWidth: Math.floor(window.innerWidth * pr * 0.6),
        textureHeight: Math.floor(window.innerHeight * pr * 0.6),
        color: 0xc8d2e0,
      });
      reflector.position.set(-15, 1.75, -23.77);
      scene.add(reflector);
    }
    if (reflector) reflector.visible = want;
    fallback.visible = !want;
  };
  applyMirror();
  onSettingsChange((_s, p) => 'quality' in p && applyMirror());

  // Loa có màng rung theo nhịp
  const cones = [];
  for (const x of [-23.2, -6.8]) {
    R.add(box(0.8, 1.6, 0.6, mat('#111827', { rough: 0.6 }), x, 0.8, -22.9));
    col(x, -22.9, 0.8, 0.6);
    for (const y of [0.5, 1.15]) {
      const cone = cyl(0.2, 0.25, 0.06, mat('#374151', { rough: 0.4 }), x, y, -22.58, 16);
      cone.rotation.x = HALF_PI;
      cone.userData.dynamic = true;
      scene.add(cone);
      cones.push(cone);
    }
  }

  // Quả cầu disco
  const disco = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.45, 1),
    new THREE.MeshStandardMaterial({ color: '#e5e7eb', metalness: 1, roughness: 0.15, flatShading: true, emissive: '#555', emissiveIntensity: 0.4 })
  );
  disco.position.set(-15, 3.4, -17);
  scene.add(disco);
  scene.add(bar([-15, 4, -17], [-15, 3.8, -17], 0.01, mat('#94a3b8')));

  // Dải LED sàn đổi màu theo nhịp
  const ledMat = new THREE.MeshStandardMaterial({ color: '#f472b6', emissive: '#f472b6', emissiveIntensity: 1 });
  for (const z of [-10.4, -23.6]) {
    const led = new THREE.Mesh(new THREE.BoxGeometry(17.4, 0.03, 0.08), ledMat);
    led.position.set(-15, 0.02, z);
    scene.add(led);
  }

  // 6 vị trí nhảy (nhìn về gương, hướng -Z)
  for (const z of [-19.5, -15.5]) for (const x of [-19.5, -15, -10.5]) eqm.add('aerobic_spot', x, z, Math.PI);

  // Kệ step + bình nước
  for (let i = 0; i < 4; i++) {
    R.add(box(0.9, 0.15, 0.4, mat(i % 2 ? '#f472b6' : '#a78bfa', { rough: 0.6 }), -23.3, 0.08 + i * 0.16, -12 - 0 * i));
  }
  col(-23.3, -12, 0.9, 0.4);
  poster(R, -6.17, 2.6, -13.5, -HALF_PI, ['AEROBIC', 'Mỗi ngày 18:00'], '#f472b6', 2.2, 1);

  const colors = ['#f472b6', '#22d3ee', '#a3e635', '#facc15', '#a78bfa'].map((c) => new THREE.Color(c));
  return (dt) => {
    const beat = audio.getBeat();
    const pulse = Math.pow(1 - (beat % 1), 3);
    disco.rotation.y += dt * 0.8;
    for (const c of cones) c.scale.set(1 + pulse * 0.15, 1, 1 + pulse * 0.15);
    const idx = Math.abs(Math.floor(beat / 4)) % colors.length;
    ledMat.emissive.lerp(colors[idx], 0.1);
    ledMat.color.copy(ledMat.emissive);
    ledMat.emissiveIntensity = 0.6 + pulse * 1.4;
  };
}

// ---------- KHU TẬP TỰ DO ----------
function buildFreeArea(R, col, eqm) {
  eqm.add('pullup_bar', -3.5, -22.6, 0);
  eqm.add('pullup_bar', -0.5, -22.6, 0);
  eqm.add('battle_rope', 5, -16.4, Math.PI);
  eqm.add('yoga_mat', -3.6, -14.2, Math.PI, { color: '#c084fc' });
  eqm.add('yoga_mat', -2.4, -14.2, Math.PI, { color: '#f472b6' });
  eqm.add('yoga_mat', -1.2, -14.2, Math.PI, { color: '#34d399' });
  eqm.add('medicine_ball', 8.3, -22.2, Math.PI);
  eqm.add('medicine_ball', 8.3, -12.8, 0);

  // Kệ bóng tạ
  R.add(box(0.5, 1.2, 1.6, mat(C.metal, { metal: 0.5 }), 9.45, 0.6, -17.5));
  const ballColors = ['#ef4444', '#3b82f6', '#22c55e', '#eab308'];
  for (let i = 0; i < 4; i++) R.add(sphere(0.16, mat(ballColors[i], { rough: 0.6 }), 9.25, 0.35 + (i % 2) * 0.5, -18 + Math.floor(i / 2) * 0.9, 12));
  col(9.45, -17.5, 0.55, 1.6);

  // Bóng tập lớn (gym ball)
  for (const [x, z, c] of [[-5.2, -11, '#f472b6'], [-4.2, -11.2, '#22d3ee'], [-5.2, -12, '#a3e635']]) {
    R.add(sphere(0.35, mat(c, { rough: 0.35 }), x, 0.35, z, 16));
    col(x, z, 0.6, 0.6);
  }
  // Hộp nhảy (plyo box)
  for (const [x, h, c] of [[1.5, 0.4, '#334155'], [2.4, 0.6, '#1e293b'], [3.3, 0.8, '#0f172a']]) {
    R.add(box(0.7, h, 0.6, mat(c, { rough: 0.6 }), x, h / 2, -23.3));
    R.add(box(0.72, 0.03, 0.62, mat('#60a5fa', { emissive: '#60a5fa', emissiveIntensity: 0.5 }), x, h + 0.01, -23.3, { cast: false }));
  }
  col(2.4, -23.3, 2.7, 0.6);
  // Con lăn foam + kettlebell
  for (let i = 0; i < 3; i++) {
    const r = cyl(0.08, 0.08, 0.6, mat(['#f97316', '#22d3ee', '#a78bfa'][i], { rough: 0.9 }), 8.6, 0.08 + i * 0.16, -10.9, 12);
    r.rotation.z = HALF_PI;
    R.add(r);
  }
  col(8.6, -10.9, 0.7, 0.4);
  poster(R, 9.83, 2.6, -20.5, -HALF_PI, ['FUNCTIONAL', 'Xà đơn – Dây – Bóng'], '#60a5fa', 2.4, 1);
}

// ---------- PHÒNG THAY ĐỒ ----------
function buildLockerRoom(R, col, eqm) {
  const colors = ['#14b8a6', '#0d9488'];
  // Dãy tủ dọc tường Đông (mặt tủ nhìn về -X)
  const interactiveEast = new Set([2, 9]);
  for (let i = 0; i < 16; i++) {
    const z = -8.6 + i * 0.62;
    if (interactiveEast.has(i)) {
      eqm.add('locker', 23.55 - 0.6, z, HALF_PI, { color: '#f59e0b' });
      continue;
    }
    const g = new THREE.Group();
    g.position.set(23.55, 0, z);
    g.rotation.y = HALF_PI;
    buildLockerColumn(g, colors[i % 2]);
    R.add(g);
  }
  col(23.55, -8.6 + 7.5 * 0.62, 0.5, 16 * 0.62);

  // Dãy tủ dọc tường Bắc (mặt tủ nhìn về +Z), chừa cửa xông hơi
  const northXs = [];
  for (let x = 10.8; x <= 15.4; x += 0.62) northXs.push(x);
  for (let x = 18.6; x <= 22.9; x += 0.62) northXs.push(x);
  northXs.forEach((x, i) => {
    if (i === 3 || i === 10) {
      eqm.add('locker', x, -9.55 + 0.6, Math.PI, { color: '#f59e0b' });
      return;
    }
    const g = new THREE.Group();
    g.position.set(x, 0, -9.55);
    g.rotation.y = Math.PI;
    buildLockerColumn(g, colors[i % 2]);
    R.add(g);
  });
  col(13.1, -9.55, 5.3, 0.5);
  col(20.75, -9.55, 4.9, 0.5);

  // Ghế băng dài
  bench(R, col, 19.6, -4, 4.5, false, '#a16207');
  bench(R, col, 19.6, 3, 4.5, false, '#a16207');
  bench(R, col, 14.5, 4.5, 3, false, '#a16207');

  // Bàn trang điểm + gương tường Tây
  R.add(box(0.5, 0.08, 3, mat('#f8fafc', { rough: 0.3 }), 10.45, 0.85, 4.5));
  R.add(box(0.04, 1.1, 3, mat('#d6ecff', { rough: 0.05, metal: 0.95 }), 10.17, 1.6, 4.5, { cast: false }));
  for (const z of [3.4, 4.5, 5.6]) R.add(sphere(0.06, mat('#fff7cc', { emissive: '#fff7cc', emissiveIntensity: 1.5 }), 10.2, 2.25, z, 8));
  col(10.45, 4.5, 0.5, 3);
  // Kệ khăn
  R.add(box(1.4, 1.4, 0.45, mat('#e2e8f0'), 12, 0.7, 7.55));
  for (let i = 0; i < 6; i++) R.add(box(0.36, 0.14, 0.38, mat(['#f9a8d4', '#99f6e4', '#fde68a'][i % 3]), 11.6 + (i % 3) * 0.4, 0.55 + Math.floor(i / 3) * 0.5, 7.5));
  col(12, 7.55, 1.4, 0.45);
  plant(R, col, 23.2, 7.3);
  poster(R, 15, 2.6, 7.83, Math.PI, ['PHÒNG THAY ĐỒ', 'Mở tủ để đổi trang phục'], '#2dd4bf', 2.6, 0.9);
}

// ---------- PHÒNG XÔNG HƠI ----------
function buildSauna(scene, R, col, eqm) {
  const wood = new THREE.MeshStandardMaterial({ map: textures.wood('#b07a48', '#7a4b26'), roughness: 0.85 });
  wood.map.repeat.set(4, 1.5);
  const woodSeat = mat('#c48a52', { rough: 0.8 });
  // Ốp gỗ tường trong
  const panels = [
    [17, -23.82, 13.6, 0.04, 0],
    [13.05, -10.18, 5.9, 0.04, 0],
    [20.95, -10.18, 5.9, 0.04, 0],
    [10.18, -17, 0.04, 13.6, 0],
    [23.82, -17, 0.04, 13.6, 0],
  ];
  for (const [x, z, w, d] of panels) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 3.9, d), wood);
    m.position.set(x, 1.95, z);
    m.receiveShadow = true;
    m.userData.noBake = true;
    R.add(m);
  }
  // Bậc ghế 2 tầng
  R.add(box(12, 0.08, 0.7, woodSeat, 17, 0.41, -21.0));
  R.add(box(12, 0.37, 0.05, woodSeat, 17, 0.19, -20.67));
  R.add(box(12, 0.08, 1.4, woodSeat, 17, 0.81, -22.6));
  R.add(box(12, 0.77, 0.05, woodSeat, 17, 0.39, -21.92));
  R.add(box(12, 0.9, 0.05, woodSeat, 17, 1.3, -23.75));
  col(17, -21.0, 12, 0.7);
  col(17, -22.85, 12, 1.9);

  // Lò xông đá
  const stove = new THREE.Group();
  stove.position.set(22.6, 0, -12);
  stove.add(box(0.9, 0.8, 0.9, mat('#1f2937', { rough: 0.5, metal: 0.4 }), 0, 0.4, 0));
  stove.add(box(0.95, 0.1, 0.95, mat('#ff6b1a', { emissive: '#ff5a00', emissiveIntensity: 1.2 }), 0, 0.82, 0, { cast: false }));
  for (let i = 0; i < 12; i++) {
    stove.add(sphere(0.1 + Math.random() * 0.05, mat('#6b7280', { rough: 0.9, flat: true }), (Math.random() - 0.5) * 0.6, 0.92 + Math.random() * 0.1, (Math.random() - 0.5) * 0.6, 6));
  }
  stove.add(box(1.2, 0.9, 0.04, mat('#a16207'), 0, 0.45, -0.62));
  R.add(stove);
  col(22.6, -12, 1.1, 1.1);
  // Xô + gáo
  R.add(cyl(0.18, 0.14, 0.3, woodSeat, 21.5, 0.15, -11, 12));
  R.add(bar([21.5, 0.3, -11], [21.3, 0.6, -11.2], 0.015, woodSeat));
  col(21.5, -11, 0.4, 0.4);
  // Nhiệt kế treo tường
  R.add(box(0.25, 0.6, 0.04, mat('#fef3c7'), 10.25, 1.8, -14, { cast: false }));
  R.add(box(0.05, 0.42, 0.05, mat('#ef4444', { emissive: '#ef4444', emissiveIntensity: 0.6 }), 10.27, 1.78, -14, { cast: false }));
  // Đèn ấm
  for (const x of [13, 17, 21]) R.add(sphere(0.12, mat('#ffcf8a', { emissive: '#ff9f43', emissiveIntensity: 2 }), x, 3.6, -16, 8));

  // Ghế xông hơi: 4 ghế tầng dưới + 4 ghế tầng trên
  for (const x of [12, 14.5, 19.5, 22]) eqm.add('sauna_seat', x, -20.95, 0, { top: 0.45, exitZ: 0.9 });
  for (const x of [13.25, 15.75, 18.25, 20.75]) eqm.add('sauna_seat', x, -22.7, 0, { top: 0.85, exitZ: 2.6 });

  // Hơi nước
  const steam = new SteamSystem({
    bounds: { x1: 10.5, x2: 23.5, z1: -23.5, z2: -10.5, h: 3.8 },
    count: quality().particles,
    source: new THREE.Vector3(22.6, 1, -12),
    opacity: 0.16,
    size: 1.1,
  });
  scene.add(steam.points);
  onSettingsChange((_s, p) => 'quality' in p && steam.setCount(quality().particles));

  return (dt, t) => steam.update(dt, t);
}

// ---------- TOILET ----------
function buildToilets(R, col, eqm) {
  const partition = mat('#cbd5e1', { rough: 0.5 });
  const configs = [
    { x1: -24, x2: -16, accent: '#3b82f6', sinkX: -23.85 + 0.66, sinkRy: -HALF_PI, sinkWallX: -23.85, label: 'NAM', urinal: true },
    { x1: -16, x2: -8, accent: '#ec4899', sinkX: -8.15 - 0.66, sinkRy: HALF_PI, sinkWallX: -8.15, label: 'NỮ', urinal: false },
  ];
  for (const c of configs) {
    const cx = (c.x1 + c.x2) / 2;
    // 2 buồng vệ sinh sát tường Nam (z=20)
    const stallXs = [cx - 1.4, cx + 1.4];
    for (const sx of stallXs) {
      eqm.add('toilet', sx, 19.3, Math.PI);
      // vách ngăn
      for (const s of [-1, 1]) {
        R.add(box(0.06, 2, 1.9, partition, sx + s * 0.85, 1.05, 18.9));
        col(sx + s * 0.85, 18.9, 0.08, 1.9);
      }
      R.add(box(1.7, 0.05, 0.05, mat(c.accent), sx, 2.05, 17.95));
      // giấy vệ sinh
      const roll = cyl(0.06, 0.06, 0.1, mat('#ffffff'), sx + 0.55, 0.8, 19.4, 10);
      roll.rotation.z = HALF_PI;
      R.add(roll);
    }
    // Bồn rửa tay + máy sấy
    for (const z of [10.8, 12.4]) eqm.add('sink', c.sinkX, z, c.sinkRy);
    const dryerX = c.sinkWallX + (c.sinkRy > 0 ? -0.12 : 0.12);
    R.add(box(0.2, 0.35, 0.3, mat('#e5e7eb', { metal: 0.4 }), dryerX, 1.3, 14));
    // thùng rác
    R.add(cyl(0.18, 0.15, 0.45, mat('#64748b'), c.sinkX, 0.22, 14.9, 12));
    col(c.sinkX, 14.9, 0.4, 0.4);
    if (c.urinal) {
      for (const z of [16, 17]) {
        R.add(box(0.3, 0.5, 0.3, mat('#ffffff', { rough: 0.2 }), c.x2 - 0.32, 0.85, z));
        col(c.x2 - 0.32, z, 0.35, 0.3);
      }
    } else {
      plant(R, col, c.x2 - 0.5, 16.5, 0.8);
    }
    poster(R, cx, 2.8, 8.17, 0, [`WC ${c.label}`, 'Giữ vệ sinh chung'], c.accent, 2, 0.7);
  }
}
