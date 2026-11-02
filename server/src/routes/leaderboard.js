import { Router } from 'express';
import { getLeaderboard } from '../controllers/leaderboardController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.get('/', requireAuth, getLeaderboard);
export default router;
