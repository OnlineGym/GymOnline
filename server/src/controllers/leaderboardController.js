import Character from '../models/Character.js';
import WorkoutLog from '../models/WorkoutLog.js';
import { Guild } from '../models/social.js';
import { asyncHandler, HttpError } from '../middleware/errorHandler.js';
import { remember } from '../services/cache.js';
import { STATS } from '../../../shared/constants.js';

const TTL = 30; // giây – leaderboard được cache, không truy vấn DB mỗi lần mở bảng

const mapChar = (c, i) => ({
  rank: i + 1,
  userId: String(c.userId),
  displayName: c.displayName,
  level: c.level,
  exp: c.exp,
  totalCalories: Math.round(c.totalCalories || 0),
  totalWorkouts: c.totalWorkouts || 0,
  power: Math.round(Object.values(c.stats || {}).reduce((a, b) => a + (Number(b) || 0), 0)),
  stats: c.stats,
});

/**
 * GET /api/leaderboard?type=level|calories|stat|weekly|guild&stat=chest
 */
export const getLeaderboard = asyncHandler(async (req, res) => {
  const type = String(req.query.type || 'level');
  const stat = String(req.query.stat || 'chest');
  const fields = 'userId displayName level exp totalCalories totalWorkouts stats';

  let data;
  switch (type) {
    case 'level':
    case 'calories':
      // Giữ tương thích bản cũ: trả cả 2 bảng
      data = await remember('lb:basic', TTL, async () => {
        const [topLevel, topCalories] = await Promise.all([
          Character.find().sort({ level: -1, exp: -1 }).limit(20).select(fields).lean(),
          Character.find({ totalCalories: { $gt: 0 } }).sort({ totalCalories: -1 }).limit(20).select(fields).lean(),
        ]);
        return { topLevel: topLevel.map(mapChar), topCalories: topCalories.map(mapChar) };
      });
      break;
    case 'stat': {
      if (!STATS.includes(stat)) throw new HttpError(400, 'Nhóm cơ không hợp lệ');
      data = await remember(`lb:stat:${stat}`, TTL, async () => {
        const rows = await Character.find({ [`stats.${stat}`]: { $gt: 0 } }).sort({ [`stats.${stat}`]: -1 }).limit(20).select(fields).lean();
        return { rows: rows.map((c, i) => ({ ...mapChar(c, i), value: Math.round(c.stats?.[stat] || 0) })) };
      });
      break;
    }
    case 'weekly':
      data = await remember('lb:weekly', TTL, async () => {
        const since = new Date(Date.now() - 7 * 86400000);
        const rows = await WorkoutLog.aggregate([
          { $match: { createdAt: { $gte: since } } },
          { $group: { _id: '$userId', exp: { $sum: '$expGained' }, calories: { $sum: '$caloriesBurned' }, sessions: { $sum: 1 } } },
          { $sort: { exp: -1 } },
          { $limit: 20 },
          { $lookup: { from: 'characters', localField: '_id', foreignField: 'userId', as: 'c' } },
          { $unwind: '$c' },
        ]);
        return {
          rows: rows.map((r, i) => ({
            rank: i + 1,
            userId: String(r._id),
            displayName: r.c.displayName,
            level: r.c.level,
            value: r.exp,
            calories: Math.round(r.calories),
            sessions: r.sessions,
          })),
        };
      });
      break;
    case 'guild':
      data = await remember('lb:guild', TTL, async () => {
        const rows = await Character.aggregate([
          { $match: { guildId: { $ne: null } } },
          { $group: { _id: '$guildId', members: { $sum: 1 }, levels: { $sum: '$level' }, calories: { $sum: '$totalCalories' } } },
          { $sort: { levels: -1 } },
          { $limit: 20 },
        ]);
        const guilds = await Guild.find({ _id: { $in: rows.map((r) => r._id) } }).select('name tag color').lean();
        const gm = new Map(guilds.map((g) => [String(g._id), g]));
        return {
          rows: rows
            .filter((r) => gm.has(String(r._id)))
            .map((r, i) => ({
              rank: i + 1,
              guildId: String(r._id),
              displayName: `[${gm.get(String(r._id)).tag}] ${gm.get(String(r._id)).name}`,
              members: r.members,
              value: r.levels,
              calories: Math.round(r.calories),
            })),
        };
      });
      break;
    default:
      throw new HttpError(400, 'Loại bảng xếp hạng không hợp lệ');
  }
  res.json({ type, ...data });
});
