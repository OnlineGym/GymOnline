import { redis } from './redis.js';

/**
 * Cache đơn giản: Redis nếu có (dùng chung giữa các instance), không thì bộ nhớ trong.
 * remember(key, ttl, fn): trả cache nếu còn hạn, ngược lại gọi fn() và lưu lại.
 * Gộp các lời gọi trùng nhau đang chờ (tránh "dồn" nhiều truy vấn DB cùng lúc).
 */
const mem = new Map();
const inflight = new Map();

export async function remember(key, ttlSec, fn) {
  const r = redis();
  if (r) {
    const hit = await r.get(`gym:cache:${key}`);
    if (hit) return JSON.parse(hit);
  } else {
    const hit = mem.get(key);
    if (hit && hit.exp > Date.now()) return hit.value;
  }
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try {
      const value = await fn();
      if (r) await r.set(`gym:cache:${key}`, JSON.stringify(value), { EX: ttlSec });
      else mem.set(key, { value, exp: Date.now() + ttlSec * 1000 });
      return value;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

export async function invalidate(prefix) {
  const r = redis();
  if (r) {
    for await (const k of r.scanIterator({ MATCH: `gym:cache:${prefix}*`, COUNT: 100 })) await r.del(k);
  } else {
    for (const k of mem.keys()) if (k.startsWith(prefix)) mem.delete(k);
  }
}
