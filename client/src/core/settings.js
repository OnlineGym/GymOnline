import { isMobile } from './device.js';

// Cài đặt người chơi (lưu localStorage)
const KEY = 'gym_settings_v1';

export const QUALITY_PRESETS = {
  low: { pixelRatio: 0.8, shadows: false, shadowSize: 512, mirror: false, particles: 40, pointLights: false, antialias: false },
  medium: { pixelRatio: 1, shadows: true, shadowSize: 1024, mirror: false, particles: 120, pointLights: true, antialias: true },
  high: { pixelRatio: 2, shadows: true, shadowSize: 2048, mirror: true, particles: 260, pointLights: true, antialias: true },
};

const defaults = {
  quality: isMobile() ? 'low' : 'medium',
  sound: true,
  music: 0.6,
  sfx: 0.8,
  showFps: false,
  cameraSensitivity: 1,
  autoQuality: true, // tự giảm đồ họa khi FPS thấp
  maxDetailed: 50, // số nhân vật hiển thị chi tiết tối đa
};

function load() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...defaults };
  }
}

const listeners = new Set();
export const settings = load();

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
