import { Character } from './Character.js';
import { ANIM_NAMES, dq, dqa } from '@shared/constants.js';

export const lerpAngle = (a, b, k) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};

const INTERP_DELAY = 130; // ms – hiển thị trễ 1 chút để luôn có 2 mẫu nội suy

/**
 * Người chơi khác trong vùng nhìn thấy (AOI): tạo khi server báo "vào vùng", xóa khi "ra vùng".
 * Nhận snapshot lượng tử hóa, nội suy vị trí/hướng giữa các mẫu để chuyển động mượt.
 */
export class RemotePlayer {
  constructor(info, parent) {
    this.nid = info.nid;
    this.userId = info.uid;
    this.appearance = info.a;
    this.party = info.pt || null;
    this.char = new Character(info.a);
    if (info.g) this.char.setTag(info.g);
    const x = dq(info.x);
    const y = dq(info.y);
    const z = dq(info.z);
    const ry = dqa(info.r);
    this.char.root.position.set(x, y, z);
    this.char.root.rotation.y = ry;
    parent.add(this.char.root);
    this.buffer = [{ t: 0, x, y, z, ry }];
    this.anim = ANIM_NAMES[info.an] || 'idle';
    this.eq = info.eq || null;
    this.dist = 0;
  }

  get position() {
    return this.char.root.position;
  }

  get name() {
    return this.appearance.displayName;
  }

  push(t, qx, qy, qz, qr, an, pp = 0) {
    const last = this.buffer[this.buffer.length - 1];
    if (last && t <= last.t) return;
    this.buffer.push({ t, x: dq(qx), y: dq(qy), z: dq(qz), ry: dqa(qr) });
    if (this.buffer.length > 30) this.buffer.splice(0, this.buffer.length - 30);
    this.anim = ANIM_NAMES[an] || 'idle';
    this.pp = pp;
  }

  setAppearance(app) {
    this.appearance = app;
    this.char.setAppearance(app);
  }

  update(dt, serverNow) {
    const renderT = serverNow - INTERP_DELAY;
    const buf = this.buffer;
    while (buf.length > 2 && buf[1].t <= renderT) buf.shift();
    let x;
    let y;
    let z;
    let ry;
    const a = buf[0];
    const b = buf[1];
    if (b && renderT >= a.t && renderT <= b.t) {
      const k = (renderT - a.t) / Math.max(1, b.t - a.t);
      x = a.x + (b.x - a.x) * k;
      y = a.y + (b.y - a.y) * k;
      z = a.z + (b.z - a.z) * k;
      ry = lerpAngle(a.ry, b.ry, k);
    } else {
      const last = buf[buf.length - 1];
      x = last.x;
      y = last.y;
      z = last.z;
      ry = last.ry;
    }
    const root = this.char.root;
    const s = 1 - Math.exp(-dt * 20);
    if (Math.hypot(root.position.x - x, root.position.z - z) > 3) root.position.set(x, y, z);
    else {
      root.position.x += (x - root.position.x) * s;
      root.position.z += (z - root.position.z) * s;
      root.position.y += (y - root.position.y) * s;
    }
    root.rotation.y = lerpAngle(root.rotation.y, ry, s);
  }

  dispose() {
    this.char.dispose();
  }
}
