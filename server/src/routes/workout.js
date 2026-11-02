import { Router } from 'express';
import { createWorkout, getHistory } from '../controllers/workoutController.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody, rules } from '../middleware/validate.js';
import { EQUIPMENT_TYPES } from '../config/equipment.js';

const router = Router();

router.post(
  '/',
  requireAuth,
  validateBody({
    equipmentType: rules.oneOf(Object.keys(EQUIPMENT_TYPES), { label: 'Loại máy' }),
    durationSec: rules.number({ min: 0, max: 3600, label: 'Thời lượng' }),
    reps: rules.number({ min: 0, max: 10000, label: 'Số rep' }),
  }),
  createWorkout
);

router.get('/history', requireAuth, getHistory);

export default router;
