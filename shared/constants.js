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
  { id: 3, key: '3', name: 'Tầng 3 – Studio, Pilates & Võ thuật', color: '#a78bfa' },
  { id: 4, key: 'R', name: 'Sân thượng – Ngoài trời', color: '#84cc16' },
];
export const SPAWN_FLOOR = 1;
export const SPAWN = { x: 0, z: 18.5 };
// Sảnh thang máy (giống nhau mọi tầng) – điểm đến khi đổi tầng
export const TRANSIT_ARRIVAL = { x: 31, z: 0 };
export const FLOOR_BOUNDS = { minX: -18, maxX: 40, minZ: -21, maxZ: 21 };
export const WORLD_BOUNDS = { minX: -20, maxX: 42, minZ: -23, maxZ: 31 }; // gồm sân trước

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
  'dive', 'tread', 'ride', 'sitFloor', 'lieRest', 'pilatesReformer', 'pilatesRollUp', 'pilatesTeaser',
];
// Phòng có nhạc YouTube chung (tầng 3)
//  search: tự tìm nhạc theo từ khóa (cần YOUTUBE_API_KEY) | first/playlist: bài mở đầu + danh sách mặc định
export const MUSIC_ROOMS = {
  aerobic: { label: '🎵 Nhạc Aerobic', f: 3, x1: -18, x2: -3, z1: 8, z2: 21, search: true },
  yoga: { label: '🧘 Nhạc Yoga', f: 3, x1: -3, x2: 10, z1: 8, z2: 21, search: false, first: 'PXYs2NskGio', playlist: 'RDPXYs2NskGio', noPanel: true },
};
export const musicRoomAt = (f, x, z) => {
  for (const [id, r] of Object.entries(MUSIC_ROOMS)) if (f === r.f && x > r.x1 && x < r.x2 && z > r.z1 && z < r.z2) return id;
  return null;
};

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
  raceRow: { label: 'Đua chèo thuyền', icon: '🚣', min: 2, max: 8, sec: 90, coins: 50, exp: 35, distance: 300 },
  raceBike: { label: 'Đua xe đạp', icon: '🚴', min: 2, max: 8, sec: 90, coins: 50, exp: 35, distance: 300 },
};

// Vật phẩm cửa hàng (mua bằng coins)
export const ITEMS = {
  whey: { label: 'Whey Protein', icon: '🥤', price: 60, type: 'drink', buff: { kind: 'exp', mult: 1.25, sec: 600 }, desc: '+25% EXP trong 10 phút' },
  smoothie: { label: 'Sinh tố bơ', icon: '🥑', price: 40, type: 'drink', buff: { kind: 'exp', mult: 1.15, sec: 900 }, desc: '+15% EXP trong 15 phút' },
  juice: { label: 'Nước cam', icon: '🧃', price: 25, type: 'drink', buff: { kind: 'cal', mult: 1.2, sec: 600 }, desc: '+20% calo đốt trong 10 phút' },
  energy: { label: 'Nước tăng lực', icon: '⚡', price: 35, type: 'drink', buff: { kind: 'speed', mult: 1.25, sec: 300 }, desc: 'Chạy nhanh hơn 25% trong 5 phút' },
  bar: { label: 'Thanh protein', icon: '🍫', price: 30, type: 'drink', buff: { kind: 'exp', mult: 1.1, sec: 1200 }, desc: '+10% EXP trong 20 phút' },
  coffee: { label: 'Cà phê đen', icon: '☕', price: 20, type: 'drink', buff: { kind: 'speed', mult: 1.15, sec: 300 }, desc: 'Chạy nhanh hơn 15% trong 5 phút' },
  water: { label: 'Nước suối', icon: '💧', price: 5, type: 'drink', buff: { kind: 'stat', mult: 1.1, sec: 300 }, desc: '+10% chỉ số cơ trong 5 phút' },
  headband: { label: 'Băng đô thể thao', icon: '🎽', price: 120, type: 'accessory', desc: 'Phụ kiện đội đầu' },
  cap: { label: 'Mũ lưỡi trai', icon: '🧢', price: 150, type: 'accessory', desc: 'Phụ kiện đội đầu' },
  towel: { label: 'Khăn vắt cổ', icon: '🧣', price: 90, type: 'accessory', desc: 'Khăn tập gym' },
  gloves: { label: 'Găng boxing', icon: '🥊', price: 200, type: 'accessory', desc: 'Găng đỏ cực ngầu' },
  sunglasses: { label: 'Kính râm', icon: '🕶️', price: 180, type: 'accessory', desc: 'Ngầu cả trong phòng gym' },
  beanie: { label: 'Mũ len', icon: '🧶', price: 140, type: 'accessory', desc: 'Mũ len có quả bông' },
  visor: { label: 'Mũ lưỡi trai hở đỉnh', icon: '🎾', price: 130, type: 'accessory', desc: 'Chống chói khi chạy sân thượng' },
  medal: { label: 'Huy chương vàng', icon: '🏅', price: 400, type: 'accessory', desc: 'Đeo trước ngực' },
  backpack: { label: 'Balo thể thao', icon: '🎒', price: 260, type: 'accessory', desc: 'Balo đeo sau lưng' },
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
  streak_7: { label: 'Bền bỉ', icon: '🔥', desc: 'Điểm danh 7 ngày liên tiếp' },
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
export const BOXING_RING = { f: 3, x: -8.5, z: -9.5, size: 7 };
// Tốc độ tối đa server cho phép (m/s) – chống hack tốc độ
export const MAX_SPEED = 6.8;

export const PARTY_MAX = 5;
export const PARTY_DAILY_GOAL = 1500; // kcal cả nhóm / ngày
export const GUILD_MAX = 50;
export const GUILD_COST = 300;

// Hướng dẫn tân thủ, điểm danh, nhiệm vụ
export const TUTORIAL_REWARD = 100;
export const CHECKIN_REWARDS = [20, 30, 40, 50, 60, 80, 150]; // xu theo ngày trong chuỗi 7 ngày
export const DAILY_QUESTS = {
  d_workouts3: { label: 'Hoàn thành 3 buổi tập', icon: '💪', kind: 'workouts', goal: 3, coins: 40, exp: 30 },
  d_workouts5: { label: 'Hoàn thành 5 buổi tập', icon: '🏋️', kind: 'workouts', goal: 5, coins: 70, exp: 50 },
  d_cal150: { label: 'Đốt 150 kcal', icon: '🔥', kind: 'calories', goal: 150, coins: 40, exp: 30 },
  d_cal400: { label: 'Đốt 400 kcal', icon: '🔥', kind: 'calories', goal: 400, coins: 80, exp: 60 },
  d_min10: { label: 'Tập đủ 10 phút', icon: '⏱️', kind: 'minutes', goal: 10, coins: 50, exp: 40 },
  d_legs: { label: 'Tập chân 2 buổi', icon: '🦵', kind: 'stat_legs', goal: 2, coins: 40, exp: 30 },
  d_chest: { label: 'Tập ngực 2 buổi', icon: '🫁', kind: 'stat_chest', goal: 2, coins: 40, exp: 30 },
  d_back: { label: 'Tập lưng 2 buổi', icon: '🔙', kind: 'stat_back', goal: 2, coins: 40, exp: 30 },
  d_stamina: { label: 'Tập cardio 2 buổi', icon: '🏃', kind: 'stat_stamina', goal: 2, coins: 40, exp: 30 },
  d_challenge: { label: 'Chơi 1 trận thách đấu', icon: '⚔️', kind: 'challenge', goal: 1, coins: 60, exp: 40 },
};
export const WEEKLY_QUESTS = {
  w_workouts: { label: 'Hoàn thành 25 buổi tập', icon: '📅', kind: 'workouts', goal: 25, coins: 300, exp: 250 },
  w_cal: { label: 'Đốt 2.000 kcal', icon: '🔥', kind: 'calories', goal: 2000, coins: 300, exp: 250 },
  w_min: { label: 'Tập đủ 90 phút', icon: '⏱️', kind: 'minutes', goal: 90, coins: 300, exp: 250 },
  w_win: { label: 'Thắng 5 trận thách đấu', icon: '🏆', kind: 'win', goal: 5, coins: 400, exp: 300 },
};
