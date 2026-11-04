import { Router } from 'express';
import { getCharacter, upsertCharacter, finishTutorial } from '../controllers/characterController.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody, rules, HEX_COLOR } from '../middleware/validate.js';
import { HAIR_STYLES, OUTFIT_STYLES, GENDERS } from '../models/Character.js';

const router = Router();

const color = (label) => rules.string({ pattern: HEX_COLOR, label });

router.get('/', requireAuth, getCharacter);
router.post('/tutorial', requireAuth, finishTutorial);

router.put(
  '/',
  requireAuth,
  validateBody({
    displayName: rules.string({ min: 2, max: 16, label: 'Tên hiển thị' }),
    gender: rules.oneOf(GENDERS, { label: 'Giới tính' }),
    skinColor: color('Màu da'),
    hair: (v) => {
      if (!v || typeof v !== 'object') return 'Thiếu thông tin tóc';
      return rules.oneOf(HAIR_STYLES, { label: 'Kiểu tóc' })(v.style) || color('Màu tóc')(v.color);
    },
    outfit: (v) => {
      if (!v || typeof v !== 'object') return 'Thiếu thông tin trang phục';
      return (
        rules.oneOf(OUTFIT_STYLES, { label: 'Kiểu trang phục' })(v.style) ||
        color('Màu áo')(v.top) ||
        color('Màu quần')(v.bottom) ||
        color('Màu giày')(v.shoes)
      );
    },
  }),
  upsertCharacter
);

export default router;
