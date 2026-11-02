// Lưu phiên tập đang diễn ra / vừa kết thúc của từng user (trong bộ nhớ).
// Socket ghi lại thời điểm khóa/mở máy -> REST /api/workouts dùng để kiểm chứng thời lượng tập.
const sessions = new Map(); // userId -> { equipmentId, equipmentType, startedAt, endedAt, consumed }

export function startSession(userId, equipmentId, equipmentType) {
  sessions.set(String(userId), { equipmentId, equipmentType, startedAt: Date.now(), endedAt: null, consumed: false });
}

export function endSession(userId) {
  const s = sessions.get(String(userId));
  if (s && !s.endedAt) s.endedAt = Date.now();
}

// Lấy phiên hợp lệ để ghi log (chỉ dùng được 1 lần)
export function consumeSession(userId, equipmentType) {
  const s = sessions.get(String(userId));
  if (!s || s.consumed || s.equipmentType !== equipmentType) return null;
  const end = s.endedAt || Date.now();
  // Phiên kết thúc quá 2 phút mà chưa ghi thì coi như hết hạn
  if (Date.now() - end > 120000) return null;
  s.consumed = true;
  return { serverDurationSec: (end - s.startedAt) / 1000 };
}
