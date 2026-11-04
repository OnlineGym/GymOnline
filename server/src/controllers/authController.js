import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Character from '../models/Character.js';
import { signToken, banMessage } from '../middleware/auth.js';
import { issueVerify } from './accountController.js';
import { HttpError, asyncHandler } from '../middleware/errorHandler.js';

export const register = asyncHandler(async (req, res) => {
  const username = req.body.username.trim();
  const email = req.body.email.trim().toLowerCase();
  const { password } = req.body;

  const exists = await User.findOne({ $or: [{ username }, { email }] }).lean();
  if (exists) {
    throw new HttpError(409, exists.email === email ? 'Email đã được sử dụng' : 'Tên đăng nhập đã tồn tại');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ username, email, passwordHash, acceptedTermsAt: new Date() });
  // Gửi email xác minh ở nền: không bắt người chơi chờ, lỗi mail không làm hỏng đăng ký
  issueVerify(user).catch((e) => console.error('[mail] verify', e.message));
  res.status(201).json({ token: signToken(user._id, 0), user: user.toPublic(), hasCharacter: false });
});

export const login = asyncHandler(async (req, res) => {
  const login = req.body.login.trim();
  const user = await User.findOne({ $or: [{ username: login }, { email: login.toLowerCase() }] }).select(
    '+passwordHash'
  );
  // Thông báo chung chung để không lộ tài khoản có tồn tại hay không
  if (!user || !(await bcrypt.compare(req.body.password, user.passwordHash))) {
    throw new HttpError(401, 'Sai tên đăng nhập hoặc mật khẩu');
  }
  if (user.bannedUntil && user.bannedUntil > new Date()) throw new HttpError(403, banMessage(user));
  const hasCharacter = !!(await Character.exists({ userId: user._id }));
  res.json({ token: signToken(user._id, user.tokenVersion || 0), user: user.toPublic(), hasCharacter });
});

export const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) throw new HttpError(401, 'Tài khoản không tồn tại');
  const character = await Character.findOne({ userId: user._id });
  res.json({ user: user.toPublic(), hasCharacter: !!character, character: character ? character.toPublic() : null });
});
