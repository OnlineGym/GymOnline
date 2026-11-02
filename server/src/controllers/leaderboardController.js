import Character from '../models/Character.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export const getLeaderboard = asyncHandler(async (req, res) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  const fields = 'userId displayName level exp totalCalories totalWorkouts stats';

  const [topLevel, topCalories] = await Promise.all([
    Character.find().sort({ level: -1, exp: -1 }).limit(limit).select(fields).lean(),
    Character.find({ totalCalories: { $gt: 0 } }).sort({ totalCalories: -1 }).limit(limit).select(fields).lean(),
  ]);

  const map = (c, i) => ({
    rank: i + 1,
    userId: String(c.userId),
    displayName: c.displayName,
    level: c.level,
    exp: c.exp,
    totalCalories: Math.round(c.totalCalories || 0),
    totalWorkouts: c.totalWorkouts || 0,
    power: Object.values(c.stats || {}).reduce((a, b) => a + (Number(b) || 0), 0),
  });

  res.json({ topLevel: topLevel.map(map), topCalories: topCalories.map(map) });
});
