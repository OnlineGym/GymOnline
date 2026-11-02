import * as THREE from 'three';
import { Floor } from './Floor.js';
import { FLOOR_DEFS } from './floors.js';
import { setupLighting } from './lighting.js';
import { FLOORS } from '@shared/constants.js';

/**
 * Tòa nhà nhiều tầng: chỉ tầng hiện tại được hiển thị (tầng khác ẩn hoàn toàn).
 * Tầng được dựng lần đầu khi người chơi tới (lazy), có màn hình loading ngắn.
 */
const INDOOR_FOG = new THREE.Color('#e3e8ef');
const SKY = new THREE.Color('#9fd3ff');

export class Building {
  constructor(scene, equipment) {
    this.scene = scene;
    this.equipment = equipment;
    this.floors = FLOOR_DEFS.map((def) => new Floor(def, { scene, equipment }));
    this.current = null;
    this.lighting = setupLighting(scene);
    this._cullTimer = 0;
  }

  floor(id) {
    return this.floors[id];
  }

  get id() {
    return this.current?.id ?? 1;
  }

  // Đổi tầng hiển thị (dựng nếu chưa có)
  setFloor(id) {
    const f = this.floors[id];
    if (this.current === f) return f;
    if (this.current) this.current.setActive(false);
    f.setActive(true);
    this.current = f;
    const outdoor = id === 4;
    this.scene.background = outdoor ? SKY : INDOOR_FOG;
    this.scene.fog.color.copy(outdoor ? SKY : INDOOR_FOG);
    this.scene.fog.near = outdoor ? 70 : 30;
    this.scene.fog.far = outdoor ? 160 : 44;
    this.lighting.setFloor(id, f.def);
    return f;
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

  update(dt, t, positions, ctx) {
    if (!this.current) return;
    const p = positions[0];
    this._cullTimer -= dt;
    if (p && this._cullTimer <= 0) {
      this._cullTimer = 0.25;
      this.current.updateCulling(p.x, p.z);
    }
    this.current.update(dt, t, positions, ctx);
    this.lighting.update(dt, t, p);
  }
}
