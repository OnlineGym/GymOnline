import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { register, login, me } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody, rules } from '../middleware/validate.js';

const router = Router();

// Giới hạn số lần đăng nhập/đăng ký để chống dò mật khẩu
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { message: 'Bạn thao tác quá nhiều, vui lòng thử lại sau ít phút' } },
});

router.post(
  '/register',
  authLimiter,
  validateBody({
    username: rules.string({ min: 3, max: 20, pattern: /^[a-zA-Z0-9_]+$/, label: 'Tên đăng nhập (không dấu, không dấu cách)' }),
    email: rules.string({ max: 100, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, label: 'Email' }),
    password: rules.string({ min: 6, max: 72, label: 'Mật khẩu' }),
  }),
  register
);

router.post(
  '/login',
  authLimiter,
  validateBody({
    login: rules.string({ min: 3, max: 100, label: 'Tên đăng nhập/Email' }),
    password: rules.string({ min: 1, max: 72, label: 'Mật khẩu' }),
  }),
  login
);

router.get('/me', requireAuth, me);

export default router;
