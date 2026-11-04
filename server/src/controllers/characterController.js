import { TUTORIAL_REWARD } from '../../../shared/constants.js';
import Character from '../models/Character.js';
import { HttpError, asyncHandler } from '../middleware/errorHandler.js';
import { filterProfanity } from '../utils/profanity.js';
import { broadcastAppearance } from '../realtime/notify.js';

export const getCharacter = asyncHandler(async (req, res) => {
  const character = await Character.findOne({ userId: req.userId });
  if (!character) throw new HttpError(404, 'Chưa tạo nhân vật');
  res.json({ character: character.toPublic() });
});

// Tạo mới hoặc cập nhật ngoại hình (KHÔNG cho sửa level/exp/stats qua API này)
export const upsertCharacter = asyncHandler(async (req, res) => {
  const { displayName, gender, skinColor, hair, outfit } = req.body;
  const cleanName = filterProfanity(displayName.trim());
  if (cleanName.includes('*')) throw new HttpError(400, 'Tên hiển thị chứa từ không phù hợp');

  let character = await Character.findOne({ userId: req.userId });
  const created = !character;
  if (!character) character = new Character({ userId: req.userId });

  character.displayName = cleanName;
  character.gender = gender;
  character.skinColor = skinColor;
  character.hair = { style: hair.style, color: hair.color };
  character.outfit = { style: outfit.style, top: outfit.top, bottom: outfit.bottom, shoes: outfit.shoes };
  // Phụ kiện chỉ đeo được khi có trong túi đồ
  if ('accessory' in req.body) {
    const acc = req.body.accessory;
    if (acc && !character.hasItem(acc)) throw new HttpError(400, 'Bạn chưa sở hữu phụ kiện này');
    character.accessory = acc || null;
  }
  await character.save();

  broadcastAppearance(req.userId, character.appearance());
  res.status(created ? 201 : 200).json({ character: character.toPublic() });
});

// Hoàn thành/bỏ qua hướng dẫn tân thủ: chỉ thưởng 1 lần và chỉ khi làm hết các bước
export const finishTutorial = asyncHandler(async (req, res) => {
  const coins = req.body?.finished ? TUTORIAL_REWARD : 0;
  const c = await Character.findOneAndUpdate({ userId: req.userId, tutorialDone: { $ne: true } }, { $set: { tutorialDone: true }, $inc: { coins } }, { new: true });
  if (!c) return res.json({ ok: true, coins: 0 });
  res.json({ ok: true, coins, character: c.toPublic() });
});
