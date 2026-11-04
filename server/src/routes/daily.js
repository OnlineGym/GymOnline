import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { state, claim, checkin } from '../services/quests.js';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => res.json(await state(req.userId))));
router.post('/checkin', asyncHandler(async (req, res) => res.json(await checkin(req.userId))));
router.post('/quests/:key/claim', asyncHandler(async (req, res) => res.json(await claim(req.userId, String(req.params.key)))));

export default router;
