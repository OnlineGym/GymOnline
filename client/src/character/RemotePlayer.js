import { Character } from './Character.js';

const lerpAngle = (a, b, k) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};

const INTERP_DELAY = 120; // ms – hiển thị trễ 1 chút để luôn có 2 mẫu nội suy

/**
 * Người chơi khác: nhận snapshot từ server, nội suy vị trí/hướng giữa các mẫu để chuyển động mượt.
 */
export class RemotePlayer {
  constructor(data, scene) {
    this.id = data.id;
    this.userId = data.userId;
    this.appearance = data.appearance;
    this.char = new Character(data.appearance);
    this.char.root.position.set(data.x, data.y || 0, data.z);
    this.char.root.rotation.y = data.ry || 0;
    scene.add(this.char.root);
    this.buffer = [{ t: Date.now() - 1000, x: data.x, y: data.y || 0, z: data.z, ry: data.ry || 0 }];
    this.anim = data.anim || 'idle';
    this.eq = data.eq || null;
  }

  get position() {
    return this.char.root.position;
  }

  push(t, x, y, z, ry, anim, eq) {
    const last = this.buffer[this.buffer.length - 1];
    if (last && t <= last.t) return;
    this.buffer.push({ t, x, y, z, ry });
    if (this.buffer.length > 30) this.buffer.splice(0, this.buffer.length - 30);
    this.anim = anim;
    this.eq = eq;
  }

  setAppearance(app) {
    this.appearance = app;
    this.char.setAppearance(app);
  }

  update(dt, serverNow) {
    const renderT = serverNow - INTERP_DELAY;
    const buf = this.buffer;
    // bỏ các mẫu quá cũ (giữ lại 1 mẫu trước renderT)
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
    // teleport nếu lệch quá xa (vào máy tập / ra khỏi máy)
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

export { lerpAngle };
