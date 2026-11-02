import { redis } from './redis.js';

/**
 * Trạng thái online của người chơi (dùng cho danh sách bạn bè, "nhảy tới chỗ bạn").
 * Redis hash nếu có (xuyên instance), không thì Map trong bộ nhớ.
 * Giá trị: { channel, url, floor, zone, activity, name, level, at }
 */
const KEY = 'gym:presence';
const mem = new Map();

export async function setPresence(userId, data) {
  const v = { ...data, at: Date.now() };
  const r = redis();
  if (r) await r.hSet(KEY, String(userId), JSON.stringify(v));
  else mem.set(String(userId), v);
}

export async function updatePresence(userId, patch) {
  const cur = (await getPresence([userId]))[String(userId)];
  if (!cur) return;
  await setPresence(userId, { ...cur, ...patch });
}

export async function clearPresence(userId) {
  const r = redis();
  if (r) await r.hDel(KEY, String(userId));
  else mem.delete(String(userId));
}

export async function getPresence(userIds) {
  const ids = userIds.map(String);
  const out = {};
  if (!ids.length) return out;
  const r = redis();
  if (r) {
    const vals = await r.hmGet(KEY, ids);
    ids.forEach((id, i) => {
      if (vals[i]) out[id] = JSON.parse(vals[i]);
    });
  } else {
    for (const id of ids) if (mem.has(id)) out[id] = mem.get(id);
  }
  return out;
}
