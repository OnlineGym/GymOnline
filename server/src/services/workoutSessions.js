// Phiên tập đang diễn ra / vừa kết thúc của từng user (bộ nhớ trong instance giữ channel của họ).
// Socket ghi lại thời điểm khóa/mở máy -> REST /api/workouts dùng để kiểm chứng thời lượng tập,
// đồng thời phát hiện "tập cùng" (2 người tập cạnh nhau / spotter / cùng máy đôi).
const sessions = new Map();
// userId -> { equipmentId, base, type, slot, startedAt, endedAt, consumed, channel, x, z }

export function startSession(userId, info) {
  sessions.set(String(userId), { ...info, startedAt: Date.now(), endedAt: null, consumed: false });
}

export function endSession(userId) {
  const s = sessions.get(String(userId));
  if (s && !s.endedAt) s.endedAt = Date.now();
}

export function getSession(userId) {
  return sessions.get(String(userId)) || null;
}

// Lấy phiên hợp lệ để ghi log (chỉ dùng được 1 lần)
export function consumeSession(userId, equipmentType, slot = 0) {
  const s = sessions.get(String(userId));
  if (!s || s.consumed || s.type !== equipmentType || (s.slot || 0) !== (slot || 0)) return null;
  const end = s.endedAt || Date.now();
  if (Date.now() - end > 120000) return null; // quá 2 phút chưa ghi -> hết hạn
  s.consumed = true;
  return { serverDurationSec: (end - s.startedAt) / 1000, session: s, partners: findPartners(userId, s, end) };
}

// Người tập cùng: cùng channel, cùng máy (slot khác) hoặc ở gần ≤ 4m, trùng ≥ 50% thời gian
function findPartners(userId, me, myEnd) {
  const myDur = Math.max(1, myEnd - me.startedAt);
  const out = [];
  for (const [uid, s] of sessions) {
    if (uid === String(userId) || s.channel !== me.channel) continue;
    const sameMachine = s.base === me.base;
    const near = Math.hypot(s.x - me.x, s.z - me.z) <= 4 && s.floor === me.floor;
    if (!sameMachine && !near) continue;
    const overlap = Math.min(myEnd, s.endedAt || Date.now()) - Math.max(me.startedAt, s.startedAt);
    if (overlap / myDur >= 0.5) out.push({ userId: uid, spotter: sameMachine });
  }
  return out;
}

// Ai đang tập (dùng cho thống kê/hiệu ứng)
export function activeCount() {
  let n = 0;
  for (const s of sessions.values()) if (!s.endedAt) n++;
  return n;
}

// Dọn phiên cũ mỗi phút
setInterval(() => {
  const now = Date.now();
  for (const [k, s] of sessions) if (s.endedAt && now - s.endedAt > 5 * 60000) sessions.delete(k);
}, 60000).unref();
