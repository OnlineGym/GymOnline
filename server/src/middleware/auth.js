import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import User from '../models/User.js';
import { HttpError } from './errorHandler.js';

export function signToken(userId, tokenVersion = 0) {
  return jwt.sign({ sub: String(userId), tv: tokenVersion }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

export function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

// Trạng thái tài khoản dùng cho mỗi request: cache ngắn để không truy vấn DB liên tục
const CACHE_MS = 10000;
const cache = new Map();
export function invalidateAuth(userId) {
  cache.delete(String(userId));
}
async function authState(userId) {
  const key = String(userId);
  const hit = cache.get(key);
  if (hit && hit.at > Date.now() - CACHE_MS) return hit.u;
  const u = await User.findById(userId).select('tokenVersion bannedUntil banReason role chatMutedUntil').lean();
  if (cache.size > 20000) cache.clear();
  cache.set(key, { at: Date.now(), u });
  return u;
}

export const banMessage = (u) =>
  `Tài khoản đang bị khóa${u.banReason ? `: ${u.banReason}` : ''}${u.bannedUntil.getFullYear() < 2900 ? ` (tới ${u.bannedUntil.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })})` : ''}`;

// Kiểm tra token còn hiệu lực + tài khoản không bị khóa. Trả về lỗi dạng { code, message } hoặc null
export async function checkAccount(payload) {
  const u = await authState(payload.sub);
  if (!u) return { code: 'UNAUTHORIZED', message: 'Tài khoản không tồn tại' };
  if ((payload.tv || 0) !== (u.tokenVersion || 0)) return { code: 'UNAUTHORIZED', message: 'Phiên đăng nhập đã hết hiệu lực, vui lòng đăng nhập lại' };
  if (u.bannedUntil && u.bannedUntil > new Date()) return { code: 'BANNED', message: banMessage(u) };
  return null;
}

// Middleware bắt buộc đăng nhập: đọc header "Authorization: Bearer <token>"
export async function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return next(new HttpError(401, 'Bạn chưa đăng nhập'));
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return next(new HttpError(401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn'));
  }
  try {
    const bad = await checkAccount(payload);
    if (bad) return next(new HttpError(bad.code === 'BANNED' ? 403 : 401, bad.message));
    req.userId = payload.sub;
    next();
  } catch (e) {
    next(e);
  }
}

export async function requireAdmin(req, _res, next) {
  try {
    const u = await authState(req.userId);
    if (u?.role !== 'admin') return next(new HttpError(403, 'Bạn không có quyền quản trị'));
    next();
  } catch (e) {
    next(e);
  }
}
