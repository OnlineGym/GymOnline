import { BEAT_SECONDS_SHARED } from './audio.js';

/**
 * ================== CẤU HÌNH THIẾT BỊ (DATA) ==================
 * Thêm máy mới = thêm 1 dòng ở đây (nếu dùng lại kiểu khung `model.kind` đã có).
 *
 *  label/en   : tên hiển thị
 *  group      : nhóm cơ được cộng (chest/back/shoulders/arms/legs/core/stamina)
 *  anim       : animation nhân vật (client/src/character/animations.js)
 *  rep        : số giây / 1 rep (1 chu kỳ animation)
 *  cal        : kcal / phút
 *  exp        : EXP / rep
 *  unlock     : level tối thiểu để dùng
 *  model      : { kind, ...tham số } – kiểu khung 3D (client/src/equipment/builders.js)
 *  slots      : vị trí phụ cho người thứ 2 (spotter, cầm đích...) – mỗi slot khóa riêng
 *  klass      : lớp tập nhóm có điểm đồng bộ theo nhịp (aerobic/yoga/spin)
 *  utility    : thiết bị tiện ích (không tính buổi tập)
 *  freeMove   : được di chuyển tự do khi đang tập (chạy vòng sân thượng)
 */
const E = (label, en, group, anim, rep, cal, model, extra = {}) => ({ label, en, group, anim, rep, cal, model, exp: 3, unlock: 1, ...extra });
const U = (label, en, utility, anim, model, extra = {}) => ({ label, en, group: null, anim, model, utility, rep: 2, cal: 0, exp: 0, unlock: 1, ...extra });

const SPOT = { key: 'spot', label: 'Hỗ trợ (Spotter)', anim: 'spot', group: 'stamina', exp: 2, cal: 3, offset: { x: 0, z: -1.25 }, facing: 0 };

export const EQUIPMENT = {
  // ---------------- NGỰC ----------------
  chest_press: E('Máy đẩy ngực', 'Chest Press', 'chest', 'chestPress', 2.2, 7, { kind: 'chestPress' }),
  incline_chest_press: E('Máy đẩy ngực dốc', 'Incline Chest Press', 'chest', 'inclinePress', 2.2, 7, { kind: 'seat', handles: 'press', backAngle: -0.4 }, { unlock: 3 }),
  pec_deck: E('Máy ép ngực', 'Pec Deck', 'chest', 'pecDeck', 2.4, 6, { kind: 'pecDeck' }),
  bench_flat: E('Ghế đẩy ngực phẳng', 'Flat Bench Press', 'chest', 'benchPress', 2.4, 8, { kind: 'bench', angle: 0, rack: true }, { exp: 4, slots: [SPOT], params: { angle: 0 } }),
  bench_incline: E('Ghế đẩy ngực dốc lên', 'Incline Bench Press', 'chest', 'benchPress', 2.4, 8, { kind: 'bench', angle: 0.45, rack: true }, { exp: 4, unlock: 3, slots: [SPOT], params: { angle: 0.45 } }),
  bench_decline: E('Ghế đẩy ngực dốc xuống', 'Decline Bench Press', 'chest', 'benchPress', 2.4, 8, { kind: 'bench', angle: -0.22, rack: true }, { exp: 4, unlock: 5, slots: [SPOT], params: { angle: -0.22 } }),
  cable_crossover: E('Cáp chéo ngực', 'Cable Crossover', 'chest', 'crossover', 2.4, 6, { kind: 'cable', double: true }, { unlock: 4 }),
  dip_station: E('Xà kép', 'Dip Station', 'chest', 'dips', 2.2, 8, { kind: 'station', type: 'dip' }, { unlock: 2, exp: 4 }),

  // ---------------- LƯNG ----------------
  lat_pulldown: E('Máy kéo xô', 'Lat Pulldown', 'back', 'latPulldown', 2.4, 7, { kind: 'latPulldown' }),
  seated_row: E('Máy kéo cáp ngồi', 'Seated Row', 'back', 'seatedRow', 2.4, 7, { kind: 'seatedRow' }),
  tbar_row: E('Máy T-bar row', 'T-Bar Row', 'back', 'tbarRow', 2.4, 8, { kind: 'station', type: 'tbar' }, { unlock: 4 }),
  assisted_pullup: E('Máy hỗ trợ kéo xà', 'Assisted Pull-up', 'back', 'assistedPullup', 2.4, 7, { kind: 'station', type: 'assisted' }),
  hyperextension: E('Ghế ưỡn lưng', 'Hyperextension', 'back', 'hyperext', 2.4, 5, { kind: 'station', type: 'hyper' }, { unlock: 2 }),
  pullup_bar: E('Xà đơn', 'Pull-up', 'back', 'pullup', 2.4, 9, { kind: 'pullupBar' }, { exp: 4 }),

  // ---------------- VAI ----------------
  shoulder_press: E('Máy đẩy vai', 'Shoulder Press', 'shoulders', 'shoulderPress', 2.2, 6, { kind: 'seat', handles: 'overhead' }),
  lateral_raise: E('Máy dang vai', 'Lateral Raise', 'shoulders', 'lateralRaise', 2.2, 5, { kind: 'seat', handles: 'lateral', back: false }),
  rear_delt_fly: E('Máy vai sau', 'Rear Delt Fly', 'shoulders', 'rearDelt', 2.4, 5, { kind: 'seat', handles: 'reverseFly', back: false, chestPad: true }, { unlock: 2 }),
  face_pull: E('Kéo cáp lên mặt', 'Face Pull', 'shoulders', 'facePull', 2.2, 5, { kind: 'cable', height: 'high' }, { unlock: 3 }),
  landmine_press: E('Đẩy landmine', 'Landmine Press', 'shoulders', 'landminePress', 2.4, 7, { kind: 'platform', prop: 'landmine' }, { unlock: 6 }),

  // ---------------- TAY ----------------
  bicep_machine: E('Máy cuốn tay trước', 'Bicep Curl Machine', 'arms', 'bicepCurl', 2.0, 5, { kind: 'bicepMachine' }),
  preacher_curl: E('Ghế preacher curl', 'Preacher Curl', 'arms', 'preacherCurl', 2.0, 5, { kind: 'seat', handles: 'preacher', back: false }, { unlock: 2 }),
  tricep_machine: E('Máy duỗi tay sau', 'Tricep Extension', 'arms', 'tricepPress', 2.0, 5, { kind: 'tricepMachine' }),
  tricep_pushdown: E('Kéo cáp tay sau', 'Tricep Pushdown', 'arms', 'tricepPushdown', 2.0, 5, { kind: 'cable', height: 'high' }),
  cable_curl: E('Cuốn tay cáp', 'Cable Curl', 'arms', 'cableCurl', 2.0, 5, { kind: 'cable', height: 'low' }),
  ez_barbell: E('Thanh EZ & Barbell', 'Barbell Curl', 'arms', 'barbellCurl', 2.0, 6, { kind: 'platform', prop: 'barRack' }, { unlock: 2 }),
  dumbbell_bench: E('Ghế tập tạ đơn', 'Dumbbell Curl', 'arms', 'dumbbellCurl', 2.0, 6, { kind: 'dumbbellBench' }),

  // ---------------- CHÂN / MÔNG ----------------
  leg_press: E('Máy đạp đùi', 'Leg Press', 'legs', 'legPress', 2.4, 8, { kind: 'legPress' }),
  leg_extension: E('Máy đá đùi', 'Leg Extension', 'legs', 'legExtension', 2.2, 6, { kind: 'legExtension' }),
  leg_curl_lying: E('Máy móc đùi nằm', 'Lying Leg Curl', 'legs', 'legCurlLying', 2.2, 6, { kind: 'station', type: 'legCurl' }),
  leg_curl_seated: E('Máy móc đùi ngồi', 'Seated Leg Curl', 'legs', 'legCurlSeated', 2.2, 6, { kind: 'seat', handles: 'legCurl' }),
  hack_squat: E('Máy hack squat', 'Hack Squat', 'legs', 'hackSquat', 2.6, 9, { kind: 'station', type: 'hack' }, { unlock: 5, exp: 4 }),
  smith_machine: E('Smith machine', 'Smith Squat', 'legs', 'squat', 2.6, 9, { kind: 'rack', type: 'smith' }, { unlock: 4, exp: 4 }),
  power_rack: E('Power rack – Squat', 'Barbell Squat', 'legs', 'squat', 2.6, 10, { kind: 'rack', type: 'power' }, { unlock: 6, exp: 5, slots: [{ ...SPOT, offset: { x: 0, z: -0.8 } }] }),
  hip_thrust: E('Ghế hip thrust', 'Hip Thrust', 'legs', 'hipThrust', 2.4, 7, { kind: 'bench', angle: 0, low: true }, { unlock: 3 }),
  hip_abduction: E('Máy dạng đùi', 'Hip Abduction', 'legs', 'hipAbduction', 2.0, 5, { kind: 'seat', handles: 'abduct' }),
  hip_adduction: E('Máy khép đùi', 'Hip Adduction', 'legs', 'hipAdduction', 2.0, 5, { kind: 'seat', handles: 'abduct', inward: true }),
  calf_standing: E('Máy bắp chân đứng', 'Standing Calf Raise', 'legs', 'calfRaise', 1.6, 5, { kind: 'station', type: 'calf' }),
  calf_seated: E('Máy bắp chân ngồi', 'Seated Calf Raise', 'legs', 'calfSeated', 1.6, 4, { kind: 'seat', handles: 'calf', back: false }),
  glute_machine: E('Máy tập mông đa hướng', 'Multi-Hip Glute', 'legs', 'gluteKick', 2.0, 6, { kind: 'station', type: 'glute' }, { unlock: 2 }),

  // ---------------- BỤNG / CORE ----------------
  ab_crunch: E('Máy gập bụng', 'Ab Crunch', 'core', 'abCrunch', 2.0, 5, { kind: 'seat', handles: 'crunch' }),
  roman_chair: E('Ghế gập bụng La Mã', 'Roman Chair Sit-up', 'core', 'romanSitup', 2.4, 6, { kind: 'station', type: 'roman' }),
  torso_rotation: E('Máy xoay người', 'Torso Rotation', 'core', 'torsoRotation', 2.4, 5, { kind: 'seat', handles: 'rotation' }),
  plank_mat: E('Thảm plank', 'Plank', 'core', 'plank', 3, 5, { kind: 'mat', color: '#0ea5e9' }, { exp: 4 }),
  trx: E('Dây TRX', 'TRX Row', 'core', 'trxRow', 2.4, 7, { kind: 'station', type: 'trx' }, { unlock: 3 }),

  // ---------------- CARDIO ----------------
  treadmill: E('Máy chạy bộ', 'Treadmill', 'stamina', 'treadmill', 0.7, 11, { kind: 'treadmill' }, { exp: 1 }),
  elliptical: E('Máy elliptical', 'Elliptical', 'stamina', 'elliptical', 1.0, 10, { kind: 'cardio', type: 'elliptical' }, { exp: 1 }),
  upright_bike: E('Xe đạp tập', 'Upright Bike', 'stamina', 'bike', 0.8, 8, { kind: 'cardio', type: 'upright' }, { exp: 1 }),
  recumbent_bike: E('Xe đạp nằm', 'Recumbent Bike', 'stamina', 'recumbent', 0.9, 7, { kind: 'cardio', type: 'recumbent' }, { exp: 1 }),
  spin_bike: E('Xe đạp spin', 'Spin Class', 'stamina', 'spin', 0.6, 12, { kind: 'cardio', type: 'spin' }, { exp: 1, klass: 'spin' }),
  rowing_machine: E('Máy chèo thuyền', 'Rowing Machine', 'back', 'rowing', 2.0, 10, { kind: 'cardio', type: 'rower' }, { exp: 2 }),
  stair_climber: E('Máy leo cầu thang', 'Stair Climber', 'legs', 'stairClimb', 0.9, 11, { kind: 'cardio', type: 'stair' }, { exp: 1, unlock: 2 }),
  assault_bike: E('Xe đạp gió', 'Assault Bike', 'stamina', 'assaultBike', 0.7, 14, { kind: 'cardio', type: 'assault' }, { exp: 1, unlock: 5 }),
  ski_erg: E('Máy trượt tuyết', 'Ski Erg', 'stamina', 'skiErg', 1.4, 12, { kind: 'cardio', type: 'ski' }, { exp: 2, unlock: 4 }),

  // ---------------- FUNCTIONAL / CROSSFIT ----------------
  kettlebell: E('Kettlebell swing', 'Kettlebell', 'legs', 'kbSwing', 1.6, 10, { kind: 'platform', prop: 'kettlebell' }),
  battle_rope: E('Dây kéo', 'Battle Rope', 'stamina', 'battleRope', 0.6, 12, { kind: 'battleRope' }, { exp: 1 }),
  sled: E('Đẩy xe trượt', 'Sled Push', 'legs', 'sledPush', 0.8, 13, { kind: 'platform', prop: 'sled' }, { exp: 2, unlock: 4 }),
  plyo_box: E('Nhảy hộp', 'Box Jump', 'legs', 'boxJump', 1.8, 10, { kind: 'platform', prop: 'box' }),
  slam_ball: E('Đập bóng', 'Slam Ball', 'core', 'ballSlam', 1.6, 10, { kind: 'platform', prop: 'slamball' }),
  medicine_ball: E('Bóng tạ', 'Medicine Ball', 'chest', 'ballThrow', 2.0, 8, { kind: 'medicineBall' }),
  tire_flip: E('Lật lốp xe', 'Tire Flip', 'legs', 'tireFlip', 3.0, 13, { kind: 'platform', prop: 'tire' }, { exp: 5, unlock: 6 }),
  farmers_walk: E("Farmer's walk", "Farmer's Walk", 'arms', 'farmerWalk', 1.2, 9, { kind: 'platform', prop: 'farmer' }, { exp: 2 }),
  trap_bar: E('Deadlift trap bar', 'Trap Bar Deadlift', 'back', 'deadlift', 2.6, 10, { kind: 'platform', prop: 'trapbar' }, { exp: 5, unlock: 3 }),
  jump_rope: E('Nhảy dây', 'Jump Rope', 'stamina', 'jumpRope', 0.5, 12, { kind: 'platform', prop: 'rope' }, { exp: 1 }),

  // ---------------- VÕ / BOXING ----------------
  heavy_bag: E('Bao cát', 'Heavy Bag', 'arms', 'boxBag', 1.2, 11, { kind: 'bag', type: 'heavy' }, { exp: 2 }),
  speed_bag: E('Bóng tốc độ', 'Speed Bag', 'shoulders', 'speedBag', 0.5, 8, { kind: 'bag', type: 'speed' }, { exp: 1, unlock: 2 }),
  pad_mitts: E('Đấm đích (Pad mitts)', 'Pad Mitts', 'arms', 'padPunch', 1.0, 10, { kind: 'mat', color: '#ef4444', pads: true }, {
    exp: 2,
    slots: [{ key: 'holder', label: 'Cầm đích cho bạn', anim: 'padHold', group: 'shoulders', exp: 2, cal: 5, offset: { x: 0, z: 1.1 }, facing: Math.PI }],
  }),

  // ---------------- THƯ GIÃN / KHÁC ----------------
  foam_roller: E('Con lăn giãn cơ', 'Foam Roller', 'stamina', 'foamRoll', 3, 3, { kind: 'mat', color: '#f97316', roller: true }),
  stretch_mat: E('Thảm giãn cơ', 'Stretching', 'stamina', 'stretch', 4, 4, { kind: 'mat', color: '#c084fc' }),
  yoga_mat: E('Lớp Yoga', 'Yoga Class', 'core', 'yogaFlow', 4, 5, { kind: 'mat', color: '#34d399' }, { klass: 'yoga' }),
  aerobic_spot: E('Lớp Aerobic', 'Aerobic Dance', 'stamina', 'aerobic', BEAT_SECONDS_SHARED * 2, 9, { kind: 'aerobicSpot' }, { exp: 1, klass: 'aerobic' }),
  pool_lane: E('Làn bơi', 'Swimming', 'stamina', 'swim', 1.6, 12, { kind: 'spot', marker: '#38bdf8' }, { exp: 2 }),
  sauna_seat: E('Ghế xông hơi', 'Sauna', 'stamina', 'sauna', 5, 2, { kind: 'spot' }, { exp: 1 }),
  steam_seat: E('Phòng xông hơi ướt', 'Steam Room', 'stamina', 'steam', 5, 2, { kind: 'spot' }, { exp: 1 }),
  massage_table: E('Bàn massage', 'Massage', 'stamina', 'massageLie', 5, 1, { kind: 'massage', type: 'table' }, { exp: 1 }),
  massage_chair: E('Ghế massage', 'Massage Chair', 'stamina', 'massageChair', 5, 1, { kind: 'massage', type: 'chair' }, { exp: 1 }),
  running_track: E('Đường chạy vòng', 'Rooftop Track', 'stamina', 'run', 20, 10, { kind: 'spot', marker: '#facc15' }, { exp: 8, freeMove: true, minRep: 12 }),

  // ---------------- TIỆN ÍCH ----------------
  inbody: U('Cân đo InBody', 'Body Scan', 'inbody', 'inbody', { kind: 'inbody' }),
  shop_whey: U('Cửa hàng Whey', 'Supplement Shop', 'shop', 'shopping', { kind: 'counter', type: 'whey' }),
  juice_bar: U('Quầy Juice Bar', 'Juice Bar', 'shop', 'shopping', { kind: 'counter', type: 'juice' }),
  locker: U('Tủ đồ – Thay trang phục', 'Locker', 'wardrobe', 'locker', { kind: 'locker' }),
  toilet: U('Đi vệ sinh', 'Toilet', 'timed', 'toilet', { kind: 'toilet' }, { duration: 5 }),
  sink: U('Rửa tay', 'Sink', 'timed', 'washHands', { kind: 'sink' }, { duration: 3.5 }),
  elevator: U('Thang máy', 'Elevator', 'transit', 'elevator', { kind: 'spot' }, { shared: true }),
  stairs_up: U('Cầu thang lên', 'Stairs Up', 'transit', 'climb', { kind: 'spot' }, { shared: true, dir: 1 }),
  stairs_down: U('Cầu thang xuống', 'Stairs Down', 'transit', 'climb', { kind: 'spot' }, { shared: true, dir: -1 }),
  escalator_up: U('Thang cuốn lên', 'Escalator Up', 'transit', 'idle', { kind: 'spot' }, { shared: true, dir: 1 }),
  escalator_down: U('Thang cuốn xuống', 'Escalator Down', 'transit', 'idle', { kind: 'spot' }, { shared: true, dir: -1 }),
};

// Thông tin cho 1 slot cụ thể (slot 0 = vị trí chính)
export function slotInfo(type, slot = 0) {
  const base = EQUIPMENT[type];
  if (!base) return null;
  if (!slot) return base;
  const s = base.slots?.[slot - 1];
  if (!s) return null;
  return { ...base, ...s, label: s.label, unlock: base.unlock, slots: undefined };
}

export const minRepSec = (info) => info.minRep ?? info.rep * 0.7;

// Nhóm hiển thị trong "Tìm máy trống"
export const EQUIPMENT_GROUP_LABEL = {
  chest: 'Ngực',
  back: 'Lưng',
  shoulders: 'Vai',
  arms: 'Tay',
  legs: 'Chân / Mông',
  core: 'Bụng / Core',
  stamina: 'Cardio / Thể lực',
};
