import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { box, cyl, sphere, bar, torus } from './helpers.js';
import { mat, C, textures, textTexture, normalMapFrom } from './materials.js';
import { SteamSystem } from './effects.js';
import { plant, tree, chairRow, lockerRow, dumbbellRack, bench, poster, mirror, sofa, counterDesk, waterCooler, neonRing, tpl } from './decor.js';
import { NPCs } from '../character/npcs.js';
import { quality, onSettingsChange } from '../core/settings.js';
import { audio } from '../core/audio.js';
import { BOXING_RING } from '@shared/constants.js';

/**
 * Định nghĩa 5 tầng của tòa nhà (mặt bằng 58m x 42m mỗi tầng):
 *   B1 Spa & bể bơi | 1 Sảnh + Cardio | 2 Strength | 3 Studio + Võ thuật | R Sân thượng
 * Phòng có `walls: true` sẽ được sinh tường tự động; cửa nằm trên cạnh phòng.
 * Sảnh thang máy (x 24..40, z -10..10) giống nhau mọi tầng, dựng trong Floor.buildTransit.
 */
const HALF_PI = Math.PI / 2;
const TRANSIT = { id: 'transit', name: 'Sảnh thang máy', icon: '🛗', x1: 24, x2: 40, z1: -10, z2: 10, floor: 'darkTile', map: '#334155' };

// Đặt 1 hàng thiết bị
function row(ctx, type, x0, z, dx, n, ry = 0, opts) {
  for (let i = 0; i < n; i++) ctx.add(type, x0 + i * dx, z, ry, opts);
}
function list(ctx, types, x0, z, dx, ry = 0) {
  types.forEach((t, i) => t && ctx.add(t, x0 + i * dx, z, ry));
}

// ============================ TẦNG 1 ============================
const FLOOR1 = {
  id: 1,
  wallColor: '#d9dce1',
  dadoColor: '#2a2e35',
  ceiling: '#44474d',
  ducts: true,
  fog: '#8f959e',
  hallName: 'Lối đi',
  baseFloor: 'lobby',
  outerDoors: [{ side: 's', c: 0, w: 4, type: 'sliding' }],
  rooms: [
    { id: 'shop', name: 'Cửa hàng Whey', icon: '🛒', x1: -18, x2: -9, z1: 12, z2: 21, walls: true, floor: 'darkTile', map: '#0f172a' },
    { id: 'lobby', name: 'Sảnh lớn / Lễ tân', icon: '🏠', x1: -9, x2: 24, z1: 12, z2: 21, floor: 'lobby', map: '#334155' },
    { id: 'juice', name: 'Juice Bar', icon: '🧃', x1: 24, x2: 40, z1: 12, z2: 21, floor: 'wood', map: '#9a3412' },
    { id: 'cardio', name: 'Khu Cardio', icon: '🏃', x1: -18, x2: 24, z1: -21, z2: 12, floor: 'rubber', map: '#1e293b' },
    TRANSIT,
    { id: 'lounge', name: 'Góc nghỉ', icon: '🛋️', x1: 24, x2: 40, z1: -21, z2: -10, floor: 'carpetBlue', map: '#0c4a6e' },
  ],
  doors: [{ x: -9, z: 16.5, w: 3, type: 'double', color: '#22d3ee' }],
  signs: [{ x: -9, z: 16.5, ry: HALF_PI, text: 'CỬA HÀNG WHEY', sub: 'Supplement Shop', color: '#22d3ee', back: 'SẢNH LỚN' }],
  build(ctx) {
    const S = ctx.S;
    // ----- Sảnh -----
    counterDesk(ctx, 1.25, 15, 6, true);
    S.add(box(0.5, 0.35, 0.05, mat('#111827'), -0.25, 1.35, 14.7));
    poster(ctx, -8.83, 2.5, 13.5, HALF_PI, ['GYM ONLINE', '5 tầng – Tập cùng 1000 người'], '#22d3ee', 2.8, 0.9);
    poster(ctx, 0, 3.0, 20.83, Math.PI, ['CHÀO MỪNG!', 'Thang máy ➜ tầng 2, 3, sân thượng'], '#a78bfa', 5, 1.2);
    ctx.add('inbody', 11, 16, Math.PI);
    ctx.add('inbody', 13.5, 16, Math.PI);
    poster(ctx, 12.25, 2.4, 17.6, 0, ['CÂN INBODY', 'Đo chỉ số cơ thể'], '#22d3ee', 3, 0.8).position.y = 2.6;
    sofa(ctx, 15.9, 19.6, 0);
    sofa(ctx, 20, 19.6, 0, '#be185d');
    ctx.S.add(box(1.6, 0.06, 0.8, mat('#f1f5f9', { rough: 0.2 }), 18, 0.45, 17.8));
    ctx.col(18, 17.8, 1.6, 0.8);
    for (const [x, z] of [[-8, 20], [-8, 13], [22.5, 13], [4, 20], [-4, 20]]) plant(ctx, x, z);
    // ----- Cửa hàng Whey -----
    ctx.add('shop_whey', -13.5, 16.5, -HALF_PI);
    poster(ctx, -17.83, 2.8, 16, HALF_PI, ['WHEY SHOP', 'Whey • Sinh tố • Phụ kiện'], '#22d3ee', 4, 1.1);
    for (let i = 0; i < 2; i++) {
      S.add(box(1.4, 1.6, 0.5, mat('#334155'), -16.5 + i * 2.6, 0.8, 12.6));
      for (let j = 0; j < 6; j++) S.add(cyl(0.07, 0.07, 0.2, mat(['#ef4444', '#22d3ee', '#a3e635', '#facc15'][j % 4]), -17 + i * 2.6 + (j % 3) * 0.45, 0.6 + Math.floor(j / 3) * 0.5, 12.85, 8));
    }
    ctx.col(-15.2, 12.6, 4.8, 0.5);
    // ----- Juice bar -----
    ctx.add('juice_bar', 32, 17.5, HALF_PI);
    for (const x of [27, 29.5]) for (const z of [13.5, 16]) {
      S.add(cyl(0.5, 0.5, 0.05, mat('#fef3c7'), x, 0.75, z, 16));
      S.add(cyl(0.05, 0.05, 0.75, mat(C.metal), x, 0.37, z, 8));
      ctx.col(x, z, 0.8, 0.8);
    }
    poster(ctx, 39.83, 2.8, 17.5, -HALF_PI, ['JUICE BAR', 'Nước ép – Sinh tố – Năng lượng'], '#f97316', 4, 1.1);
    // ----- Khu cardio -----
    row(ctx, 'treadmill', -15.6, -18.75, 1.8, 9, Math.PI);
    row(ctx, 'treadmill', -15.6, -15, 1.8, 9, Math.PI);
    row(ctx, 'treadmill', 3, -18.75, 1.8, 8, Math.PI);
    row(ctx, 'elliptical', -15.6, -10.75, 2.1, 4, Math.PI);
    row(ctx, 'stair_climber', -6.5, -10.75, 1.95, 4, Math.PI);
    row(ctx, 'ski_erg', 3, -10.75, 1.95, 4, Math.PI);
    row(ctx, 'upright_bike', -15.6, -6, 1.6, 5, Math.PI);
    row(ctx, 'recumbent_bike', -6.5, -6, 1.8, 4, Math.PI);
    row(ctx, 'assault_bike', 1.5, -6, 1.95, 4, Math.PI);
    row(ctx, 'rowing_machine', -15.6, -1, 2.1, 4, Math.PI);
    row(ctx, 'upright_bike', -6.5, -1, 1.6, 4, Math.PI);
    row(ctx, 'elliptical', 1.25, -1, 2.1, 4, Math.PI);
    for (const x of [-7, 3, 13]) poster(ctx, x, 2.6, -20.83, 0, ['CARDIO ZONE', 'Đốt mỡ – Tăng sức bền'], '#22d3ee', 3.2, 1);
    waterCooler(ctx, 22.8, -19.8);
    waterCooler(ctx, -17.2, 6);
    // ----- Góc nghỉ -----
    sofa(ctx, 31, -19.6, 0, '#0e7490');
    sofa(ctx, 31, -12, Math.PI, '#0e7490');
    plant(ctx, 26, -15.5);
    plant(ctx, 38.5, -15.5);
    // ----- Sân trước (ngoài tòa nhà) -----
    buildPlaza(ctx);
  },
  npcs: (floor) =>
    new NPCs(floor.group, [
      {
        name: 'Lễ tân Mai',
        pos: [1.25, 0, 16.2],
        ry: 0,
        anim: 'idle',
        greet: { emote: 'wave', text: 'Chào mừng tới Gym Online! Thang máy ở phía Đông, bấm M để xem bản đồ 🗺️', radius: 5 },
        app: { displayName: 'Lễ tân Mai', gender: 'female', skinColor: '#f8d3b0', hair: { style: 'ponytail', color: '#3b2a20' }, outfit: { style: 'tshirt', top: '#22d3ee', bottom: '#0f172a', shoes: '#ffffff' } },
      },
      {
        name: 'Chủ shop Tuấn',
        pos: [-14.9, 0, 16.5],
        ry: HALF_PI,
        anim: 'idle',
        greet: { emote: 'flex', text: 'Whey xịn đây! Uống vào tập nhanh lên level 🥤', radius: 4 },
        app: { displayName: 'Chủ shop', gender: 'male', skinColor: '#c98e62', hair: { style: 'spiky', color: '#1f1a17' }, outfit: { style: 'tank', top: '#ef4444', bottom: '#111827', shoes: '#f8fafc' } },
      },
    ]),
};

function buildPlaza(ctx) {
  const S = ctx.S;
  const grassTex = textures.grass();
  grassTex.repeat.set(40, 40);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }));
  ground.rotation.x = -HALF_PI;
  ground.position.y = -0.03;
  ground.receiveShadow = true;
  ground.userData.noBake = true;
  ctx.floor.shell.add(ground);
  const plazaTex = textures.tile('#d6d3d1', '#a8a29e', 2);
  plazaTex.repeat.set(14, 5);
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(30, 10), new THREE.MeshStandardMaterial({ map: plazaTex, roughness: 0.9 }));
  plaza.rotation.x = -HALF_PI;
  plaza.position.set(0, -0.01, 26);
  plaza.receiveShadow = true;
  plaza.userData.noBake = true;
  ctx.floor.shell.add(plaza);
  const bushMat = mat('#4ade80', { rough: 0.9, flat: true });
  for (let x = -14.5; x <= 14.5; x += 1.25) S.add(sphere(0.65, bushMat, x, 0.45, 31, 8));
  for (let z = 21.8; z <= 31; z += 1.25) {
    S.add(sphere(0.65, bushMat, -15, 0.45, z, 8));
    S.add(sphere(0.65, bushMat, 15, 0.45, z, 8));
  }
  ctx.collision.addBox(-16, 16, 30.6, 32, 'fence');
  ctx.collision.addBox(-16, -14.4, 21, 32, 'fence');
  ctx.collision.addBox(14.4, 16, 21, 32, 'fence');
  for (const [x, z] of [[-10, 24.5], [10, 24.5], [-10, 29], [10, 29]]) tree(ctx, x, z);
  for (const [x, z] of [[-30, 42], [30, 45], [-40, 0], [50, 10], [0, 55], [-38, -34], [45, -34]]) ctx.inst.add(tpl().tree, x, 0, z, 0, 1.4);
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.2), new THREE.MeshBasicMaterial({ map: textTexture(['GYM ONLINE', 'Tòa nhà 5 tầng'], { w: 1024, h: 176, size: 96 }) }));
  logo.position.set(0, 3.3, 21.17);
  logo.userData.noBake = true;
  S.add(logo);
}

// ============================ TẦNG 2 ============================
const FLOOR2 = {
  id: 2,
  wallColor: '#6d727c',
  dadoColor: '#25282e',
  ceiling: '#484b52',
  ducts: true,
  fog: '#3c4047',
  baseFloor: 'rubber',
  rooms: [
    { id: 'freeweights', name: 'Khu tạ tự do', icon: '🏋️', x1: -18, x2: 1, z1: 10, z2: 21, floor: 'rubber', map: '#1e293b' },
    { id: 'power', name: 'Khu Power Rack', icon: '🦍', x1: 1, x2: 24, z1: 10, z2: 21, floor: 'concrete', map: '#3f3f46' },
    { id: 'machines', name: 'Khu máy tập', icon: '⚙️', x1: -18, x2: 24, z1: -21, z2: 10, floor: 'rubber', map: '#1e293b' },
    TRANSIT,
    { id: 'stretch', name: 'Khu giãn cơ', icon: '🧘', x1: 24, x2: 40, z1: -21, z2: -10, floor: 'mats', map: '#1e3a8a' },
    { id: 'lounge2', name: 'Góc nghỉ', icon: '🥤', x1: 24, x2: 40, z1: 10, z2: 21, floor: 'carpetBlue', map: '#0c4a6e' },
  ],
  build(ctx) {
    // ----- Tạ tự do -----
    for (const x of [-14.5, -9.5, -4.5]) dumbbellRack(ctx, x, 20.2, 4.5, 0);
    mirror(ctx, -8.5, 1.9, 20.8, 0, 18, 2.4);
    row(ctx, 'dumbbell_bench', -16, 17, 3.25, 4, 0);
    list(ctx, ['bench_flat', 'bench_incline', 'bench_decline'], -16, 13, 3.4);
    ctx.add('preacher_curl', -5.5, 13, 0);
    ctx.add('ez_barbell', -1.5, 17, 0);
    // ----- Power -----
    list(ctx, ['power_rack', 'power_rack'], 4.5, 17.5, 4.5);
    list(ctx, ['smith_machine'], 4.5, 12.8, 4.5);
    ctx.add('trap_bar', 9, 12.6, 0);
    ctx.add('landmine_press', 18.5, 15.5, 0);
    ctx.add('hip_thrust', 14, 17.5, 0);
    for (const x of [1.5, 11.8]) for (let i = 0; i < 4; i++) ctx.inst.add(tpl().plate, x, 0.3 + i * 0.22, 19.9, 0, 1 - i * 0.12);
    poster(ctx, 11, 2.8, 20.83, Math.PI, ['POWER ZONE', 'Squat • Deadlift • Bench'], '#f43f5e', 4, 1.1);
    // ----- Máy tập (lưới) -----
    list(ctx, ['chest_press', 'incline_chest_press', 'pec_deck', 'shoulder_press', 'lateral_raise', 'rear_delt_fly', 'dip_station', 'assisted_pullup', 'pullup_bar'], -15.6, 5, 4);
    list(ctx, ['lat_pulldown', 'seated_row', 'tbar_row', 'hyperextension', 'bicep_machine', 'tricep_machine', 'ab_crunch', 'torso_rotation'], -15.6, -3, 4);
    list(ctx, ['leg_press', 'leg_extension', 'leg_curl_lying', 'leg_curl_seated', 'hack_squat', 'hip_abduction', 'hip_adduction', 'calf_standing', 'calf_seated', 'glute_machine'], -15.6, -10.75, 3.7);
    list(ctx, ['cable_crossover', 'face_pull', 'tricep_pushdown', 'cable_curl'], -14, -15, 6);
    list(ctx, ['chest_press', 'lat_pulldown', 'leg_press', 'shoulder_press', 'seated_row', 'pec_deck', 'leg_extension'], -15.6, -19.2, 4.3);
    for (const [x, t] of [[-7, ['NGỰC & VAI', 'Chest • Shoulders']], [3, ['LƯNG & TAY', 'Back • Arms']], [13, ['CHÂN & MÔNG', 'Legs • Glutes']]]) poster(ctx, x, 2.8, -20.83, 0, t, '#f43f5e', 3.6, 1);
    waterCooler(ctx, 22.5, 8.5);
    // ----- Giãn cơ -----
    row(ctx, 'foam_roller', 26.5, -19, 2.2, 6, 0);
    row(ctx, 'stretch_mat', 26.5, -14, 2.2, 6, 0);
    // ----- Góc nghỉ -----
    sofa(ctx, 31, 19.6, 0, '#0e7490');
    sofa(ctx, 31, 12.5, Math.PI, '#0e7490');
    plant(ctx, 26, 16);
    plant(ctx, 38.5, 16);
  },
  npcs: (floor) =>
    new NPCs(floor.group, [
      {
        name: 'PT Hùng',
        pos: [1.5, 0, 11],
        ry: Math.PI,
        anim: 'idle',
        greet: { emote: 'flex', text: 'Ghế bench có chỗ cho người hỗ trợ (spotter) – rủ bạn tập cùng để nhận bonus EXP! 💪', radius: 5 },
        app: { displayName: 'PT Hùng', gender: 'male', skinColor: '#c98e62', hair: { style: 'short', color: '#1f1a17' }, outfit: { style: 'tank', top: '#f43f5e', bottom: '#111827', shoes: '#f8fafc' } },
      },
    ]),
};

// ============================ TẦNG 3 ============================
const FLOOR3 = {
  id: 3,
  wallColor: '#d4d7de',
  dadoColor: '#3a3f4a',
  ceiling: '#44474d',
  fog: '#8f959e',
  baseFloor: 'lobby',
  windowSkip: [18], // tường sau bục giáo viên Pilates: để trống cho poster
  rooms: [
    { id: 'aerobic', name: 'Studio Aerobic', icon: '💃', x1: -18, x2: -3, z1: 8, z2: 21, walls: true, floor: 'wood', map: '#4c1d95' },
    { id: 'yoga', name: 'Studio Yoga', icon: '🧘', x1: -3, x2: 10, z1: 8, z2: 21, walls: true, floor: 'carpet', map: '#14532d' },
    { id: 'spin', name: 'Studio Spin', icon: '🚴', x1: 10, x2: 24, z1: 8, z2: 21, walls: true, floor: 'darkTile', map: '#7f1d1d' },
    { id: 'boxing', name: 'Võ thuật / Boxing', icon: '🥊', x1: -18, x2: 1, z1: -21, z2: 2, walls: true, floor: 'darkTile', map: '#450a0a' },
    // Pilates đứng trước Functional: 2 vùng chồng nhau thì Pilates được ưu tiên (sàn, bản đồ, tên khu)
    { id: 'pilates', name: 'Studio Pilates', icon: '🤸', x1: 12, x2: 24, z1: -21, z2: -9.5, walls: true, floor: 'wood', map: '#9d174d' },
    { id: 'functional', name: 'Khu Functional', icon: '🔥', x1: 1, x2: 24, z1: -21, z2: 2, floor: 'turf', map: '#14532d' },
    TRANSIT,
  ],
  doors: [
    { x: -10.5, z: 8, w: 3, type: 'double', color: '#f472b6' },
    { x: 3.5, z: 8, w: 2.6, type: 'double', color: '#34d399' },
    { x: 17, z: 8, w: 2.6, type: 'double', color: '#ef4444' },
    { x: -8.5, z: 2, w: 4, type: 'open' },
    { x: 1, z: -11, w: 3, type: 'open' },
    { x: 18, z: -9.5, w: 2.6, type: 'double', color: '#fb7185' },
  ],
  signs: [
    { x: -10.5, z: 8, ry: Math.PI, text: 'STUDIO AEROBIC', sub: 'Lớp nhảy theo nhạc', color: '#f472b6', back: 'HÀNH LANG' },
    { x: 3.5, z: 8, ry: Math.PI, text: 'STUDIO YOGA', sub: 'Thư giãn – Dẻo dai', color: '#34d399', back: 'HÀNH LANG' },
    { x: 17, z: 8, ry: Math.PI, text: 'STUDIO SPIN', sub: 'Đạp xe theo nhạc', color: '#ef4444', back: 'HÀNH LANG' },
    { x: -8.5, z: 2, ry: 0, text: 'BOXING', sub: 'Võ đài • Bao cát', color: '#ef4444', back: 'HÀNH LANG' },
    { x: 18, z: -9.5, ry: 0, text: 'STUDIO PILATES', sub: 'Reformer • Roll-up • Teaser', color: '#fb7185', back: 'KHU FUNCTIONAL' },
  ],
  build(ctx) {
    const S = ctx.S;
    // ----- Aerobic -----
    S.add(box(5, 0.25, 2, mat('#1e1b4b', { rough: 0.5 }), -10.5, 0.125, 18.8));
    S.add(box(5.1, 0.04, 2.1, mat('#f472b6', { emissive: '#f472b6', emissiveIntensity: 1.2 }), -10.5, 0.26, 18.8, { cast: false }));
    ctx.col(-10.5, 18.8, 5, 2);
    for (const z of [11, 13.6, 16.2]) for (const x of [-15, -12, -9, -6]) ctx.add('aerobic_spot', x, z, 0);
    ctx.updaters.push(aerobicMirror(ctx, -10.5, 20.78, 14, Math.PI));
    for (const x of [-17.2, -3.8]) {
      S.add(box(0.8, 1.6, 0.6, mat('#111827', { rough: 0.6 }), x, 0.8, 19.9));
      ctx.col(x, 19.9, 0.8, 0.6);
    }
    ctx.updaters.push(discoBall(ctx, -10.5, 3.4, 14));
    // ----- Yoga -----
    for (const z of [11, 13.9, 16.8]) for (const x of [-1, 2, 5, 8]) ctx.add('yoga_mat', x, z, 0);
    S.add(box(4, 0.15, 2, mat('#14532d', { rough: 0.8 }), 3.5, 0.075, 19.2));
    ctx.col(3.5, 19.2, 4, 2);
    for (const x of [-2.3, 9.3]) plant(ctx, x, 19.9, 1.2);
    poster(ctx, 3.5, 2.9, 20.83, Math.PI, ['NAMASTE 🙏', 'Hít thở – Thư giãn'], '#34d399', 3.4, 1);
    // ----- Spin -----
    for (const z of [11.2, 13.8, 16.4]) for (const x of [12.5, 15.5, 18.5, 21.5]) ctx.add('spin_bike', x, z, 0);
    S.add(box(4, 0.3, 2.2, mat('#450a0a'), 17, 0.15, 19.4));
    ctx.col(17, 19.4, 4, 2.2);
    for (let i = 0; i < 6; i++) S.add(box(0.06, 3.6, 0.06, mat('#ef4444', { emissive: '#ef4444', emissiveIntensity: 1.5 }), 10.5 + i * 2.6, 1.8, 20.8, { cast: false }));
    poster(ctx, 17, 3, 20.83, Math.PI, ['SPIN CLASS', 'Đạp theo nhịp – x30% EXP'], '#ef4444', 3.6, 1);
    // ----- Boxing -----
    buildRing(ctx);
    for (let z = -19.5; z <= -2; z += 3.5) ctx.add('heavy_bag', -15.6, z, -HALF_PI);
    for (const x of [-12, -9.5, -7]) ctx.add('speed_bag', x, -19.6, Math.PI);
    ctx.add('pad_mitts', -2, -18.5, 0);
    ctx.add('pad_mitts', -2, -15, 0);
    chairRow(ctx, -14, -3.5, 6, 0.6, Math.PI);
    poster(ctx, 0.83, 2.8, -17, -HALF_PI, ['FIGHT CLUB', 'Thách đấu Sparring từ menu nhân vật'], '#ef4444', 3.6, 1);
    // ----- Functional -----
    list(ctx, ['sled', 'plyo_box', 'plyo_box'], 3, -19, 3.4);
    list(ctx, ['battle_rope', 'kettlebell', 'kettlebell'], 3, -13.5, 3.4);
    list(ctx, ['slam_ball', 'medicine_ball', 'tire_flip', 'farmers_walk', 'jump_rope', 'jump_rope'], 3, -5.5, 3);
    list(ctx, ['ab_crunch', 'roman_chair', 'torso_rotation', 'trx', 'plank_mat', 'plank_mat'], 3, -0.5, 3);
    poster(ctx, 3, 2.8, -20.83, 0, ['FUNCTIONAL', 'Sled • Kettlebell • Tire • Core'], '#a3e635', 4, 1);
    // ----- Pilates -----
    list(ctx, ['pilates_reformer', 'pilates_reformer', null, 'pilates_reformer', 'pilates_reformer'], 13, -17.4, 2.25);
    list(ctx, ['pilates_mat', 'pilates_mat', 'pilates_mat', 'pilates_mat'], 13, -14.2, 3.2);
    list(ctx, ['pilates_teaser', 'pilates_teaser', null, null, 'pilates_teaser', 'pilates_teaser'], 13, -11.6, 2);
    S.add(box(4, 0.15, 1.6, mat('#7f1d3f', { rough: 0.8 }), 18, 0.075, -20));
    ctx.col(18, -20, 4, 1.6);
    poster(ctx, 18, 2.9, -20.83, 0, ['PILATES', 'Sức mạnh từ trung tâm cơ thể'], '#fb7185', 3.6, 1);
    for (const x of [13, 23]) plant(ctx, x, -20, 1.2);
  },
  npcs: (floor) =>
    new NPCs(floor.group, [
      {
        name: 'HLV Aerobic',
        pos: [-10.5, 0.25, 18.6],
        ry: Math.PI,
        anim: 'aerobic',
        greet: { emote: 'cheer', text: 'Vào lớp nào! Bấm SPACE đúng nhịp để có điểm đồng bộ 💃', radius: 7 },
        app: { displayName: 'HLV Aerobic', gender: 'female', skinColor: '#e8b48a', hair: { style: 'twintails', color: '#e85d75' }, outfit: { style: 'tank', top: '#f472b6', bottom: '#8b5cf6', shoes: '#f8fafc' } },
      },
      {
        name: 'Cô Yoga',
        pos: [3.5, 0.15, 19.2],
        ry: Math.PI,
        anim: 'yogaFlow',
        greet: { emote: 'bow', text: 'Thả lỏng, hít sâu… bấm SPACE theo nhịp thở 🧘', radius: 6 },
        app: { displayName: 'Cô Yoga', gender: 'female', skinColor: '#f5c9a0', hair: { style: 'bun', color: '#3b2a20' }, outfit: { style: 'tank', top: '#34d399', bottom: '#14532d', shoes: '#f8fafc' } },
      },
      {
        name: 'Cô Pilates',
        pos: [18, 0.15, -20],
        ry: 0,
        anim: 'idle',
        greet: { emote: 'wave', text: 'Siết cơ bụng, thở đều và kiểm soát từng động tác nhé 🤸', radius: 6 },
        app: { displayName: 'Cô Pilates', gender: 'female', skinColor: '#f0c8a4', hair: { style: 'bun', color: '#7c2d12' }, outfit: { style: 'tank', top: '#fb7185', bottom: '#4c0519', shoes: '#f8fafc' } },
      },
      {
        name: 'Coach Spin',
        pos: [17, 0.3, 19.2],
        ry: Math.PI,
        anim: 'idle',
        greet: { emote: 'cheer', text: 'Đạp nhanh lên! Giữ nhịp với nhạc nhé 🚴', radius: 6 },
        app: { displayName: 'Coach Spin', gender: 'male', skinColor: '#8d5a3b', hair: { style: 'spiky', color: '#facc15' }, outfit: { style: 'tank', top: '#ef4444', bottom: '#111827', shoes: '#f8fafc' } },
      },
    ]),
};

function buildRing(ctx) {
  const S = ctx.S;
  const R = BOXING_RING;
  const h = 0.6;
  S.add(box(R.size, h, R.size, mat('#1e3a8a', { rough: 0.7 }), R.x, h / 2, R.z));
  S.add(box(R.size - 0.4, 0.04, R.size - 0.4, mat('#e2e8f0', { rough: 0.8 }), R.x, h + 0.02, R.z, { cast: false }));
  const half = R.size / 2 - 0.2;
  const corners = [
    [-half, -half, '#ef4444'],
    [half, -half, '#3b82f6'],
    [half, half, '#ef4444'],
    [-half, half, '#3b82f6'],
  ];
  for (const [dx, dz, c] of corners) S.add(cyl(0.08, 0.08, 1.4, mat(c), R.x + dx, h + 0.7, R.z + dz, 10));
  for (const y of [0.45, 0.85, 1.2]) {
    for (let i = 0; i < 4; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % 4];
      S.add(bar([R.x + a[0], h + y, R.z + a[1]], [R.x + b[0], h + y, R.z + b[1]], 0.02, mat('#f8fafc', { rough: 0.5 })));
    }
  }
  ctx.col(R.x, R.z, R.size, R.size);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.7), new THREE.MeshBasicMaterial({ map: textTexture(['VÕ ĐÀI', 'Sparring 2 người'], { accent: '#ef4444' }) }));
  sign.position.set(R.x, 3.2, R.z - R.size / 2 - 0.2);
  sign.userData.noBake = true;
  S.add(sign);
}

function aerobicMirror(ctx, x, z, w, ry) {
  const H = 2.6;
  ctx.S.add(box(w + 0.2, H + 0.2, 0.05, mat('#475569'), x, 1.75, z + 0.04, { cast: false }));
  const fallback = new THREE.Mesh(new THREE.PlaneGeometry(w, H), new THREE.MeshStandardMaterial({ color: '#dbeafe', roughness: 0.05, metalness: 0.95 }));
  fallback.position.set(x, 1.75, z);
  fallback.rotation.y = ry;
  fallback.userData.dynamic = true;
  ctx.group.add(fallback);
  let reflector = null;
  const wantMirror = () => quality().mirror && ctx.group.visible && ctx.group.position.y === 0 && Math.hypot((ctx.floor.px ?? 999) - x, (ctx.floor.pz ?? 999) - z) < 17;
  const apply = () => {
    const want = wantMirror();
    if (want && !reflector) {
      const pr = Math.min(window.devicePixelRatio, 1.5);
      reflector = new Reflector(new THREE.PlaneGeometry(w, H), {
        textureWidth: Math.floor(window.innerWidth * pr * 0.5),
        textureHeight: Math.floor(window.innerHeight * pr * 0.5),
        color: 0xc8d2e0,
      });
      reflector.position.set(x, 1.75, z - 0.01);
      reflector.rotation.y = ry;
      ctx.group.add(reflector);
    }
    if (reflector) reflector.visible = !!want;
    fallback.visible = !want;
  };
  onSettingsChange((_s, p) => 'quality' in p && apply());
  let last = null;
  return () => {
    const v = wantMirror();
    if (v !== last) {
      last = v;
      apply();
    }
  };
}

function discoBall(ctx, x, y, z) {
  const disco = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.45, 1),
    new THREE.MeshStandardMaterial({ color: '#e5e7eb', metalness: 1, roughness: 0.15, flatShading: true, emissive: '#555', emissiveIntensity: 0.4 })
  );
  disco.position.set(x, y, z);
  ctx.group.add(disco);
  const ledMat = new THREE.MeshStandardMaterial({ color: '#f472b6', emissive: '#f472b6', emissiveIntensity: 1 });
  for (const lz of [8.4, 20.6]) {
    const led = new THREE.Mesh(new THREE.BoxGeometry(14.6, 0.03, 0.08), ledMat);
    led.position.set(-10.5, 0.02, lz);
    ctx.group.add(led);
  }
  const colors = ['#f472b6', '#22d3ee', '#a3e635', '#facc15', '#a78bfa'].map((c) => new THREE.Color(c));
  return (dt) => {
    const beat = audio.getBeat();
    const pulse = Math.pow(1 - (beat % 1), 3);
    disco.rotation.y += dt * 0.8;
    const idx = Math.abs(Math.floor(beat / 4)) % colors.length;
    ledMat.emissive.lerp(colors[idx], 0.1);
    ledMat.color.copy(ledMat.emissive);
    ledMat.emissiveIntensity = 0.6 + pulse * 1.4;
  };
}

// ============================ TẦNG HẦM B1 ============================
const FLOOR0 = {
  id: 0,
  windows: false,
  wallColor: '#ded6c8',
  dadoColor: '#8b7a63',
  ceiling: '#e9e3d8',
  fog: '#b8b0a3',
  baseFloor: 'poolDeck',
  hallName: 'Hành lang Spa',
  holes: [{ x1: -15, x2: 3, z1: -18.5, z2: -6, noEdge: true }],
  envProbe: [-6, 2, -3],
  rooms: [
    { id: 'pool', name: 'Hồ bơi', icon: '🏊', x1: -18, x2: 6, z1: -21, z2: 4, walls: true, floor: 'poolDeck', map: '#0369a1' },
    { id: 'sauna', name: 'Phòng Sauna', icon: '♨️', x1: 6, x2: 15, z1: -21, z2: -11, walls: true, floor: 'sauna', map: '#9a3412' },
    { id: 'steam', name: 'Phòng xông hơi ướt', icon: '🌫️', x1: 15, x2: 22.4, z1: -21, z2: -11, walls: true, floor: 'wcTile', map: '#64748b' },
    { id: 'massage', name: 'Phòng Massage', icon: '💆', x1: 6, x2: 15, z1: -8.5, z2: 4, walls: true, floor: 'wood', map: '#78350f' },
    { id: 'relax', name: 'Phòng thư giãn', icon: '🛋️', x1: 15, x2: 22.4, z1: -8.5, z2: 4, walls: true, floor: 'carpetBlue', map: '#0c4a6e' },
    { id: 'locker_m', name: 'Phòng thay đồ Nam', icon: '🚹', x1: -18, x2: -6, z1: 8.5, z2: 21, walls: true, floor: 'lockerTile', map: '#1d4ed8' },
    { id: 'locker_f', name: 'Phòng thay đồ Nữ', icon: '🚺', x1: -6, x2: 6, z1: 8.5, z2: 21, walls: true, floor: 'lockerTile', map: '#be185d' },
    { id: 'wc_m', name: 'Toilet Nam', icon: '🚻', x1: 6, x2: 15, z1: 13, z2: 21, walls: true, floor: 'wcTile', map: '#1e40af' },
    { id: 'wc_f', name: 'Toilet Nữ', icon: '🚻', x1: 15, x2: 24, z1: 13, z2: 21, walls: true, floor: 'wcTile', map: '#9d174d' },
    TRANSIT,
  ],
  doors: [
    { x: -6, z: 4, w: 4, type: 'open' },
    { x: 10.5, z: -11, w: 1.8, type: 'swing', color: '#8a5a33' },
    { x: 18.7, z: -11, w: 1.8, type: 'swing', color: '#94a3b8' },
    { x: 10.5, z: 4, w: 2, type: 'swing', color: '#a16207' },
    { x: 18.7, z: 4, w: 2, type: 'swing', color: '#0e7490' },
    { x: -12, z: 8.5, w: 2.4, type: 'swing', color: '#3b82f6' },
    { x: 0, z: 8.5, w: 2.4, type: 'swing', color: '#ec4899' },
    { x: 10.5, z: 13, w: 1.8, type: 'swing', color: '#3b82f6' },
    { x: 19.5, z: 13, w: 1.8, type: 'swing', color: '#ec4899' },
  ],
  signs: [
    { x: -6, z: 4, ry: Math.PI, text: 'HỒ BƠI', sub: 'Pool – 6 làn', color: '#38bdf8', back: 'HÀNH LANG' },
    { x: 10.5, z: -11, ry: Math.PI, text: 'SAUNA', sub: '85°C', color: '#fb923c', back: 'HÀNH LANG' },
    { x: 18.7, z: -11, ry: Math.PI, text: 'XÔNG HƠI ƯỚT', sub: 'Steam room', color: '#94a3b8', back: 'HÀNH LANG' },
    { x: 10.5, z: 4, ry: Math.PI, text: 'MASSAGE', sub: '', color: '#f59e0b', back: 'HÀNH LANG' },
    { x: 18.7, z: 4, ry: Math.PI, text: 'THƯ GIÃN', sub: 'Ghế massage', color: '#22d3ee', back: 'HÀNH LANG' },
    { x: -12, z: 8.5, ry: 0, text: 'THAY ĐỒ NAM', sub: '', color: '#3b82f6', back: 'HÀNH LANG' },
    { x: 0, z: 8.5, ry: 0, text: 'THAY ĐỒ NỮ', sub: '', color: '#ec4899', back: 'HÀNH LANG' },
    { x: 10.5, z: 13, ry: 0, text: 'WC NAM', sub: '', color: '#3b82f6' },
    { x: 19.5, z: 13, ry: 0, text: 'WC NỮ', sub: '', color: '#ec4899' },
  ],
  build(ctx) {
    const S = ctx.S;
    buildPool(ctx);
    // ghế nằm 2 bên, chừa lối đi giữa từ cửa xuống hồ
    for (const x of [-15, -12, -9, -3, 0, 3]) {
      ctx.inst.add(tpl().lounger, x, 0, 1.5, Math.PI);
      ctx.col(x, 1.5, 0.8, 1.8);
    }
    S.add(box(0.8, 2.2, 0.8, mat('#f8fafc'), -17, 1.1, -12));
    ctx.col(-17, -12, 0.8, 0.8);
    poster(ctx, -6, 2.9, 3.83, Math.PI, ['HỒ BƠI', 'Đi xuống nước để bơi • Space nổi • C lặn'], '#38bdf8', 3.6, 1);
    // ----- Sauna -----
    const wood = new THREE.MeshStandardMaterial({ map: textures.wood('#b07a48', '#7a4b26'), roughness: 0.85 });
    wood.map.repeat.set(4, 1.5);
    const panel = (x, z, w, d) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 3.9, d), wood);
      m.position.set(x, 1.95, z);
      m.receiveShadow = true;
      m.userData.noBake = true;
      S.add(m);
    };
    panel(10.5, -20.82, 8.6, 0.04);
    panel(6.18, -16, 0.04, 9.6);
    panel(14.82, -16, 0.04, 9.6);
    const ws = mat('#c48a52', { rough: 0.8 });
    S.add(box(8, 0.08, 0.7, ws, 10.5, 0.41, -17.2));
    S.add(box(8, 0.37, 0.05, ws, 10.5, 0.19, -16.87));
    S.add(box(8, 0.08, 1.4, ws, 10.5, 0.81, -18.8));
    S.add(box(8, 0.77, 0.05, ws, 10.5, 0.39, -18.12));
    ctx.col(10.5, -17.2, 8, 0.7);
    ctx.col(10.5, -19.1, 8, 2);
    const stove = new THREE.Group();
    stove.position.set(13.8, 0, -12.4);
    stove.add(box(0.9, 0.8, 0.9, mat('#1f2937', { rough: 0.5, metal: 0.4 }), 0, 0.4, 0));
    stove.add(box(0.95, 0.1, 0.95, mat('#ff6b1a', { emissive: '#ff5a00', emissiveIntensity: 1.2 }), 0, 0.82, 0, { cast: false }));
    for (let i = 0; i < 10; i++) stove.add(sphere(0.1 + Math.random() * 0.05, mat('#6b7280', { rough: 0.9, flat: true }), (Math.random() - 0.5) * 0.6, 0.92 + Math.random() * 0.1, (Math.random() - 0.5) * 0.6, 6));
    S.add(stove);
    ctx.col(13.8, -12.4, 1.1, 1.1);
    for (const x of [7.5, 9.5, 11.5, 13.5]) ctx.add('sauna_seat', x, -17.15, 0, { top: 0.45, exitZ: 0.9 });
    for (const x of [8, 10.5, 13]) ctx.add('sauna_seat', x, -18.9, 0, { top: 0.85, exitZ: 2.6 });
    const steam = new SteamSystem({ bounds: { x1: 6.5, x2: 14.5, z1: -20.5, z2: -11.5, h: 3.8 }, count: quality().particles, source: new THREE.Vector3(13.8, 1, -12.4), opacity: 0.16, size: 1.1 });
    ctx.group.add(steam.points);
    // ----- Xông hơi ướt -----
    const tile = mat('#cbd5e1', { rough: 0.3 });
    S.add(box(7, 0.45, 0.7, tile, 18.7, 0.22, -19.9));
    S.add(box(0.7, 0.45, 5, tile, 21.8, 0.22, -17));
    ctx.col(18.7, -19.9, 7, 0.7);
    ctx.col(21.8, -17, 0.7, 5);
    for (const x of [16.2, 18.2, 20.2]) ctx.add('steam_seat', x, -19.6, 0, { top: 0.45, exitZ: 0.9 });
    const fog = new SteamSystem({ bounds: { x1: 15.5, x2: 21.9, z1: -20.5, z2: -11.5, h: 3.8 }, count: quality().particles * 1.5, opacity: 0.3, size: 1.6, rise: 0.15 });
    ctx.group.add(fog.points);
    onSettingsChange((_s, p) => {
      if ('quality' in p) {
        steam.setCount(quality().particles);
        fog.setCount(quality().particles * 1.5);
      }
    });
    ctx.updaters.push((dt, t) => {
      steam.update(dt, t);
      fog.update(dt, t);
    });
    // ----- Massage + thư giãn -----
    ctx.add('massage_table', 8.2, -3, 0);
    ctx.add('massage_table', 12.6, -3, 0);
    for (const x of [17, 20]) ctx.add('massage_chair', x, -5.5, 0);
    for (const x of [17, 20]) ctx.add('massage_chair', x, 0, 0);
    plant(ctx, 7, 2.5);
    plant(ctx, 21.4, 2.5);
    for (const [x, z] of [[8, -7.5], [13, -7.5]]) S.add(sphere(0.12, mat('#ffcf8a', { emissive: '#ff9f43', emissiveIntensity: 2 }), x, 3.2, z, 8));
    // ----- Phòng thay đồ -----
    const lm = lockerRow(ctx, -17.55, 9.6, 18, -HALF_PI, 0.62, 0, [6, 14]);
    ctx.add('locker', lm[6].x + 0.6, lm[6].z, -HALF_PI, { color: '#f59e0b' });
    ctx.add('locker', lm[14].x + 0.6, lm[14].z, -HALF_PI, { color: '#f59e0b' });
    const lf = lockerRow(ctx, 5.55, 9.6, 18, HALF_PI, 0.62, 'pink', [6, 14]);
    ctx.add('locker', lf[6].x - 0.6, lf[6].z, HALF_PI, { color: '#f59e0b' });
    ctx.add('locker', lf[14].x - 0.6, lf[14].z, HALF_PI, { color: '#f59e0b' });
    bench(ctx, -12, 14.5, 5, false, '#a16207');
    bench(ctx, 0, 14.5, 5, false, '#a16207');
    for (const cx of [-12, 0]) {
      for (let i = 0; i < 3; i++) {
        const sx = cx - 3 + i * 3;
        S.add(box(0.06, 2.2, 1.2, mat('#cbd5e1'), sx - 1.2, 1.1, 20.3));
        S.add(cyl(0.1, 0.1, 0.05, mat('#e2e8f0', { metal: 0.8 }), sx, 2.3, 20.5, 10));
      }
      ctx.col(cx, 20.3, 9, 1.2);
    }
    // ----- Toilet -----
    for (const [cx, accent] of [[10.5, '#3b82f6'], [19.5, '#ec4899']]) {
      for (const sx of [cx - 3, cx + 0.5]) {
        ctx.add('toilet', sx, 20.3, Math.PI);
        for (const s of [-1, 1]) {
          S.add(box(0.06, 2, 1.9, mat('#cbd5e1'), sx + s * 0.85, 1.05, 19.9));
          ctx.col(sx + s * 0.85, 19.9, 0.08, 1.9);
        }
        S.add(box(1.7, 0.05, 0.05, mat(accent), sx, 2.05, 18.95));
      }
      ctx.add('sink', cx + 3.2, 15, HALF_PI);
      ctx.add('sink', cx + 3.2, 17, HALF_PI);
    }
  },
  npcs: (floor) =>
    new NPCs(floor.group, [
      {
        name: 'Cứu hộ Long',
        pos: [-17, 2.2, -12],
        ry: HALF_PI,
        anim: 'sit',
        greet: { emote: 'wave', text: 'Bơi trong làn và bấm E nhé. An toàn là trên hết! 🏊', radius: 8 },
        app: { displayName: 'Cứu hộ', gender: 'male', skinColor: '#c98e62', hair: { style: 'short', color: '#1f1a17' }, outfit: { style: 'tank', top: '#ef4444', bottom: '#facc15', shoes: '#ef4444' } },
      },
    ]),
};

// Hồ bơi sâu: mặt nước hơi thấp hơn sàn, đáy có ánh sáng gợn (caustics) chuyển động
export const POOL = { x1: -15, x2: 3, z1: -18.5, z2: -6, depth: 2.4, surface: -0.12 };

function causticsTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 256);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = 'rgba(180,240,255,' + (0.12 + Math.random() * 0.25) + ')';
    g.lineWidth = 1 + Math.random() * 2.5;
    g.beginPath();
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) g.quadraticCurveTo(x + (Math.random() - 0.5) * 120, y + (Math.random() - 0.5) * 120, x + (Math.random() - 0.5) * 140, y + (Math.random() - 0.5) * 140);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildPool(ctx) {
  const P = POOL;
  const S = ctx.S;
  const w = P.x2 - P.x1;
  const d = P.z2 - P.z1;
  const cx = (P.x1 + P.x2) / 2;
  const cz = (P.z1 + P.z2) / 2;
  const tile = textures.tile('#7dd3fc', '#0369a1', 8);
  tile.repeat.set(w / 2, d / 2);
  const caustics = causticsTexture();
  caustics.repeat.set(w / 6, d / 6);
  const floorMat = new THREE.MeshStandardMaterial({ map: tile, normalMap: normalMapFrom(tile, 1.5), roughness: 0.3, emissive: '#7dd3fc', emissiveMap: caustics, emissiveIntensity: 0.9 });
  const bottom = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
  bottom.rotation.x = -HALF_PI;
  bottom.position.set(cx, -P.depth, cz);
  bottom.receiveShadow = true;
  bottom.userData.dynamic = true;
  ctx.group.add(bottom);
  // Thành hồ ốp gạch
  const wallTex = textures.tile('#bae6fd', '#0284c7', 8);
  wallTex.repeat.set(w / 2, P.depth / 2);
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.3, side: THREE.DoubleSide });
  const wall = (pw, x, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, P.depth), wallMat);
    m.position.set(x, -P.depth / 2, z);
    m.rotation.y = ry;
    m.userData.noBake = true;
    S.add(m);
  };
  wall(w, cx, P.z1, 0);
  wall(w, cx, P.z2, Math.PI);
  wall(d, P.x1, cz, HALF_PI);
  wall(d, P.x2, cz, -HALF_PI);
  // Viền đá quanh hồ
  const coping = mat('#f8fafc', { rough: 0.45 });
  S.add(box(w + 0.6, 0.06, 0.3, coping, cx, 0.03, P.z1 - 0.15));
  S.add(box(w + 0.6, 0.06, 0.3, coping, cx, 0.03, P.z2 + 0.15));
  S.add(box(0.3, 0.06, d, coping, P.x1 - 0.15, 0.03, cz));
  S.add(box(0.3, 0.06, d, coping, P.x2 + 0.15, 0.03, cz));
  // Mặt nước: trong suốt, phản chiếu, sóng chạy (normal map cuộn)
  const wt = textures.water();
  const waterNormal = normalMapFrom(wt, 3);
  waterNormal.repeat.set(w / 5, d / 5);
  const waterMat = new THREE.MeshStandardMaterial({ color: '#38bdf8', transparent: true, opacity: 0.55, roughness: 0.06, metalness: 0.1, normalMap: waterNormal, normalScale: new THREE.Vector2(0.4, 0.4), side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.4 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(w, d), waterMat);
  water.rotation.x = -HALF_PI;
  water.position.set(cx, P.surface, cz);
  water.renderOrder = 2;
  water.userData.dynamic = true;
  ctx.group.add(water);
  // Dây phân làn nổi
  for (let i = 1; i < 6; i++) {
    const lx = P.x1 + i * 3;
    for (let k = 0; k < 10; k++) S.add(sphere(0.06, mat(k % 2 ? '#ef4444' : '#f8fafc'), lx, P.surface + 0.03, P.z1 + 0.6 + k * 1.2, 6));
  }
  // Thang leo ở 4 góc
  const steel = mat('#e2e8f0', { metal: 0.9, rough: 0.2 });
  for (const [x, z, dz] of [[P.x1 + 1.5, P.z2, -1], [P.x2 - 1.5, P.z2, -1], [P.x1 + 1.5, P.z1, 1], [P.x2 - 1.5, P.z1, 1]]) {
    for (const s of [-0.25, 0.25]) {
      S.add(bar([x + s, 0.9, z - dz * 0.1], [x + s, -P.depth + 0.3, z + dz * 0.15], 0.025, steel));
      S.add(bar([x + s, 0.9, z - dz * 0.1], [x + s, 0.9, z - dz * 0.45], 0.025, steel));
    }
    for (let k = 0; k < 4; k++) S.add(bar([x - 0.25, -0.3 - k * 0.45, z + dz * 0.12], [x + 0.25, -0.3 - k * 0.45, z + dz * 0.12], 0.02, steel));
  }
  ctx.updaters.push((dt, t) => {
    waterNormal.offset.x += dt * 0.025;
    waterNormal.offset.y += dt * 0.018;
    caustics.offset.x = Math.sin(t * 0.3) * 0.2;
    caustics.offset.y += dt * 0.03;
    floorMat.emissiveIntensity = 0.75 + Math.sin(t * 1.7) * 0.15;
  });
}

// ============================ SÂN THƯỢNG ============================
const FLOOR4 = {
  id: 4,
  ceiling: false,
  windows: false,
  baseFloor: 'concrete',
  wallColor: '#cbd5e1',
  hallName: 'Sân thượng',
  rooms: [
    { id: 'outdoor', name: 'Khu tập ngoài trời', icon: '🌤️', x1: -11, x2: 13, z1: -13, z2: 13, floor: 'turf', map: '#3f6212' },
    { id: 'track', name: 'Đường chạy vòng', icon: '🏁', x1: -17, x2: 20, z1: -19, z2: 19, floor: 'track', map: '#9a3412' },
    TRANSIT,
    { id: 'garden', name: 'Vườn thư giãn', icon: '🌿', x1: 22, x2: 40, z1: 10, z2: 21, floor: 'turf', map: '#166534' },
    { id: 'sunbath', name: 'Khu tắm nắng', icon: '☀️', x1: 22, x2: 40, z1: -21, z2: -10, floor: 'wood', map: '#92400e' },
  ],
  build(ctx) {
    const S = ctx.S;
    // Vạch làn chạy
    const white = mat('#f8fafc', { rough: 0.6 });
    const lines = [
      [-17, 20, -19, 19],
      [-11, 13, -13, 13],
      [-14, 16.5, -16, 16],
    ];
    for (const [x1, x2, z1, z2] of lines) {
      S.add(box(x2 - x1, 0.012, 0.08, white, (x1 + x2) / 2, 0.012, z1, { cast: false }));
      S.add(box(x2 - x1, 0.012, 0.08, white, (x1 + x2) / 2, 0.012, z2, { cast: false }));
      S.add(box(0.08, 0.012, z2 - z1, white, x1, 0.012, (z1 + z2) / 2, { cast: false }));
      S.add(box(0.08, 0.012, z2 - z1, white, x2, 0.012, (z1 + z2) / 2, { cast: false }));
    }
    S.add(box(0.3, 0.014, 6, mat('#facc15', { emissive: '#facc15', emissiveIntensity: 0.8 }), 1, 0.013, 16, { cast: false }));
    const startSign = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.8), new THREE.MeshBasicMaterial({ map: textTexture(['START / FINISH', 'Chạy vòng – E để bắt đầu'], { accent: '#facc15' }) }));
    startSign.position.set(1, 2.8, 19.6);
    startSign.rotation.y = Math.PI;
    startSign.userData.noBake = true;
    S.add(startSign);
    for (const s of [-1, 1]) S.add(box(0.12, 2.8, 0.12, mat(C.metal), 1 + s * 2, 1.4, 19.6));
    ctx.add('running_track', 1, 16, -HALF_PI);
    // Khu tập ngoài trời
    list(ctx, ['pullup_bar', 'pullup_bar', 'battle_rope'], -9, -11, 3.2);
    row(ctx, 'upright_bike', 3, -11, 2, 4, 0);
    list(ctx, ['kettlebell', 'kettlebell', 'plyo_box', 'plyo_box'], -9, -4, 2.8);
    list(ctx, ['jump_rope', 'jump_rope'], 3, -4, 2.8);
    for (const z of [3, 7]) row(ctx, 'yoga_mat', -9, z, 1.5, 6, 0);
    for (const [x, z] of [[7, 2], [11, -7], [-6, 11], [9, 11]]) tree(ctx, x, z);
    bench(ctx, 4, 11.5, 3, true, '#a16207');
    // Vườn + tắm nắng
    for (const [x, z] of [[26, 13], [34, 13], [26, 19], [34, 19], [30, 16]]) tree(ctx, x, z);
    for (let i = 0; i < 6; i++) ctx.inst.add(tpl().lounger, 25 + i * 2.6, 0, -17, Math.PI);
    ctx.col(31.5, -17, 16, 1.8);
    for (let i = 0; i < 3; i++) {
      const u = new THREE.Group();
      u.position.set(26.3 + i * 5.2, 0, -14.5);
      u.add(cyl(0.04, 0.04, 2.4, mat('#f8fafc'), 0, 1.2, 0, 6));
      const top = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.5, 10), mat(['#ef4444', '#22d3ee', '#facc15'][i]));
      top.position.y = 2.5;
      top.castShadow = true;
      u.add(top);
      S.add(u);
    }
  },
  npcs: (floor) =>
    new NPCs(floor.group, [
      {
        name: 'Sư phụ Gym',
        pos: [8, -0.2, 8],
        ry: Math.PI,
        anim: 'meditate',
        greet: { emote: 'bow', text: 'Chạy 10 vòng sân thượng sẽ nhận huy hiệu Chạy bền 🙏', radius: 5 },
        app: { displayName: 'Sư phụ Gym', gender: 'male', skinColor: '#f5c9a0', hair: { style: 'bald', color: '#3b2a20' }, outfit: { style: 'robe', top: '#7c8fa6', bottom: '#7c8fa6', shoes: '#5b6b80' } },
      },
    ]),
};

export const FLOOR_DEFS = [FLOOR0, FLOOR1, FLOOR2, FLOOR3, FLOOR4];

// Vùng đường chạy vòng (sân thượng) để đếm vòng
export const TRACK = { cx: 1, cz: 0, outer: { x1: -17, x2: 20, z1: -19, z2: 19 }, inner: { x1: -11, x2: 13, z1: -13, z2: 13 } };

export { sphere, torus };
