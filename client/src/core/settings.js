import { isMobile } from './device.js';

// Cài đặt người chơi (lưu localStorage)
const KEY = 'gym_settings_v1';

/**
 * Mức đồ họa:
 *  - post: hậu kỳ (bloom đèn neon, ambient occlusion – bóng tối góc khuất, khử răng cưa MSAA)
 *  - envProbe: chụp phản chiếu môi trường thật của từng tầng (kim loại, gương, sàn bóng)
 *  - physical: vật liệu vải/da/nước nâng cao (sheen, clearcoat, transmission)
 */
export const QUALITY_PRESETS = {
  low: { pixelRatio: 0.8, shadows: false, shadowSize: 512, mirror: false, particles: 40, pointLights: false, antialias: false, post: false, bloom: false, ao: false, msaa: 0, envProbe: false, physical: false, softShadow: false },
  medium: { pixelRatio: 1, shadows: true, shadowSize: 1024, mirror: false, particles: 120, pointLights: true, antialias: true, post: true, bloom: true, ao: false, msaa: 4, envProbe: true, physical: false, softShadow: false },
  high: { pixelRatio: 1.25, shadows: true, shadowSize: 1536, mirror: true, particles: 260, pointLights: true, antialias: true, post: true, bloom: true, ao: true, msaa: 4, envProbe: true, physical: true, softShadow: true },
  ultra: { pixelRatio: 1.5, shadows: true, shadowSize: 2048, mirror: true, particles: 400, pointLights: true, antialias: true, post: true, bloom: true, ao: true, msaa: 4, envProbe: true, physical: true, softShadow: true },
};
export const QUALITY_ORDER = ['low', 'medium', 'high', 'ultra'];
export const QUALITY_LABEL = { low: 'Thấp', medium: 'Trung bình', high: 'Cao', ultra: 'Cực cao' };

// Phím có thể đổi. Space, Enter, Esc, mũi tên, số và J/K/L giữ cố định vì minigame + thang máy đang dùng
export const DEFAULT_KEYS = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  run: 'ShiftLeft',
  interact: 'KeyE',
  player: 'KeyF',
  emote: 'KeyQ',
  map: 'KeyM',
  finder: 'KeyN',
  social: 'KeyO',
  inventory: 'KeyI',
  quests: 'KeyP',
  sit: 'KeyC',
  lie: 'KeyZ',
};
export const KEY_LABELS = {
  forward: 'Đi tới',
  back: 'Đi lùi',
  left: 'Sang trái',
  right: 'Sang phải',
  run: 'Chạy',
  interact: 'Tập / tương tác',
  player: 'Tương tác người gần nhất',
  emote: 'Vòng biểu cảm',
  map: 'Bản đồ',
  finder: 'Tìm máy trống',
  social: 'Bạn bè',
  inventory: 'Túi đồ',
  quests: 'Nhiệm vụ',
  sit: 'Ngồi / lặn',
  lie: 'Nằm',
};
export const RESERVED_KEYS = /^(Space|Enter|Escape|Tab|Arrow.*|Digit\d|Numpad\d|KeyJ|KeyK|KeyL|Meta.*|F\d+)$/;
export const keyLabel = (code = '') =>
  code.replace(/^Key/, '').replace(/^Digit/, '').replace('ShiftLeft', 'Shift').replace('ShiftRight', 'Shift phải').replace('ControlLeft', 'Ctrl').replace('ControlRight', 'Ctrl phải').replace('AltLeft', 'Alt').replace('AltRight', 'Alt phải');

const defaults = {
  quality: isMobile() ? 'low' : 'high',
  sound: true,
  music: 0.6,
  sfx: 0.8,
  showFps: false,
  cameraSensitivity: 1,
  autoQuality: true, // tự giảm đồ họa khi FPS thấp
  maxDetailed: 50, // số nhân vật hiển thị chi tiết tối đa
  fov: 62, // góc nhìn (độ) – tầm nhìn rộng/hẹp
  viewDistance: 1, // hệ số tầm nhìn xa (0.6 - 1.8): sương mù, khoảng cách hiển thị khu/nhân vật
  maxZoom: 9, // khoảng cách camera xa nhất
  firstPersonElevator: true, // góc nhìn thứ nhất trong thang máy
  keys: { ...DEFAULT_KEYS },
};

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...defaults, ...saved, keys: { ...DEFAULT_KEYS, ...(saved.keys || {}) } };
  } catch {
    return { ...defaults };
  }
}

const listeners = new Set();
export const settings = load();
if (!QUALITY_PRESETS[settings.quality]) settings.quality = defaults.quality;

export function updateSettings(patch) {
  Object.assign(settings, patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* bỏ qua khi trình duyệt chặn storage */
  }
  listeners.forEach((fn) => fn(settings, patch));
}

export function onSettingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const quality = () => QUALITY_PRESETS[settings.quality] || QUALITY_PRESETS.medium;
// Hệ số tầm nhìn xa đã giới hạn
export const viewMul = () => Math.max(0.6, Math.min(1.8, settings.viewDistance || 1));
