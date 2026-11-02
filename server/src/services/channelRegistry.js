import { redis } from './redis.js';
import env from '../config/env.js';
import { CHANNEL_MAX } from '../../../shared/constants.js';

/**
 * Registry danh sách channel của TẤT CẢ instance:
 *  - mỗi instance định kỳ đăng ký channel của mình (số người, url) vào Redis hash gym:channels
 *  - không có Redis -> chỉ trả danh sách channel của instance hiện tại
 * Channel hết hạn sau 15s nếu instance sập (không còn heartbeat).
 */
const KEY = 'gym:channels';
const STALE_MS = 15000;
let localProvider = () => [];

export function setLocalProvider(fn) {
  localProvider = fn;
}

export async function publishLocal() {
  const r = redis();
  if (!r) return;
  const list = localProvider();
  if (!list.length) return;
  const multi = r.multi();
  for (const c of list) multi.hSet(KEY, c.id, JSON.stringify({ ...c, instanceId: env.instanceId, url: env.publicUrl || null, at: Date.now() }));
  await multi.exec();
}

export async function listChannels() {
  const local = localProvider().map((c) => ({ ...c, instanceId: env.instanceId, url: env.publicUrl || null, local: true }));
  const r = redis();
  if (!r) return local;
  const all = await r.hGetAll(KEY);
  const now = Date.now();
  const merged = new Map();
  for (const [id, raw] of Object.entries(all)) {
    const c = JSON.parse(raw);
    if (now - c.at > STALE_MS) {
      r.hDel(KEY, id).catch(() => {});
      continue;
    }
    merged.set(id, { ...c, local: c.instanceId === env.instanceId });
  }
  for (const c of local) merged.set(c.id, c); // số liệu local là mới nhất
  return [...merged.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export { CHANNEL_MAX };
