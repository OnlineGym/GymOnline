import { HIPS, SIT, arms, keyframes, walk, run, aerobic, sauna, idle, pos, TAU, lerp } from '../animations.js';

/**
 * Animation cho các thiết bị / tương tác mới (lưu ý: chỉ dùng hàm import bên trong hàm vì 2 module import vòng nhau).
 * Tư thế nằm dùng lieX/lieY/lieZ: xoay cả thân quanh bàn chân rồi dịch để hông nằm đúng vị trí gốc.
 *   faceUp  : nằm ngửa (đầu về -Z)  | faceDown: nằm sấp (đầu về +Z)
 */
const HALF_PI = Math.PI / 2;
const faceUp = (h = 0, tilt = 0) => ({ lieX: -HALF_PI + tilt, lieY: 0.28 + h, lieZ: 0.34 });
const faceDown = (h = 0, tilt = 0) => ({ lieX: HALF_PI - tilt, lieY: 0.28 + h, lieZ: -0.34 });
const sit = (extra) => ({ ...SIT, ...extra });
const legsBench = { lLegX: 1.1, rLegX: 1.1, lKnee: 0.5, rKnee: 0.5, lLegZ: 0.3, rLegZ: 0.3 };
const guard = { lArmX: -1.1, rArmX: -1.1, lElbow: -2.1, rElbow: -2.1, lArmZ: 0.35, rArmZ: 0.35 };
const stance = (t) => ({ lLegX: -0.25, rLegX: 0.25, lKnee: 0.25, rKnee: 0.25, lLegZ: 0.15, rLegZ: 0.15, bounce: Math.abs(Math.sin(t * 6)) * 0.02, spineY: 0.2 });
const squatPose = (d) => ({ hipsY: HIPS - 0.14 * d, lLegX: -1.25 * d, rLegX: -1.25 * d, lKnee: 2.1 * d, rKnee: 2.1 * d, spineX: 0.45 * d, lLegZ: 0.25, rLegZ: 0.25 });

// ---------------- NGỰC ----------------
const benchPress = (_t, { p, params }) => ({
  ...faceUp(0, params?.angle || 0),
  ...legsBench,
  ...arms(-1.45, 0.75 - p * 0.5, -1.5 + p * 1.4),
});
const spot = (_t, { p }) => ({ spineX: 0.55, headX: 0.35, lKnee: 0.15, rKnee: 0.15, ...arms(-1.1 - p * 0.25, 0.25, -0.4) });
const crossover = (_t, { p }) => ({ spineX: 0.15, lLegX: -0.25, lKnee: 0.15, ...arms(-0.9 - p * 0.3, 1.3 - p * 1.0, -0.25, p * 0.7) });
const dips = (_t, { p }) => ({ bounce: -p * 0.22, spineX: 0.15, lLegX: 0.25, rLegX: 0.25, lKnee: 0.9, rKnee: 0.9, ...arms(0.15, 0.15, -p * 1.3) });
const inclinePress = (_t, { p }) => sit({ spineX: -0.35, ...arms(-1.3 - p * 0.7, 0.7 - p * 0.4, -1.5 + p * 1.4) });

// ---------------- LƯNG ----------------
const tbarRow = (_t, { p }) => ({ spineX: 0.85, headX: -0.5, lLegX: -0.25, rLegX: -0.25, lKnee: 0.35, rKnee: 0.35, lLegZ: 0.2, rLegZ: 0.2, ...arms(-0.75 + p * 0.55, 0.25, -0.1 - p * 1.5) });
const assistedPullup = (_t, { p }) => ({ bounce: p * 0.15, lLegX: 0.3, rLegX: 0.3, lKnee: 1.7, rKnee: 1.7, headX: -0.15, ...arms(-2.95 + p * 0.25, 0.3 + p * 0.75, -p * 1.9) });
const hyperext = (_t, { p }) => ({ lieX: HALF_PI * 0.6, lieY: 0.62, lieZ: -0.25, spineX: 0.9 - p * 0.9, headX: 0.2 - p * 0.4, ...arms(-2.2, 0.9, -2.0) });

// ---------------- VAI ----------------
const shoulderPress = (_t, { p }) => sit({ headX: -0.05, ...arms(-2.0 - p * 0.9, 1.1 - p * 0.7, -1.9 + p * 1.8) });
const lateralRaise = (_t, { p }) => sit({ ...arms(0.05, 0.25 + p * 1.25, -0.25) });
const rearDelt = (_t, { p }) => sit({ spineX: 0.2, ...arms(-1.45, 0.3, -0.15, 1.0 - p * 1.6) });
const facePull = (_t, { p }) => ({ spineX: -0.05, lLegX: -0.2, lKnee: 0.15, ...arms(-1.55 - p * 0.15, 0.2 + p * 1.0, -0.1 - p * 2.0) });
const landminePress = (_t, { p }) => ({
  spineX: 0.15,
  lLegX: -0.35,
  lKnee: 0.3,
  rLegX: 0.25,
  rArmX: -0.9 - p * 1.2,
  rElbow: -1.9 + p * 1.8,
  rArmZ: 0.3,
  rArmY: 0.3,
  lArmX: -0.7,
  lElbow: -1.6,
  lArmY: 0.6,
});

// ---------------- TAY ----------------
const preacherCurl = (_t, { p }) => sit({ spineX: 0.3, headX: -0.15, ...arms(-0.95, 0.15, -0.25 - p * 1.9) });
const tricepPushdown = (_t, { p }) => ({ spineX: 0.15, lKnee: 0.1, rKnee: 0.1, ...arms(-0.35, 0.15, -(1.7 - p * 1.55)) });
const cableCurl = (_t, { p }) => ({ spineX: -0.05, ...arms(-0.1, 0.12, -0.15 - p * 2.0) });
const barbellCurl = (_t, { p }) => ({ spineX: -0.05, ...arms(-0.15, 0.08, -0.2 - p * 2.0) });

// ---------------- CHÂN ----------------
const legCurlLying = (_t, { p }) => ({ ...faceDown(0), ...arms(-2.6, 0.4, -0.8), lKnee: p * 1.8, rKnee: p * 1.8 });
const legCurlSeated = (_t, { p }) => sit({ lLegX: -1.5, rLegX: -1.5, lKnee: 0.3 + p * 1.3, rKnee: 0.3 + p * 1.3, ...arms(0.15, 0.6, -0.3) });
const hackSquat = (_t, { p }) => ({ ...squatPose(p), spineX: -0.2 + p * 0.1, ...arms(-0.4, 0.9, -2.2) });
const squat = (_t, { p }) => ({ ...squatPose(p), headX: -0.1, ...arms(-0.6, 1.35, -2.0) });
const hipThrust = (_t, { p }) => ({
  lieX: -(0.6 + p * 0.85),
  lieY: 0.18 + p * 0.12,
  lieZ: 0.05,
  lLegX: -0.9 - (1 - p) * 0.5,
  rLegX: -0.9 - (1 - p) * 0.5,
  lKnee: 1.7,
  rKnee: 1.7,
  ...arms(-0.6, 0.4, -1.0),
});
const hipAbduction = (_t, { p }) => sit({ lLegZ: 0.12 + p * 0.5, rLegZ: 0.12 + p * 0.5, ...arms(0.1, 0.5, -0.3) });
const hipAdduction = (_t, { p }) => sit({ lLegZ: 0.62 - p * 0.5, rLegZ: 0.62 - p * 0.5, ...arms(0.1, 0.5, -0.3) });
const calfRaise = (_t, { p }) => ({ bounce: p * 0.08, ...arms(-0.4, 0.9, -2.2) });
const calfSeated = (_t, { p }) => sit({ lLegX: -1.5 - p * 0.12, rLegX: -1.5 - p * 0.12, ...arms(-0.3, 0.4, -0.5) });
const gluteKick = (_t, { p }) => ({ spineX: 0.2, rLegX: p * 0.9, rKnee: 0.3, ...arms(-1.2, 0.2, -0.2) });

// ---------------- BỤNG ----------------
const abCrunch = (_t, { p }) => sit({ spineX: p * 0.6, headX: p * 0.3, ...arms(-2.5 + p * 0.6, 0.4, -1.8) });
const romanSitup = (_t, { p }) => ({ ...faceUp(0.1, 0.4), spineX: p * 1.1, lLegX: -0.4, rLegX: -0.4, lKnee: 0.8, rKnee: 0.8, ...arms(-1.0, 0.1, -2.0, 0.6) });
const torsoRotation = (_t, { phase }) => sit({ spineY: Math.sin(phase * TAU) * 0.6, ...arms(-1.2, 0.3, -0.6, 0.5) });
const plank = (t) => ({ ...faceDown(0.14, 0.1), bounce: Math.sin(t * 2) * 0.004, spineZ: Math.sin(t * 9) * 0.01, ...arms(-1.5, 0.25, -1.55), headX: -0.2 });
const trxRow = (_t, { p }) => ({ lieX: -(0.45 - p * 0.25), ...arms(-1.45, 0.25, -0.1 - p * 1.6), lLegZ: 0.15, rLegZ: 0.15 });

// ---------------- CARDIO ----------------
const elliptical = (t) => {
  const w = t * 6;
  return {
    lLegX: Math.sin(w) * 0.35,
    rLegX: -Math.sin(w) * 0.35,
    lKnee: 0.3 + pos(Math.sin(w + 1)) * 0.4,
    rKnee: 0.3 + pos(-Math.sin(w + 1)) * 0.4,
    lArmX: -0.9 - Math.sin(w) * 0.3,
    rArmX: -0.9 + Math.sin(w) * 0.3,
    lElbow: -1.2,
    rElbow: -1.2,
    lArmZ: 0.3,
    rArmZ: 0.3,
    bounce: Math.abs(Math.sin(w)) * 0.02,
  };
};
const pedal = (w, base = -1.2, amp = 0.4, knee = 1.4) => ({
  lLegX: base + Math.sin(w) * amp,
  rLegX: base - Math.sin(w) * amp,
  lKnee: knee + Math.cos(w) * 0.5,
  rKnee: knee - Math.cos(w) * 0.5,
});
const bike = (t) => ({ ...pedal(t * 9), spineX: 0.35, ...arms(-1.1, 0.25, -0.4) });
const recumbent = (t) => ({ ...pedal(t * 8, -1.4, 0.35, 0.8), spineX: -0.4, ...arms(0.1, 0.45, -0.3) });
const spin = (t, { beat }) => {
  const climb = Math.floor(beat / 16) % 2 === 1; // đứng đạp leo dốc mỗi 16 nhịp
  return { ...pedal(t * 13, climb ? -0.9 : -1.2, 0.45), spineX: climb ? 0.6 : 0.5, bounce: climb ? 0.12 + Math.abs(Math.sin(t * 6.5)) * 0.05 : 0, ...arms(-1.25, 0.3, -0.3) };
};
const rowing = (_t, { p }) => ({
  ...SIT,
  lLegX: -1.9 + p * 0.45,
  rLegX: -1.9 + p * 0.45,
  lKnee: 2.2 - p * 2.1,
  rKnee: 2.2 - p * 2.1,
  spineX: 0.35 - p * 0.6,
  ...arms(-1.5 + p * 1.2, 0.2, -p * 1.8),
});
const stairClimb = (t) => {
  const s = Math.sin(t * 7);
  return { lLegX: -0.8 * pos(s), rLegX: -0.8 * pos(-s), lKnee: 1.2 * pos(s), rKnee: 1.2 * pos(-s), spineX: 0.15, bounce: Math.abs(s) * 0.03, ...arms(-0.6, 0.3, -0.8) };
};
const assaultBike = (t) => {
  const w = t * 9;
  return { ...pedal(w), spineX: 0.3, lArmX: -1.0 - Math.sin(w) * 0.35, rArmX: -1.0 + Math.sin(w) * 0.35, lElbow: -0.8, rElbow: -0.8, lArmZ: 0.3, rArmZ: 0.3 };
};
const skiErg = (_t, { p }) => ({ spineX: p * 0.7, lKnee: p * 0.5, rKnee: p * 0.5, hipsY: HIPS - p * 0.03, ...arms(-2.6 + p * 2.9, 0.25, -0.2) });

// ---------------- FUNCTIONAL ----------------
const kbSwing = (_t, { p }) => ({ spineX: 0.8 * (1 - p), lKnee: 0.4 * (1 - p), rKnee: 0.4 * (1 - p), lLegZ: 0.25, rLegZ: 0.25, ...arms(0.1 - p * 1.6 - 0.8 * (1 - p), 0.12, -0.1, 0.3) });
const sledPush = (t) => ({ ...run(t * 0.8), spineX: 0.7, headX: -0.4, ...arms(-1.4, 0.35, -0.3) });
const boxJump = (_t, { phase }) => {
  const squatK = phase < 0.35 ? Math.sin((phase / 0.35) * Math.PI) : 0;
  const jump = phase >= 0.35 && phase < 0.75 ? Math.sin(((phase - 0.35) / 0.4) * Math.PI) : 0;
  return {
    ...squatPose(squatK * 0.7),
    bounce: jump * 0.55,
    lLegX: -jump * 0.9 - squatK * 0.9,
    rLegX: -jump * 0.9 - squatK * 0.9,
    lKnee: jump * 1.5 + squatK * 1.5,
    rKnee: jump * 1.5 + squatK * 1.5,
    ...arms(squatK * 0.6 - jump * 2.4, 0.3, -0.2),
  };
};
const ballSlam = (_t, { p }) => ({ spineX: 0.8 * (1 - p), lKnee: 0.5 * (1 - p), rKnee: 0.5 * (1 - p), ...arms(-0.3 - p * 2.6, 0.08, -0.2, 0.45) });
const tireFlip = (_t, { p }) => ({ ...squatPose(0.7 * (1 - p)), spineX: 0.9 * (1 - p), ...arms(-0.5 - p * 1.8, 0.3, -0.3 - p * 0.8) });
const farmerWalk = (t) => ({ ...walk(t * 0.7), spineX: 0.05, lArmX: 0, rArmX: 0, lArmZ: 0.22, rArmZ: 0.22, lElbow: 0, rElbow: 0 });
const deadlift = (_t, { p }) => {
  const s = 0.9 * (1 - p);
  return { spineX: s, lKnee: 1.0 * (1 - p), rKnee: 1.0 * (1 - p), lLegX: -0.5 * (1 - p), rLegX: -0.5 * (1 - p), hipsY: HIPS - 0.06 * (1 - p), ...arms(-s, 0.2, 0) };
};
const jumpRope = (t) => ({ bounce: Math.abs(Math.sin(t * 12)) * 0.06, lKnee: 0.2, rKnee: 0.2, ...arms(-0.3, 0.5, -1.4) });

// ---------------- BOXING ----------------
const punches = (phase, speed = 1) => {
  const pl = phase < 0.5 ? Math.sin(phase * 2 * Math.PI) : 0;
  const pr = phase >= 0.5 ? Math.sin((phase - 0.5) * 2 * Math.PI) : 0;
  return {
    lArmX: -1.1 - pl * 0.45 * speed,
    lElbow: -2.1 + pl * 2.0,
    rArmX: -1.1 - pr * 0.45 * speed,
    rElbow: -2.1 + pr * 2.0,
    lArmZ: 0.35 - pl * 0.2,
    rArmZ: 0.35 - pr * 0.2,
    spineY: (pl - pr) * 0.35 + 0.1,
  };
};
const boxBag = (t, { phase }) => ({ ...stance(t), ...punches(phase) });
const speedBag = (t) => ({
  ...stance(t),
  lArmX: -1.75 + Math.sin(t * 28) * 0.15,
  rArmX: -1.75 - Math.sin(t * 28) * 0.15,
  lElbow: -1.7,
  rElbow: -1.7,
  lArmZ: 0.3,
  rArmZ: 0.3,
  headX: -0.2,
});
const padPunch = (t, { phase }) => ({ ...stance(t), ...punches(phase, 1.1) });
const padHold = (t, { phase }) => {
  const hit = Math.abs(Math.sin(phase * TAU)) * 0.15;
  return { ...stance(t), lArmX: -1.4 + hit, rArmX: -1.4 + hit, lElbow: -1.6, rElbow: -1.6, lArmZ: 0.5, rArmZ: 0.5, spineX: -hit * 0.4 };
};
const sparIdle = (t) => ({ ...stance(t), ...guard });
const sparPunch = (t) => ({ ...stance(t), ...guard, rArmX: -1.55, rElbow: -0.1, rArmZ: 0.15, spineY: -0.4 });
const sparBlock = (t) => ({ ...stance(t), lArmX: -1.6, rArmX: -1.6, lElbow: -2.4, rElbow: -2.4, lArmZ: 0.1, rArmZ: 0.1, spineX: 0.15, headX: 0.15 });
const sparDodge = (t) => ({ ...stance(t), ...guard, spineX: 0.4, spineZ: 0.4, hipsY: HIPS - 0.05, lKnee: 0.5, rKnee: 0.5 });
const sparHit = (t) => ({ ...stance(t), spineX: -0.3, headX: -0.35, ...arms(-0.4, 0.8, -0.6), eyes: 'closed', mouth: 'open' });
const sparKO = () => ({ ...faceUp(-0.28), ...arms(0, 1.4, -0.2), eyes: 'closed', mouth: 'open' });

// ---------------- THƯ GIÃN / KHÁC ----------------
const foamRoll = (t) => ({ ...faceUp(0.1), lieZ: 0.34 + Math.sin(t * 1.6) * 0.2, lLegX: -0.6, rLegX: -0.6, lKnee: 1.2, rKnee: 1.2, ...arms(0.6, 0.4, -0.2), eyes: 'closed' });
// tạo lười (lazy) vì arms/squatPose chưa sẵn sàng lúc module nạp (import vòng)
let YOGA_KEYS = null;
const yogaKeys = () => [
  { ...arms(-3.0, 0.2, -0.1), lLegZ: 0.75, lKnee: 1.6, lLegX: -0.3, eyes: 'closed' }, // cây
  { ...arms(0, 1.55, -0.05), lLegX: -0.7, lKnee: 0.8, rLegX: 0.45, hipsY: HIPS - 0.05, headY: 0.8, eyes: 'closed' }, // chiến binh
  { ...arms(-2.9, 0.3, -0.1), spineX: -0.25, headX: -0.3, eyes: 'closed' }, // ngửa
  { ...squatPose(0.55), ...arms(-2.6, 0.2, -0.1), eyes: 'closed' }, // ghế
];
const yogaFlow = (_t, { phase }) => keyframes((YOGA_KEYS ||= yogaKeys()), phase);
const swim = (t) => {
  const w = t * 5;
  return {
    ...faceDown(-0.16),
    lArmX: -1.6 + Math.sin(w) * 1.6,
    rArmX: -1.6 - Math.sin(w) * 1.6,
    lArmZ: 0.3,
    rArmZ: 0.3,
    lElbow: -0.3,
    rElbow: -0.3,
    lLegX: Math.sin(w * 3) * 0.25,
    rLegX: -Math.sin(w * 3) * 0.25,
    spineY: Math.sin(w) * 0.15,
    headY: Math.sin(w) * 0.4,
  };
};
const massageLie = (t) => ({ ...faceDown(0), bounce: Math.sin(t * 1.2) * 0.005, ...arms(0.1, 0.12, -0.1), eyes: 'closed' });
const massageChair = (t) => sit({ spineX: -0.35, bounce: Math.sin(t * 30) * 0.004, headX: -0.15, ...arms(-0.3, 0.4, -0.5), eyes: 'closed' });
const inbody = (t) => ({ headX: 0.2 + Math.sin(t) * 0.03, ...arms(-0.5, 0.5, -0.3) });
const shopping = (t) => ({ ...idle(t), headX: 0.1, headY: Math.sin(t * 0.7) * 0.4, ...arms(-0.6, 0.2, -0.9) });
const steam = (t) => sauna(t);
const elevator = (t) => ({ ...idle(t), headX: -0.25 });
const climb = (t) => {
  const w = walk(t * 0.9);
  return { ...w, lKnee: w.lKnee * 1.6 + 0.2, rKnee: w.rKnee * 1.6 + 0.2, spineX: 0.15 };
};
const jump = () => ({ lLegX: -0.6, rLegX: -0.6, lKnee: 1.0, rKnee: 1.0, ...arms(-2.4, 0.6, -0.3), mouth: 'open', eyes: 'happy' });

// ---------------- THÁCH ĐẤU / TƯƠNG TÁC 2 NGƯỜI ----------------
const pushup = (_t, { p }) => ({ ...faceDown(0.22 - p * 0.24), ...arms(-1.5, 0.35, -p * 1.4), headX: -0.2 });
const armWrestle = (t, { lean = 0 }) => ({
  spineX: 0.45,
  spineZ: lean * 0.2,
  rArmX: -1.3,
  rElbow: -1.6,
  rArmZ: 0.1,
  rArmY: lean * 0.4,
  lArmX: -0.9,
  lElbow: -1.4,
  lArmZ: 0.3,
  bounce: Math.sin(t * 20) * 0.004,
  mouth: 'open',
});
const handshake = (t) => ({ rArmX: -1.0 + Math.sin(t * 14) * 0.12, rElbow: -0.35, rArmZ: 0.05, eyes: 'happy' });
const highfive = (t) => {
  const k = (t % 2.5) / 2.5;
  return { rArmX: -2.5, rArmZ: 0.4, rElbow: -0.2 - (k > 0.4 && k < 0.5 ? 0.4 : 0), bounce: k > 0.4 && k < 0.55 ? 0.08 : 0, eyes: 'happy', mouth: 'open' };
};
const fistbump = (t) => ({ rArmX: -1.45, rElbow: -0.25 - Math.max(0, Math.sin(t * 3)) * 0.2, rArmZ: 0.1, eyes: 'happy' });
const hug = () => ({ ...arms(-1.35, 0.55, -1.0, 0.9), spineX: 0.15, eyes: 'happy' });
const pat = (t) => ({ rArmX: -1.55, rArmZ: 0.1, rElbow: -0.6 + Math.sin(t * 8) * 0.25, eyes: 'happy' });
const coupleDance = (t) => ({
  spineZ: Math.sin(t * 3) * 0.15,
  lLegZ: 0.04 + pos(Math.sin(t * 3)) * 0.25,
  rLegZ: 0.04 + pos(-Math.sin(t * 3)) * 0.25,
  lArmX: -1.4,
  lArmZ: 0.9,
  lElbow: -0.8,
  rArmX: -1.1,
  rArmY: 0.6,
  rElbow: -0.6,
  bounce: Math.abs(Math.sin(t * 3)) * 0.03,
  eyes: 'happy',
});

export const EXTRA_ANIMS = {
  benchPress,
  spot,
  crossover,
  dips,
  inclinePress,
  tbarRow,
  assistedPullup,
  hyperext,
  shoulderPress,
  lateralRaise,
  rearDelt,
  facePull,
  landminePress,
  preacherCurl,
  tricepPushdown,
  cableCurl,
  barbellCurl,
  legCurlLying,
  legCurlSeated,
  hackSquat,
  squat,
  hipThrust,
  hipAbduction,
  hipAdduction,
  calfRaise,
  calfSeated,
  gluteKick,
  abCrunch,
  romanSitup,
  torsoRotation,
  plank,
  trxRow,
  elliptical,
  bike,
  recumbent,
  spin,
  rowing,
  stairClimb,
  assaultBike,
  skiErg,
  kbSwing,
  sledPush,
  boxJump,
  ballSlam,
  tireFlip,
  farmerWalk,
  deadlift,
  jumpRope,
  boxBag,
  speedBag,
  padPunch,
  padHold,
  foamRoll,
  yogaFlow,
  swim,
  massageLie,
  massageChair,
  inbody,
  shopping,
  steam,
  elevator,
  climb,
  jump,
  pushup,
  armWrestle,
  sparIdle,
  sparPunch,
  sparBlock,
  sparDodge,
  sparHit,
  sparKO,
  handshake,
  highfive,
  fistbump,
  hug,
  pat,
  coupleDance,
};

// Đạo cụ cầm tay theo animation
export const EXTRA_PROPS = {
  barbellCurl: 'ezbar',
  kbSwing: 'kettlebell',
  ballSlam: 'ball',
  farmerWalk: 'farmer',
  jumpRope: 'rope',
  boxBag: 'gloves',
  speedBag: 'gloves',
  padPunch: 'gloves',
  padHold: 'pads',
  sparIdle: 'gloves',
  sparPunch: 'gloves',
  sparBlock: 'gloves',
  sparDodge: 'gloves',
  sparHit: 'gloves',
  sparKO: 'gloves',
};

export { lerp };
