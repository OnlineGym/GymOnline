import { EQUIPMENT_TYPES, expToNext } from '../config/equipment.js';

const MAX_SESSION_SEC = 60 * 60; // Tối đa 1 giờ / buổi tập

/**
 * Tính thưởng cho một buổi tập dựa trên cấu hình server (chống gian lận):
 * - Giới hạn thời lượng, số rep không vượt quá tốc độ tối đa của máy
 */
export function computeReward(equipmentType, durationSec, reps) {
  const cfg = EQUIPMENT_TYPES[equipmentType];
  if (!cfg) return null;
  const duration = Math.max(0, Math.min(MAX_SESSION_SEC, Math.floor(durationSec)));
  const maxReps = Math.floor(duration / cfg.minRepSec) + 1;
  const validReps = Math.max(0, Math.min(Math.floor(reps), maxReps));
  const calories = Math.round(((cfg.calPerMin * duration) / 60) * 10) / 10;
  const exp = Math.round(validReps * cfg.expPerRep + duration * 0.15);
  const statGain = Math.round((validReps * 0.5 + duration / 30) * 10) / 10;
  const coins = Math.floor(exp / 10);
  return { duration, reps: validReps, calories, exp, stat: cfg.stat, statGain, coins };
}

// Cộng exp vào nhân vật, xử lý lên nhiều level cùng lúc. Trả về số level đã tăng
export function applyExp(character, exp) {
  character.exp += exp;
  let levelsUp = 0;
  while (character.exp >= expToNext(character.level)) {
    character.exp -= expToNext(character.level);
    character.level += 1;
    levelsUp += 1;
    character.coins += 50; // thưởng lên cấp
  }
  return levelsUp;
}
