import { toast } from '../ui/dom.js';
import { POOL } from '../world/floors.js';
import { EQUIPMENT_INFO } from '../equipment/config.js';
import { audio } from './audio.js';
import { settings } from './settings.js';

/**
 * BƠI & LẶN tự do trong hồ (tầng B1):
 *  - đi xuống hồ là tự bơi; WASD bơi theo hướng camera, Shift bơi nhanh (tốn hơi)
 *  - SPACE nổi lên, C / Ctrl lặn xuống; thả tay thì nổi dần lên mặt nước
 *  - thanh hơi thở khi lặn; hết hơi tự ngoi lên
 *  - leo lên bờ: ở mặt nước, bơi sát thành hồ rồi bấm SPACE (hoặc E)
 *  - quãng đường bơi được tính thành buổi tập (mỗi 25m = 1 chặng)
 */
const SURF = POOL.surface - 0.3; // độ cao gốc nhân vật khi nổi trên mặt nước
const BOTTOM = -POOL.depth + 0.35;
const POOL_EQ = { id: 'f0:pool_lane_1', type: 'pool_lane', slot: 0, info: EQUIPMENT_INFO.pool_lane, exit: { x: 0, z: 0 } };

export class Swim {
  constructor(game) {
    this.g = game;
    this.breath = 1;
    this.y = SURF;
    this.warned = false;
  }

  static inPool(f, x, z, margin = 0) {
    return f === 0 && x > POOL.x1 + margin && x < POOL.x2 - margin && z > POOL.z1 + margin && z < POOL.z2 - margin;
  }

  tryEnter() {
    const g = this.g;
    if (!Swim.inPool(g.floorId, g.pos.x, g.pos.z)) return false;
    g.mode = 'swim';
    this.y = SURF;
    this.breath = 1;
    this.dist = 0;
    this.laps = 0;
    g.jumpY = 0;
    audio.sfx('pop');
    toast('🏊 Đang bơi: WASD bơi • SPACE nổi • C lặn • sát thành hồ + SPACE để lên bờ', 'info', 4500);
    const now = g.ctx.clockTime;
    g.session = { eq: POOL_EQ, start: now, laps: 0, swim: true };
    g.net.request('equipment:request', { id: POOL_EQ.id, type: POOL_EQ.type, slot: 0 });
    g.hud.showWorkout(POOL_EQ.info, '+Thể lực • mỗi 25m = 1 chặng', { laps: true, lapsLabel: 'Chặng 25m' });
    return true;
  }

  get underwater() {
    return this.y < SURF - 0.25;
  }

  update(dt) {
    const g = this.g;
    // Bị dịch chuyển ra khỏi hồ (đổi tầng / dịch chuyển nhanh) -> kết thúc bơi
    if (!Swim.inPool(g.floorId, g.pos.x, g.pos.z, -0.5)) {
      g.rampY = 0;
      g.hud.setBreath?.(null);
      g.finishSwim(this.laps);
      return;
    }
    const k = g.input.keys;
    const mv = g.input.getMove();
    const mag = Math.hypot(mv.x, mv.y);
    const { f, r } = g.cam.basis();
    let dx = r.x * mv.x + f.x * mv.y;
    let dz = r.z * mv.x + f.z * mv.y;
    const len = Math.hypot(dx, dz);
    if (len > 0) {
      dx /= len;
      dz /= len;
    }
    const sprint = g.input.isRunning() && mag > 0.5;
    const speed = (sprint ? 2.8 : 1.7) * Math.min(1, mag);
    const kk = 1 - Math.exp(-dt * 4); // nước có quán tính
    g.vel.x += (dx * speed - g.vel.x) * kk;
    g.vel.z += (dz * speed - g.vel.z) * kk;
    g.pos.x = Math.max(POOL.x1 + 0.35, Math.min(POOL.x2 - 0.35, g.pos.x + g.vel.x * dt));
    g.pos.z = Math.max(POOL.z1 + 0.35, Math.min(POOL.z2 - 0.35, g.pos.z + g.vel.z * dt));
    this.dist += Math.hypot(g.vel.x, g.vel.z) * dt;
    // Nổi / lặn
    const up = k.has('Space') || g.mobileUp;
    const down = k.has(settings.keys.sit) || k.has('ControlLeft') || g.mobileDown;
    let vy = up ? 1.5 : down ? -1.4 : this.y < SURF ? 0.45 : 0;
    if (this.breath <= 0) vy = 2;
    this.y = Math.max(BOTTOM, Math.min(SURF, this.y + vy * dt));
    // Hơi thở
    if (this.underwater) {
      this.breath = Math.max(0, this.breath - dt / (sprint ? 14 : 22));
      if (this.breath <= 0 && !this.warned) {
        this.warned = true;
        toast('😵 Hết hơi! Đang ngoi lên mặt nước...', 'error', 2500);
      }
    } else {
      this.breath = Math.min(1, this.breath + dt / 3);
      if (this.breath > 0.5) this.warned = false;
    }
    g.rampY = this.y;
    if (len > 0.1) g.ry = Math.atan2(dx, dz);
    const moving = mag > 0.1;
    // Bơi: chỉ tính lúc thực sự bơi, thả nổi thì không đốt calo
    if (moving && g.session) g.session.activeSec = (g.session.activeSec || 0) + dt;
    g.me.play(this.underwater ? 'dive' : moving ? 'swim' : 'tread');
    // Chặng 25m
    const laps = Math.floor(this.dist / 25);
    if (laps > this.laps) {
      this.laps = laps;
      if (g.session) g.session.laps = laps;
      audio.sfx('coin');
      toast(`🏊 Hoàn thành chặng ${laps} (${laps * 25}m)`, 'success', 1800);
    }
    if (g.session) g.hud.updateWorkout({ reps: this.laps, time: g.ctx.clockTime - g.session.start, cal: (POOL_EQ.info.cal * (g.session.activeSec || 0)) / 60, repProgress: (this.dist % 25) / 25 });
    g.hud.setBreath?.(this.underwater || this.breath < 1 ? this.breath : null);
  }

  // Sát thành hồ + ở mặt nước -> leo lên bờ
  canClimbOut() {
    const { x, z } = this.g.pos;
    if (this.underwater) return null;
    const d = [
      [x - POOL.x1, -1, 0],
      [POOL.x2 - x, 1, 0],
      [z - POOL.z1, 0, -1],
      [POOL.z2 - z, 0, 1],
    ].sort((a, b) => a[0] - b[0])[0];
    return d[0] < 0.75 ? { nx: d[1], nz: d[2] } : null;
  }

  climbOut() {
    const g = this.g;
    const e = this.canClimbOut();
    if (!e) return false;
    if (e.nx) g.pos.x = e.nx > 0 ? POOL.x2 + 0.7 : POOL.x1 - 0.7;
    if (e.nz) g.pos.z = e.nz > 0 ? POOL.z2 + 0.7 : POOL.z1 - 0.7;
    g.rampY = 0;
    g.vel.x = g.vel.z = 0;
    g.hud.setBreath?.(null);
    audio.sfx('pop');
    g.finishSwim(this.laps);
    return true;
  }
}
