import mongoose from 'mongoose';
import Character from '../models/Character.js';
import WorkoutLog from '../models/WorkoutLog.js';
import { HttpError, asyncHandler } from '../middleware/errorHandler.js';
import { computeReward, applyExp } from '../utils/progression.js';
import { consumeSession } from '../services/workoutSessions.js';
import { expToNext } from '../config/equipment.js';
import { getIO, broadcastAppearance } from '../sockets/index.js';

export const createWorkout = asyncHandler(async (req, res) => {
  const { equipmentType, durationSec, reps } = req.body;

  // Đối chiếu với phiên tập do socket ghi nhận (người chơi phải thực sự khóa máy)
  const session = consumeSession(req.userId, equipmentType);
  if (!session) throw new HttpError(400, 'Không tìm thấy buổi tập hợp lệ cho máy này');
  const trustedDuration = Math.min(durationSec, session.serverDurationSec + 2);

  const reward = computeReward(equipmentType, trustedDuration, reps);
  if (!reward) throw new HttpError(400, 'Loại máy tập không hợp lệ');
  if (reward.duration < 3) throw new HttpError(400, 'Buổi tập quá ngắn (tối thiểu 3 giây)');

  const character = await Character.findOne({ userId: req.userId });
  if (!character) throw new HttpError(404, 'Chưa tạo nhân vật');

  const prevLevel = character.level;
  const levelsUp = applyExp(character, reward.exp);
  character.stats[reward.stat] = Math.round((character.stats[reward.stat] + reward.statGain) * 10) / 10;
  character.coins += reward.coins;
  character.totalCalories += reward.calories;
  character.totalWorkouts += 1;
  await character.save();

  const log = await WorkoutLog.create({
    userId: req.userId,
    equipmentType,
    durationSec: reward.duration,
    reps: reward.reps,
    caloriesBurned: reward.calories,
    expGained: reward.exp,
    stat: reward.stat,
  });

  if (levelsUp > 0) {
    broadcastAppearance(req.userId, character.appearance());
    getIO()?.emit('player:levelup', { userId: String(req.userId), level: character.level });
  }

  res.status(201).json({
    log,
    reward: { ...reward, levelsUp, prevLevel, newLevel: character.level, expToNext: expToNext(character.level) },
    character: character.toPublic(),
  });
});

export const getHistory = asyncHandler(async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
  const userId = new mongoose.Types.ObjectId(String(req.userId));
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [logs, totals, today] = await Promise.all([
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
  ]);

  res.json({
    logs,
    totals: totals[0] || { sessions: 0, calories: 0, durationSec: 0, reps: 0, exp: 0 },
    today: today[0] || { calories: 0, sessions: 0 },
  });
});
