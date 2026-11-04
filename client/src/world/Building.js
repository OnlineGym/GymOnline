import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Floor } from './Floor.js';
import { FLOOR_DEFS } from './floors.js';
import { setupLighting } from './lighting.js';
import { FLOOR_H, inHub } from './transit.js';
import { FLOORS } from '@shared/constants.js';
import { quality, viewMul, onSettingsChange } from '../core/settings.js';

/**
 * Tòa nhà nhiều tầng xếp chồng thật (mỗi tầng cao FLOOR_H):
 *  - bình thường chỉ hiển thị tầng hiện tại
 *  - khi đứng ở sảnh thang: hiển thị thêm tầng trên/dưới (lệch ±FLOOR_H) để nhìn xuyên giếng thang,
 *    đi thang bộ / thang cuốn liền mạch không cần màn hình loading
 *  - mỗi tầng có phản chiếu môi trường riêng (chụp 1 lần), sân thượng có bầu trời thật
 */
const INDOOR_FOG = new THREE.Color('#e3e8ef');
const SKY_FOG = new THREE.Color('#bcdcf5');
const _fog = new THREE.Color();

export class Building {
  constructor(scene, equipment, ctx = null) {
    this.scene = scene;
    this.equipment = equipment;
    this.ctx = ctx;
    this.floors = FLOOR_DEFS.map((def) => new Floor(def, { scene, equipment }));
    this.current = null;
    this.neighbors = [];
    this.lighting = setupLighting(scene);
    this._cullTimer = 0;
    this.sky = null;
    onSettingsChange((_s, p) => {
      if ('viewDistance' in p || 'quality' in p) this._applyFog();
      if ('quality' in p && this.current) this._applyEnv(this.current);
    });
  }

  floor(id) {
    return this.floors[id];
  }

  get id() {
    return this.current?.id ?? 1;
  }

  setFloor(id, pos) {
    const f = this.floors[id];
    if (this.current === f) return f;
    for (const n of this.neighbors) n.setActive(false);
    this.neighbors = [];
    if (this.current) this.current.setActive(false);
    f.setActive(true, 0);
    this.current = f;
    this._applyFog();
    this.lighting.setFloor(id, f.def);
    this._applySky(id === 4);
    this._applyEnv(f);
    // Hiện ngay tầng kề (đổi tầng liền mạch trên thang -> không bị nháy trống)
    if (pos) this._updateNeighbors(pos, true);
    return f;
  }

  _applyFog() {
    const outdoor = this.current?.id === 4;
    const m = viewMul();
    // Trong nhà: sương mù nhạt cùng tông với tầng để chiều sâu tự nhiên, cuối phòng không bị trắng xóa
    const indoor = this.current?.def.fog ? _fog.set(this.current.def.fog) : INDOOR_FOG;
    this.scene.background = outdoor ? (this.sky ? null : SKY_FOG) : indoor;
    this.scene.fog.color.copy(outdoor ? SKY_FOG : indoor);
    this.scene.fog.near = (outdoor ? 70 : 30) * m;
    this.scene.fog.far = (outdoor ? 170 : 62) * m;
  }

  _applySky(on) {
    this.ctx?.setOutdoor?.(on);
    if (on && !this.sky) {
      const sky = new Sky();
      sky.scale.setScalar(350);
      const u = sky.material.uniforms;
      u.turbidity.value = 4;
      u.rayleigh.value = 1.6;
      u.mieCoefficient.value = 0.005;
      u.mieDirectionalG.value = 0.82;
      const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(50), THREE.MathUtils.degToRad(160));
      u.sunPosition.value.copy(sun);
      this.sky = sky;
    }
    if (this.sky) {
      if (on) this.scene.add(this.sky);
      else this.sky.removeFromParent();
    }
    this._applyFog();
  }

  // Phản chiếu môi trường: chụp tầng thật (mức Trung bình trở lên) hoặc phòng ảo dựng sẵn
  _applyEnv(f) {
    if (!this.ctx) return;
    if (quality().envProbe && f.built) {
      if (!f.envMap) f.captureEnv(this.ctx.renderer, this.ctx.pmrem);
      this.scene.environment = f.envMap;
      // Tầng sàn/tường sáng màu (B1, sân thượng) cần ít ánh sáng phản chiếu hơn để không bị lóa
      this.scene.environmentIntensity = f.id === 4 ? 0.45 : f.id === 0 ? 0.7 : 1.5;
    } else {
      this.scene.environment = this.ctx.roomEnv;
      this.scene.environmentIntensity = 0.45;
    }
  }

  isBuilt(id) {
    return this.floors[id].built;
  }

  roomAt(x, z) {
    return this.current?.roomAt(x, z) || { id: 'hall', name: '', icon: '' };
  }

  get collision() {
    return this.current.collision;
  }

  get cameraBlockers() {
    return this.current?.cameraBlockers || [];
  }

  floorName(id = this.id) {
    return FLOORS[id].name;
  }

  // Hiển thị tầng trên/dưới khi ở sảnh thang (hoặc đang đi trên dốc)
  _updateNeighbors(p, force) {
    const want = (p && inHub(p.x, p.z)) || force;
    const id = this.current.id;
    const list = want ? [this.floors[id - 1], this.floors[id + 1]].filter(Boolean) : [];
    for (const n of this.neighbors) if (!list.includes(n)) n.setActive(false);
    for (const n of list) {
      if (!this.neighbors.includes(n) || !n.group.visible) n.setActive(true, (n.id - id) * FLOOR_H);
      n.updateCulling(p.x, p.z, 16);
    }
    this.neighbors = list;
  }

  update(dt, t, positions, ctx, { onRamp = false } = {}) {
    if (!this.current) return;
    const p = positions[0];
    this._cullTimer -= dt;
    if (p && this._cullTimer <= 0) {
      this._cullTimer = 0.25;
      this.current.updateCulling(p.x, p.z);
      this._updateNeighbors(p, onRamp);
    }
    this.current.update(dt, t, positions, ctx);
    for (const n of this.neighbors) for (const u of n.updaters) u(dt, t);
    this.lighting.update(dt, t, p);
    if (this.ctx) this.ctx.renderer.shadowMap.needsUpdate = this.lighting.shadowDirty;
  }
}
