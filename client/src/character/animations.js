/**
 * Animation viết bằng code: mỗi hàm trả về "tư thế" (góc các khớp) theo thời gian.
 * Nhân vật sẽ nội suy mượt từ tư thế hiện tại sang tư thế mục tiêu mỗi frame.
 *
 * Quy ước góc (nhân vật nhìn về +Z):
 *  - armX âm  = vung tay ra trước / giơ lên (−π/2 ngang vai, −π thẳng lên trời)
 *  - armZ dương = dạng tay sang ngang; armY dương = khép tay vào phía trước (động tác ép ngực)
 *  - elbow âm = gập khuỷu; twist = xoay mặt phẳng gập khuỷu (dùng cho flex cơ bắp)
 *  - legX âm  = đưa chân ra trước; knee dương = gập gối
 *  - spineX dương = cúi người về trước
 */
export const HIPS = 0.34;

export const BASE_POSE = {
  hipsY: HIPS,
  bounce: 0,
  spineX: 0,
  spineY: 0,
  spineZ: 0,
  headX: 0,
  headY: 0,
  headZ: 0,
  lArmX: 0,
  lArmY: 0,
  lArmZ: 0.28,
  lElbow: -0.15,
  lTwist: 0,
  rArmX: 0,
  rArmY: 0,
  rArmZ: 0.28,
  rElbow: -0.15,
  rTwist: 0,
  lLegX: 0,
  lLegZ: 0.04,
  lKnee: 0,
  rLegX: 0,
  rLegZ: 0.04,
  rKnee: 0,
};

const TAU = Math.PI * 2;
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (k) => k * k * (3 - 2 * k);
const pos = (v) => Math.max(0, v);

// Tư thế ngồi (đùi nằm ngang, cẳng chân thả xuống)
const SIT = { lLegX: -1.5, lKnee: 1.45, rLegX: -1.5, rKnee: 1.45, lLegZ: 0.12, rLegZ: 0.12 };

// Gán đối xứng cho 2 tay
const arms = (x, z, elbow, y = 0, twist = 0) => ({
  lArmX: x,
  lArmZ: z,
  lElbow: elbow,
  lArmY: y,
  lTwist: twist,
  rArmX: x,
  rArmZ: z,
  rElbow: elbow,
  rArmY: y,
  rTwist: twist,
});

function blendPoses(a, b, k) {
  const out = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const va = a[key] ?? BASE_POSE[key];
    const vb = b[key] ?? BASE_POSE[key];
    out[key] = typeof va === 'number' ? lerp(va, vb, k) : k < 0.5 ? va : vb;
  }
  return out;
}

// Chuỗi keyframe lặp theo phase 0..1
function keyframes(list, phase) {
  const n = list.length;
  const f = phase * n;
  const i = Math.floor(f) % n;
  return blendPoses(list[i], list[(i + 1) % n], smooth(f - Math.floor(f)));
}

// ===================== DI CHUYỂN =====================
function idle(t) {
  const b = Math.sin(t * 2.2);
  const look = Math.sin(t * 0.37) * Math.sin(t * 0.23);
  return {
    spineX: 0.02 * b,
    bounce: 0.006 * b,
    lArmZ: 0.28 + 0.03 * b,
    rArmZ: 0.28 + 0.03 * b,
    headY: look * 0.35,
    headX: -0.03 * b,
    headZ: Math.sin(t * 0.6) * 0.04,
  };
}

function walk(t) {
  const w = t * 10;
  const s = Math.sin(w);
  return {
    lLegX: s * 0.6,
    rLegX: -s * 0.6,
    lKnee: pos(Math.sin(w + 1.3)) * 0.9,
    rKnee: pos(Math.sin(w + 1.3 + Math.PI)) * 0.9,
    lArmX: -s * 0.65,
    rArmX: s * 0.65,
    lElbow: -0.35,
    rElbow: -0.35,
    bounce: Math.abs(Math.sin(w)) * 0.035,
    spineZ: s * 0.07, // dáng đi lạch bạch đáng yêu
    spineY: s * 0.1,
    headZ: -s * 0.05,
  };
}

function run(t) {
  const w = t * 15;
  const s = Math.sin(w);
  return {
    lLegX: s * 0.95,
    rLegX: -s * 0.95,
    lKnee: pos(Math.sin(w + 1.2)) * 1.5 + 0.2,
    rKnee: pos(Math.sin(w + 1.2 + Math.PI)) * 1.5 + 0.2,
    lArmX: -s * 0.95,
    rArmX: s * 0.95,
    lElbow: -1.3,
    rElbow: -1.3,
    lArmZ: 0.35,
    rArmZ: 0.35,
    bounce: Math.abs(Math.sin(w)) * 0.07,
    spineX: 0.2,
    spineY: s * 0.12,
    headX: -0.12,
  };
}

// ===================== MÁY TẬP =====================
const chestPress = (_t, { p }) => ({ ...SIT, spineX: -0.05, ...arms(-1.25 - p * 0.3, 0.75 - p * 0.55, -1.5 + p * 1.4) });

const pecDeck = (_t, { p }) => ({ ...SIT, spineX: -0.05, ...arms(-0.05, 1.45, -0.35, p * 1.25) });

const latPulldown = (_t, { p }) => ({
  ...SIT,
  headX: -0.18 + p * 0.1,
  spineX: -0.08,
  ...arms(-2.85 + p * 0.75, 0.35 + p * 0.8, -0.15 - p * 1.8),
});

const seatedRow = (_t, { p }) => ({
  ...SIT,
  lLegX: -1.35,
  rLegX: -1.35,
  lKnee: 1.0,
  rKnee: 1.0,
  spineX: 0.12 - p * 0.25,
  ...arms(-1.45 + p * 1.15, 0.22, -0.1 - p * 1.7),
});

const legPress = (_t, { p }) => ({
  spineX: -0.35,
  headX: 0.25,
  lLegX: -2.0 + p * 0.55,
  rLegX: -2.0 + p * 0.55,
  lKnee: 1.6 - p * 1.45,
  rKnee: 1.6 - p * 1.45,
  lLegZ: 0.15,
  rLegZ: 0.15,
  ...arms(-0.25, 0.55, -0.6),
});

const legExtension = (_t, { p }) => ({ ...SIT, lKnee: 1.5 - p * 1.35, rKnee: 1.5 - p * 1.35, spineX: -0.05, ...arms(0.15, 0.6, -0.3) });

const bicepCurl = (_t, { p }) => ({ ...SIT, spineX: 0.25, headX: -0.15, ...arms(-0.95, 0.2, -0.25 - p * 1.9) });

const tricepPress = (_t, { p }) => ({ ...SIT, spineX: -0.03, ...arms(-0.25, 0.45, -(1.7 - p * 1.55)) });

const treadmill = (t) => run(t * 0.9);

function dumbbellCurl(_t, { phase }) {
  const pl = 0.5 - 0.5 * Math.cos(phase * TAU);
  const pr = 0.5 - 0.5 * Math.cos(phase * TAU + Math.PI);
  return {
    ...SIT,
    spineX: 0.05,
    headY: (pl - pr) * 0.25,
    lArmX: -0.15,
    rArmX: -0.15,
    lArmZ: 0.3,
    rArmZ: 0.3,
    lElbow: -0.2 - pl * 2.0,
    rElbow: -0.2 - pr * 2.0,
  };
}

const pullup = (_t, { p }) => ({
  bounce: p * 0.3,
  spineX: -0.05,
  headX: -0.15,
  lLegX: -0.2,
  rLegX: -0.1,
  lKnee: 0.8,
  rKnee: 0.7,
  ...arms(-2.95 + p * 0.25, 0.3 + p * 0.75, -p * 1.9),
});

function battleRope(t) {
  const w = Math.sin(t * 10);
  return {
    hipsY: HIPS - 0.04,
    lLegX: -0.55,
    rLegX: -0.55,
    lKnee: 0.95,
    rKnee: 0.95,
    lLegZ: 0.22,
    rLegZ: 0.22,
    spineX: 0.25,
    headX: -0.2,
    bounce: Math.abs(w) * 0.01,
    lArmX: -0.9 + w * 0.45,
    rArmX: -0.9 - w * 0.45,
    lArmZ: 0.25,
    rArmZ: 0.25,
    lElbow: -0.4,
    rElbow: -0.4,
  };
}

const STRETCH_KEYS = [
  { ...arms(-3.0, 0.2, -0.1), headX: -0.2, bounce: 0.03 },
  { ...arms(-3.0, 0.4, -0.2), spineZ: 0.45, headZ: 0.2 },
  { ...arms(-3.0, 0.4, -0.2), spineZ: -0.45, headZ: -0.2 },
  { ...arms(-0.6, 0.15, -0.1), spineX: 0.95, headX: 0.3, lLegZ: 0.15, rLegZ: 0.15 },
];
const stretch = (_t, { phase }) => ({ ...keyframes(STRETCH_KEYS, phase), eyes: 'closed' });

const ballThrow = (_t, { p }) => {
  const k = p;
  return {
    hipsY: HIPS - 0.06 * (1 - k),
    lLegX: -0.7 * (1 - k),
    rLegX: -0.7 * (1 - k),
    lKnee: 1.25 * (1 - k),
    rKnee: 1.25 * (1 - k),
    lLegZ: 0.2,
    rLegZ: 0.2,
    spineX: 0.25 * (1 - k) - 0.1 * k,
    headX: -0.25 * k,
    bounce: k * 0.05,
    ...arms(lerp(-1.0, -2.9, k), 0.05, lerp(-1.6, -0.2, k), 0.45),
  };
};

// Aerobic: 4 điệu nhảy, mỗi điệu 8 nhịp, đồng bộ theo nhạc
function aerobic(_t, { beat }) {
  const move = Math.floor(beat / 8) % 4;
  const b = beat % 1;
  const half = Math.sin(beat * Math.PI); // đổi bên mỗi nhịp
  const pump = Math.abs(Math.sin(beat * Math.PI));
  switch (move) {
    case 0: // bước chạm 2 bên + vỗ tay trên đầu
      return {
        lLegZ: 0.04 + pos(half) * 0.35,
        rLegZ: 0.04 + pos(-half) * 0.35,
        lKnee: pos(-half) * 0.4,
        rKnee: pos(half) * 0.4,
        spineZ: half * 0.15,
        bounce: pump * 0.03,
        ...arms(-2.6 - pump * 0.2, 0.3 + (1 - pump) * 0.5, -0.4, 0.2),
        eyes: 'happy',
      };
    case 1: {
      // nhảy dang tay chân (jumping jack)
      const jj = 0.5 - 0.5 * Math.cos(beat * Math.PI);
      return {
        lLegZ: 0.04 + jj * 0.4,
        rLegZ: 0.04 + jj * 0.4,
        lArmZ: 0.3 + jj * 2.5,
        rArmZ: 0.3 + jj * 2.5,
        lElbow: -0.1,
        rElbow: -0.1,
        bounce: Math.abs(Math.sin(beat * Math.PI)) * 0.12,
        mouth: 'open',
        eyes: 'happy',
      };
    }
    case 2: // nâng gối + đấm lên
      return {
        lLegX: -1.3 * pos(half),
        lKnee: 1.7 * pos(half),
        rLegX: -1.3 * pos(-half),
        rKnee: 1.7 * pos(-half),
        lArmX: -2.9 * pos(-half) - 0.3,
        rArmX: -2.9 * pos(half) - 0.3,
        lElbow: -1.2 * pos(half) - 0.2,
        rElbow: -1.2 * pos(-half) - 0.2,
        lArmZ: 0.3,
        rArmZ: 0.3,
        bounce: pump * 0.05,
        spineX: 0.08,
      };
    default: // xoay hông + chỉ tay disco
      return {
        spineY: half * 0.5,
        spineZ: half * 0.12,
        headZ: -half * 0.15,
        lLegZ: 0.15,
        rLegZ: 0.15,
        lKnee: 0.2 + pump * 0.2,
        rKnee: 0.2 + (1 - pump) * 0.2,
        rArmX: half > 0 ? -2.5 : -0.4,
        rArmZ: half > 0 ? 0.9 : 0.1,
        rElbow: -0.1,
        lArmX: -0.4,
        lArmZ: 0.5,
        lElbow: -1.5,
        lArmY: 0.6,
        bounce: (1 - b) * 0.03,
        eyes: 'happy',
      };
  }
}

function sauna(t) {
  const br = Math.sin(t * 1.2);
  return {
    ...SIT,
    lKnee: 1.35,
    rKnee: 1.35,
    lLegZ: 0.18,
    rLegZ: 0.18,
    spineX: -0.12 + br * 0.02,
    headX: -0.2 + br * 0.04,
    headZ: 0.12,
    ...arms(-0.5, 0.35, -0.6),
    eyes: 'closed',
    sweat: true,
  };
}

function toilet(t) {
  const swing = Math.sin(t * 3);
  return {
    ...SIT,
    lKnee: 1.45 + swing * 0.15,
    rKnee: 1.45 - swing * 0.15,
    spineX: 0.35,
    headX: 0.15 + Math.sin(t * 0.8) * 0.05,
    ...arms(-0.9, 0.25, -1.6, 0.35),
    eyes: Math.sin(t * 1.3) > 0.3 ? 'closed' : 'open',
  };
}

function washHands(t) {
  const r = Math.sin(t * 14);
  return {
    spineX: 0.15,
    headX: 0.25,
    lArmX: -0.85,
    rArmX: -0.85,
    lArmY: 0.45 + r * 0.12,
    rArmY: 0.45 - r * 0.12,
    lArmZ: 0.15,
    rArmZ: 0.15,
    lElbow: -0.6,
    rElbow: -0.6,
  };
}

function locker(t) {
  const r = Math.sin(t * 2.5);
  return {
    spineX: 0.06,
    headX: -0.12,
    headY: r * 0.2,
    rArmX: -1.6 + r * 0.25,
    rArmZ: 0.2,
    rElbow: -0.4,
    rArmY: 0.15,
    lArmX: -1.0,
    lArmZ: 0.5,
    lElbow: -0.5,
  };
}

// Ngồi nghỉ chung (dùng cho NPC hoặc ghế)
const sit = (t) => ({ ...SIT, ...idle(t), ...arms(-0.4, 0.3, -0.5) });

// Ngồi thiền xếp bằng (NPC sư phụ) – gốc nhân vật cần hạ thấp ~0.2
function meditate(t) {
  const br = Math.sin(t * 1.1);
  return {
    lLegX: -1.4,
    rLegX: -1.4,
    lLegZ: 0.75,
    rLegZ: 0.75,
    lKnee: 2.5,
    rKnee: 2.5,
    spineX: 0.02 * br,
    bounce: 0.008 * br,
    headX: 0.08,
    ...arms(-0.55, 0.55, -0.7, 0.25),
    eyes: 'closed',
  };
}

export const ANIMS = {
  idle,
  walk,
  run,
  sit,
  meditate,
  chestPress,
  pecDeck,
  latPulldown,
  seatedRow,
  legPress,
  legExtension,
  bicepCurl,
  tricepPress,
  treadmill,
  dumbbellCurl,
  pullup,
  battleRope,
  stretch,
  ballThrow,
  aerobic,
  sauna,
  toilet,
  washHands,
  locker,
};

// Đạo cụ cầm tay theo animation
export const ANIM_PROPS = {
  dumbbellCurl: 'dumbbells',
  ballThrow: 'ball',
};

// ===================== BIỂU CẢM (EMOTE) =====================
export const EMOTES = {
  wave: {
    label: 'Vẫy tay',
    icon: '👋',
    duration: 2.4,
    fn: (t) => ({ rArmZ: 2.6, rArmX: -0.2, rElbow: -0.5 + Math.sin(t * 12) * 0.45, headZ: 0.15, eyes: 'happy' }),
  },
  laugh: {
    label: 'Cười',
    icon: '😆',
    duration: 2.6,
    fn: (t) => ({
      spineX: -0.15 + Math.sin(t * 18) * 0.05,
      headX: -0.25,
      bounce: Math.abs(Math.sin(t * 18)) * 0.02,
      ...arms(-0.5, 0.25, -1.3, 0.55),
      eyes: 'happy',
      mouth: 'open',
    }),
  },
  cool: {
    label: 'Ngầu',
    icon: '😎',
    duration: 3,
    prop: 'sunglasses',
    fn: () => ({
      lArmX: -1.15,
      rArmX: -1.05,
      lArmY: 0.95,
      rArmY: 0.95,
      lArmZ: 0.3,
      rArmZ: 0.3,
      lElbow: -1.9,
      rElbow: -1.9,
      headZ: 0.18,
      headX: -0.1,
      spineZ: -0.05,
      rLegZ: 0.25,
      mouth: 'smile',
    }),
  },
  tired: {
    label: 'Mệt',
    icon: '😮‍💨',
    duration: 3,
    fn: (t) => ({
      spineX: 0.45,
      headX: 0.35,
      bounce: Math.sin(t * 6) * 0.015 - 0.02,
      ...arms(-0.3, 0.2, -0.1),
      lKnee: 0.3,
      rKnee: 0.3,
      eyes: 'closed',
      mouth: 'open',
      sweat: true,
    }),
  },
  flex: {
    label: 'Khoe cơ',
    icon: '💪',
    duration: 2.8,
    fn: (t) => ({
      ...arms(0, 1.45, -2.0 + Math.sin(t * 8) * 0.15, 0, Math.PI / 2),
      spineX: -0.08,
      headX: -0.1,
      bounce: Math.abs(Math.sin(t * 8)) * 0.015,
      lLegZ: 0.15,
      rLegZ: 0.15,
      eyes: 'happy',
      mouth: 'open',
    }),
  },
  dance: {
    label: 'Nhảy',
    icon: '🕺',
    duration: 4,
    fn: (t) => aerobic(t, { beat: 24 + t * 2.2 }),
  },
  cheer: {
    label: 'Cổ vũ',
    icon: '🎉',
    duration: 2.6,
    fn: (t) => ({
      ...arms(-2.6 + Math.sin(t * 14) * 0.25, 0.5, -0.2),
      bounce: pos(Math.sin(t * 9)) * 0.18,
      lKnee: pos(Math.sin(t * 9)) * 0.4,
      rKnee: pos(Math.sin(t * 9)) * 0.4,
      eyes: 'happy',
      mouth: 'open',
    }),
  },
  bow: {
    label: 'Cúi chào',
    icon: '🙇',
    duration: 2.4,
    fn: (t) => {
      const k = Math.sin(Math.min(1, t / 2.4) * Math.PI);
      return { spineX: 0.85 * k, headX: 0.3 * k, ...arms(-0.25 * k, 0.12, -0.2, 0.5 * k), eyes: 'closed' };
    },
  },
};

export const EMOTE_LIST = Object.keys(EMOTES);
