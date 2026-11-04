import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validateBody, rules } from '../middleware/validate.js';
import * as A from '../controllers/adminController.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const reason = rules.string({ max: 200, optional: true, label: 'Lý do' });
router.get('/overview', A.overview);
router.get('/reports', A.listReports);
router.post('/reports/:id/resolve', A.resolveReport);
router.get('/users', A.searchUsers);
router.get('/users/:id', A.getUser);
router.post('/users/:id/ban', validateBody({ hours: rules.number({ min: 0, max: 87600, optional: true, label: 'Số giờ' }), reason }), A.banUser);
router.post('/users/:id/unban', A.unbanUser);
router.post('/users/:id/mute', validateBody({ minutes: rules.number({ min: 1, max: 43200, optional: true, label: 'Số phút' }), reason }), A.muteUser);
router.post('/users/:id/unmute', A.unmuteUser);
router.post('/announce', validateBody({ text: rules.string({ min: 1, max: 200, label: 'Nội dung' }) }), A.announce);
router.get('/actions', A.listActions);

export default router;
