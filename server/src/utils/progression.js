import { slotInfo, minRepSec, expToNext } from '../config/equipment.js';
import { activeEvents } from '../../../shared/constants.js';

const MAX_SESSION_SEC = 60 * 60; // tối đa 1 giờ / buổi

/**
 * Tính thưởng 1 buổi tập dựa trên cấu hình server (không tin số liệu client):
 *  - thời lượng bị giới hạn theo thời gian server đo; số rep giới hạn theo tốc độ tối đa của máy
 *  - kcal, EXP theo thời gian, chỉ số chỉ tính phần thời gian có thao tác (active): ngồi không thì không được gì
 *  - bonus: giờ vàng (x2), buff đồ uống, tập cùng (+20%), party (+10%), điểm đồng bộ lớp nhóm (≤ +30%)
 */
export function computeReward(type, slot, durationSec, reps, { buffs = [], partners = [], inParty = false, sync = 0, form = 0, active } = {}) {
  const cfg = slotInfo(type, slot);
  if (!cfg || cfg.utility || !cfg.group) return null;
  const duration = Math.max(0, Math.min(MAX_SESSION_SEC, Math.floor(durationSec)));
  // Không bao giờ vượt thời gian server đo được
  const activeSec = active === undefined ? duration : Math.max(0, Math.min(duration, Number(active) || 0));
  const maxReps = Math.floor(duration / minRepSec(cfg)) + 1;
  const validReps = Math.max(0, Math.min(Math.floor(reps), maxReps));

  const bonuses = [];
  let expMult = 1;
  let calMult = 1;
  let statMult = 1;
  for (const ev of activeEvents()) {
    if (ev.expMult) {
      expMult *= ev.expMult;
      bonuses.push(ev.key);
    }
  }
  for (const b of buffs) {
    if (b.kind === 'exp') expMult *= b.mult;
    if (b.kind === 'cal') calMult *= b.mult;
    if (b.kind === 'stat') statMult *= b.mult;
    bonuses.push(`buff_${b.kind}`);
  }
  if (partners.length) {
    expMult *= 1.2;
    bonuses.push(partners.some((p) => p.spotter) ? 'spotter' : 'duo');
  }
  if (inParty) {
    expMult *= 1.1;
    bonuses.push('party');
  }
  if (cfg.klass && sync > 0) {
    const s = Math.max(0, Math.min(1, sync));
    expMult *= 1 + s * 0.3;
    bonuses.push('sync');
  }

  // Độ chuẩn động tác trong minigame (0..1) -> tối đa +25% EXP
  if (!cfg.klass && form > 0) {
    expMult *= 1 + Math.max(0, Math.min(1, form)) * 0.25;
    bonuses.push('form');
  }

  const calories = Math.round(((cfg.cal * activeSec) / 60) * calMult * 10) / 10;
  const baseExp = validReps * cfg.exp + activeSec * 0.15;
  const exp = Math.round(baseExp * expMult);
  const statGain = Math.round((validReps * 0.5 + activeSec / 30) * statMult * 10) / 10;
  const coins = Math.floor(exp / 10);
  return { duration, active: activeSec, reps: validReps, calories, exp, stat: cfg.group, statGain, coins, bonuses };
}

// Cộng exp, xử lý lên nhiều level cùng lúc. Trả về số level đã tăng
export function applyExp(character, exp) {
  character.exp += exp;
  let levelsUp = 0;
  while (character.exp >= expToNext(character.level)) {
    character.exp -= expToNext(character.level);
    character.level += 1;
    levelsUp += 1;
    character.coins += 50;
  }
  return levelsUp;
}
