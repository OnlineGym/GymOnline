import { SpatialHash } from './SpatialHash.js';
import { InteractionManager } from './interactions.js';
import { AOI, FLOORS, q, qa } from '../../../shared/constants.js';

const NEAR2 = AOI.near * AOI.near;
const MID2 = AOI.mid * AOI.mid;
const KEEP2 = (AOI.far + 6) * (AOI.far + 6); // vùng trễ tránh vào/ra liên tục ở rìa AOI

/**
 * 1 channel = 1 bản sao tòa nhà gym, tối đa ~120 người.
 * Giữ: người chơi, lưới AOI theo từng tầng, khóa máy tập, tương tác 2 người.
 */
export class Channel {
  constructor({ id, name, order, io }) {
    this.id = id;
    this.name = name;
    this.order = order;
    this.io = io;
    this.players = new Map(); // socketId -> player
    this.byUser = new Map(); // userId -> player
    this.byNid = new Map(); // nid (số ngắn gửi qua mạng) -> player
    this.grids = FLOORS.map(() => new SpatialHash(AOI.cell));
    this.locks = new Map(); // equipmentId -> nid
    this.peak = 0;
    this.emptySince = Date.now();
    this.ix = new InteractionManager(this);
    this.stats = { bytesOut: 0, msgsOut: 0 };
  }

  get count() {
    return this.players.size;
  }

  get room() {
    return `ch:${this.id}`;
  }

  floorRoom(f) {
    return `ch:${this.id}:f${f}`;
  }

  add(p) {
    this.players.set(p.sid, p);
    this.byUser.set(p.userId, p);
    this.byNid.set(p.nid, p);
    this.grids[p.f].insert(p);
    p.socket.join([this.room, this.floorRoom(p.f)]);
    this.peak = Math.max(this.peak, this.players.size);
    this.emptySince = 0;
  }

  remove(p) {
    this.releaseAll(p);
    this.ix.onLeave(p);
    this.grids[p.f].remove(p);
    this.players.delete(p.sid);
    if (this.byUser.get(p.userId) === p) this.byUser.delete(p.userId);
    this.byNid.delete(p.nid);
    if (!this.players.size) this.emptySince = Date.now();
  }

  move(p) {
    this.grids[p.f].move(p);
  }

  setFloor(p, f, x, z) {
    this.releaseAll(p);
    p.socket.leave(this.floorRoom(p.f));
    this.grids[p.f].remove(p);
    p.f = f;
    p.x = x;
    p.z = z;
    p.y = 0;
    p.ver++;
    this.grids[f].insert(p);
    p.socket.join(this.floorRoom(f));
  }

  // ---------- Khóa máy tập ----------
  lock(p, equipmentId) {
    this.releaseAll(p);
    this.locks.set(equipmentId, p.nid);
    p.eq = equipmentId;
    this.io.to(this.floorRoom(p.f)).emit('lock', { id: equipmentId, nid: p.nid });
  }

  releaseAll(p) {
    if (!p.eq) return;
    if (this.locks.get(p.eq) === p.nid) {
      this.locks.delete(p.eq);
      this.io.to(this.floorRoom(p.f)).emit('lock', { id: p.eq, nid: 0 });
    }
    p.eq = null;
  }

  holder(equipmentId) {
    const nid = this.locks.get(equipmentId);
    return nid ? this.byNid.get(nid) : null;
  }

  locksForFloor(f) {
    const prefix = `f${f}:`;
    const out = {};
    for (const [k, v] of this.locks) if (k.startsWith(prefix)) out[k] = v;
    return out;
  }

  // Người chơi trong bán kính (cùng tầng)
  nearby(p, radius) {
    const out = [];
    this.grids[p.f].query(p.x, p.z, radius, (o) => out.push(o));
    return out;
  }

  /**
   * Tick AOI (15Hz): với mỗi người chơi chỉ gửi trạng thái những người ở gần
   *  - < 18m: mỗi tick (15Hz) | < 34m: mỗi 3 tick (5Hz) | < 52m: mỗi 5 tick (3Hz) | xa hơn: không gửi
   *  - vào/ra vùng nhìn: gửi 'aoi' (thông tin đầy đủ khi vào, chỉ nid khi ra)
   *  - trạng thái gom 1 gói 's' / người nhận, vị trí lượng tử hóa số nguyên
   */
  tick(tickNo, now) {
    for (const p of this.players.values()) {
      const grid = this.grids[p.f];
      let enters = null;
      let states = null;
      const seen = p._seen;
      seen.clear();
      grid.query(p.x, p.z, AOI.far, (o, d2) => {
        if (o === p) return;
        seen.add(o.nid);
        const last = p.view.get(o.nid);
        if (last === undefined) {
          (enters ||= []).push(o.info());
          p.view.set(o.nid, o.ver);
          return;
        }
        if (o.ver === last) return;
        const tier = d2 < NEAR2 ? 1 : d2 < MID2 ? 3 : 5;
        if (tier > 1 && (tickNo + o.nid) % tier !== 0) return; // rải đều tải giữa các tick
        p.view.set(o.nid, o.ver);
        (states ||= []).push(o.packed());
      });
      let leaves = null;
      if (p.view.size !== seen.size) {
        for (const nid of p.view.keys()) {
          if (seen.has(nid)) continue;
          const o = this.byNid.get(nid);
          if (o && o.f === p.f && (o.x - p.x) ** 2 + (o.z - p.z) ** 2 < KEEP2) continue;
          (leaves ||= []).push(nid);
          p.view.delete(nid);
        }
      }
      if (enters || leaves) {
        p.socket.emit('aoi', { e: enters || [], l: leaves || [] });
        this.stats.msgsOut++;
      }
      if (states) {
        p.socket.emit('s', { t: now, p: states });
        this.stats.msgsOut++;
      }
    }
    this.ix.tick(now);
  }

  updateAppearance(userId, appearance) {
    const p = this.byUser.get(userId);
    if (!p) return;
    p.appearance = appearance;
    p.infoVer++;
    // Gửi cho những người đang nhìn thấy (cùng tầng, gần)
    this.io.to(this.floorRoom(p.f)).emit('appearance', { nid: p.nid, a: appearance });
  }

  summary() {
    return { id: this.id, name: this.name, order: this.order, count: this.players.size, peak: this.peak };
  }
}

/**
 * Tạo đối tượng người chơi trong channel
 */
let nidSeq = 1;
export function createPlayer({ socket, userId, appearance, bot = false, f, x, z, ry, extra = {} }) {
  const p = {
    sid: socket.id,
    socket,
    nid: nidSeq++ % 2147483647 || nidSeq++,
    userId,
    appearance,
    bot,
    f,
    x,
    y: 0,
    z,
    ry,
    anim: 0,
    eq: null,
    ver: 1,
    infoVer: 1,
    view: new Map(),
    _seen: new Set(),
    lastStateAt: Date.now(),
    teleportUntil: Date.now() + 5000,
    violations: 0,
    ix: null,
    party: null,
    guild: null,
    zone: '',
    chat: { times: [], mutedUntil: 0, last: '', repeat: 0 },
    lastEmote: 0,
    ...extra,
  };
  p.packed = () => {
    if (p._pv !== p.ver) {
      p._pk = [p.nid, q(p.x), q(p.y), q(p.z), qa(p.ry), p.anim];
      p._pv = p.ver;
    }
    return p._pk;
  };
  p.info = () => ({
    nid: p.nid,
    uid: p.userId,
    a: p.appearance,
    x: q(p.x),
    y: q(p.y),
    z: q(p.z),
    r: qa(p.ry),
    an: p.anim,
    eq: p.eq,
    pt: p.party,
    g: p.guildTag || null,
  });
  return p;
}
