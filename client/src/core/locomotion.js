import { h, uiRoot, toast } from '../ui/dom.js';
import { FLOORS } from '@shared/constants.js';
import {
  FLOOR_H, RAMP_X1, RAMP_X2, ESC_SPEED, CAB_X1, CAB_X2,
  rampsUpFrom, rampsDownFrom, rampHeight, elevatorAt,
} from '../world/transit.js';
import { settings } from './settings.js';
import { audio } from './audio.js';

const WALK = 2.4;
const RUN = 4.0;

/**
 * Di chuyển giữa các tầng KHÔNG cần bấm E:
 *  - Thang bộ: đi vào chân dốc → nhân vật leo từng bậc, lên tới đỉnh là sang tầng trên (liền mạch)
 *  - Thang cuốn: đứng lên băng là được chở đi (vẫn có thể bước thêm cho nhanh)
 *  - Thang máy: bước vào cabin → bảng bấm tầng → cửa đóng, cabin chạy (góc nhìn thứ nhất, rung nhẹ,
 *    màn hình đếm tầng) → cửa mở ở tầng mới
 */
export class Locomotion {
  constructor(game) {
    this.g = game;
    this.ramp = null;
    this.ride = null;
    this.panelCab = null;
    this.panel = h('div', { class: 'elev-panel panel interactive hidden' });
    this.rideHud = h('div', { class: 'elev-hud hidden' }, h('div', { class: 'eh-arrow' }), h('div', { class: 'eh-floor' }), h('div', { class: 'eh-name' }));
    uiRoot().append(this.panel, this.rideHud);
  }

  get onRamp() {
    return !!this.ramp;
  }

  // ================= THANG BỘ / THANG CUỐN =================
  // Gọi khi đang di chuyển tự do: bước vào chân dốc (tầng dưới) hoặc đỉnh dốc (tầng trên)
  tryEnterRamp() {
    const g = this.g;
    const { x, z } = g.pos;
    const f = g.floorId;
    for (const r of rampsUpFrom(f)) {
      if (r.kind === 'escDown') continue;
      if (z > r.z1 + 0.1 && z < r.z2 - 0.1 && x >= RAMP_X1 - 0.05 && x < RAMP_X1 + 1.2) return this._enter(r, false);
    }
    for (const r of rampsDownFrom(f)) {
      if (r.kind === 'escUp') continue;
      if (z > r.z1 + 0.1 && z < r.z2 - 0.1 && x <= RAMP_X2 + 0.05 && x > RAMP_X2 - 1.2) return this._enter(r, true);
    }
    return false;
  }

  _enter(r, upper) {
    this.ramp = { r, upper };
    this.g.mode = 'ramp';
    this.g.jumpY = 0;
    if (r.kind !== 'stairs') audio.sfx('click');
    return true;
  }

  updateRamp(dt) {
    const g = this.g;
    const { r, upper } = this.ramp;
    const mv = g.input.getMove();
    const { f, r: right } = g.cam.basis();
    let dx = right.x * mv.x + f.x * mv.y;
    let dz = right.z * mv.x + f.z * mv.y;
    const len = Math.hypot(dx, dz);
    if (len > 1) {
      dx /= len;
      dz /= len;
    }
    const speed = g.input.isRunning() ? RUN : WALK;
    const belt = r.kind === 'escUp' ? ESC_SPEED : r.kind === 'escDown' ? -ESC_SPEED : 0;
    const vx = dx * speed + belt;
    g.pos.x += vx * dt;
    g.pos.z = Math.max(r.z1 + 0.32, Math.min(r.z2 - 0.32, g.pos.z + dz * speed * 0.6 * dt));
    const base = upper ? -FLOOR_H : 0;
    g.rampY = base + rampHeight(g.pos.x);
    if (Math.abs(vx) > 0.05) g.ry = vx > 0 ? Math.PI / 2 : -Math.PI / 2;
    const walking = len > 0.1;
    g.me.play(walking ? (r.kind === 'stairs' ? 'climb' : 'walk') : r.kind === 'stairs' ? 'idle' : 'ride');

    const via = r.kind === 'stairs' ? 'stairs' : 'escalator';
    if (!upper) {
      if (g.pos.x < RAMP_X1 - 0.3) return this._exit();
      if (g.pos.x > RAMP_X2) return this._cross(+1, via, RAMP_X2 + 0.55, g.pos.z);
    } else {
      if (g.pos.x > RAMP_X2 + 0.3) return this._exit();
      if (g.pos.x < RAMP_X1) return this._cross(-1, via, RAMP_X1 - 0.55, g.pos.z);
    }
    return undefined;
  }

  _exit() {
    this.ramp = null;
    this.g.rampY = 0;
    this.g.mode = 'free';
  }

  // Sang tầng mới liền mạch: đổi tầng phía client ngay, server xác nhận sau
  async _cross(dir, via, x, z) {
    const g = this.g;
    const from = g.floorId;
    const to = from + dir;
    this.ramp = null;
    g.rampY = 0;
    g.mode = 'free';
    g.switchFloorLocal(to, { x, z }, { dy: -dir * FLOOR_H });
    toast(`${dir > 0 ? '⬆️' : '⬇️'} ${FLOORS[to].name}`, 'info', 1800);
    const res = await g.net.request('floor:change', { to, via, x, z });
    if (!res?.ok) {
      toast(res?.message || 'Không đổi được tầng', 'error');
      g.switchFloorLocal(from, { x: dir > 0 ? RAMP_X1 - 0.6 : RAMP_X2 + 0.6, z }, {});
      return;
    }
    g.applyFloorLocks(to, res.locks);
  }

  // ================= THANG MÁY =================
  updateElevatorPanel() {
    const g = this.g;
    const cab = g.mode === 'free' ? elevatorAt(g.pos.x, g.pos.z) : null;
    if (cab?.id === this.panelCab) return;
    this.panelCab = cab?.id || null;
    this.panel.classList.toggle('hidden', !cab);
    if (!cab) return;
    this.panel.innerHTML = '';
    this.panel.append(
      h('div', { class: 'ep-title' }, `🛗 Thang máy ${cab.id} – chọn tầng`),
      h(
        'div',
        { class: 'ep-btns' },
        [...FLOORS].reverse().map((fl) =>
          h(
            'button',
            {
              type: 'button',
              class: `ep-btn ${fl.id === g.floorId ? 'here' : ''}`,
              style: { borderColor: fl.color },
              disabled: fl.id === g.floorId,
              title: fl.name,
              onclick: () => this.rideTo(fl.id),
            },
            fl.key
          )
        )
      ),
      h('div', { class: 'ep-hint' }, 'Phím số 0-4 cũng chọn được tầng (0 = B1, 4 = sân thượng)')
    );
  }

  async rideTo(to) {
    const g = this.g;
    if (g.mode !== 'free') return;
    const cab = elevatorAt(g.pos.x, g.pos.z);
    if (!cab || to === g.floorId) return;
    const from = g.floorId;
    g.mode = 'elevator';
    this.panel.classList.add('hidden');
    this.panelCab = null;
    const zc = (cab.z1 + cab.z2) / 2;
    const cx = (CAB_X1 + CAB_X2) / 2 + 0.15;
    g.pos.x = cx;
    g.pos.z = zc;
    g.ry = -Math.PI / 2; // quay mặt ra cửa
    g.vel.x = g.vel.z = 0;
    g.me.play('elevator');
    const door = () => g.building.current.cabinDoors[cab.id];
    door().locked = true;
    if (settings.firstPersonElevator) {
      g.cam.firstPerson = true;
      g.cam.yaw = Math.PI / 2;
      g.cam.pitch = 0.05;
      g.me.root.visible = false;
    }
    const dirUp = to > from;
    this._rideHud(dirUp, from);
    audio.sfx('door');
    await wait(1000); // cửa đóng
    const res = await g.net.request('floor:change', { to, via: 'elevator', x: cx, z: zc });
    if (!res?.ok) {
      toast(res?.message || 'Thang máy bận', 'error');
      door().locked = false;
      this._endRide();
      return;
    }
    // Cabin chạy: rung nhẹ + đếm tầng
    g.cam.shake = 1;
    audio.sfx('click');
    const steps = Math.abs(to - from);
    for (let i = 1; i <= steps; i++) {
      await wait(1100);
      const cur = from + (dirUp ? i : -i);
      this._rideHud(dirUp, cur);
      if (i === steps) {
        // Đổi tầng khi cửa đang đóng – người chơi không thấy giật
        g.switchFloorLocal(to, { x: cx, z: zc }, {});
        g.applyFloorLocks(to, res.locks);
        door().locked = true;
      }
    }
    g.cam.shake = 0.3;
    await wait(500);
    g.cam.shake = 0;
    audio.sfx('levelup');
    door().locked = false;
    g.building.current.cabinDisplays[cab.id]?.(FLOORS[to].key, '#a3e635');
    this.rideHud.classList.add('hidden');
    g.mode = 'free';
    toast(`🛗 Đã tới ${FLOORS[to].name}`, 'success', 2000);
  }

  _rideHud(up, f) {
    this.rideHud.classList.remove('hidden');
    this.rideHud.querySelector('.eh-arrow').textContent = up ? '▲' : '▼';
    this.rideHud.querySelector('.eh-floor').textContent = FLOORS[f].key;
    this.rideHud.querySelector('.eh-name').textContent = FLOORS[f].name;
    for (const fl of this.g.building.floors) if (fl.built) fl.cabinDisplays && Object.values(fl.cabinDisplays).forEach((d) => d(`${up ? '▲' : '▼'}${FLOORS[f].key}`));
  }

  _endRide() {
    const g = this.g;
    g.cam.firstPerson = false;
    g.cam.shake = 0;
    g.me.root.visible = true;
    this.rideHud.classList.add('hidden');
    g.mode = 'free';
  }

  // Ra khỏi cabin thì trả lại góc nhìn thứ ba
  update() {
    const g = this.g;
    if (g.cam.firstPerson && g.mode === 'free' && !elevatorAt(g.pos.x, g.pos.z)) {
      g.cam.firstPerson = false;
      g.me.root.visible = true;
      g.cam.yaw = g.ry + Math.PI;
      g.cam.snap = true;
    }
  }

  // Phím số chọn tầng khi đứng trong cabin
  onKey(code) {
    if (!this.panelCab) return false;
    const m = /^Digit([0-4])$/.exec(code);
    if (!m) return false;
    this.rideTo(Number(m[1]));
    return true;
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
