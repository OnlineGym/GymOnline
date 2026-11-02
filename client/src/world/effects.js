import * as THREE from 'three';
import { textures } from './materials.js';

/**
 * Hệ hạt hơi nước (sauna): các hạt mờ bay lên chậm, lắc lư, mờ dần.
 * Số hạt phụ thuộc chất lượng đồ họa.
 */
export class SteamSystem {
  constructor({ bounds, count = 120, color = '#ffffff', size = 0.9, opacity = 0.18, rise = 0.35, source = null }) {
    this.bounds = bounds;
    this.source = source;
    this.rise = rise;
    this.max = 300;
    const pos = new Float32Array(this.max * 3);
    this.life = new Float32Array(this.max);
    this.speed = new Float32Array(this.max);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.material = new THREE.PointsMaterial({
      color,
      size,
      map: textures.softDot(),
      transparent: true,
      opacity,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    this.points.userData.dynamic = true;
    for (let i = 0; i < this.max; i++) this._respawn(i, true);
    this.setCount(count);
  }

  setCount(n) {
    this.count = Math.min(this.max, n);
    this.geo.setDrawRange(0, this.count);
  }

  _respawn(i, randomY = false) {
    const p = this.geo.attributes.position.array;
    const b = this.bounds;
    if (this.source && Math.random() < 0.55) {
      p[i * 3] = this.source.x + (Math.random() - 0.5) * 0.6;
      p[i * 3 + 1] = this.source.y;
      p[i * 3 + 2] = this.source.z + (Math.random() - 0.5) * 0.6;
    } else {
      p[i * 3] = b.x1 + Math.random() * (b.x2 - b.x1);
      p[i * 3 + 1] = randomY ? Math.random() * b.h : Math.random() * 0.6;
      p[i * 3 + 2] = b.z1 + Math.random() * (b.z2 - b.z1);
    }
    this.life[i] = Math.random();
    this.speed[i] = this.rise * (0.5 + Math.random());
  }

  update(dt, t) {
    const p = this.geo.attributes.position.array;
    for (let i = 0; i < this.count; i++) {
      p[i * 3 + 1] += this.speed[i] * dt;
      p[i * 3] += Math.sin(t * 0.8 + i) * dt * 0.12;
      p[i * 3 + 2] += Math.cos(t * 0.7 + i * 1.3) * dt * 0.12;
      if (p[i * 3 + 1] > this.bounds.h) this._respawn(i);
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}

/**
 * Hiệu ứng vòng sáng + hạt khi lên level (gắn vào vị trí nhân vật)
 */
export class LevelUpBurst {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.ringGeo = new THREE.TorusGeometry(0.6, 0.04, 8, 40);
  }

  spawn(pos, color = '#facc15') {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false });
    const ring = new THREE.Mesh(this.ringGeo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, 0.1, pos.z);
    this.scene.add(ring);
    const sparks = [];
    const sGeo = new THREE.OctahedronGeometry(0.06);
    for (let i = 0; i < 18; i++) {
      const s = new THREE.Mesh(sGeo, mat);
      const a = (i / 18) * Math.PI * 2;
      s.position.set(pos.x, 0.3, pos.z);
      s.userData.v = new THREE.Vector3(Math.cos(a) * 1.4, 2.5 + Math.random() * 1.5, Math.sin(a) * 1.4);
      this.scene.add(s);
      sparks.push(s);
    }
    this.items.push({ ring, sparks, mat, t: 0 });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const k = it.t / 1.6;
      it.ring.scale.setScalar(1 + k * 3);
      it.ring.position.y = 0.1 + k * 1.5;
      it.mat.opacity = Math.max(0, 1 - k);
      for (const s of it.sparks) {
        s.userData.v.y -= 6 * dt;
        s.position.addScaledVector(s.userData.v, dt);
        s.rotation.y += dt * 8;
      }
      if (k >= 1) {
        this.scene.remove(it.ring);
        it.sparks.forEach((s) => this.scene.remove(s));
        it.mat.dispose();
        this.items.splice(i, 1);
      }
    }
  }
}
