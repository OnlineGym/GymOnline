import { h, uiRoot } from './dom.js';
import { audio } from '../core/audio.js';

/**
 * Thông báo có nút hành động (lời mời kết bạn, party, thách đấu, quà tặng...).
 * actions: [{ label, primary, fn }] – bấm nút sẽ gọi fn rồi đóng thông báo.
 */
let box = null;
const HIST_KEY = 'gym_notif_v1';
const loadHist = () => {
  try {
    return JSON.parse(localStorage.getItem(HIST_KEY) || '[]');
  } catch {
    return [];
  }
};
let history = loadHist();
let unread = 0;
let onBadge = null;
export const setNotifBadge = (fn) => {
  onBadge = fn;
  fn(unread);
};
export function record(icon, title, text = '') {
  history.unshift({ icon, title, text, at: Date.now() });
  history = history.slice(0, 50);
  try {
    localStorage.setItem(HIST_KEY, JSON.stringify(history));
  } catch {
    /* bỏ qua */
  }
  unread++;
  onBadge?.(unread);
}
export const notifHistory = () => history;
export function clearNotifHistory() {
  history = [];
  try {
    localStorage.removeItem(HIST_KEY);
  } catch {
    /* bỏ qua */
  }
}
export function markNotifRead() {
  unread = 0;
  onBadge?.(0);
}

export function notify({ icon = '🔔', title, text, actions = [], timeout = 20000 }) {
  record(icon, title, text || '');
  if (!box) {
    box = h('div', { class: 'notify-box' });
    uiRoot().append(box);
  }
  const close = () => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 250);
  };
  const btns = actions.map((a) =>
    h(
      'button',
      {
        class: `btn ${a.primary ? '' : 'ghost'}`,
        type: 'button',
        onclick: async () => {
          close();
          await a.fn?.();
        },
      },
      a.label
    )
  );
  const timerBar = h('div', { class: 'nt-timer', style: { animationDuration: `${timeout}ms` } });
  const el = h(
    'div',
    { class: 'notify panel interactive' },
    h('div', { class: 'nt-head' }, h('span', { class: 'nt-icon' }, icon), h('div', {}, h('b', {}, title), text ? h('div', { class: 'nt-text' }, text) : null), h('button', { class: 'close-x', onclick: close }, '✕')),
    btns.length ? h('div', { class: 'nt-actions' }, btns) : null,
    timerBar
  );
  box.prepend(el);
  while (box.children.length > 4) box.lastChild.remove();
  audio.sfx('pop');
  setTimeout(close, timeout);
  return close;
}
