import mongoose from 'mongoose';
import ChatMessage, { dmChannel } from '../models/ChatMessage.js';
import { HttpError, asyncHandler } from '../middleware/errorHandler.js';

// GET /api/chat/history?channel=global|nearby|dm&with=<userId>&limit=50
export const getChatHistory = asyncHandler(async (req, res) => {
  const channel = String(req.query.channel || 'global');
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));

  let key;
  if (channel === 'global' || channel === 'nearby') key = channel;
  else if (channel === 'dm') {
    const other = String(req.query.with || '');
    if (!mongoose.isValidObjectId(other)) throw new HttpError(400, 'Thiếu hoặc sai tham số with');
    key = dmChannel(req.userId, other);
  } else throw new HttpError(400, 'Kênh chat không hợp lệ');

  const docs = await ChatMessage.find({ channel: key }).sort({ createdAt: -1 }).limit(limit);
  res.json({ channel, messages: docs.reverse().map((d) => d.toPublic()) });
});
