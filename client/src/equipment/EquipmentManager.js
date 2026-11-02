import * as THREE from 'three';
import { buildEquipmentMesh } from './builders.js';
import { EQUIPMENT_INFO, effort } from './config.js';

/**
 * Quản lý toàn bộ thiết bị trong gym:
 *  - đặt máy vào thế giới + đăng ký va chạm
 *  - tìm máy gần người chơi nhất để hiện nút "Tập"
 *  - trạng thái khóa (server quyết định ai đang dùng máy nào)
 *  - cập nhật chuyển động bộ phận máy theo nhịp tập của người đang dùng
 */
export class EquipmentManager {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'equipment';
    this.list = [];
    this.byId = new Map();
    this.counters = {};
    this.locks = new Map(); // equipmentId -> socketId
    this.collision = null;
  }

  setCollision(collision) {
    this.collision = collision;
  }

  /**
   * Thêm thiết bị. ry phải là bội số 90° để va chạm AABB đúng.
   * opts: { stat, color, top, exitZ, label, id }
   */
  add(type, x, z, ry = 0, opts = {}) {
    const info = EQUIPMENT_INFO[type];
    const n = (this.counters[type] = (this.counters[type] || 0) + 1);
    const id = opts.id || `${type}_${n}`;
    const built = buildEquipmentMesh(type, opts.stat || info.stat || 'stamina', opts);
    built.group.position.set(x, 0, z);
    built.group.rotation.y = ry;
    this.root.add(built.group);

    const cos = Math.cos(ry);
    const sin = Math.sin(ry);
    // chuyển toạ độ cục bộ -> thế giới
    const toWorld = (lx, lz) => ({ x: x + lx * cos + lz * sin, z: z - lx * sin + lz * cos });

    const addCollider = (fp) => {
      if (!fp || !this.collision) return;
      const c = toWorld(fp.ox || 0, fp.oz || 0);
      this.collision.addRect(c.x, c.z, fp.w, fp.d, ry, id);
    };
    addCollider(built.footprint);
    (built.extraColliders || []).forEach(addCollider);

    const seatW = toWorld(built.seat.x, built.seat.z);
    const exitW = toWorld(built.exit.x, built.exit.z);
    const eq = {
      id,
      type,
      info,
      label: opts.label || info.label,
      group: built.group,
      seat: { x: seatW.x, y: built.seat.y, z: seatW.z, ry },
      exit: exitW,
      update: built.update,
      user: null, // nhân vật đang dùng (local hoặc remote)
      startTime: 0,
    };
    this.list.push(eq);
    this.byId.set(id, eq);
    return eq;
  }

  setLock(equipmentId, socketId) {
    if (socketId) this.locks.set(equipmentId, socketId);
    else this.locks.delete(equipmentId);
  }

  setAllLocks(obj) {
    this.locks.clear();
    for (const [k, v] of Object.entries(obj || {})) this.locks.set(k, v);
  }

  isFreeFor(eq, selfId) {
    const holder = this.locks.get(eq.id);
    return !holder || holder === selfId;
  }

  // Máy gần nhất trong bán kính range (tính tới điểm ngồi/đứng tập)
  nearest(pos, range = 1.5) {
    let best = null;
    let bestD = range;
    for (const eq of this.list) {
      const d = Math.hypot(eq.seat.x - pos.x, eq.seat.z - pos.z);
      if (d < bestD) {
        bestD = d;
        best = eq;
      }
    }
    return best;
  }

  // Gán người dùng máy (để đồng bộ chuyển động máy + animation)
  setUser(eq, character, now) {
    if (eq.user === character) return;
    eq.user = character;
    eq.startTime = now;
  }

  clearUser(character) {
    for (const eq of this.list) if (eq.user === character) eq.user = null;
  }

  phaseOf(eq, now) {
    if (!eq.user) return 0;
    const rep = eq.info.rep || 2;
    return (((now - eq.startTime) / rep) % 1 + 1) % 1;
  }

  update(dt, now) {
    for (const eq of this.list) {
      const active = !!eq.user;
      const phase = this.phaseOf(eq, now);
      eq.update(active ? effort(phase) : 0, active, dt, now, phase);
    }
  }
}
