import * as THREE from 'three';
import { settings } from './settings.js';

const _ray = new THREE.Raycaster();
const _dir = new THREE.Vector3();
const _focus = new THREE.Vector3();
const _look = new THREE.Vector3();

/**
 * Camera:
 *  - góc nhìn thứ ba: bám nhân vật, xoay yaw/pitch, zoom (xa tối đa theo cài đặt), tự tránh xuyên tường
 *  - góc nhìn thứ nhất (firstPerson): dùng trong cabin thang máy – nhìn từ mắt nhân vật
 *  - shake: rung nhẹ (cabin thang máy đang chạy)
 */
export class ThirdPersonCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = 0.42;
    this.distance = 5.2;
    this.minDist = 1.6;
    this.currentDist = this.distance;
    this.blockers = [];
    this.ceiling = 3.75;
    this.focusHeight = 1.0;
    this.smoothFocus = new THREE.Vector3();
    this.firstPerson = false;
    this.shake = 0;
    this._init = false;
  }

  get maxDist() {
    return settings.maxZoom || 9;
  }

  setBlockers(list) {
    this.blockers = list;
  }

  // Dịch tiêu điểm (khi đổi tầng liền mạch trên thang bộ/thang cuốn)
  shiftY(dy) {
    this.smoothFocus.y += dy;
    this.camera.position.y += dy;
  }

  update(dt, target, look, t = 0) {
    this.yaw -= look.dx * 0.0055;
    const minPitch = this.firstPerson ? -1.1 : -0.15;
    this.pitch = THREE.MathUtils.clamp(this.pitch + look.dy * 0.004, minPitch, 1.25);
    this.distance = THREE.MathUtils.clamp(this.distance + look.zoom, this.minDist, this.maxDist);

    const shakeY = this.shake ? Math.sin(t * 38) * 0.012 * this.shake + Math.sin(t * 13) * 0.008 * this.shake : 0;

    if (this.firstPerson) {
      // Mắt nhân vật: cao ~1.25m, nhìn theo yaw/pitch
      _focus.set(target.x, target.y + 1.25 + shakeY, target.z);
      this.smoothFocus.copy(_focus);
      this.camera.position.copy(_focus);
      const cp = Math.cos(this.pitch);
      _look.set(-Math.sin(this.yaw) * cp, -Math.sin(this.pitch), -Math.cos(this.yaw) * cp).add(_focus);
      this.camera.lookAt(_look);
      this._init = true;
      return;
    }

    _focus.set(target.x, target.y + this.focusHeight, target.z);
    if (!this._init || this.snap) {
      this.snap = false;
      this.smoothFocus.copy(_focus);
      this._init = true;
    }
    this.smoothFocus.lerp(_focus, 1 - Math.exp(-dt * 14));

    const cp = Math.cos(this.pitch);
    _dir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp).normalize();

    let wanted = this.distance;
    if (this.blockers.length) {
      _ray.set(this.smoothFocus, _dir);
      _ray.far = this.distance + 0.3;
      const hit = _ray.intersectObjects(this.blockers, false)[0];
      if (hit) wanted = Math.max(0.5, hit.distance - 0.3);
    }
    const k = wanted < this.currentDist ? 1 - Math.exp(-dt * 25) : 1 - Math.exp(-dt * 4);
    this.currentDist += (wanted - this.currentDist) * k;

    const cam = this.camera.position;
    cam.copy(this.smoothFocus).addScaledVector(_dir, this.currentDist);
    const inside = target.x > -18 && target.x < 40 && Math.abs(target.z) < 21;
    if (inside) cam.y = Math.min(cam.y, this.ceiling);
    cam.y = Math.max(cam.y, (this.floorY ?? 0) + 0.25);
    cam.y += shakeY;
    this.camera.lookAt(this.smoothFocus);
  }

  basis() {
    const f = { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
    const r = { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) };
    return { f, r };
  }
}
