import * as THREE from 'three';

const _ray = new THREE.Raycaster();
const _dir = new THREE.Vector3();
const _focus = new THREE.Vector3();

/**
 * Camera góc nhìn thứ ba: bám theo nhân vật, xoay bằng yaw/pitch, zoom,
 * tự kéo lại gần khi bị tường chắn (raycast tới các mesh tường)
 */
export class ThirdPersonCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0; // 0 = camera ở phía +Z nhìn về -Z
    this.pitch = 0.42;
    this.distance = 5.2;
    this.minDist = 1.6;
    this.maxDist = 9;
    this.currentDist = this.distance;
    this.blockers = [];
    this.ceiling = 3.75;
    this.focusHeight = 1.0;
    this.smoothFocus = new THREE.Vector3();
    this._init = false;
  }

  setBlockers(list) {
    this.blockers = list;
  }

  update(dt, target, look) {
    this.yaw -= look.dx * 0.0055;
    this.pitch = THREE.MathUtils.clamp(this.pitch + look.dy * 0.004, -0.15, 1.25);
    this.distance = THREE.MathUtils.clamp(this.distance + look.zoom, this.minDist, this.maxDist);

    _focus.set(target.x, target.y + this.focusHeight, target.z);
    if (!this._init || this.snap) {
      this.snap = false;
      this.smoothFocus.copy(_focus);
      this._init = true;
    }
    this.smoothFocus.lerp(_focus, 1 - Math.exp(-dt * 14));

    const cp = Math.cos(this.pitch);
    _dir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp).normalize();

    // Raycast chống xuyên tường
    let wanted = this.distance;
    if (this.blockers.length) {
      _ray.set(this.smoothFocus, _dir);
      _ray.far = this.distance + 0.3;
      const hit = _ray.intersectObjects(this.blockers, false)[0];
      if (hit) wanted = Math.max(0.5, hit.distance - 0.3);
    }
    // Vào gần nhanh (tránh nhìn xuyên), lùi ra chậm cho mượt
    const k = wanted < this.currentDist ? 1 - Math.exp(-dt * 25) : 1 - Math.exp(-dt * 4);
    this.currentDist += (wanted - this.currentDist) * k;

    const cam = this.camera.position;
    cam.copy(this.smoothFocus).addScaledVector(_dir, this.currentDist);
    // Không cho camera chui lên trần / xuống sàn khi ở trong nhà
    const inside = Math.abs(target.x) < 40 && target.z < 30 && target.z > -30;
    if (inside) cam.y = Math.min(cam.y, this.ceiling);
    cam.y = Math.max(cam.y, 0.25);
    this.camera.lookAt(this.smoothFocus);
  }

  // Hướng "phía trước" và "bên phải" theo camera trên mặt phẳng XZ
  basis() {
    const f = { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
    const r = { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) };
    return { f, r };
  }
}
