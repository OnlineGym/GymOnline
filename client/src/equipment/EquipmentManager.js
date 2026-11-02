import { buildEquipmentMesh } from './builders.js';
import { EQUIPMENT_INFO, slotInfo, effort } from './config.js';

/**
 * Quản lý toàn bộ thiết bị của tòa nhà (mọi tầng):
 *  - id dạng "f{tầng}:{loại}_{số}" (+ "#{slot}" cho vị trí phụ: spotter, cầm đích...)
 *  - đăng ký va chạm theo tầng, tìm máy gần nhất, trạng thái khóa do server quyết định
 *  - cập nhật chuyển động bộ phận máy theo nhịp tập của người đang dùng (chỉ tầng hiện tại)
 */
export class EquipmentManager {
  constructor() {
    this.list = [];
    this.byId = new Map();
    this.byFloor = new Map();
    this.counters = {};
    this.locks = new Map(); // equipmentId -> nid
  }

  /**
   * Thêm thiết bị vào tầng `floor`. ry phải là bội số 90° để va chạm AABB đúng.
   * ctx: { parent (Group), collision }
   */
  add(floor, type, x, z, ry = 0, opts = {}, ctx) {
    const info = EQUIPMENT_INFO[type];
    if (!info) throw new Error(`Thiết bị không tồn tại: ${type}`);
    const key = `${floor}:${type}`;
    const n = (this.counters[key] = (this.counters[key] || 0) + 1);
    const id = `f${floor}:${type}_${n}`;
    const built = buildEquipmentMesh(info.model, info.group || 'stamina', opts);
    built.group.position.set(x, 0, z);
    built.group.rotation.y = ry;
    ctx.parent.add(built.group);

    const cos = Math.cos(ry);
    const sin = Math.sin(ry);
    const toWorld = (lx, lz) => ({ x: x + lx * cos + lz * sin, z: z - lx * sin + lz * cos });
    const addCollider = (fp) => {
      if (!fp || !ctx.collision) return;
      const c = toWorld(fp.ox || 0, fp.oz || 0);
      ctx.collision.addRect(c.x, c.z, fp.w, fp.d, ry, id);
    };
    addCollider(built.footprint);
    (built.extraColliders || []).forEach(addCollider);

    const seatW = toWorld(built.seat.x, built.seat.z);
    const exitW = toWorld(built.exit.x, built.exit.z);
    const seatY = info.seatY ?? built.seat.y;
    // Bộ phận chuyển động (đĩa tạ, tay cầm, băng chuyền...) – chỉ hiện khi ở gần (LOD thiết bị)
    const dyn = [];
    built.group.traverse((o) => {
      if (o !== built.group && o.userData.dynamic && !dyn.some((d) => isAncestor(d, o))) dyn.push(o);
    });
    const main = {
      dyn,
      dynVisible: true,
      id,
      type,
      slot: 0,
      floor,
      info,
      label: opts.label || info.label,
      group: built.group,
      seat: { x: seatW.x, y: seatY, z: seatW.z, ry },
      exit: exitW,
      update: built.update,
      user: null,
      startTime: 0,
      base: null,
    };
    this._register(main);
    // Vị trí phụ (spotter / người cầm đích...)
    (info.slots || []).forEach((s, i) => {
      const off = s.offset || { x: 0, z: 1 };
      const sw = toWorld(built.seat.x + off.x, built.seat.z + off.z);
      const ex = toWorld(built.seat.x + off.x + 0.8, built.seat.z + off.z);
      this._register({
        id: `${id}#${i + 1}`,
        type,
        slot: i + 1,
        floor,
        info: slotInfo(type, i + 1),
        label: s.label,
        group: built.group,
        seat: { x: sw.x, y: 0, z: sw.z, ry: ry + (s.facing || 0) },
        exit: ex,
        update: () => {},
        user: null,
        startTime: 0,
        base: main,
      });
    });
    return main;
  }

  _register(eq) {
    this.list.push(eq);
    this.byId.set(eq.id, eq);
    if (!this.byFloor.has(eq.floor)) this.byFloor.set(eq.floor, []);
    this.byFloor.get(eq.floor).push(eq);
  }

  setLock(equipmentId, nid) {
    if (nid) this.locks.set(equipmentId, nid);
    else this.locks.delete(equipmentId);
  }

  setFloorLocks(floor, obj) {
    const prefix = `f${floor}:`;
    for (const k of [...this.locks.keys()]) if (k.startsWith(prefix)) this.locks.delete(k);
    for (const [k, v] of Object.entries(obj || {})) this.locks.set(k, v);
  }

  isFreeFor(eq, selfNid) {
    if (eq.info.shared) return true;
    const holder = this.locks.get(eq.id);
    return !holder || holder === selfNid;
  }

  // Thiết bị gần nhất trên tầng trong bán kính range (tính tới điểm ngồi/đứng tập)
  nearest(floor, pos, range = 1.5, filter) {
    let best = null;
    let bestD = range;
    for (const eq of this.byFloor.get(floor) || []) {
      if (filter && !filter(eq)) continue;
      const d = Math.hypot(eq.seat.x - pos.x, eq.seat.z - pos.z);
      if (d < bestD) {
        bestD = d;
        best = eq;
      }
    }
    return best;
  }

  setUser(eq, character, now) {
    if (eq.user === character) return;
    eq.user = character;
    eq.startTime = now;
  }

  clearUser(character) {
    for (const eq of this.list) if (eq.user === character) eq.user = null;
  }

  phaseOf(eq, now) {
    // Vị trí phụ (spotter) đồng bộ nhịp với người tập chính
    const ref = eq.base && eq.base.user ? eq.base : eq;
    if (!ref.user) return 0;
    const rep = ref.info.rep || 2;
    return ((((now - ref.startTime) / rep) % 1) + 1) % 1;
  }

  update(floor, dt, now, player) {
    for (const eq of this.byFloor.get(floor) || []) {
      if (eq.base) continue;
      if (!eq.group.parent?.visible) continue; // khu đang bị ẩn (culling) -> bỏ qua
      if (player) {
        const near = !!eq.user || Math.hypot(eq.seat.x - player.x, eq.seat.z - player.z) < 16;
        if (near !== eq.dynVisible) {
          eq.dynVisible = near;
          for (const d of eq.dyn) d.visible = near;
        }
        if (!near) continue;
      }
      const active = !!eq.user;
      const phase = this.phaseOf(eq, now);
      eq.update(active ? effort(phase) : 0, active, dt, now, phase);
    }
  }

  // Thống kê cho "Tìm máy trống"
  summary(floor, locks = this.locks) {
    const out = {};
    for (const eq of this.byFloor.get(floor) || []) {
      if (eq.base || eq.info.utility) continue;
      const s = (out[eq.type] ||= { type: eq.type, total: 0, free: 0, items: [] });
      s.total++;
      const free = !locks.get(eq.id);
      if (free) s.free++;
      s.items.push({ id: eq.id, x: eq.seat.x, z: eq.seat.z, free });
    }
    return out;
  }
}

function isAncestor(a, o) {
  for (let p = o.parent; p; p = p.parent) if (p === a) return true;
  return false;
}
