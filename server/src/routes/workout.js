import { Router } from 'express';
import { createWorkout, getHistory } from '../controllers/workoutController.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody, rules } from '../middleware/validate.js';
import { EQUIPMENT } from '../config/equipment.js';

const router = Router();
const workoutTypes = Object.keys(EQUIPMENT).filter((k) => !EQUIPMENT[k].utility);

router.post(
  '/',
  requireAuth,
  validateBody({
    equipmentType: rules.oneOf(workoutTypes, { label: 'Loại máy' }),
    durationSec: rules.number({ min: 0, max: 3600, label: 'Thời lượng' }),
    reps: rules.number({ min: 0, max: 10000, label: 'Số rep' }),
    slot: rules.number({ min: 0, max: 3, optional: true, label: 'Vị trí' }),
    sync: rules.number({ min: 0, max: 1, optional: true, label: 'Điểm đồng bộ' }),
  }),
  createWorkout
);

router.get('/history', requireAuth, getHistory);

export default router;
