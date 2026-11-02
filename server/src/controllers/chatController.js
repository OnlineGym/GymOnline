import mongoose from 'mongoose';
import ChatMessage, { dmChannel } from '../models/ChatMessage.js';
import Character from '../models/Character.js';
import { Party } from '../models/social.js';
import { HttpError, asyncHandler } from '../middleware/errorHandler.js';
import { pending } from '../services/writeBuffer.js';

// GET /api/chat/history?channel=global|nearby|party|guild|dm&ch=<channelId>&with=<userId>&limit=50
export const getChatHistory = asyncHandler(async (req, res) => {
  const channel = String(req.query.channel || 'global');
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const gameChannel = String(req.query.ch || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);

  let key;
  if (channel === 'global') key = `ch:${gameChannel}`;
  else if (channel === 'nearby') key = `near:${gameChannel}`;
  else if (channel === 'party') {
    const party = await Party.findOne({ members: req.userId }).select('_id').lean();
    if (!party) return res.json({ channel, messages: [] });
    key = `party:${party._id}`;
  } else if (channel === 'guild') {
    const c = await Character.findOne({ userId: req.userId }).select('guildId').lean();
    if (!c?.guildId) return res.json({ channel, messages: [] });
    key = `guild:${c.guildId}`;
  } else if (channel === 'dm') {
    const other = String(req.query.with || '');
    if (!mongoose.isValidObjectId(other)) throw new HttpError(400, 'Thiếu hoặc sai tham số with');
    key = dmChannel(req.userId, other);
  } else throw new HttpError(400, 'Kênh chat không hợp lệ');

  const docs = await ChatMessage.find({ channel: key }).sort({ createdAt: -1 }).limit(limit);
  // Gộp cả tin còn trong bộ đệm ghi lô
  const buffered = pending(ChatMessage, (d) => d.channel === key);
  const all = [...docs.reverse(), ...buffered].slice(-limit);
  res.json({ channel, messages: all.map((d) => d.toPublic()) });
});
