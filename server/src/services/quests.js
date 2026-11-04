import DailyProgress from '../models/DailyProgress.js';
import Character from '../models/Character.js';
import { DAILY_QUESTS, WEEKLY_QUESTS, CHECKIN_REWARDS } from '../../../shared/constants.js';
import { HttpError } from '../middleware/errorHandler.js';
import { applyExp } from '../utils/progression.js';
import { award } from './achievements.js';
import { notifyUser, broadcastAppearance } from '../realtime/notify.js';

// Mốc ngày/tuần theo giờ Việt Nam (UTC+7)
const vn = (now = Date.now()) => new Date(now + 7 * 3600000);
export const dayKey = (now = Date.now()) => vn(now).toISOString().slice(0, 10);
export const weekKey = (now = Date.now()) => {
  const d = vn(now);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // về thứ Hai
  return d.toISOString().slice(0, 10);
};

// Chọn nhiệm vụ cố định theo người + ngày: tải lại trang không đổi nhiệm vụ
function pick(pool, n, seed) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const list = Object.entries(pool);
  const out = [];
  while (out.length < Math.min(n, pool.length ?? list.length) && list.length) {
    h = Math.imul(h ^ 0x9e3779b9, 16777619) >>> 0;
    const [key, q] = list.splice(h % list.length, 1)[0];
    out.push({ key, kind: q.kind, goal: q.goal, progress: 0, claimed: false, notified: false });
  }
  return out;
}

export async function ensure(userId) {
  const today = dayKey();
  const week = weekKey();
  const seed = String(userId);
  let doc = await DailyProgress.findOne({ userId });
  if (!doc) {
    try {
      doc = await DailyProgress.create({ userId, day: today, daily: pick(DAILY_QUESTS, 3, seed + today), week, weekly: pick(WEEKLY_QUESTS, 2, seed + week) });
    } catch (e) {
      if (e.code !== 11000) throw e;
      doc = await DailyProgress.findOne({ userId });
    }
  }
  const set = {};
  if (doc.day !== today) Object.assign(set, { day: today, daily: pick(DAILY_QUESTS, 3, seed + today) });
  if (doc.week !== week) Object.assign(set, { week, weekly: pick(WEEKLY_QUESTS, 2, seed + week) });
  if (Object.keys(set).length) doc = await DailyProgress.findOneAndUpdate({ userId }, { $set: set }, { new: true });
  return doc;
}

const defOf = (key) => DAILY_QUESTS[key] || WEEKLY_QUESTS[key];
const view = (q) => {
  const def = defOf(q.key) || {};
  return { key: q.key, label: def.label, icon: def.icon, goal: q.goal, progress: Math.min(q.goal, Math.floor(q.progress)), claimed: q.claimed, done: q.progress >= q.goal, coins: def.coins, exp: def.exp };
};

export async function state(userId) {
  const d = await ensure(userId);
  const today = dayKey();
  const yesterday = dayKey(Date.now() - 86400000);
  const alive = d.checkinDay === today || d.checkinDay === yesterday;
  const streak = alive ? d.streak : 0;
  return {
    daily: d.daily.map(view),
    weekly: d.weekly.map(view),
    checkin: { today: d.checkinDay === today, streak, best: d.bestStreak, rewards: CHECKIN_REWARDS, next: CHECKIN_REWARDS[streak % CHECKIN_REWARDS.length] },
  };
}

/**
 * Cộng tiến độ nhiệm vụ (kind: workouts, calories, minutes, challenge, win, stat_chest...).
 * Lỗi ở đây không được làm hỏng luồng tập luyện nên luôn tự nuốt lỗi.
 */
export async function bump(userId, kind, amount = 1) {
  try {
    await ensure(userId);
    await DailyProgress.updateOne(
      { userId },
      { $inc: { 'daily.$[d].progress': amount, 'weekly.$[w].progress': amount } },
      { arrayFilters: [{ 'd.kind': kind }, { 'w.kind': kind }] }
    );
    const doc = await DailyProgress.findOne({ userId });
    for (const [field, list] of [['daily', doc.daily], ['weekly', doc.weekly]]) {
      for (const q of list) {
        if (q.kind !== kind || q.notified || q.progress < q.goal) continue;
        const r = await DailyProgress.updateOne({ userId, [field]: { $elemMatch: { key: q.key, notified: false } } }, { $set: { [`${field}.$.notified`]: true } });
        if (r.modifiedCount) notifyUser(userId, 'notify', { kind: 'quest_done', label: defOf(q.key)?.label, icon: defOf(q.key)?.icon });
      }
    }
  } catch (e) {
    console.error('[quests] bump', e.message);
  }
}

async function grant(userId, coins, exp) {
  const c = await Character.findOne({ userId });
  if (!c) throw new HttpError(404, 'Chưa tạo nhân vật');
  c.coins += coins;
  const up = exp ? applyExp(c, exp) : 0;
  await c.save();
  if (up) broadcastAppearance(userId, c.appearance());
  return c;
}

export async function claim(userId, key) {
  const d = await ensure(userId);
  const field = d.daily.some((q) => q.key === key) ? 'daily' : d.weekly.some((q) => q.key === key) ? 'weekly' : null;
  if (!field) throw new HttpError(404, 'Không tìm thấy nhiệm vụ');
  const q = d[field].find((x) => x.key === key);
  if (q.progress < q.goal) throw new HttpError(400, 'Nhiệm vụ chưa hoàn thành');
  // Đổi cờ nguyên tử: bấm 2 lần chỉ nhận 1 lần
  const r = await DailyProgress.updateOne({ userId, [field]: { $elemMatch: { key, claimed: false } } }, { $set: { [`${field}.$.claimed`]: true } });
  if (!r.modifiedCount) throw new HttpError(409, 'Bạn đã nhận thưởng nhiệm vụ này');
  const def = defOf(key);
  const c = await grant(userId, def.coins, def.exp);
  return { character: c.toPublic(), coins: def.coins, exp: def.exp };
}

export async function checkin(userId) {
  const d = await ensure(userId);
  const today = dayKey();
  if (d.checkinDay === today) throw new HttpError(409, 'Hôm nay bạn đã điểm danh rồi');
  const streak = d.checkinDay === dayKey(Date.now() - 86400000) ? d.streak + 1 : 1;
  const r = await DailyProgress.updateOne(
    { userId, checkinDay: { $ne: today } },
    { $set: { checkinDay: today, streak, bestStreak: Math.max(d.bestStreak || 0, streak) } }
  );
  if (!r.modifiedCount) throw new HttpError(409, 'Hôm nay bạn đã điểm danh rồi');
  const coins = CHECKIN_REWARDS[(streak - 1) % CHECKIN_REWARDS.length];
  const c = await grant(userId, coins, 0);
  if (streak >= 7) await award(userId, 'streak_7');
  return { coins, streak, character: c.toPublic() };
}
