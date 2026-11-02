import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import { validateBody, rules } from '../middleware/validate.js';
import * as S from '../controllers/socialController.js';

const router = Router();
router.use(requireAuth);

const strict = (limit, minutes = 10) =>
  rateLimit({
    windowMs: minutes * 60000,
    limit,
    keyGenerator: (req) => req.userId,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { message: 'Bạn thao tác quá nhiều, thử lại sau' } },
  });

// Bạn bè & chặn
router.get('/friends', S.listFriends);
router.post('/friends/request', strict(30), S.requestFriend);
router.post('/friends/:userId/accept', S.acceptFriend);
router.delete('/friends/:userId', S.removeFriend);
router.post('/friends/block', validateBody({ userId: rules.string({ min: 24, max: 24, label: 'userId' }) }), S.blockUser);
router.delete('/friends/block/:userId', S.unblockUser);
router.get('/friends/blocked', S.listBlocked);

// Hồ sơ công khai / tìm người chơi
router.get('/players', S.searchPlayers);
router.get('/players/:userId', S.getPlayer);

// Party
router.get('/party', S.getParty);
router.post('/party', S.createParty);
router.post('/party/invite', strict(30), validateBody({ userId: rules.string({ min: 24, max: 24, label: 'userId' }) }), S.inviteParty);
router.post('/party/join', validateBody({ partyId: rules.string({ min: 24, max: 24, label: 'partyId' }) }), S.joinParty);
router.post('/party/leave', S.leaveParty);
router.post('/party/kick', validateBody({ userId: rules.string({ min: 24, max: 24, label: 'userId' }) }), S.kickParty);

// Guild / CLB
router.get('/guilds', S.listGuilds);
router.get('/guilds/mine', S.myGuild);
router.get('/guilds/:id', S.getGuild);
router.post(
  '/guilds',
  strict(5, 60),
  validateBody({
    name: rules.string({ min: 3, max: 24, label: 'Tên CLB' }),
    tag: rules.string({ min: 2, max: 5, pattern: /^[a-zA-Z0-9]+$/, label: 'Tag' }),
    description: rules.string({ max: 200, optional: true, label: 'Mô tả' }),
  }),
  S.createGuild
);
router.post('/guilds/:id/join', S.joinGuild);
router.post('/guilds/invite', strict(30), validateBody({ userId: rules.string({ min: 24, max: 24, label: 'userId' }) }), S.inviteGuild);
router.post('/guilds/leave', S.leaveGuild);
router.post('/guilds/kick', validateBody({ userId: rules.string({ min: 24, max: 24, label: 'userId' }) }), S.kickGuild);

// Báo cáo vi phạm (giới hạn 5 lần / giờ)
router.post(
  '/reports',
  strict(5, 60),
  validateBody({
    userId: rules.string({ min: 24, max: 24, label: 'userId' }),
    reason: rules.oneOf(['spam', 'abuse', 'cheat', 'name', 'other'], { label: 'Lý do' }),
    details: rules.string({ max: 300, optional: true, label: 'Chi tiết' }),
  }),
  S.createReport
);

// Thành tích & lịch sử thách đấu
router.get('/achievements', S.getAchievements);
router.get('/challenges/history', S.challengeHistory);

export default router;
