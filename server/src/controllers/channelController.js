import mongoose from 'mongoose';
import { Friendship } from '../models/social.js';
import { asyncHandler, HttpError } from '../middleware/errorHandler.js';
import { listChannels } from '../services/channelRegistry.js';
import { getPresence } from '../services/presence.js';
import { getChannelManager } from '../realtime/index.js';
import { stats as writeStats } from '../services/writeBuffer.js';
import { activeCount } from '../services/workoutSessions.js';
import env from '../config/env.js';
import { CHANNEL_MAX } from '../../../shared/constants.js';

// GET /api/channels – danh sách channel + bạn bè đang ở channel nào
export const getChannels = asyncHandler(async (req, res) => {
  const uid = new mongoose.Types.ObjectId(String(req.userId));
  const [channels, rels] = await Promise.all([
    listChannels(),
    Friendship.find({ status: 'accepted', $or: [{ requester: uid }, { recipient: uid }] }).lean(),
  ]);
  const friendIds = rels.map((r) => String(String(r.requester) === String(uid) ? r.recipient : r.requester));
  const pres = await getPresence(friendIds);
  const friendsIn = {};
  for (const p of Object.values(pres)) (friendsIn[p.channel] ||= []).push(p.name);
  res.json({ max: CHANNEL_MAX, channels: channels.map((c) => ({ ...c, friends: friendsIn[c.id] || [] })) });
});

// GET /api/admin/metrics – số liệu cho công cụ load test (cần header x-admin-secret)
export const metrics = asyncHandler(async (req, res) => {
  if (!env.adminSecret || req.headers['x-admin-secret'] !== env.adminSecret) throw new HttpError(403, 'Forbidden');
  const m = getChannelManager();
  const mem = process.memoryUsage();
  res.json({
    instance: env.instanceId,
    players: m.totalPlayers(),
    channels: [...m.channels.values()].map((c) => ({ ...c.summary(), msgsOut: c.stats.msgsOut, interactions: c.ix.list.size })),
    tick: { avgMs: +m.metrics.tickMs.toFixed(2), maxMs: +m.metrics.tickMsMax.toFixed(2), lagMs: m.metrics.lagMs, ticks: m.metrics.ticks },
    cpu: process.cpuUsage(),
    uptime: process.uptime(),
    memoryMB: { rss: Math.round(mem.rss / 1048576), heap: Math.round(mem.heapUsed / 1048576) },
    writeBuffer: writeStats,
    activeWorkouts: activeCount(),
  });
});
