import { createClient } from 'redis';
import env from '../config/env.js';

/**
 * Redis là TÙY CHỌN. Có REDIS_URL -> bật:
 *  - Socket.IO Redis adapter (nhiều instance server, chat/thông báo xuyên instance)
 *  - Registry channel + presence + cache leaderboard dùng chung
 * Không có -> mọi thứ chạy bằng bộ nhớ trong 1 instance.
 */
let pub = null;
let sub = null;

export async function connectRedis() {
  if (!env.redisUrl) {
    console.log('[redis] Không cấu hình REDIS_URL -> chạy 1 instance (bộ nhớ trong)');
    return null;
  }
  pub = createClient({ url: env.redisUrl });
  sub = pub.duplicate();
  pub.on('error', (e) => console.error('[redis] pub error', e.message));
  sub.on('error', (e) => console.error('[redis] sub error', e.message));
  await Promise.all([pub.connect(), sub.connect()]);
  console.log('[redis] Đã kết nối', env.redisUrl);
  return { pub, sub };
}

export const redis = () => pub;
export const redisSub = () => sub;
