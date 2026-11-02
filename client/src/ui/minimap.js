import { ROOMS, WALLS } from '../world/layout.js';
import { isMobile } from '../core/device.js';

/**
 * Bản đồ nhỏ 2D (canvas): phòng, tường, máy tập, người chơi khác (chấm xanh), bản thân (mũi tên vàng)
 */
const BOUNDS = { x1: -25, x2: 25, z1: -25, z2: 31 };

export class Minimap {
  constructor(canvas, equipment) {
    this.canvas = canvas;
    this.equipment = equipment;
    const scale = isMobile() ? 2.2 : 3;
    this.scale = scale;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = (BOUNDS.x2 - BOUNDS.x1) * scale;
    const hh = (BOUNDS.z2 - BOUNDS.z1) * scale;
    canvas.width = w * dpr;
    canvas.height = hh * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${hh}px`;
    this.ctx = canvas.getContext('2d');
    this.ctx.scale(dpr, dpr);
    this.bg = this._renderBackground(w, hh, dpr);
    this._acc = 0;
  }

  tx(x) {
    return (x - BOUNDS.x1) * this.scale;
  }
  tz(z) {
    return (z - BOUNDS.z1) * this.scale;
  }

  // Vẽ nền tĩnh 1 lần (phòng + tường + máy) để mỗi frame chỉ vẽ chấm người chơi
  _renderBackground(w, hh, dpr) {
    const c = document.createElement('canvas');
    c.width = w * dpr;
    c.height = hh * dpr;
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.fillStyle = '#14301f';
    g.fillRect(0, 0, w, hh);
    g.fillStyle = '#57534e';
    g.fillRect(this.tx(-12.5), this.tz(20), 25 * this.scale, 10 * this.scale);
    for (const r of ROOMS) {
      g.fillStyle = r.map;
      g.fillRect(this.tx(r.x1), this.tz(r.z1), (r.x2 - r.x1) * this.scale, (r.z2 - r.z1) * this.scale);
    }
    g.strokeStyle = '#e2e8f0';
    g.lineWidth = Math.max(1.5, this.scale * 0.35);
    g.lineCap = 'square';
    for (const wl of WALLS) {
      const alongX = wl.z1 === wl.z2;
      const a = alongX ? Math.min(wl.x1, wl.x2) : Math.min(wl.z1, wl.z2);
      const b = alongX ? Math.max(wl.x1, wl.x2) : Math.max(wl.z1, wl.z2);
      let cur = a;
      const segs = [];
      for (const d of (wl.doors || []).slice().sort((p, q) => p.c - q.c)) {
        segs.push([cur, d.c - d.w / 2]);
        cur = d.c + d.w / 2;
      }
      segs.push([cur, b]);
      g.beginPath();
      for (const [s, e] of segs) {
        if (alongX) {
          g.moveTo(this.tx(s), this.tz(wl.z1));
          g.lineTo(this.tx(e), this.tz(wl.z1));
        } else {
          g.moveTo(this.tx(wl.x1), this.tz(s));
          g.lineTo(this.tx(wl.x1), this.tz(e));
        }
      }
      g.stroke();
    }
    // máy tập
    for (const eq of this.equipment.list) {
      g.fillStyle = eq.info.utility ? 'rgba(148,163,184,0.7)' : 'rgba(250,204,21,0.8)';
      g.fillRect(this.tx(eq.seat.x) - 1.5, this.tz(eq.seat.z) - 1.5, 3, 3);
    }
    // icon phòng
    g.font = `${Math.round(this.scale * 3.2)}px sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const r of ROOMS) g.fillText(r.icon, this.tx((r.x1 + r.x2) / 2), this.tz((r.z1 + r.z2) / 2));
    return c;
  }

  draw(dt, self, yaw, others) {
    this._acc += dt;
    if (this._acc < 0.1) return; // vẽ ~10 lần/giây là đủ
    this._acc = 0;
    const g = this.ctx;
    const w = this.canvas.width;
    const hh = this.canvas.height;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.bg, 0, 0, w, hh);
    g.restore();
    for (const o of others) {
      g.fillStyle = '#22d3ee';
      g.beginPath();
      g.arc(this.tx(o.x), this.tz(o.z), this.scale * 0.9, 0, Math.PI * 2);
      g.fill();
    }
    // bản thân: tam giác theo hướng camera
    g.save();
    g.translate(this.tx(self.x), this.tz(self.z));
    g.rotate(-yaw);
    g.fillStyle = '#facc15';
    g.strokeStyle = '#0b0f1a';
    g.lineWidth = 1.5;
    const s = this.scale * 1.6;
    g.beginPath();
    g.moveTo(0, -s * 1.2);
    g.lineTo(s * 0.8, s * 0.8);
    g.lineTo(-s * 0.8, s * 0.8);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
}
