import { h, uiRoot } from './dom.js';
import { EMOTES, EMOTE_LIST } from '../character/animations.js';

// Vòng chọn biểu cảm (8 emote xếp tròn). Phím Q để mở, phím 1-8 dùng nhanh.
export class EmoteWheel {
  constructor(onPick) {
    this.onPick = onPick;
    const wheel = h('div', { class: 'wheel' });
    const center = h('div', { class: 'wheel-center panel' }, 'Chọn biểu cảm');
    wheel.append(center);
    const R = 112;
    EMOTE_LIST.forEach((name, i) => {
      const e = EMOTES[name];
      const a = (i / EMOTE_LIST.length) * Math.PI * 2 - Math.PI / 2;
      const b = h(
        'button',
        {
          type: 'button',
          style: { left: `${150 + Math.cos(a) * R}px`, top: `${150 + Math.sin(a) * R}px` },
          onclick: () => {
            this.close();
            this.onPick(name);
          },
          onmouseenter: () => (center.textContent = e.label),
        },
        e.icon,
        h('span', {}, e.label),
        h('small', {}, String(i + 1))
      );
      wheel.append(b);
    });
    this.el = h('div', { class: 'emote-wheel hidden interactive', onclick: (ev) => ev.target === this.el && this.close() }, wheel);
    uiRoot().append(this.el);
  }

  get isOpen() {
    return !this.el.classList.contains('hidden');
  }

  open() {
    this.el.classList.remove('hidden');
  }

  close() {
    this.el.classList.add('hidden');
  }

  toggle() {
    this.isOpen ? this.close() : this.open();
  }
}
