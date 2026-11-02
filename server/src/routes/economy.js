import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import { validateBody, rules } from '../middleware/validate.js';
import * as E from '../controllers/economyController.js';
import { ITEMS } from '../../../shared/constants.js';

const router = Router();
router.use(requireAuth);

const giftLimiter = rateLimit({
  windowMs: 10 * 60000,
  limit: 20,
  keyGenerator: (req) => req.userId,
  message: { error: { message: 'Tặng quà quá nhiều, thử lại sau' } },
});
const itemRule = rules.oneOf(Object.keys(ITEMS), { label: 'Vật phẩm' });

router.get('/shop', E.getShop);
router.post('/shop/buy', validateBody({ item: itemRule, qty: rules.number({ min: 1, max: 10, optional: true, label: 'Số lượng' }) }), E.buyItem);
router.post('/inventory/use', validateBody({ item: itemRule }), E.useItem);
router.post('/inventory/equip', E.equipAccessory);
router.post(
  '/gifts',
  giftLimiter,
  validateBody({
    to: rules.string({ min: 24, max: 24, label: 'Người nhận' }),
    coins: rules.number({ min: 0, max: 10000, optional: true, label: 'Xu' }),
    item: rules.oneOf(Object.keys(ITEMS), { optional: true, label: 'Vật phẩm' }),
    qty: rules.number({ min: 1, max: 10, optional: true, label: 'Số lượng' }),
    message: rules.string({ max: 100, optional: true, label: 'Lời nhắn' }),
  }),
  E.sendGift
);
router.get('/gifts/pending', E.pendingGifts);
router.post('/gifts/:id/accept', E.respondGift(true));
router.post('/gifts/:id/decline', E.respondGift(false));

export default router;
