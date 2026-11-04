import * as THREE from 'three';
import { box } from './helpers.js';
import { mat } from './materials.js';
const DOOR_H = 2.6;
const WALL_T = 0.3;

/**
 * Cửa tự động: mở khi có người chơi (bất kỳ ai) đứng gần, đóng lại khi đi xa.
 * - swing: cửa 1 cánh xoay bản lề
 * - double: cửa 2 cánh xoay
 * - sliding: cửa kính lùa (cửa chính)
 */
export class Door {
  constructor({ type, x, z, w, alongX, color = '#64748b' }) {
    this.type = type;
    this.center = new THREE.Vector2(x, z);
    this.open = 0;
    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);
    if (!alongX) this.group.rotation.y = Math.PI / 2;
    this.group.userData.dynamic = true;
    this.panels = [];

    const doorMat = mat(color, { rough: 0.5 });
    const glassMat = mat('#bae6fd', { rough: 0.05, metal: 0.1, transparent: true, opacity: 0.35 });
    const handleMat = mat('#e2e8f0', { metal: 0.8, rough: 0.3 });
    const h = DOOR_H - 0.05;

    if (type === 'sliding') {
      const half = w / 2;
      this.slide = half * 0.92;
      for (const side of [-1, 1]) {
        const p = new THREE.Group();
        p.add(box(half, h, 0.06, glassMat, 0, h / 2, 0, { cast: false }));
        p.add(box(half, 0.08, 0.08, mat('#94a3b8', { metal: 0.6 }), 0, h - 0.04, 0));
        p.add(box(0.05, 0.5, 0.05, handleMat, -side * (half / 2 - 0.12), 1.1, 0.06));
        p.userData.closedX = side * (half / 2);
        p.userData.side = side;
        p.position.x = p.userData.closedX;
        this.group.add(p);
        this.panels.push(p);
      }
    } else {
      const count = type === 'double' ? 2 : 1;
      const pw = w / count;
      for (let i = 0; i < count; i++) {
        const side = count === 1 ? -1 : i === 0 ? -1 : 1;
        const pivot = new THREE.Group();
        pivot.position.x = side * (w / 2);
        const panel = box(pw - 0.04, h, 0.07, doorMat, -side * (pw / 2), h / 2, 0);
        pivot.add(panel);
        pivot.add(box(0.06, 0.06, 0.18, handleMat, -side * (pw - 0.18), 1.05, 0));
        if (type === 'double') {
          // ô kính nhỏ trên cửa phòng aerobic
          pivot.add(box(pw * 0.5, 0.6, 0.08, glassMat, -side * (pw / 2), 1.7, 0, { cast: false }));
        }
        pivot.userData.side = side;
        this.group.add(pivot);
        this.panels.push(pivot);
      }
    }
    // Khung cửa
    const frameMat = mat('#1f2937', { rough: 0.6 });
    this.group.add(box(0.08, DOOR_H, WALL_T + 0.04, frameMat, -w / 2, DOOR_H / 2, 0));
    this.group.add(box(0.08, DOOR_H, WALL_T + 0.04, frameMat, w / 2, DOOR_H / 2, 0));
    this.group.add(box(w + 0.08, 0.08, WALL_T + 0.04, frameMat, 0, DOOR_H, 0));
  }

  update(dt, positions) {
    let near = false;
    for (const p of positions) {
      if (Math.hypot(p.x - this.center.x, p.z - this.center.y) < 2.3) {
        near = true;
        break;
      }
    }
    const target = this.locked ? 0 : this.forceOpen || near ? 1 : 0;
    this.open += (target - this.open) * (1 - Math.exp(-dt * 6));
    for (const p of this.panels) {
      if (this.type === 'sliding') {
        p.position.x = p.userData.closedX + p.userData.side * this.open * this.slide;
      } else {
        p.rotation.y = p.userData.side * -this.open * 1.45;
      }
    }
  }
}
