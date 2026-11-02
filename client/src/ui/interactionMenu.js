import { h, uiRoot } from './dom.js';
import { PAIR_EMOTES, CHALLENGES } from '@shared/constants.js';

/**
 * Menu tương tác khi bấm vào nhân vật khác (hoặc lại gần + phím F):
 * Xem hồ sơ, Kết bạn, Mời party, Emote đôi, Thách đấu, Nhắn riêng, Tặng quà, Chặn, Báo cáo
 */
let current = null;

export function closeInteractionMenu() {
  current?.remove();
  current = null;
}

export function openInteractionMenu({ x, y, target, actions }) {
  closeInteractionMenu();
  const item = (icon, label, fn, cls = '') =>
    h(
      'button',
      {
        type: 'button',
        class: `im-item ${cls}`,
        onclick: () => {
          closeInteractionMenu();
          fn();
        },
      },
      h('span', {}, icon),
      label
    );
  const sub = (icon, label, entries) => {
    const panel = h('div', { class: 'im-sub hidden' }, entries.map(([k, v]) => item(v.icon, v.label, () => v.fn(k))));
    const btn = h(
      'button',
      {
        type: 'button',
        class: 'im-item',
        onclick: (e) => {
          e.stopPropagation();
          panel.classList.toggle('hidden');
        },
      },
      h('span', {}, icon),
      `${label} ▸`
    );
    return h('div', {}, btn, panel);
  };
  const pairEntries = Object.entries(PAIR_EMOTES).map(([k, v]) => [k, { ...v, fn: () => actions.pair(k) }]);
  const challengeEntries = Object.entries(CHALLENGES).map(([k, v]) => [k, { ...v, fn: () => actions.challenge(k) }]);
  const el = h(
    'div',
    { class: 'interact-menu panel interactive' },
    h('div', { class: 'im-head' }, h('b', {}, target.name), h('span', { class: 'level-badge' }, `Lv.${target.level || 1}`)),
    item('👤', 'Xem hồ sơ', actions.profile),
    item('➕', 'Kết bạn', actions.friend),
    item('👥', 'Mời vào party', actions.party),
    item('🛡️', 'Mời vào CLB', actions.guild),
    sub('🤝', 'Emote đôi', pairEntries),
    sub('⚔️', 'Thách đấu', challengeEntries),
    item('💬', 'Nhắn riêng', actions.dm),
    item('🎁', 'Tặng quà', actions.gift),
    item('🚫', 'Chặn', actions.block, 'danger'),
    item('⚠️', 'Báo cáo', actions.report, 'danger')
  );
  uiRoot().append(el);
  const r = el.getBoundingClientRect();
  el.style.left = `${Math.max(8, Math.min(window.innerWidth - r.width - 8, x))}px`;
  el.style.top = `${Math.max(8, Math.min(window.innerHeight - r.height - 8, y))}px`;
  current = el;
  setTimeout(() => {
    const off = (e) => {
      if (!el.contains(e.target)) {
        closeInteractionMenu();
        window.removeEventListener('pointerdown', off, true);
      }
    };
    window.addEventListener('pointerdown', off, true);
  }, 0);
}
