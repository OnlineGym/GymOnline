// ================== HẰNG SỐ DÙNG CHUNG CLIENT + SERVER ==================

// 7 nhóm chỉ số cơ bắp
export const STATS = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core', 'stamina'];
export const STAT_LABELS = {
  chest: 'Ngực',
  back: 'Lưng',
  shoulders: 'Vai',
  arms: 'Tay',
  legs: 'Chân',
  core: 'Bụng',
  stamina: 'Thể lực',
};
export const STAT_ICONS = { chest: '🫁', back: '🦾', shoulders: '🏔️', arms: '💪', legs: '🦵', core: '🧱', stamina: '❤️' };
export const STAT_COLORS = {
  chest: '#ff5d7a',
  back: '#4dabf7',
  shoulders: '#b197fc',
  arms: '#fcc419',
  legs: '#51cf66',
  core: '#ff922b',
  stamina: '#22d3ee',
};

export const expToNext = (level) => 100 + (level - 1) * 60;

// Tòa nhà nhiều tầng
export const FLOORS = [
  { id: 0, key: 'B1', name: 'Tầng hầm – Spa & Bể bơi', color: '#0ea5e9' },
  { id: 1, key: '1', name: 'Tầng 1 – Sảnh & Cardio', color: '#22d3ee' },
  { id: 2, key: '2', name: 'Tầng 2 – Strength', color: '#f43f5e' },
  { id: 3, key: '3', name: 'Tầng 3 – Studio & Võ thuật', color: '#a78bfa' },
  { id: 4, key: 'R', name: 'Sân thượng – Ngoài trời', color: '#84cc16' },
];
export const SPAWN_FLOOR = 1;
export const SPAWN = { x: 0, z: 24 };
// Sảnh thang máy (giống nhau mọi tầng) – điểm đến khi đổi tầng
export const TRANSIT_ARRIVAL = { x: 31, z: 0 };
export const FLOOR_BOUNDS = { minX: -40, maxX: 40, minZ: -30, maxZ: 30 };
export const WORLD_BOUNDS = { minX: -42, maxX: 42, minZ: -32, maxZ: 40 }; // gồm sân trước

// Channel / instance
export const CHANNEL_MAX = 120; // số người tối đa / channel
export const CHANNEL_HARD_MAX = 150; // vượt mức khi vào theo bạn bè
export const CHANNEL_AUTO_FILL = 0.8; // tự phân bổ ưu tiên channel < 80% để cân bằng

// Giao thức mạng: lượng tử hóa vị trí (1 đơn vị = 5cm) để gửi số nguyên
export const QUANT = 20;
export const q = (v) => Math.round(v * QUANT);
export const dq = (v) => v / QUANT;
export const qa = (rad) => Math.round(rad * 100);
export const dqa = (v) => v / 100;

// AOI: khoảng cách và tần suất gửi (tick server = 15Hz)
export const AOI = {
  cell: 16, // ô lưới 16m
  near: 18, // < 18m: mỗi tick (15Hz)
  mid: 34, // < 34m: mỗi 3 tick (5Hz)
  far: 52, // < 52m: mỗi 5 tick (3Hz); xa hơn: không gửi
  nearbyChat: 14,
};

// Bảng chỉ số animation để gửi qua mạng bằng số thay vì chuỗi
export const ANIM_NAMES = [
  'idle', 'walk', 'run', 'jump', 'sit', 'meditate',
  'chestPress', 'pecDeck', 'latPulldown', 'seatedRow', 'legPress', 'legExtension', 'bicepCurl', 'tricepPress',
  'treadmill', 'dumbbellCurl', 'pullup', 'battleRope', 'stretch', 'ballThrow', 'aerobic', 'sauna', 'toilet',
  'washHands', 'locker',
  'benchPress', 'spot', 'crossover', 'dips', 'inclinePress', 'tbarRow', 'assistedPullup', 'hyperext',
  'shoulderPress', 'lateralRaise', 'rearDelt', 'facePull', 'landminePress', 'preacherCurl', 'tricepPushdown',
  'cableCurl', 'barbellCurl', 'legCurlLying', 'legCurlSeated', 'hackSquat', 'squat', 'hipThrust', 'hipAbduction',
  'hipAdduction', 'calfRaise', 'calfSeated', 'gluteKick', 'abCrunch', 'romanSitup', 'torsoRotation', 'plank',
  'trxRow', 'elliptical', 'bike', 'recumbent', 'spin', 'rowing', 'stairClimb', 'assaultBike', 'skiErg',
  'kbSwing', 'sledPush', 'boxJump', 'ballSlam', 'tireFlip', 'farmerWalk', 'deadlift', 'jumpRope',
  'boxBag', 'speedBag', 'padPunch', 'padHold', 'foamRoll', 'yogaFlow', 'swim', 'massageLie', 'massageChair',
  'inbody', 'shopping', 'pushup', 'armWrestle', 'sparIdle', 'sparPunch', 'sparBlock', 'sparDodge', 'sparHit',
  'sparKO', 'handshake', 'highfive', 'fistbump', 'hug', 'pat', 'coupleDance', 'steam', 'elevator', 'climb',
];
export const ANIM_INDEX = Object.fromEntries(ANIM_NAMES.map((n, i) => [n, i]));

export const EMOTES = ['wave', 'laugh', 'cool', 'tired', 'flex', 'dance', 'cheer', 'bow'];

// Emote đôi (cả 2 phải đồng ý)
export const PAIR_EMOTES = {
  handshake: { label: 'Bắt tay', icon: '🤝', anim: 'handshake', sec: 3 },
  highfive: { label: 'High-five', icon: '🙌', anim: 'highfive', sec: 2.5 },
  fistbump: { label: 'Cụng tay', icon: '👊', anim: 'fistbump', sec: 2.5 },
  hug: { label: 'Ôm', icon: '🤗', anim: 'hug', sec: 3.5 },
  pat: { label: 'Vỗ vai', icon: '🫶', anim: 'pat', sec: 3 },
  coupleDance: { label: 'Khiêu vũ đôi', icon: '💃', anim: 'coupleDance', sec: 8 },
};

// Thách đấu / minigame 2 người trở lên
export const CHALLENGES = {
  armWrestle: { label: 'Vật tay', icon: '💪', min: 2, max: 2, sec: 20, coins: 30, exp: 25 },
  spar: { label: 'Sparring Boxing', icon: '🥊', min: 2, max: 2, sec: 90, coins: 40, exp: 30 },
  pushup: { label: 'Thi hít đất', icon: '🙇', min: 2, max: 8, sec: 30, coins: 30, exp: 25 },
  squat: { label: 'Thi squat', icon: '🏋️', min: 2, max: 8, sec: 30, coins: 30, exp: 25 },
  plank: { label: 'Thi plank', icon: '🧱', min: 2, max: 8, sec: 120, coins: 30, exp: 25 },
  race: { label: 'Đua chạy bộ', icon: '🏃', min: 2, max: 8, sec: 90, coins: 50, exp: 35, distance: 300 },
};

// Vật phẩm cửa hàng (mua bằng coins)
export const ITEMS = {
  whey: { label: 'Whey Protein', icon: '🥤', price: 60, type: 'drink', buff: { kind: 'exp', mult: 1.25, sec: 600 }, desc: '+25% EXP trong 10 phút' },
  smoothie: { label: 'Sinh tố bơ', icon: '🥑', price: 40, type: 'drink', buff: { kind: 'exp', mult: 1.15, sec: 900 }, desc: '+15% EXP trong 15 phút' },
  juice: { label: 'Nước cam', icon: '🧃', price: 25, type: 'drink', buff: { kind: 'cal', mult: 1.2, sec: 600 }, desc: '+20% calo đốt trong 10 phút' },
  energy: { label: 'Nước tăng lực', icon: '⚡', price: 35, type: 'drink', buff: { kind: 'speed', mult: 1.25, sec: 300 }, desc: 'Chạy nhanh hơn 25% trong 5 phút' },
  water: { label: 'Nước suối', icon: '💧', price: 5, type: 'drink', buff: { kind: 'stat', mult: 1.1, sec: 300 }, desc: '+10% chỉ số cơ trong 5 phút' },
  headband: { label: 'Băng đô thể thao', icon: '🎽', price: 120, type: 'accessory', desc: 'Phụ kiện đội đầu' },
  cap: { label: 'Mũ lưỡi trai', icon: '🧢', price: 150, type: 'accessory', desc: 'Phụ kiện đội đầu' },
  towel: { label: 'Khăn vắt cổ', icon: '🧣', price: 90, type: 'accessory', desc: 'Khăn tập gym' },
  gloves: { label: 'Găng boxing', icon: '🥊', price: 200, type: 'accessory', desc: 'Găng đỏ cực ngầu' },
  crown: { label: 'Vương miện', icon: '👑', price: 1000, type: 'accessory', desc: 'Dành cho nhà vô địch' },
};

// Thành tích / huy hiệu
export const ACHIEVEMENTS = {
  first_workout: { label: 'Buổi tập đầu tiên', icon: '🎯', desc: 'Hoàn thành 1 buổi tập' },
  workouts_10: { label: 'Chăm chỉ', icon: '📅', desc: '10 buổi tập' },
  workouts_100: { label: 'Gym rat', icon: '🐀', desc: '100 buổi tập' },
  level_5: { label: 'Level 5', icon: '⭐', desc: 'Đạt level 5' },
  level_10: { label: 'Level 10', icon: '🌟', desc: 'Đạt level 10' },
  level_20: { label: 'Level 20', icon: '💫', desc: 'Đạt level 20' },
  calories_1000: { label: 'Lò đốt mỡ', icon: '🔥', desc: 'Đốt tổng 1000 kcal' },
  all_groups: { label: 'Toàn diện', icon: '🧬', desc: 'Tập đủ 7 nhóm cơ' },
  first_friend: { label: 'Kết bạn', icon: '🤝', desc: 'Có người bạn đầu tiên' },
  party_up: { label: 'Đồng đội', icon: '👥', desc: 'Tập khi đang trong party' },
  challenge_win: { label: 'Nhà vô địch', icon: '🏆', desc: 'Thắng 1 trận thách đấu' },
  spar_win: { label: 'Tay đấm', icon: '🥊', desc: 'Thắng sparring' },
  guild_member: { label: 'Thành viên CLB', icon: '🛡️', desc: 'Tham gia CLB' },
  track_10: { label: 'Chạy bền', icon: '🏁', desc: 'Chạy 10 vòng sân thượng' },
  generous: { label: 'Hào phóng', icon: '🎁', desc: 'Tặng quà cho người khác' },
  golden_hour: { label: 'Giờ vàng', icon: '🌅', desc: 'Tập trong giờ vàng' },
};

// Sự kiện định kỳ (tính theo giờ server, giống nhau ở mọi instance)
export function activeEvents(date = new Date()) {
  const events = [];
  if (date.getMinutes() < 10) events.push({ key: 'golden', label: 'Giờ vàng: x2 EXP', icon: '🌅', expMult: 2 });
  const d = date.getDay();
  if (d === 0 || d === 6) events.push({ key: 'weekend', label: 'Giải đấu cuối tuần: x2 thưởng thách đấu', icon: '🏆', challengeMult: 2 });
  return events;
}

// Võ đài boxing (tầng 3) – nơi diễn ra sparring
export const BOXING_RING = { f: 3, x: -23, z: -14, size: 7 };
// Tốc độ tối đa server cho phép (m/s) – chống hack tốc độ
export const MAX_SPEED = 6.8;

export const PARTY_MAX = 5;
export const PARTY_DAILY_GOAL = 1500; // kcal cả nhóm / ngày
export const GUILD_MAX = 50;
export const GUILD_COST = 300;
