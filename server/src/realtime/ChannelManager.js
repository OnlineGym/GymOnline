import { Channel } from './Channel.js';
import env from '../config/env.js';
import { CHANNEL_MAX, CHANNEL_HARD_MAX, CHANNEL_AUTO_FILL } from '../../../shared/constants.js';
import { setLocalProvider, publishLocal } from '../services/channelRegistry.js';
import { ChannelStat } from '../models/social.js';

const TICK_HZ = 15;

/**
 * Quản lý các channel của instance này:
 *  - phân bổ tự động: ưu tiên channel đông nhất nhưng < 80% (giữ không khí đông vui),
 *    tất cả đều ≥ 80% -> tạo channel mới (cân bằng tải)
 *  - channel trống quá 5 phút (ngoài số channel khởi tạo) sẽ bị xóa
 *  - vòng tick AOI 15Hz + đo thời gian xử lý để theo dõi hiệu năng
 */
export class ChannelManager {
  constructor(io) {
    this.io = io;
    this.channels = new Map();
    this.seq = 0;
    this.tickNo = 0;
    this.metrics = { tickMs: 0, tickMsMax: 0, ticks: 0, lagMs: 0 };
    for (let i = 0; i < env.channelsPerInstance; i++) this.create();
    setLocalProvider(() => [...this.channels.values()].map((c) => ({ ...c.summary(), max: CHANNEL_MAX })));
  }

  create() {
    this.seq++;
    const single = env.instanceId === `i${env.port}`;
    const id = `${env.instanceId}-${this.seq}`;
    const name = single ? `Gym ${this.seq}` : `Gym ${env.instanceId.toUpperCase()}.${this.seq}`;
    const ch = new Channel({ id, name, order: this.seq, io: this.io });
    this.channels.set(id, ch);
    console.log(`[channel] Tạo ${name} (${id})`);
    publishLocal().catch(() => {});
    return ch;
  }

  get(id) {
    return this.channels.get(id);
  }

  totalPlayers() {
    let n = 0;
    for (const c of this.channels.values()) n += c.count;
    return n;
  }

  // Chọn channel cho người chơi mới
  pick(requested, { viaFriend = false } = {}) {
    if (requested && requested !== 'auto') {
      const ch = this.channels.get(requested);
      if (!ch) return { error: 'CHANNEL_NOT_FOUND' };
      const cap = viaFriend ? CHANNEL_HARD_MAX : CHANNEL_MAX;
      if (ch.count >= cap) return { error: 'CHANNEL_FULL' };
      return { channel: ch };
    }
    const list = [...this.channels.values()];
    const open = list.filter((c) => c.count < CHANNEL_MAX * CHANNEL_AUTO_FILL).sort((a, b) => b.count - a.count || a.order - b.order);
    if (open.length) return { channel: open[0] };
    return { channel: this.create() };
  }

  findUser(userId) {
    for (const c of this.channels.values()) {
      const p = c.byUser.get(String(userId));
      if (p) return { channel: c, player: p };
    }
    return null;
  }

  updateAppearance(userId, appearance) {
    for (const c of this.channels.values()) c.updateAppearance(userId, appearance);
  }

  start() {
    const interval = 1000 / TICK_HZ;
    let expected = Date.now() + interval;
    const loop = () => {
      const now = Date.now();
      this.metrics.lagMs = Math.max(0, now - expected);
      const t0 = performance.now();
      this.tickNo++;
      for (const c of this.channels.values()) c.tick(this.tickNo, now);
      const ms = performance.now() - t0;
      this.metrics.tickMs = this.metrics.tickMs * 0.9 + ms * 0.1;
      this.metrics.tickMsMax = Math.max(this.metrics.tickMsMax * 0.995, ms);
      this.metrics.ticks++;
      expected += interval;
      if (expected < Date.now()) expected = Date.now() + interval; // bị trễ quá -> bắt nhịp lại
      setTimeout(loop, Math.max(0, expected - Date.now()));
    };
    setTimeout(loop, interval);

    // Heartbeat registry + dọn channel trống + thống kê
    setInterval(() => {
      publishLocal().catch((e) => console.error('[channel] publish', e.message));
      const now = Date.now();
      for (const c of [...this.channels.values()]) {
        if (this.channels.size > env.channelsPerInstance && !c.count && c.emptySince && now - c.emptySince > 5 * 60000) {
          for (const m of Object.values(c.music || {})) m.dispose();
          this.channels.delete(c.id);
          console.log(`[channel] Xóa ${c.name} (trống)`);
        }
      }
    }, 5000).unref();
    setInterval(() => {
      const docs = [...this.channels.values()].map((c) => ({ channelId: c.id, instanceId: env.instanceId, players: c.count, peak: c.peak }));
      if (docs.length) ChannelStat.insertMany(docs).catch(() => {});
    }, 60000).unref();
  }
}
