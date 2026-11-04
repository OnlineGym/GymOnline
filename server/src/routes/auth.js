import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { register, login, me } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import * as A from '../controllers/accountController.js';
import { validateBody, rules } from '../middleware/validate.js';

const router = Router();

// Giới hạn số lần đăng nhập/đăng ký để chống dò mật khẩu
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
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

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const emailRule = rules.string({ max: 100, pattern: EMAIL, label: 'Email' });
const newPass = rules.string({ min: 6, max: 72, label: 'Mật khẩu mới' });
const tokenRule = rules.string({ min: 32, max: 128, label: 'Mã xác nhận' });
const anyPass = rules.string({ min: 1, max: 72, label: 'Mật khẩu' });

// Quên mật khẩu: giới hạn chặt để tránh spam email người khác
const mailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: { message: 'Bạn yêu cầu quá nhiều lần, vui lòng thử lại sau' } },
});
router.post('/forgot', mailLimiter, validateBody({ email: emailRule }), A.forgotPassword);
router.post('/reset', authLimiter, validateBody({ token: tokenRule, password: newPass }), A.resetPassword);
router.post('/verify', authLimiter, validateBody({ token: tokenRule }), A.verifyEmail);
router.post('/resend-verify', requireAuth, mailLimiter, A.resendVerify);
router.post('/change-password', requireAuth, authLimiter, validateBody({ current: anyPass, password: newPass }), A.changePassword);
router.post('/change-email', requireAuth, mailLimiter, validateBody({ password: anyPass, email: emailRule }), A.changeEmail);
router.post('/logout-all', requireAuth, A.logoutAll);
router.post('/refresh', requireAuth, A.refresh);
router.delete('/account', requireAuth, authLimiter, validateBody({ password: anyPass, confirm: rules.string({ min: 1, max: 20, label: 'Tên đăng nhập' }) }), A.deleteAccount);

export default router;
