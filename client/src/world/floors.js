import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { box, cyl, sphere, bar, torus } from './helpers.js';
import { mat, C, textures, textTexture } from './materials.js';
import { SteamSystem } from './effects.js';
import { plant, tree, chairRow, lockerRow, dumbbellRack, bench, poster, mirror, sofa, counterDesk, waterCooler, neonRing, tpl } from './decor.js';
import { NPCs } from '../character/npcs.js';
import { quality, onSettingsChange } from '../core/settings.js';
import { audio } from '../core/audio.js';
import { BOXING_RING } from '@shared/constants.js';

/**
 * Định nghĩa 5 tầng của tòa nhà (mặt bằng 80m x 60m mỗi tầng, gấp ~11 lần bản cũ):
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
  hallName: 'Lối đi',
  baseFloor: 'lobby',
  outerDoors: [{ side: 's', c: 0, w: 4, type: 'sliding' }],
  rooms: [
    { id: 'shop', name: 'Cửa hàng Whey', icon: '🛒', x1: -40, x2: -26, z1: 12, z2: 30, walls: true, floor: 'darkTile', map: '#0f172a' },
    { id: 'lobby', name: 'Sảnh lớn / Lễ tân', icon: '🏠', x1: -26, x2: 24, z1: 12, z2: 30, floor: 'lobby', map: '#334155' },
    { id: 'juice', name: 'Juice Bar', icon: '🧃', x1: 24, x2: 40, z1: 12, z2: 30, floor: 'wood', map: '#9a3412' },
    { id: 'cardio', name: 'Khu Cardio', icon: '🏃', x1: -40, x2: 24, z1: -30, z2: 12, floor: 'rubber', map: '#1e293b' },
    TRANSIT,
    { id: 'lounge', name: 'Góc nghỉ', icon: '🛋️', x1: 24, x2: 40, z1: -30, z2: -10, floor: 'carpetBlue', map: '#0c4a6e' },
  ],
  doors: [{ x: -26, z: 21, w: 3, type: 'double', color: '#22d3ee' }],
  signs: [{ x: -26, z: 21, ry: HALF_PI, text: 'CỬA HÀNG WHEY', sub: 'Supplement Shop', color: '#22d3ee', back: 'SẢNH LỚN' }],
  build(ctx) {
    const S = ctx.S;
    // ----- Sảnh -----
    counterDesk(ctx, -4, 19, 6, true);
    S.add(box(0.5, 0.35, 0.05, mat('#111827'), -5.5, 1.35, 18.7));
    poster(ctx, -25.83, 2.5, 22, HALF_PI, ['GYM ONLINE', '5 tầng – Tập cùng 1000 người'], '#22d3ee', 4.5, 1.3);
    poster(ctx, 0, 3.0, 29.83, Math.PI, ['CHÀO MỪNG!', 'Thang máy ➜ tầng 2, 3, sân thượng'], '#a78bfa', 5, 1.2);
    ctx.add('inbody', 8, 21, Math.PI);
    ctx.add('inbody', 10.5, 21, Math.PI);
    poster(ctx, 9.3, 2.4, 22.6, 0, ['CÂN INBODY', 'Đo chỉ số cơ thể'], '#22d3ee', 3, 0.8).position.y = 2.6;
    sofa(ctx, 14, 28.6, 0);
    sofa(ctx, 19, 28.6, 0, '#be185d');
    ctx.S.add(box(1.6, 0.06, 0.8, mat('#f1f5f9', { rough: 0.2 }), 16.5, 0.45, 26.8));
    ctx.col(16.5, 26.8, 1.6, 0.8);
    for (const [x, z] of [[-24.5, 29], [-24.5, 13], [22.5, 13], [4, 29], [-4, 29]]) plant(ctx, x, z);
    // ----- Cửa hàng Whey -----
    ctx.add('shop_whey', -33, 21, -HALF_PI);
    poster(ctx, -39.83, 2.8, 21, HALF_PI, ['WHEY SHOP', 'Whey • Sinh tố • Phụ kiện'], '#22d3ee', 4, 1.1);
    for (let i = 0; i < 4; i++) {
      S.add(box(1.4, 1.6, 0.5, mat('#334155'), -36 + i * 2.6, 0.8, 12.6));
      for (let j = 0; j < 6; j++) S.add(cyl(0.07, 0.07, 0.2, mat(['#ef4444', '#22d3ee', '#a3e635', '#facc15'][j % 4]), -36.5 + i * 2.6 + (j % 3) * 0.45, 0.6 + Math.floor(j / 3) * 0.5, 12.85, 8));
    }
    ctx.col(-32, 12.6, 11, 0.5);
    // ----- Juice bar -----
    ctx.add('juice_bar', 32, 24, HALF_PI);
    for (const x of [27, 29.5]) for (const z of [16, 19]) {
      S.add(cyl(0.5, 0.5, 0.05, mat('#fef3c7'), x, 0.75, z, 16));
      S.add(cyl(0.05, 0.05, 0.75, mat(C.metal), x, 0.37, z, 8));
      ctx.col(x, z, 0.8, 0.8);
    }
    poster(ctx, 39.83, 2.8, 24, -HALF_PI, ['JUICE BAR', 'Nước ép – Sinh tố – Năng lượng'], '#f97316', 4, 1.1);
    // ----- Khu cardio -----
    row(ctx, 'treadmill', -37, -27, 2.2, 14, Math.PI);
    row(ctx, 'treadmill', -37, -22.5, 2.2, 14, Math.PI);
    row(ctx, 'treadmill', 0, -27, 2.2, 9, Math.PI);
    row(ctx, 'elliptical', -37, -16, 2.6, 6, Math.PI);
    row(ctx, 'stair_climber', -20, -16, 2.4, 5, Math.PI);
    row(ctx, 'ski_erg', 0, -16, 2.4, 5, Math.PI);
    row(ctx, 'upright_bike', -37, -9.5, 2, 7, Math.PI);
    row(ctx, 'recumbent_bike', -21.5, -9.5, 2.2, 5, Math.PI);
    row(ctx, 'assault_bike', -7, -9.5, 2.4, 5, Math.PI);
    row(ctx, 'rowing_machine', -37, -1.5, 2.6, 6, Math.PI);
    row(ctx, 'upright_bike', -18, -1.5, 2, 6, Math.PI);
    row(ctx, 'elliptical', -4, -1.5, 2.6, 6, Math.PI);
    for (const x of [-30, -10, 10]) poster(ctx, x, 2.6, -29.83, 0, ['CARDIO ZONE', 'Đốt mỡ – Tăng sức bền'], '#22d3ee', 3.2, 1);
    waterCooler(ctx, 22.8, -28.8);
    waterCooler(ctx, -39.2, 6);
    // ----- Góc nghỉ -----
    sofa(ctx, 31, -28.6, 0, '#0e7490');
    sofa(ctx, 31, -12.5, Math.PI, '#0e7490');
    plant(ctx, 26, -20);
    plant(ctx, 38.5, -20);
    // ----- Sân trước (ngoài tòa nhà) -----
    buildPlaza(ctx);
  },
  npcs: (floor) =>
    new NPCs(floor.group, [
      {
        name: 'Lễ tân Mai',
        pos: [-4, 0, 20.2],
        ry: 0,
        anim: 'idle',
        greet: { emote: 'wave', text: 'Chào mừng tới Gym Online! Thang máy ở phía Đông, bấm M để xem bản đồ 🗺️', radius: 5 },
        app: { displayName: 'Lễ tân Mai', gender: 'female', skinColor: '#f8d3b0', hair: { style: 'ponytail', color: '#3b2a20' }, outfit: { style: 'tshirt', top: '#22d3ee', bottom: '#0f172a', shoes: '#ffffff' } },
      },
      {
        name: 'Chủ shop Tuấn',
        pos: [-34.4, 0, 21],
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
  plaza.position.set(0, -0.01, 35);
  plaza.receiveShadow = true;
  plaza.userData.noBake = true;
  ctx.floor.shell.add(plaza);
  const bushMat = mat('#4ade80', { rough: 0.9, flat: true });
  for (let x = -14.5; x <= 14.5; x += 1.25) S.add(sphere(0.65, bushMat, x, 0.45, 40, 8));
  for (let z = 30.8; z <= 40; z += 1.25) {
    S.add(sphere(0.65, bushMat, -15, 0.45, z, 8));
    S.add(sphere(0.65, bushMat, 15, 0.45, z, 8));
  }
  ctx.collision.addBox(-16, 16, 39.6, 41, 'fence');
  ctx.collision.addBox(-16, -14.4, 30, 41, 'fence');
  ctx.collision.addBox(14.4, 16, 30, 41, 'fence');
  for (const [x, z] of [[-10, 33.5], [10, 33.5], [-10, 38], [10, 38]]) tree(ctx, x, z);
  for (const [x, z] of [[-30, 45], [30, 50], [-50, 0], [50, 10], [0, 60], [-45, -40], [45, -40]]) ctx.inst.add(tpl().tree, x, 0, z, 0, 1.4);
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.2), new THREE.MeshBasicMaterial({ map: textTexture(['GYM ONLINE', 'Tòa nhà 5 tầng'], { w: 1024, h: 176, size: 96 }) }));
  logo.position.set(0, 3.3, 30.17);
  logo.userData.noBake = true;
  S.add(logo);
}

// ============================ TẦNG 2 ============================
const FLOOR2 = {
  id: 2,
  baseFloor: 'rubber',
  rooms: [
    { id: 'freeweights', name: 'Khu tạ tự do', icon: '🏋️', x1: -40, x2: -8, z1: 10, z2: 30, floor: 'rubber', map: '#1e293b' },
    { id: 'power', name: 'Khu Power Rack', icon: '🦍', x1: -8, x2: 24, z1: 10, z2: 30, floor: 'concrete', map: '#3f3f46' },
    { id: 'machines', name: 'Khu máy tập', icon: '⚙️', x1: -40, x2: 24, z1: -30, z2: 10, floor: 'rubber', map: '#1e293b' },
    TRANSIT,
    { id: 'stretch', name: 'Khu giãn cơ', icon: '🧘', x1: 24, x2: 40, z1: -30, z2: -10, floor: 'mats', map: '#1e3a8a' },
    { id: 'lounge2', name: 'Góc nghỉ', icon: '🥤', x1: 24, x2: 40, z1: 10, z2: 30, floor: 'carpetBlue', map: '#0c4a6e' },
  ],
  build(ctx) {
    // ----- Tạ tự do -----
    for (const x of [-36, -31, -26, -21, -16]) dumbbellRack(ctx, x, 29.2, 4.5, 0);
    mirror(ctx, -26, 1.9, 29.8, 0, 26, 2.4);
    row(ctx, 'dumbbell_bench', -37, 25, 4, 6, 0);
    list(ctx, ['bench_flat', 'bench_flat', 'bench_incline', 'bench_incline', 'bench_decline'], -37, 17, 4.2);
    ctx.add('preacher_curl', -15, 17, 0);
    ctx.add('preacher_curl', -11.5, 17, 0);
    ctx.add('ez_barbell', -11, 24, 0);
    // ----- Power -----
    list(ctx, ['power_rack', 'power_rack', 'power_rack'], -4, 25, 5.5);
    list(ctx, ['smith_machine', 'smith_machine'], -4, 17, 5.5);
    ctx.add('trap_bar', 8, 17, 0);
    ctx.add('landmine_press', 12.5, 17, 0);
    ctx.add('hip_thrust', 18, 25, 0);
    ctx.add('hip_thrust', 18, 18, 0);
    for (const x of [-6.5, 9.8]) for (let i = 0; i < 4; i++) ctx.inst.add(tpl().plate, x, 0.3 + i * 0.22, 28.9, 0, 1 - i * 0.12);
    poster(ctx, 8, 2.8, 29.83, Math.PI, ['POWER ZONE', 'Squat • Deadlift • Bench'], '#f43f5e', 4, 1.1);
    // ----- Máy tập (lưới) -----
    list(ctx, ['chest_press', 'incline_chest_press', 'pec_deck', 'chest_press', 'shoulder_press', 'lateral_raise', 'rear_delt_fly', 'shoulder_press', 'dip_station', 'assisted_pullup', 'pullup_bar', 'pullup_bar'], -37, 5, 4.9);
    list(ctx, ['lat_pulldown', 'seated_row', 'tbar_row', 'lat_pulldown', 'seated_row', 'hyperextension', 'bicep_machine', 'tricep_machine', 'preacher_curl', 'bicep_machine', 'tricep_machine'], -37, -3, 5.3);
    list(ctx, ['leg_press', 'leg_extension', 'leg_curl_lying', 'leg_curl_seated', 'hack_squat', 'leg_press', 'leg_extension', 'hip_abduction', 'hip_adduction', 'calf_standing', 'calf_seated', 'glute_machine'], -37, -11, 4.9);
    list(ctx, ['cable_crossover', 'face_pull', 'tricep_pushdown', 'cable_curl', 'cable_crossover', 'face_pull', 'tricep_pushdown', 'cable_curl'], -36, -19, 7.2);
    list(ctx, ['chest_press', 'lat_pulldown', 'leg_press', 'shoulder_press', 'seated_row', 'pec_deck', 'leg_extension', 'bicep_machine', 'tricep_machine', 'ab_crunch', 'torso_rotation'], -37, -27, 5.3);
    for (const [x, t] of [[-24, ['NGỰC & VAI', 'Chest • Shoulders']], [-4, ['LƯNG & TAY', 'Back • Arms']], [14, ['CHÂN & MÔNG', 'Legs • Glutes']]]) poster(ctx, x, 2.8, -29.83, 0, t, '#f43f5e', 3.6, 1);
    waterCooler(ctx, 22.5, 8.5);
    // ----- Giãn cơ -----
    row(ctx, 'foam_roller', 26.5, -27, 2.2, 6, 0);
    row(ctx, 'stretch_mat', 26.5, -18, 2.2, 6, 0);
    // ----- Góc nghỉ -----
    sofa(ctx, 31, 28.6, 0, '#0e7490');
    sofa(ctx, 31, 14, Math.PI, '#0e7490');
    plant(ctx, 26, 21);
    plant(ctx, 38.5, 21);
  },
  npcs: (floor) =>
    new NPCs(floor.group, [
      {
        name: 'PT Hùng',
        pos: [-6, 0, 12.5],
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
  baseFloor: 'lobby',
  rooms: [
    { id: 'aerobic', name: 'Studio Aerobic', icon: '💃', x1: -40, x2: -16, z1: 8, z2: 30, walls: true, floor: 'wood', map: '#4c1d95' },
    { id: 'yoga', name: 'Studio Yoga', icon: '🧘', x1: -16, x2: 4, z1: 8, z2: 30, walls: true, floor: 'carpet', map: '#14532d' },
    { id: 'spin', name: 'Studio Spin', icon: '🚴', x1: 4, x2: 24, z1: 8, z2: 30, walls: true, floor: 'darkTile', map: '#7f1d1d' },
    { id: 'boxing', name: 'Võ thuật / Boxing', icon: '🥊', x1: -40, x2: -6, z1: -30, z2: 2, walls: true, floor: 'darkTile', map: '#450a0a' },
    { id: 'functional', name: 'Khu Functional', icon: '🔥', x1: -6, x2: 24, z1: -30, z2: 2, floor: 'turf', map: '#14532d' },
    TRANSIT,
  ],
  doors: [
    { x: -28, z: 8, w: 3, type: 'double', color: '#f472b6' },
    { x: -6, z: 8, w: 2.6, type: 'double', color: '#34d399' },
    { x: 14, z: 8, w: 2.6, type: 'double', color: '#ef4444' },
    { x: -23, z: 2, w: 4, type: 'open' },
    { x: -6, z: -14, w: 3, type: 'open' },
  ],
  signs: [
    { x: -28, z: 8, ry: Math.PI, text: 'STUDIO AEROBIC', sub: 'Lớp nhảy theo nhạc', color: '#f472b6', back: 'HÀNH LANG' },
    { x: -6, z: 8, ry: Math.PI, text: 'STUDIO YOGA', sub: 'Thư giãn – Dẻo dai', color: '#34d399', back: 'HÀNH LANG' },
    { x: 14, z: 8, ry: Math.PI, text: 'STUDIO SPIN', sub: 'Đạp xe theo nhạc', color: '#ef4444', back: 'HÀNH LANG' },
    { x: -23, z: 2, ry: 0, text: 'BOXING', sub: 'Võ đài • Bao cát', color: '#ef4444', back: 'HÀNH LANG' },
  ],
  build(ctx) {
    const S = ctx.S;
    // ----- Aerobic -----
    S.add(box(5, 0.25, 2, mat('#1e1b4b', { rough: 0.5 }), -28, 0.125, 27.6));
    S.add(box(5.1, 0.04, 2.1, mat('#f472b6', { emissive: '#f472b6', emissiveIntensity: 1.2 }), -28, 0.26, 27.6, { cast: false }));
    ctx.col(-28, 27.6, 5, 2);
    for (const z of [12.5, 17, 21.5]) for (const x of [-36, -32, -28, -24, -20]) ctx.add('aerobic_spot', x, z, 0);
    ctx.updaters.push(aerobicMirror(ctx, -28, 29.78, 22, Math.PI));
    for (const x of [-39, -17]) {
      S.add(box(0.8, 1.6, 0.6, mat('#111827', { rough: 0.6 }), x, 0.8, 28.9));
      ctx.col(x, 28.9, 0.8, 0.6);
    }
    ctx.updaters.push(discoBall(ctx, -28, 3.4, 18));
    // ----- Yoga -----
    for (const z of [12, 16.5, 21]) for (const x of [-13, -9.5, -6, -2.5, 1]) ctx.add('yoga_mat', x, z, 0);
    S.add(box(4, 0.15, 2, mat('#14532d', { rough: 0.8 }), -6, 0.075, 27.6));
    ctx.col(-6, 27.6, 4, 2);
    for (const x of [-15, 3]) plant(ctx, x, 28.8, 1.2);
    poster(ctx, -6, 2.9, 29.83, Math.PI, ['NAMASTE 🙏', 'Hít thở – Thư giãn'], '#34d399', 3.4, 1);
    // ----- Spin -----
    for (const z of [12.5, 16, 19.5]) for (const x of [7, 10.5, 14, 17.5, 21]) ctx.add('spin_bike', x, z, 0);
    S.add(box(4, 0.3, 2.2, mat('#450a0a'), 14, 0.15, 27.4));
    ctx.col(14, 27.4, 4, 2.2);
    for (let i = 0; i < 6; i++) S.add(box(0.06, 3.6, 0.06, mat('#ef4444', { emissive: '#ef4444', emissiveIntensity: 1.5 }), 4.3 + i * 3.9, 1.8, 29.8, { cast: false }));
    poster(ctx, 14, 3, 29.83, Math.PI, ['SPIN CLASS', 'Đạp theo nhịp – x30% EXP'], '#ef4444', 3.6, 1);
    // ----- Boxing -----
    buildRing(ctx);
    for (let z = -28; z <= -2; z += 4.3) ctx.add('heavy_bag', -37.6, z, -HALF_PI);
    for (const x of [-30, -27, -24]) ctx.add('speed_bag', x, -28.6, Math.PI);
    ctx.add('pad_mitts', -11, -27, 0);
    ctx.add('pad_mitts', -11, -19, 0);
    chairRow(ctx, -28, -6.5, 10, 0.6, Math.PI);
    poster(ctx, -6.17, 2.8, -24, -HALF_PI, ['FIGHT CLUB', 'Thách đấu Sparring từ menu nhân vật'], '#ef4444', 3.6, 1);
    // ----- Functional -----
    list(ctx, ['sled', 'sled'], -3.5, -28, 3);
    list(ctx, ['plyo_box', 'plyo_box', 'plyo_box'], 4, -28, 3);
    list(ctx, ['kettlebell', 'kettlebell', 'kettlebell'], 13.5, -28, 3);
    list(ctx, ['battle_rope', 'battle_rope'], -3, -19, 3.5);
    list(ctx, ['slam_ball', 'slam_ball', 'medicine_ball', 'medicine_ball', 'tire_flip'], 5, -20, 3.6);
    list(ctx, ['farmers_walk', 'farmers_walk', 'jump_rope', 'jump_rope', 'jump_rope'], 5, -12.5, 3.6);
    list(ctx, ['ab_crunch', 'roman_chair', 'torso_rotation', 'trx', 'trx', 'plank_mat', 'plank_mat', 'plank_mat'], -3, -4, 3.4);
    poster(ctx, 10, 2.8, -29.83, 0, ['FUNCTIONAL', 'Sled • Kettlebell • Tire • Core'], '#a3e635', 4, 1);
  },
  npcs: (floor) =>
    new NPCs(floor.group, [
      {
        name: 'HLV Aerobic',
        pos: [-28, 0.25, 27.4],
        ry: Math.PI,
        anim: 'aerobic',
        greet: { emote: 'cheer', text: 'Vào lớp nào! Bấm SPACE đúng nhịp để có điểm đồng bộ 💃', radius: 7 },
        app: { displayName: 'HLV Aerobic', gender: 'female', skinColor: '#e8b48a', hair: { style: 'twintails', color: '#e85d75' }, outfit: { style: 'tank', top: '#f472b6', bottom: '#8b5cf6', shoes: '#f8fafc' } },
      },
      {
        name: 'Cô Yoga',
        pos: [-6, 0.15, 27.6],
        ry: Math.PI,
        anim: 'yogaFlow',
        greet: { emote: 'bow', text: 'Thả lỏng, hít sâu… bấm SPACE theo nhịp thở 🧘', radius: 6 },
        app: { displayName: 'Cô Yoga', gender: 'female', skinColor: '#f5c9a0', hair: { style: 'bun', color: '#3b2a20' }, outfit: { style: 'tank', top: '#34d399', bottom: '#14532d', shoes: '#f8fafc' } },
      },
      {
        name: 'Coach Spin',
        pos: [14, 0.3, 27.2],
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
  const apply = () => {
    const want = quality().mirror && ctx.group.visible;
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
    const v = quality().mirror && ctx.group.visible;
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
  for (const lz of [8.4, 29.6]) {
    const led = new THREE.Mesh(new THREE.BoxGeometry(23.4, 0.03, 0.08), ledMat);
    led.position.set(-28, 0.02, lz);
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
  baseFloor: 'poolDeck',
  hallName: 'Hành lang Spa',
  rooms: [
    { id: 'pool', name: 'Hồ bơi', icon: '🏊', x1: -40, x2: -2, z1: -30, z2: 4, walls: true, floor: 'poolDeck', map: '#0369a1' },
    { id: 'sauna', name: 'Phòng Sauna', icon: '♨️', x1: -2, x2: 10, z1: -30, z2: -16, walls: true, floor: 'sauna', map: '#9a3412' },
    { id: 'steam', name: 'Phòng xông hơi ướt', icon: '🌫️', x1: 10, x2: 22, z1: -30, z2: -16, walls: true, floor: 'wcTile', map: '#64748b' },
    { id: 'massage', name: 'Phòng Massage', icon: '💆', x1: -2, x2: 10, z1: -12, z2: 4, walls: true, floor: 'wood', map: '#78350f' },
    { id: 'relax', name: 'Phòng thư giãn', icon: '🛋️', x1: 10, x2: 22, z1: -12, z2: 4, walls: true, floor: 'carpetBlue', map: '#0c4a6e' },
    { id: 'locker_m', name: 'Phòng thay đồ Nam', icon: '🚹', x1: -40, x2: -20, z1: 12, z2: 30, walls: true, floor: 'lockerTile', map: '#1d4ed8' },
    { id: 'locker_f', name: 'Phòng thay đồ Nữ', icon: '🚺', x1: -20, x2: 0, z1: 12, z2: 30, walls: true, floor: 'lockerTile', map: '#be185d' },
    { id: 'wc_m', name: 'Toilet Nam', icon: '🚻', x1: 0, x2: 12, z1: 18, z2: 30, walls: true, floor: 'wcTile', map: '#1e40af' },
    { id: 'wc_f', name: 'Toilet Nữ', icon: '🚻', x1: 12, x2: 24, z1: 18, z2: 30, walls: true, floor: 'wcTile', map: '#9d174d' },
    TRANSIT,
  ],
  doors: [
    { x: -21, z: 4, w: 4, type: 'open' },
    { x: 4, z: -16, w: 1.8, type: 'swing', color: '#8a5a33' },
    { x: 16, z: -16, w: 1.8, type: 'swing', color: '#94a3b8' },
    { x: 4, z: 4, w: 2, type: 'swing', color: '#a16207' },
    { x: 16, z: 4, w: 2, type: 'swing', color: '#0e7490' },
    { x: -30, z: 12, w: 2.4, type: 'swing', color: '#3b82f6' },
    { x: -10, z: 12, w: 2.4, type: 'swing', color: '#ec4899' },
    { x: 6, z: 18, w: 1.8, type: 'swing', color: '#3b82f6' },
    { x: 18, z: 18, w: 1.8, type: 'swing', color: '#ec4899' },
  ],
  signs: [
    { x: -21, z: 4, ry: Math.PI, text: 'HỒ BƠI', sub: 'Pool – 6 làn', color: '#38bdf8', back: 'HÀNH LANG' },
    { x: 4, z: -16, ry: Math.PI, text: 'SAUNA', sub: '85°C', color: '#fb923c', back: 'HÀNH LANG' },
    { x: 16, z: -16, ry: Math.PI, text: 'XÔNG HƠI ƯỚT', sub: 'Steam room', color: '#94a3b8', back: 'HÀNH LANG' },
    { x: 4, z: 4, ry: Math.PI, text: 'MASSAGE', sub: '', color: '#f59e0b', back: 'HÀNH LANG' },
    { x: 16, z: 4, ry: Math.PI, text: 'THƯ GIÃN', sub: 'Ghế massage', color: '#22d3ee', back: 'HÀNH LANG' },
    { x: -30, z: 12, ry: 0, text: 'THAY ĐỒ NAM', sub: '', color: '#3b82f6', back: 'HÀNH LANG' },
    { x: -10, z: 12, ry: 0, text: 'THAY ĐỒ NỮ', sub: '', color: '#ec4899', back: 'HÀNH LANG' },
    { x: 6, z: 18, ry: 0, text: 'WC NAM', sub: '', color: '#3b82f6' },
    { x: 18, z: 18, ry: 0, text: 'WC NỮ', sub: '', color: '#ec4899' },
  ],
  build(ctx) {
    const S = ctx.S;
    // ----- Hồ bơi (bể nổi, mặt nước ở cao 0.35m) -----
    const px1 = -36;
    const px2 = -6;
    const pz1 = -26;
    const pz2 = -6;
    const pw = px2 - px1;
    const pd = pz2 - pz1;
    const pcx = (px1 + px2) / 2;
    const pcz = (pz1 + pz2) / 2;
    S.add(box(pw, 0.02, pd, mat('#0369a1'), pcx, 0.01, pcz, { cast: false }));
    const coping = mat('#f8fafc', { rough: 0.5 });
    S.add(box(pw + 0.6, 0.45, 0.3, coping, pcx, 0.22, pz1 - 0.15));
    S.add(box(pw + 0.6, 0.45, 0.3, coping, pcx, 0.22, pz2 + 0.15));
    S.add(box(0.3, 0.45, pd, coping, px1 - 0.15, 0.22, pcz));
    S.add(box(0.3, 0.45, pd, coping, px2 + 0.15, 0.22, pcz));
    ctx.col(pcx, pcz, pw + 0.6, pd + 0.6);
    const waterTex = textures.water();
    waterTex.repeat.set(6, 4);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), new THREE.MeshStandardMaterial({ map: waterTex, transparent: true, opacity: 0.78, roughness: 0.1, metalness: 0.1 }));
    water.rotation.x = -HALF_PI;
    water.position.set(pcx, 0.35, pcz);
    water.userData.dynamic = true;
    ctx.group.add(water);
    for (let i = 1; i < 6; i++) {
      const lx = px1 + i * 5;
      for (let k = 0; k < 16; k++) S.add(sphere(0.06, mat(k % 2 ? '#ef4444' : '#f8fafc'), lx, 0.36, pz1 + 0.6 + k * 1.2, 6));
    }
    // làn bơi đặt sát mép bắc để người chơi trên bờ lại gần được
    for (let i = 0; i < 6; i++) ctx.add('pool_lane', px1 + 2.5 + i * 5, pz2 - 0.9, Math.PI, { exitZ: -1.7 });
    // ghế nằm 2 bên, chừa lối đi giữa từ cửa xuống hồ
    for (const x of [-36, -31, -26, -16, -11, -6]) {
      ctx.inst.add(tpl().lounger, x, 0, 1.5, Math.PI);
      ctx.col(x, 1.5, 0.8, 1.8);
    }
    S.add(box(0.8, 2.2, 0.8, mat('#f8fafc'), -39, 1.1, -16));
    ctx.col(-39, -16, 0.8, 0.8);
    ctx.updaters.push((dt) => {
      waterTex.offset.x += dt * 0.02;
      waterTex.offset.y += dt * 0.015;
    });
    poster(ctx, -21, 2.9, 3.83, Math.PI, ['HỒ BƠI', 'Vào làn bơi và bấm E'], '#38bdf8', 3.4, 1);
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
    panel(4, -29.82, 11.6, 0.04);
    panel(-1.82, -23, 0.04, 13.6);
    panel(9.82, -23, 0.04, 13.6);
    const ws = mat('#c48a52', { rough: 0.8 });
    S.add(box(11, 0.08, 0.7, ws, 4, 0.41, -26.2));
    S.add(box(11, 0.37, 0.05, ws, 4, 0.19, -25.87));
    S.add(box(11, 0.08, 1.4, ws, 4, 0.81, -27.8));
    S.add(box(11, 0.77, 0.05, ws, 4, 0.39, -27.12));
    ctx.col(4, -26.2, 11, 0.7);
    ctx.col(4, -28.1, 11, 2);
    const stove = new THREE.Group();
    stove.position.set(8.6, 0, -17.5);
    stove.add(box(0.9, 0.8, 0.9, mat('#1f2937', { rough: 0.5, metal: 0.4 }), 0, 0.4, 0));
    stove.add(box(0.95, 0.1, 0.95, mat('#ff6b1a', { emissive: '#ff5a00', emissiveIntensity: 1.2 }), 0, 0.82, 0, { cast: false }));
    for (let i = 0; i < 10; i++) stove.add(sphere(0.1 + Math.random() * 0.05, mat('#6b7280', { rough: 0.9, flat: true }), (Math.random() - 0.5) * 0.6, 0.92 + Math.random() * 0.1, (Math.random() - 0.5) * 0.6, 6));
    S.add(stove);
    ctx.col(8.6, -17.5, 1.1, 1.1);
    for (const x of [0, 2, 4, 6, 8]) ctx.add('sauna_seat', x, -26.15, 0, { top: 0.45, exitZ: 0.9 });
    for (const x of [1, 3.5, 6]) ctx.add('sauna_seat', x, -27.9, 0, { top: 0.85, exitZ: 2.6 });
    const steam = new SteamSystem({ bounds: { x1: -1.5, x2: 9.5, z1: -29.5, z2: -16.5, h: 3.8 }, count: quality().particles, source: new THREE.Vector3(8.6, 1, -17.5), opacity: 0.16, size: 1.1 });
    ctx.group.add(steam.points);
    // ----- Xông hơi ướt -----
    const tile = mat('#cbd5e1', { rough: 0.3 });
    S.add(box(11, 0.45, 0.7, tile, 16, 0.22, -28.9));
    S.add(box(0.7, 0.45, 8, tile, 21.4, 0.22, -24));
    ctx.col(16, -28.9, 11, 0.7);
    ctx.col(21.4, -24, 0.7, 8);
    for (const x of [11.5, 14, 16.5, 19]) ctx.add('steam_seat', x, -28.6, 0, { top: 0.45, exitZ: 0.9 });
    const fog = new SteamSystem({ bounds: { x1: 10.5, x2: 21.5, z1: -29.5, z2: -16.5, h: 3.8 }, count: quality().particles * 1.5, opacity: 0.3, size: 1.6, rise: 0.15 });
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
    ctx.add('massage_table', 1.5, -6, 0);
    ctx.add('massage_table', 6.5, -6, 0);
    for (const x of [12.5, 15.5, 18.5]) ctx.add('massage_chair', x, -8.5, 0);
    for (const x of [12.5, 15.5, 18.5]) ctx.add('massage_chair', x, -3, 0);
    plant(ctx, 0, 2.5);
    plant(ctx, 21, 2.5);
    for (const [x, z] of [[1, -11], [8, -11]]) S.add(sphere(0.12, mat('#ffcf8a', { emissive: '#ff9f43', emissiveIntensity: 2 }), x, 3.2, z, 8));
    // ----- Phòng thay đồ -----
    const lm = lockerRow(ctx, -39.55, 13.2, 27, -HALF_PI, 0.62, 0, [6, 18]);
    ctx.add('locker', lm[6].x + 0.6, lm[6].z, -HALF_PI, { color: '#f59e0b' });
    ctx.add('locker', lm[18].x + 0.6, lm[18].z, -HALF_PI, { color: '#f59e0b' });
    const lf = lockerRow(ctx, -0.45, 13.2, 27, HALF_PI, 0.62, 'pink', [6, 18]);
    ctx.add('locker', lf[6].x - 0.6, lf[6].z, HALF_PI, { color: '#f59e0b' });
    ctx.add('locker', lf[18].x - 0.6, lf[18].z, HALF_PI, { color: '#f59e0b' });
    bench(ctx, -30, 21, 8, false, '#a16207');
    bench(ctx, -10, 21, 8, false, '#a16207');
    for (const cx of [-30, -10]) {
      for (let i = 0; i < 4; i++) {
        const sx = cx - 4.5 + i * 3;
        S.add(box(0.06, 2.2, 1.2, mat('#cbd5e1'), sx - 1.2, 1.1, 29.3));
        S.add(cyl(0.1, 0.1, 0.05, mat('#e2e8f0', { metal: 0.8 }), sx, 2.3, 29.5, 10));
      }
      ctx.col(cx, 29.3, 12, 1.2);
    }
    // ----- Toilet -----
    for (const [cx, accent] of [[6, '#3b82f6'], [18, '#ec4899']]) {
      for (const sx of [cx - 3, cx + 0.5]) {
        ctx.add('toilet', sx, 29.3, Math.PI);
        for (const s of [-1, 1]) {
          S.add(box(0.06, 2, 1.9, mat('#cbd5e1'), sx + s * 0.85, 1.05, 28.9));
          ctx.col(sx + s * 0.85, 28.9, 0.08, 1.9);
        }
        S.add(box(1.7, 0.05, 0.05, mat(accent), sx, 2.05, 27.95));
      }
      ctx.add('sink', cx + 4.2, 21, HALF_PI);
      ctx.add('sink', cx + 4.2, 23, HALF_PI);
    }
  },
  npcs: (floor) =>
    new NPCs(floor.group, [
      {
        name: 'Cứu hộ Long',
        pos: [-39, 2.2, -16],
        ry: HALF_PI,
        anim: 'sit',
        greet: { emote: 'wave', text: 'Bơi trong làn và bấm E nhé. An toàn là trên hết! 🏊', radius: 8 },
        app: { displayName: 'Cứu hộ', gender: 'male', skinColor: '#c98e62', hair: { style: 'short', color: '#1f1a17' }, outfit: { style: 'tank', top: '#ef4444', bottom: '#facc15', shoes: '#ef4444' } },
      },
    ]),
};

// ============================ SÂN THƯỢNG ============================
const FLOOR4 = {
  id: 4,
  ceiling: false,
  windows: false,
  baseFloor: 'concrete',
  wallColor: '#cbd5e1',
  hallName: 'Sân thượng',
  rooms: [
    { id: 'outdoor', name: 'Khu tập ngoài trời', icon: '🌤️', x1: -30, x2: 12, z1: -20, z2: 20, floor: 'turf', map: '#3f6212' },
    { id: 'track', name: 'Đường chạy vòng', icon: '🏁', x1: -38, x2: 20, z1: -28, z2: 28, floor: 'track', map: '#9a3412' },
    TRANSIT,
    { id: 'garden', name: 'Vườn thư giãn', icon: '🌿', x1: 22, x2: 40, z1: 10, z2: 30, floor: 'turf', map: '#166534' },
    { id: 'sunbath', name: 'Khu tắm nắng', icon: '☀️', x1: 22, x2: 40, z1: -30, z2: -10, floor: 'wood', map: '#92400e' },
  ],
  build(ctx) {
    const S = ctx.S;
    // Vạch làn chạy
    const white = mat('#f8fafc', { rough: 0.6 });
    const lines = [
      [-38, 20, -28, 28],
      [-30, 12, -20, 20],
      [-34, 16, -24, 24],
    ];
    for (const [x1, x2, z1, z2] of lines) {
      S.add(box(x2 - x1, 0.012, 0.08, white, (x1 + x2) / 2, 0.012, z1, { cast: false }));
      S.add(box(x2 - x1, 0.012, 0.08, white, (x1 + x2) / 2, 0.012, z2, { cast: false }));
      S.add(box(0.08, 0.012, z2 - z1, white, x1, 0.012, (z1 + z2) / 2, { cast: false }));
      S.add(box(0.08, 0.012, z2 - z1, white, x2, 0.012, (z1 + z2) / 2, { cast: false }));
    }
    S.add(box(0.3, 0.014, 8, mat('#facc15', { emissive: '#facc15', emissiveIntensity: 0.8 }), -9, 0.013, 24, { cast: false }));
    const startSign = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.8), new THREE.MeshBasicMaterial({ map: textTexture(['START / FINISH', 'Chạy vòng – E để bắt đầu'], { accent: '#facc15' }) }));
    startSign.position.set(-9, 2.8, 28.6);
    startSign.rotation.y = Math.PI;
    startSign.userData.noBake = true;
    S.add(startSign);
    for (const s of [-1, 1]) S.add(box(0.12, 2.8, 0.12, mat(C.metal), -9 + s * 2, 1.4, 28.6));
    ctx.add('running_track', -9, 24, -HALF_PI);
    // Khu tập ngoài trời
    list(ctx, ['pullup_bar', 'pullup_bar', 'battle_rope'], -27, -17, 4);
    row(ctx, 'upright_bike', -12, -17, 2.2, 5, 0);
    list(ctx, ['kettlebell', 'kettlebell', 'plyo_box', 'plyo_box'], -27, -6, 3.2);
    list(ctx, ['jump_rope', 'jump_rope'], -12, -6, 3.2);
    for (const z of [6, 10]) row(ctx, 'yoga_mat', -26, z, 1.6, 6, 0);
    for (const [x, z] of [[2, 4], [8, -8], [-18, 16], [6, 16]]) tree(ctx, x, z);
    bench(ctx, 2, 18, 3, true, '#a16207');
    // Vườn + tắm nắng
    for (const [x, z] of [[26, 14], [34, 14], [26, 26], [34, 26], [30, 20]]) tree(ctx, x, z);
    for (let i = 0; i < 6; i++) ctx.inst.add(tpl().lounger, 25 + i * 2.6, 0, -24, Math.PI);
    ctx.col(31.5, -24, 16, 1.8);
    for (let i = 0; i < 3; i++) {
      const u = new THREE.Group();
      u.position.set(26.3 + i * 5.2, 0, -21.5);
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
        pos: [6, -0.2, 14],
        ry: Math.PI,
        anim: 'meditate',
        greet: { emote: 'bow', text: 'Chạy 10 vòng sân thượng sẽ nhận huy hiệu Chạy bền 🙏', radius: 5 },
        app: { displayName: 'Sư phụ Gym', gender: 'male', skinColor: '#f5c9a0', hair: { style: 'bald', color: '#3b2a20' }, outfit: { style: 'robe', top: '#7c8fa6', bottom: '#7c8fa6', shoes: '#5b6b80' } },
      },
    ]),
};

export const FLOOR_DEFS = [FLOOR0, FLOOR1, FLOOR2, FLOOR3, FLOOR4];

// Vùng đường chạy vòng (sân thượng) để đếm vòng
export const TRACK = { cx: -9, cz: 0, outer: { x1: -38, x2: 20, z1: -28, z2: 28 }, inner: { x1: -30, x2: 12, z1: -20, z2: 20 } };

export { sphere, torus };
