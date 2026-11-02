import { Achievement } from '../models/social.js';
import { ACHIEVEMENTS, STATS } from '../../../shared/constants.js';
import { notifyUser } from '../realtime/notify.js';

/**
 * Mở khóa thành tích. award() idempotent (index unique userId+key) và báo cho người chơi qua socket.
 */
export async function award(userId, key) {
  if (!ACHIEVEMENTS[key]) return false;
  try {
    await Achievement.create({ userId, key });
    notifyUser(userId, 'achievement', { key, ...ACHIEVEMENTS[key] });
    return true;
  } catch (e) {
    if (e.code === 11000) return false; // đã có
    throw e;
  }
}

// Kiểm tra các thành tích liên quan tới tiến độ nhân vật
export async function checkCharacter(character, ctx = {}) {
  const uid = character.userId;
  const checks = [];
  if (character.totalWorkouts >= 1) checks.push('first_workout');
  if (character.totalWorkouts >= 10) checks.push('workouts_10');
  if (character.totalWorkouts >= 100) checks.push('workouts_100');
  if (character.level >= 5) checks.push('level_5');
  if (character.level >= 10) checks.push('level_10');
  if (character.level >= 20) checks.push('level_20');
  if (character.totalCalories >= 1000) checks.push('calories_1000');
  if (STATS.every((s) => (character.groupsTrained || []).includes(s))) checks.push('all_groups');
  if ((character.trackLaps || 0) >= 10) checks.push('track_10');
  if (ctx.inParty) checks.push('party_up');
  if (ctx.golden) checks.push('golden_hour');
  const got = [];
  for (const k of checks) if (await award(uid, k)) got.push(k);
  return got;
}

export async function listFor(userId) {
  const docs = await Achievement.find({ userId }).lean();
  return docs.map((d) => ({ key: d.key, at: d.createdAt, ...ACHIEVEMENTS[d.key] }));
}
