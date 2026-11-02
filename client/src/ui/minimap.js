import { generateWalls, outerWalls } from '../world/wallGen.js';
import { FLOOR_BOUNDS, WORLD_BOUNDS } from '@shared/constants.js';
import { isMobile } from '../core/device.js';

/**
 * Vẽ mặt bằng 1 tầng lên canvas (dùng cho minimap góc màn hình và bản đồ lớn).
 * Nền (phòng + tường + thiết bị) vẽ 1 lần / tầng rồi cache; mỗi frame chỉ vẽ chấm người chơi.
 */
export function renderFloorPlan(def, equipment, scale, { labels = false, dpr = 1 } = {}) {
  const B = def.id === 1 ? { ...FLOOR_BOUNDS, maxZ: WORLD_BOUNDS.maxZ } : FLOOR_BOUNDS;
  const w = (B.maxX - B.minX) * scale;
  const hh = (B.maxZ - B.minZ) * scale;
  const c = document.createElement('canvas');
  c.width = w * dpr;
  c.height = hh * dpr;
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const tx = (x) => (x - B.minX) * scale;
  const tz = (z) => (z - B.minZ) * scale;
  g.fillStyle = def.id === 4 ? '#365314' : '#0b1220';
  g.fillRect(0, 0, w, hh);
  g.fillStyle = '#1e293b';
  g.fillRect(tx(FLOOR_BOUNDS.minX), tz(FLOOR_BOUNDS.minZ), (FLOOR_BOUNDS.maxX - FLOOR_BOUNDS.minX) * scale, (FLOOR_BOUNDS.maxZ - FLOOR_BOUNDS.minZ) * scale);
  for (const r of [...def.rooms].reverse()) {
    g.fillStyle = r.map || '#334155';
    g.fillRect(tx(r.x1), tz(r.z1), (r.x2 - r.x1) * scale, (r.z2 - r.z1) * scale);
  }
  g.strokeStyle = '#e2e8f0';
  g.lineWidth = Math.max(1.2, scale * 0.3);
  const walls = [...outerWalls(FLOOR_BOUNDS, def.outerDoors || []), ...generateWalls(def.rooms, def.doors || [], FLOOR_BOUNDS)];
  for (const wl of walls) {
    const alongX = wl.z1 === wl.z2;
    const a = alongX ? Math.min(wl.x1, wl.x2) : Math.min(wl.z1, wl.z2);
    const b = alongX ? Math.max(wl.x1, wl.x2) : Math.max(wl.z1, wl.z2);
    let cur = a;
    g.beginPath();
    for (const d of (wl.doors || []).slice().sort((p, q) => p.c - q.c)) {
      if (alongX) {
        g.moveTo(tx(cur), tz(wl.z1));
        g.lineTo(tx(d.c - d.w / 2), tz(wl.z1));
      } else {
        g.moveTo(tx(wl.x1), tz(cur));
        g.lineTo(tx(wl.x1), tz(d.c - d.w / 2));
      }
      cur = d.c + d.w / 2;
    }
    if (alongX) {
      g.moveTo(tx(cur), tz(wl.z1));
      g.lineTo(tx(b), tz(wl.z1));
    } else {
      g.moveTo(tx(wl.x1), tz(cur));
      g.lineTo(tx(wl.x1), tz(b));
    }
    g.stroke();
  }
  for (const eq of equipment.byFloor.get(def.id) || []) {
    if (eq.base) continue;
    g.fillStyle = eq.info.utility === 'transit' ? '#22d3ee' : eq.info.utility ? 'rgba(148,163,184,0.8)' : 'rgba(250,204,21,0.85)';
    const s = Math.max(2, scale * 0.6);
    g.fillRect(tx(eq.seat.x) - s / 2, tz(eq.seat.z) - s / 2, s, s);
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const r of def.rooms) {
    const cx = tx((r.x1 + r.x2) / 2);
    const cz = tz((r.z1 + r.z2) / 2);
    if (labels) {
      g.font = `700 ${Math.round(scale * 1.6)}px "Be Vietnam Pro", sans-serif`;
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.fillText(`${r.icon} ${r.name}`, cx, cz);
    } else {
      g.font = `${Math.round(scale * 3.2)}px sans-serif`;
      g.fillText(r.icon || '', cx, cz);
    }
  }
  return { canvas: c, w, h: hh, tx, tz, B };
}

export class Minimap {
  constructor(canvas, building, equipment) {
    this.canvas = canvas;
    this.building = building;
    this.equipment = equipment;
    this.scale = isMobile() ? 1.4 : 1.9;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cache = new Map();
    this._acc = 0;
  }

  plan(floorId) {
    if (!this.cache.has(floorId)) this.cache.set(floorId, renderFloorPlan(this.building.floor(floorId).def, this.equipment, this.scale, { dpr: this.dpr }));
    return this.cache.get(floorId);
  }

  draw(dt, { floor, self, yaw, others, friends = new Set(), waypoint }) {
    this._acc += dt;
    if (this._acc < 0.1) return;
    this._acc = 0;
    const p = this.plan(floor);
    if (this.canvas.width !== p.canvas.width) {
      this.canvas.width = p.canvas.width;
      this.canvas.height = p.canvas.height;
      this.canvas.style.width = `${p.w}px`;
      this.canvas.style.height = `${p.h}px`;
    }
    const g = this.canvas.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(p.canvas, 0, 0);
    g.scale(this.dpr, this.dpr);
    for (const o of others) {
      g.fillStyle = friends.has(o.userId) ? '#a3e635' : '#22d3ee';
      g.beginPath();
      g.arc(p.tx(o.x), p.tz(o.z), friends.has(o.userId) ? 3 : 2, 0, Math.PI * 2);
      g.fill();
    }
    if (waypoint) {
      const wx = p.tx(waypoint.x);
      const wz = p.tz(waypoint.z);
      g.strokeStyle = '#f472b6';
      g.setLineDash([4, 3]);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(p.tx(self.x), p.tz(self.z));
      g.lineTo(wx, wz);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = '#f472b6';
      g.beginPath();
      g.arc(wx, wz, 4, 0, Math.PI * 2);
      g.fill();
    }
    g.save();
    g.translate(p.tx(self.x), p.tz(self.z));
    g.rotate(-yaw);
    g.fillStyle = '#facc15';
    g.strokeStyle = '#0b0f1a';
    g.lineWidth = 1.5;
    const s = 5;
    g.beginPath();
    g.moveTo(0, -s * 1.3);
    g.lineTo(s * 0.85, s * 0.85);
    g.lineTo(-s * 0.85, s * 0.85);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
}
