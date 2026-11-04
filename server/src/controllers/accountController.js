import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Character from '../models/Character.js';
import WorkoutLog from '../models/WorkoutLog.js';
import ChatMessage from '../models/ChatMessage.js';
import DailyProgress from '../models/DailyProgress.js';
import { Friendship, Party, Guild, Transaction, Achievement, Match } from '../models/social.js';
import { signToken, invalidateAuth } from '../middleware/auth.js';
import { HttpError, asyncHandler } from '../middleware/errorHandler.js';
import { sendVerifyEmail, sendResetEmail, sendPasswordChangedEmail, mailConfigured } from '../services/mailer.js';
import { kickUser, userLeave, notifyRoom } from '../realtime/notify.js';
import { invalidate } from '../services/cache.js';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('hex');
const HOUR = 3600000;

// Tạo link xác minh cho email (email hiện tại hoặc email mới đang chờ đổi)
export async function issueVerify(user, target = user.email) {
  const token = newToken();
  user.verifyTokenHash = sha(token);
  user.verifyTokenExp = new Date(Date.now() + 24 * HOUR);
  await user.save();
  await sendVerifyEmail(target, token);
}

const checkPassword = async (userId, password) => {
  const user = await User.findById(userId).select('+passwordHash +verifyTokenHash +resetTokenHash');
  if (!user) throw new HttpError(401, 'Tài khoản không tồn tại');
  if (!(await bcrypt.compare(String(password || ''), user.passwordHash))) throw new HttpError(400, 'Mật khẩu hiện tại không đúng');
  return user;
};

// ===== Quên / đặt lại mật khẩu =====
export const forgotPassword = asyncHandler(async (req, res) => {
  const email = req.body.email.trim().toLowerCase();
  const user = await User.findOne({ email }).select('+resetTokenHash');
  if (user) {
    const token = newToken();
    user.resetTokenHash = sha(token);
    user.resetTokenExp = new Date(Date.now() + HOUR);
    await user.save();
    await sendResetEmail(user.email, token);
  }
  // Luôn trả lời giống nhau để không lộ email nào đã đăng ký
  res.json({ ok: true, message: 'Nếu email này đã đăng ký, chúng tôi vừa gửi link đặt lại mật khẩu (hạn 1 giờ).' });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({ resetTokenHash: sha(req.body.token), resetTokenExp: { $gt: new Date() } }).select('+passwordHash +resetTokenHash');
  if (!user) throw new HttpError(400, 'Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn');
  user.passwordHash = await bcrypt.hash(req.body.password, 10);
  user.resetTokenHash = undefined;
  user.resetTokenExp = undefined;
  user.tokenVersion = (user.tokenVersion || 0) + 1; // đăng xuất mọi thiết bị cũ
  // Bấm được link trong hộp thư nghĩa là email này là của họ
  user.emailVerified = true;
  await user.save();
  invalidateAuth(user._id);
  kickUser(user._id, 'Mật khẩu vừa được đổi, vui lòng đăng nhập lại');
  await sendPasswordChangedEmail(user.email);
  res.json({ ok: true, message: 'Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới.' });
});

export const changePassword = asyncHandler(async (req, res) => {
  const user = await checkPassword(req.userId, req.body.current);
  if (req.body.current === req.body.password) throw new HttpError(400, 'Mật khẩu mới phải khác mật khẩu hiện tại');
  user.passwordHash = await bcrypt.hash(req.body.password, 10);
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  invalidateAuth(user._id);
  await sendPasswordChangedEmail(user.email);
  // Trả token mới để thiết bị hiện tại không bị đăng xuất
  res.json({ ok: true, token: signToken(user._id, user.tokenVersion), message: 'Đã đổi mật khẩu. Các thiết bị khác sẽ phải đăng nhập lại.' });
});

export const logoutAll = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) throw new HttpError(401, 'Tài khoản không tồn tại');
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  invalidateAuth(user._id);
  kickUser(user._id, 'Đã đăng xuất khỏi mọi thiết bị');
  res.json({ ok: true });
});

// Gia hạn phiên đăng nhập khi người chơi quay lại
export const refresh = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) throw new HttpError(401, 'Tài khoản không tồn tại');
  res.json({ token: signToken(user._id, user.tokenVersion || 0) });
});

// ===== Xác minh / đổi email =====
export const resendVerify = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId).select('+verifyTokenHash');
  if (!user) throw new HttpError(401, 'Tài khoản không tồn tại');
  if (user.emailVerified && !user.pendingEmail) return res.json({ ok: true, message: 'Email đã được xác minh' });
  await issueVerify(user, user.pendingEmail || user.email);
  res.json({ ok: true, message: `Đã gửi link xác minh tới ${user.pendingEmail || user.email}`, mail: mailConfigured() });
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const user = await User.findOne({ verifyTokenHash: sha(req.body.token), verifyTokenExp: { $gt: new Date() } }).select('+verifyTokenHash');
  if (!user) throw new HttpError(400, 'Link xác minh không hợp lệ hoặc đã hết hạn');
  if (user.pendingEmail) {
    if (await User.exists({ email: user.pendingEmail, _id: { $ne: user._id } })) throw new HttpError(409, 'Email này đã được tài khoản khác sử dụng');
    user.email = user.pendingEmail;
    user.pendingEmail = undefined;
  }
  user.emailVerified = true;
  user.verifyTokenHash = undefined;
  user.verifyTokenExp = undefined;
  await user.save();
  res.json({ ok: true, message: 'Đã xác minh email 🎉', user: user.toPublic() });
});

export const changeEmail = asyncHandler(async (req, res) => {
  const email = req.body.email.trim().toLowerCase();
  const user = await checkPassword(req.userId, req.body.password);
  if (email === user.email) throw new HttpError(400, 'Đây đã là email hiện tại của bạn');
  if (await User.exists({ email })) throw new HttpError(409, 'Email đã được sử dụng');
  user.pendingEmail = email;
  await issueVerify(user, email);
  // Email cũ vẫn dùng được cho tới khi bấm link trong email mới
  res.json({ ok: true, message: `Đã gửi link xác nhận tới ${email}. Email chỉ đổi sau khi bạn bấm link.`, user: user.toPublic() });
});

// ===== Xóa tài khoản: xóa dữ liệu cá nhân, hoàn quà đang chờ cho đúng người =====
async function refund(tx, to) {
  if (tx.coins) await Character.updateOne({ userId: to }, { $inc: { coins: tx.coins } });
  if (tx.item) {
    const r = await Character.updateOne({ userId: to, 'inventory.item': tx.item }, { $inc: { 'inventory.$.qty': tx.qty } });
    if (!r.matchedCount) await Character.updateOne({ userId: to }, { $push: { inventory: { item: tx.item, qty: tx.qty } } });
  }
}

export const deleteAccount = asyncHandler(async (req, res) => {
  const user = await checkPassword(req.userId, req.body.password);
  if (user.username !== req.body.confirm) throw new HttpError(400, 'Hãy gõ đúng tên đăng nhập để xác nhận');
  const uid = new mongoose.Types.ObjectId(String(user._id));

  kickUser(uid, 'Tài khoản đã được xóa');

  // Quà/trao đổi đang chờ: trả lại cho người gửi còn tồn tại
  const pending = await Transaction.find({ status: 'pending', $or: [{ from: uid }, { to: uid }] });
  for (const tx of pending) {
    const r = await Transaction.updateOne({ _id: tx._id, status: 'pending' }, { status: 'expired' });
    if (r.modifiedCount && String(tx.from) !== String(uid)) await refund(tx, tx.from);
  }

  // Rời CLB: giao lại chủ CLB hoặc xóa CLB nếu không còn ai
  const guild = await Guild.findOne({ members: uid });
  if (guild) {
    guild.members = guild.members.filter((m) => String(m) !== String(uid));
    if (!guild.members.length) await guild.deleteOne();
    else {
      if (String(guild.leader) === String(uid)) guild.leader = guild.members[0];
      await guild.save();
      notifyRoom(`guild:${guild._id}`, 'guild:update', { id: String(guild._id) });
    }
    userLeave(uid, `guild:${guild._id}`);
    await invalidate('lb:guild');
  }
  const party = await Party.findOne({ members: uid });
  if (party) {
    party.members = party.members.filter((m) => String(m) !== String(uid));
    if (party.members.length < 1) await party.deleteOne();
    else {
      if (String(party.leader) === String(uid)) party.leader = party.members[0];
      await party.save();
    }
  }

  await Promise.all([
    Character.deleteOne({ userId: uid }),
    Friendship.deleteMany({ $or: [{ requester: uid }, { recipient: uid }] }),
    WorkoutLog.deleteMany({ userId: uid }),
    ChatMessage.deleteMany({ userId: uid }),
    Achievement.deleteMany({ userId: uid }),
    DailyProgress.deleteOne({ userId: uid }),
    // Lịch sử đấu của người khác giữ nguyên nhưng không còn tên người đã xóa
    Match.updateMany({ 'participants.userId': uid }, { $set: { 'participants.$[p].displayName': 'Người chơi đã xóa' } }, { arrayFilters: [{ 'p.userId': uid }] }),
  ]);
  await User.deleteOne({ _id: uid });
  invalidateAuth(uid);
  await invalidate('lb:level');
  res.json({ ok: true, message: 'Tài khoản đã được xóa' });
});
