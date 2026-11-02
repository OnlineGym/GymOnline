import { h, uiRoot } from './dom.js';
import { api } from '../network/api.js';
import { audio } from '../core/audio.js';

/**
 * Màn hình chọn channel: mỗi channel là 1 bản sao tòa nhà (tối đa ~120 người).
 * Hiện số người, bạn bè đang ở đâu; nút "Tự động" để server phân bổ cân bằng tải.
 * Trả về Promise<{ channel, url } | null>
 */
export function showChannelScreen({ current = null, cancelable = false } = {}) {
  return new Promise((resolve) => {
    const list = h('div', { class: 'channel-list' }, h('div', { class: 'muted' }, 'Đang tải danh sách channel...'));
    const close = (v) => {
      clearInterval(timer);
      screen.remove();
      resolve(v);
    };
    const load = async () => {
      try {
        const { channels, max } = await api.channels();
        list.innerHTML = '';
        if (!channels.length) list.append(h('div', { class: 'muted' }, 'Chưa có channel nào – bấm Tự động để tạo'));
        for (const c of channels) {
          const pct = Math.min(100, Math.round((c.count / (c.max || max)) * 100));
          const full = c.count >= (c.max || max);
          const card = h(
            'button',
            { class: `channel-card${c.id === current ? ' current' : ''}${full ? ' full' : ''}`, type: 'button', disabled: full && !c.friends?.length },
            h('div', { class: 'cc-top' }, h('b', {}, c.name), h('span', { class: 'cc-count' }, `${c.count}/${c.max || max}`)),
            h('div', { class: 'bar' }, h('div', { style: { width: `${pct}%`, background: pct > 85 ? '#f87171' : pct > 60 ? '#facc15' : '#a3e635' } })),
            h('div', { class: 'cc-sub' }, c.friends?.length ? `👥 Bạn bè: ${c.friends.slice(0, 3).join(', ')}${c.friends.length > 3 ? '…' : ''}` : full ? 'Đã đầy' : c.id === current ? 'Bạn đang ở đây' : 'Còn chỗ')
          );
          card.onclick = () => {
            audio.sfx('click');
            close({ channel: c.id, url: c.url || null });
          };
          list.append(card);
        }
      } catch (e) {
        list.innerHTML = '';
        list.append(h('div', { class: 'error-text' }, e.message));
      }
    };
    const timer = setInterval(load, 5000);
    load();
    const screen = h(
      'div',
      { class: 'screen' },
      h(
        'div',
        { class: 'auth-card panel', style: { width: 'min(560px, 100%)' } },
        h('div', { class: 'logo' }, 'CHỌN', h('span', {}, 'CHANNEL')),
        h('div', { class: 'tagline' }, 'Mỗi channel là 1 phòng gym riêng (tối đa 120 người). Vào cùng channel để gặp bạn bè!'),
        list,
        h(
          'div',
          { class: 'creator-actions' },
          cancelable ? h('button', { class: 'btn ghost', type: 'button', onclick: () => close(null) }, 'Hủy') : null,
          h('button', { class: 'btn', type: 'button', onclick: () => close({ channel: 'auto', url: null }) }, '⚡ Tự động chọn')
        )
      )
    );
    uiRoot().append(screen);
  });
}
