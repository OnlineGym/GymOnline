import { Router } from 'express';
import { getChatHistory } from '../controllers/chatController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.get('/history', requireAuth, getChatHistory);
export default router;
