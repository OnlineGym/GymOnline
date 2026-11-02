import mongoose from 'mongoose';
import Character from '../models/Character.js';
import WorkoutLog from '../models/WorkoutLog.js';
import { Party } from '../models/social.js';
import { HttpError, asyncHandler } from '../middleware/errorHandler.js';
import { computeReward, applyExp } from '../utils/progression.js';
import { consumeSession } from '../services/workoutSessions.js';
import { queue, flushAll } from '../services/writeBuffer.js';
import { checkCharacter } from '../services/achievements.js';
import { expToNext, EQUIPMENT } from '../config/equipment.js';
import { broadcastAppearance, notifyRoom, notifyUser } from '../realtime/notify.js';
import { invalidate } from '../services/cache.js';
import { partyProgress } from './socialController.js';

export const createWorkout = asyncHandler(async (req, res) => {
  const { equipmentType, durationSec, reps } = req.body;
  const slot = Number(req.body.slot) || 0;
  const sync = typeof req.body.sync === 'number' ? req.body.sync : 0;

  // Đối chiếu với phiên tập do socket ghi nhận (người chơi phải thực sự khóa máy)
  const session = consumeSession(req.userId, equipmentType, slot);
  if (!session) throw new HttpError(400, 'Không tìm thấy buổi tập hợp lệ cho máy này');
  const trustedDuration = Math.min(durationSec, session.serverDurationSec + 2);

  const character = await Character.findOne({ userId: req.userId });
  if (!character) throw new HttpError(404, 'Chưa tạo nhân vật');
  const party = await Party.findOne({ members: req.userId }).select('_id members').lean();
  const inParty = !!party && party.members.length > 1;

  const reward = computeReward(equipmentType, slot, trustedDuration, reps, {
    buffs: character.activeBuffs(),
    partners: session.partners,
    inParty,
    sync,
  });
  if (!reward) throw new HttpError(400, 'Loại máy tập không hợp lệ');
  if (reward.duration < 3) throw new HttpError(400, 'Buổi tập quá ngắn (tối thiểu 3 giây)');

  const prevLevel = character.level;
  const levelsUp = applyExp(character, reward.exp);
  character.stats[reward.stat] = Math.round(((character.stats[reward.stat] || 0) + reward.statGain) * 10) / 10;
  character.coins += reward.coins;
  character.totalCalories += reward.calories;
  character.totalWorkouts += 1;
  if (!character.groupsTrained.includes(reward.stat)) character.groupsTrained.push(reward.stat);
  if (EQUIPMENT[equipmentType]?.freeMove) character.trackLaps = (character.trackLaps || 0) + reward.reps;
  character.buffs = character.buffs.filter((b) => b.until > new Date());
  await character.save();

  // Ghi log theo lô (bộ đệm) thay vì ghi ngay
  const log = queue(WorkoutLog, {
    userId: req.userId,
    equipmentType: slot ? `${equipmentType}#${slot}` : equipmentType,
    durationSec: reward.duration,
    reps: reward.reps,
    caloriesBurned: reward.calories,
    expGained: reward.exp,
    stat: reward.stat,
    bonuses: reward.bonuses,
    guildId: character.guildId,
    partyId: party ? String(party._id) : null,
  });

  if (levelsUp > 0) broadcastAppearance(req.userId, character.appearance());
  const achievements = await checkCharacter(character, { inParty, golden: reward.bonuses.includes('golden') });

  // Tiến độ mục tiêu chung của party
  if (party) {
    await flushAll();
    await invalidate(`party:${party._id}`);
    const progress = await partyProgress(party._id);
    notifyRoom(`party:${party._id}`, 'party:progress', progress);
  }
  // Báo cho người tập cùng
  for (const pt of session.partners) {
    notifyUser(pt.userId, 'toast', { type: 'success', text: `🤝 ${character.displayName} vừa tập cùng bạn – cả hai nhận bonus +20% EXP!` });
  }

  res.status(201).json({
    log,
    reward: { ...reward, levelsUp, prevLevel, newLevel: character.level, expToNext: expToNext(character.level) },
    character: character.toPublic(),
    achievements,
  });
});

export const getHistory = asyncHandler(async (req, res) => {
  await flushAll(); // gồm cả các log còn trong bộ đệm
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
  const userId = new mongoose.Types.ObjectId(String(req.userId));
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [logs, totals, today, byGroup] = await Promise.all([
    WorkoutLog.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean(),
    WorkoutLog.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: null,
          sessions: { $sum: 1 },
          calories: { $sum: '$caloriesBurned' },
          durationSec: { $sum: '$durationSec' },
          reps: { $sum: '$reps' },
          exp: { $sum: '$expGained' },
        },
      },
    ]),
    WorkoutLog.aggregate([
      { $match: { userId, createdAt: { $gte: startOfDay } } },
      { $group: { _id: null, calories: { $sum: '$caloriesBurned' }, sessions: { $sum: 1 } } },
    ]),
    WorkoutLog.aggregate([{ $match: { userId } }, { $group: { _id: '$stat', sessions: { $sum: 1 }, calories: { $sum: '$caloriesBurned' } } }]),
  ]);

  res.json({
    logs,
    totals: totals[0] || { sessions: 0, calories: 0, durationSec: 0, reps: 0, exp: 0 },
    today: today[0] || { calories: 0, sessions: 0 },
    byGroup,
  });
});
