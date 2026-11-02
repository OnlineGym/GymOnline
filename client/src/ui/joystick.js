import nipplejs from 'nipplejs';
import { h, uiRoot } from './dom.js';

/**
 * Điều khiển cảm ứng cho mobile:
 *  - Joystick ảo (nipplejs) góc trái để di chuyển
 *  - Vuốt nửa phải màn hình để xoay camera (xử lý trong Input)
 *  - Cụm nút phải: Tương tác / Chạy / Emote / Chat
 */
export class MobileControls {
  constructor(input, { onInteract, onEmote, onChat }) {
    this.input = input;
    const zone = h('div', { class: 'joystick-zone' });
    uiRoot().append(zone);

    this.manager = nipplejs.create({
      zone,
      mode: 'dynamic',
      color: '#22d3ee',
      size: 120,
      restOpacity: 0.6,
      fadeTime: 150,
    });
    this.manager.on('move', (_e, data) => {
      if (!data?.vector) return;
      const force = Math.min(1, data.force);
      input.setJoystick(data.vector.x * force, data.vector.y * force);
    });
    this.manager.on('end', () => input.setJoystick(0, 0));

    this.interactBtn = h('button', { class: 'm-btn big hidden', onclick: onInteract }, 'Tập');
    this.runBtn = h('button', { class: 'm-btn' }, '🏃');
    this.runBtn.onclick = () => {
      input.mobileRun = !input.mobileRun;
      this.runBtn.classList.toggle('active', input.mobileRun);
    };
    this.chatBtn = h('button', { class: 'm-btn', onclick: onChat }, '💬');
    const emoteBtn = h('button', { class: 'm-btn', onclick: onEmote }, '😊');
    this.el = h('div', { class: 'mobile-actions' }, this.interactBtn, this.runBtn, emoteBtn, this.chatBtn);
    uiRoot().append(this.el);
  }

  setInteract(label, busy = false) {
    this.interactBtn.classList.toggle('hidden', !label);
    this.interactBtn.classList.toggle('busy', busy);
    if (label) this.interactBtn.textContent = label;
  }

  setUnread(n) {
    this.chatBtn.textContent = n > 0 ? `💬${Math.min(9, n)}` : '💬';
  }
}
