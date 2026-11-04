import mongoose from 'mongoose';
import User from '../models/User.js';
import Character from '../models/Character.js';
import ChatMessage from '../models/ChatMessage.js';
import { Report, Guild, AdminAction } from '../models/social.js';
import { HttpError, asyncHandler } from '../middleware/errorHandler.js';
import { invalidateAuth } from '../middleware/auth.js';
import { getIO, getManager, kickUser, notifyUser } from '../realtime/notify.js';

const oid = (v) => {
  if (!mongoose.isValidObjectId(String(v))) throw new HttpError(400, 'ID không hợp lệ');
  return new mongoose.Types.ObjectId(String(v));
};
const log = (req, action, target, detail = '') => AdminAction.create({ admin: req.userId, action, target, detail });
const safeRegex = (s) => new RegExp(String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

async function targetUser(req) {
  const user = await User.findById(oid(req.params.id));
  if (!user) throw new HttpError(404, 'Không tìm thấy người chơi');
  if (String(user._id) === String(req.userId)) throw new HttpError(400, 'Không thể tự xử lý tài khoản của mình');
  if (user.role === 'admin') throw new HttpError(403, 'Không thể xử lý tài khoản quản trị');
  return user;
}

const userRow = (u, c) => ({
  id: String(u._id),
  username: u.username,
  email: u.email,
  emailVerified: !!u.emailVerified,
  role: u.role || 'user',
  createdAt: u.createdAt,
  bannedUntil: u.bannedUntil || null,
  banReason: u.banReason || '',
  chatMutedUntil: u.chatMutedUntil || null,
  displayName: c?.displayName || null,
  level: c?.level || null,
  coins: c?.coins ?? null,
});

export const overview = asyncHandler(async (_req, res) => {
  const now = new Date();
  const [users, characters, openReports, banned, muted, guilds, newUsers] = await Promise.all([
    User.countDocuments(),
    Character.countDocuments(),
    Report.countDocuments({ status: 'open' }),
    User.countDocuments({ bannedUntil: { $gt: now } }),
    User.countDocuments({ chatMutedUntil: { $gt: now } }),
    Guild.countDocuments(),
    User.countDocuments({ createdAt: { $gt: new Date(Date.now() - 7 * 86400000) } }),
  ]);
  const channels = getManager() ? [...getManager().channels.values()].map((c) => c.summary()) : [];
  res.json({ users, characters, openReports, banned, muted, guilds, newUsers, online: channels.reduce((a, c) => a + c.count, 0), channels });
});

export const listReports = asyncHandler(async (req, res) => {
  const status = ['open', 'reviewed', 'dismissed'].includes(req.query.status) ? req.query.status : 'open';
  const docs = await Report.find({ status }).sort({ createdAt: status === 'open' ? 1 : -1 }).limit(100).lean();
  const ids = [...new Set(docs.flatMap((d) => [String(d.reporter), String(d.target)]))];
  const [users, chars] = await Promise.all([User.find({ _id: { $in: ids } }).select('username bannedUntil chatMutedUntil').lean(), Character.find({ userId: { $in: ids } }).select('userId displayName').lean()]);
  const uMap = new Map(users.map((u) => [String(u._id), u]));
  const cMap = new Map(chars.map((c) => [String(c.userId), c.displayName]));
  const who = (id) => ({ id: String(id), username: uMap.get(String(id))?.username || '(đã xóa)', name: cMap.get(String(id)) || '', bannedUntil: uMap.get(String(id))?.bannedUntil || null, chatMutedUntil: uMap.get(String(id))?.chatMutedUntil || null });
  // Số báo cáo đang mở nhằm vào cùng 1 người: giúp thấy ai bị báo cáo nhiều
  const counts = await Report.aggregate([{ $match: { status: 'open' } }, { $group: { _id: '$target', n: { $sum: 1 } } }]);
  const cnt = new Map(counts.map((c) => [String(c._id), c.n]));
  res.json({
    reports: docs.map((d) => ({
      id: String(d._id),
      reason: d.reason,
      details: d.details,
      recentChat: d.recentChat,
      status: d.status,
      note: d.note || '',
      createdAt: d.createdAt,
      reporter: who(d.reporter),
      target: { ...who(d.target), openReports: cnt.get(String(d.target)) || 0 },
    })),
  });
});

export const resolveReport = asyncHandler(async (req, res) => {
  const status = req.body.status === 'dismissed' ? 'dismissed' : 'reviewed';
  const note = String(req.body.note || '').slice(0, 300);
  const r = await Report.findByIdAndUpdate(oid(req.params.id), { status, note, handledBy: req.userId }, { new: true });
  if (!r) throw new HttpError(404, 'Không tìm thấy báo cáo');
  await log(req, `report:${status}`, r.target, note);
  res.json({ ok: true });
});

export const searchUsers = asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  let users;
  if (q) {
    const rx = safeRegex(q);
    const chars = await Character.find({ displayName: rx }).select('userId').limit(30).lean();
    users = await User.find({ $or: [{ username: rx }, { email: rx }, { _id: { $in: chars.map((c) => c.userId) } }] }).limit(30).lean();
  } else users = await User.find().sort({ createdAt: -1 }).limit(30).lean();
  const chars = await Character.find({ userId: { $in: users.map((u) => u._id) } }).select('userId displayName level coins').lean();
  const cMap = new Map(chars.map((c) => [String(c.userId), c]));
  res.json({ users: users.map((u) => userRow(u, cMap.get(String(u._id)))) });
});

export const getUser = asyncHandler(async (req, res) => {
  const id = oid(req.params.id);
  const user = await User.findById(id).lean();
  if (!user) throw new HttpError(404, 'Không tìm thấy người chơi');
  const [character, reports, chat, actions] = await Promise.all([
    Character.findOne({ userId: id }).select('displayName level coins').lean(),
    Report.find({ target: id }).sort({ createdAt: -1 }).limit(20).lean(),
    ChatMessage.find({ userId: id }).sort({ createdAt: -1 }).limit(30).select('channel content createdAt').lean(),
    AdminAction.find({ target: id }).sort({ createdAt: -1 }).limit(20).lean(),
  ]);
  res.json({
    user: userRow(user, character),
    reports: reports.map((r) => ({ id: String(r._id), reason: r.reason, details: r.details, status: r.status, createdAt: r.createdAt })),
    chat,
    actions,
  });
});

// hours bỏ trống = khóa vĩnh viễn
export const banUser = asyncHandler(async (req, res) => {
  const user = await targetUser(req);
  const hours = Number(req.body.hours) || 0;
  user.bannedUntil = hours > 0 ? new Date(Date.now() + hours * 3600000) : new Date('2999-01-01');
  user.banReason = String(req.body.reason || 'Vi phạm quy định').slice(0, 200);
  await user.save();
  invalidateAuth(user._id);
  kickUser(user._id, `Tài khoản bị khóa: ${user.banReason}`);
  await log(req, 'ban', user._id, `${hours ? `${hours} giờ` : 'vĩnh viễn'} – ${user.banReason}`);
  res.json({ ok: true, user: userRow(user) });
});

export const unbanUser = asyncHandler(async (req, res) => {
  const user = await targetUser(req);
  user.bannedUntil = undefined;
  user.banReason = undefined;
  await user.save();
  invalidateAuth(user._id);
  await log(req, 'unban', user._id);
  res.json({ ok: true, user: userRow(user) });
});

export const muteUser = asyncHandler(async (req, res) => {
  const user = await targetUser(req);
  const minutes = Math.max(1, Math.min(60 * 24 * 30, Number(req.body.minutes) || 60));
  user.chatMutedUntil = new Date(Date.now() + minutes * 60000);
  await user.save();
  // Áp dụng ngay nếu người này đang online
  const found = getManager()?.findUser(String(user._id));
  if (found) found.player.adminMutedUntil = user.chatMutedUntil.getTime();
  notifyUser(user._id, 'toast', { type: 'error', text: `🔇 Bạn bị cấm chat ${minutes} phút${req.body.reason ? `: ${String(req.body.reason).slice(0, 100)}` : ''}` });
  await log(req, 'mute', user._id, `${minutes} phút – ${String(req.body.reason || '').slice(0, 200)}`);
  res.json({ ok: true, user: userRow(user) });
});

export const unmuteUser = asyncHandler(async (req, res) => {
  const user = await targetUser(req);
  user.chatMutedUntil = undefined;
  await user.save();
  const found = getManager()?.findUser(String(user._id));
  if (found) found.player.adminMutedUntil = 0;
  await log(req, 'unmute', user._id);
  res.json({ ok: true, user: userRow(user) });
});

// Thông báo tới toàn bộ người chơi đang online
export const announce = asyncHandler(async (req, res) => {
  const text = String(req.body.text || '').trim().slice(0, 200);
  if (!text) throw new HttpError(400, 'Nội dung trống');
  getIO()?.emit('notify', { kind: 'announce', text });
  await log(req, 'announce', null, text);
  res.json({ ok: true });
});

export const listActions = asyncHandler(async (_req, res) => {
  const docs = await AdminAction.find().sort({ createdAt: -1 }).limit(100).lean();
  const ids = [...new Set(docs.flatMap((d) => [d.admin, d.target].filter(Boolean).map(String)))];
  const users = await User.find({ _id: { $in: ids } }).select('username').lean();
  const m = new Map(users.map((u) => [String(u._id), u.username]));
  res.json({ actions: docs.map((d) => ({ id: String(d._id), admin: m.get(String(d.admin)) || '?', target: d.target ? m.get(String(d.target)) || '(đã xóa)' : '', action: d.action, detail: d.detail, at: d.createdAt })) });
});
