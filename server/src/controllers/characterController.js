import Character from '../models/Character.js';
import { HttpError, asyncHandler } from '../middleware/errorHandler.js';
import { filterProfanity } from '../utils/profanity.js';
import { broadcastAppearance } from '../sockets/index.js';

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
  await character.save();

  // Đồng bộ ngoại hình mới cho mọi người chơi đang online
  broadcastAppearance(req.userId, character.appearance());

  res.status(created ? 201 : 200).json({ character: character.toPublic() });
});
