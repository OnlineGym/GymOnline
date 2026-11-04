import { h, uiRoot, toast } from './dom.js';
import { api } from '../network/api.js';
import { audio } from '../core/audio.js';
import { isMobile } from '../core/device.js';
import { settings, keyLabel } from '../core/settings.js';
import { promptCheckin } from './quests.js';

/**
 * Hướng dẫn tân thủ: chỉ hiện với nhân vật mới. Mỗi bước tự hoàn thành khi người chơi làm đúng việc đó.
 */
const k = (a) => keyLabel(settings.keys[a]);

export class Tutorial {
  constructor(game) {
    this.g = game;
    this.step = -1;
    this.steps = [
      {
        title: 'Di chuyển',
        text: () => (isMobile() ? 'Dùng joystick bên trái để đi lại.' : `Dùng ${k('forward')} ${k('left')} ${k('back')} ${k('right')} để đi, giữ ${k('run')} để chạy.`),
        start: () => (this.from = { ...this.g.pos }),
        done: () => Math.hypot(this.g.pos.x - this.from.x, this.g.pos.z - this.from.z) > 3,
      },
      {
        title: 'Xoay camera',
        text: () => (isMobile() ? 'Vuốt ở nửa phải màn hình để xoay camera.' : 'Giữ chuột trái và kéo để xoay camera, lăn chuột để zoom.'),
        start: () => (this.yaw = this.g.cam.yaw),
        done: () => Math.abs(this.g.cam.yaw - this.yaw) > 0.4,
      },
      {
        title: 'Xem bản đồ',
        text: () => (isMobile() ? 'Bấm vào bản đồ nhỏ ở góc màn hình.' : `Bấm ${k('map')} hoặc bấm vào bản đồ nhỏ ở góc màn hình. Xem xong đóng lại nhé.`),
        start: () => (this.g.lastMenu = null),
        done: () => this.g.lastMenu === 'map',
      },
      {
        title: 'Tập buổi đầu tiên',
        text: () => `Đi theo mũi tên tới máy chạy bộ, đứng cạnh máy rồi bấm ${isMobile() ? 'nút tương tác' : k('interact')}.`,
        start: () => {
          const eqs = (this.g.equipment.byFloor.get(1) || []).filter((e) => e.type === 'treadmill');
          const p = this.g.pos;
          const near = eqs.sort((a, b) => Math.hypot(a.seat.x - p.x, a.seat.z - p.z) - Math.hypot(b.seat.x - p.x, b.seat.z - p.z))[0];
          if (near) this.g.setWaypoint({ f: 1, x: near.exit.x, z: near.exit.z, label: 'Máy chạy bộ' });
        },
        done: () => this.g.mode === 'working' || this.g.mode === 'utility',
      },
      {
        title: 'Hoàn thành buổi tập',
        text: () => `Làm theo bảng minigame ít nhất vài giây, rồi bấm Dừng (${isMobile() ? 'nút trên màn hình' : k('interact')}) để nhận EXP và xu.`,
        done: () => this.g.mode === 'free',
      },
      {
        title: 'Nhiệm vụ hằng ngày',
        text: () => `Bấm 📋 trên thanh menu${isMobile() ? '' : ` hoặc phím ${k('quests')}`} để xem nhiệm vụ và điểm danh nhận xu.`,
        start: () => (this.g.lastMenu = null),
        done: () => this.g.lastMenu === 'quests',
      },
    ];
    this.titleEl = h('b', {});
    this.textEl = h('div', { class: 'tut-text' });
    this.countEl = h('small', { class: 'muted' });
    this.el = h(
      'div',
      { class: 'tutorial panel interactive' },
      h('div', { class: 'tut-head' }, this.countEl, h('button', { class: 'tut-skip', type: 'button', onclick: () => this.skip() }, 'Bỏ qua')),
      this.titleEl,
      this.textEl
    );
    uiRoot().append(this.el);
    this.next();
  }

  next() {
    this.step++;
    const s = this.steps[this.step];
    if (!s) return this.finish(true);
    s.start?.();
    this.countEl.textContent = `Hướng dẫn ${this.step + 1}/${this.steps.length}`;
    this.titleEl.textContent = s.title;
    this.textEl.textContent = s.text();
    this.el.classList.remove('pop');
    void this.el.offsetWidth;
    this.el.classList.add('pop');
    return undefined;
  }

  update() {
    const s = this.steps[this.step];
    if (s?.done()) {
      audio.sfx('pop');
      this.next();
    }
  }

  skip() {
    if (confirm('Bỏ qua hướng dẫn? Bạn sẽ không nhận được phần thưởng tân thủ.')) this.finish(false);
  }

  async finish(finished) {
    this.el.remove();
    this.g.tutorial = null;
    try {
      const r = await api.finishTutorial(finished);
      if (r.character) this.g.onCharacter(r.character);
      if (r.coins) {
        audio.sfx('coin');
        toast(`🎉 Hoàn thành hướng dẫn: +${r.coins} xu`, 'success', 4000);
      }
    } catch (e) {
      toast(e.message, 'error');
    }
    promptCheckin(this.g);
  }
}
