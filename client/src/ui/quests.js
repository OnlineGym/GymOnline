import { h, openModal, toast } from './dom.js';
import { api } from '../network/api.js';
import { audio } from '../core/audio.js';
import { notify } from './notifications.js';

/**
 * Nhiệm vụ ngày/tuần + điểm danh chuỗi 7 ngày.
 */
async function doCheckin(game) {
  const r = await api.checkin();
  game.onCharacter(r.character);
  audio.sfx('coin');
  toast(`📅 Điểm danh ngày ${r.streak}: +${r.coins} xu`, 'success', 3500);
  return r;
}

export async function openQuests(game) {
  const body = h('div', {});
  openModal('📋 Nhiệm vụ & điểm danh', body, { width: 560 });

  const questRow = (q, refresh) => {
    const pct = Math.min(100, (q.progress / q.goal) * 100);
    const btn = q.claimed
      ? h('span', { class: 'muted' }, '✓ Đã nhận')
      : h(
          'button',
          {
            class: 'btn',
            type: 'button',
            disabled: !q.done,
            onclick: async () => {
              try {
                const r = await api.claimQuest(q.key);
                game.onCharacter(r.character);
                audio.sfx('coin');
                toast(`🎉 +${r.coins} xu, +${r.exp} EXP`, 'success');
                refresh();
              } catch (e) {
                toast(e.message, 'error');
              }
            },
          },
          q.done ? 'Nhận' : 'Chưa xong'
        );
    return h(
      'div',
      { class: 'quest-row' },
      h('span', { class: 'quest-icon' }, q.icon),
      h(
        'div',
        { class: 'quest-main' },
        h('b', {}, q.label),
        h('div', { class: 'bar' }, h('div', { style: { width: `${pct}%` } })),
        h('span', { class: 'muted' }, `${q.progress}/${q.goal} • 🪙 ${q.coins} • ⭐ ${q.exp} EXP`)
      ),
      btn
    );
  };

  const render = async () => {
    try {
      const s = await api.daily();
      body.innerHTML = '';
      const c = s.checkin;
      // Ô đang tới lượt nhận trong chuỗi 7 ngày
      const done = c.today ? ((c.streak - 1) % 7) + 1 : c.streak % 7;
      const days = c.rewards.map((coins, i) => h('div', { class: `checkin-day${i < done ? ' done' : ''}${!c.today && i === done ? ' next' : ''}` }, h('small', {}, `Ngày ${i + 1}`), h('b', {}, `🪙${coins}`), i < done ? h('span', {}, '✓') : null));
      const btn = h(
        'button',
        {
          class: 'btn',
          type: 'button',
          disabled: c.today,
          onclick: async () => {
            try {
              await doCheckin(game);
              render();
            } catch (e) {
              toast(e.message, 'error');
            }
          },
        },
        c.today ? '✓ Hôm nay đã điểm danh' : '📅 Điểm danh'
      );
      body.append(
        h('h4', {}, `📅 Điểm danh • Chuỗi ${c.streak} ngày • Kỷ lục ${c.best}`),
        h('div', { class: 'checkin-grid' }, days),
        h('p', { class: 'muted', style: { fontSize: '12px' } }, 'Bỏ lỡ 1 ngày chuỗi sẽ tính lại từ đầu.'),
        btn,
        h('h4', {}, '🌞 Nhiệm vụ hôm nay'),
        ...s.daily.map((q) => questRow(q, render)),
        h('h4', {}, '🗓️ Nhiệm vụ tuần này'),
        ...s.weekly.map((q) => questRow(q, render))
      );
    } catch (e) {
      body.innerHTML = '';
      body.append(h('p', { class: 'error-text' }, e.message));
    }
  };
  body.append(h('p', { class: 'muted' }, 'Đang tải...'));
  render();
}

// Vào game: nhắc điểm danh nếu hôm nay chưa làm
export async function promptCheckin(game) {
  try {
    const s = await api.daily();
    if (s.checkin.today) return;
    notify({
      icon: '📅',
      title: `Điểm danh hôm nay: +${s.checkin.next} xu`,
      text: s.checkin.streak ? `Bạn đang có chuỗi ${s.checkin.streak} ngày` : 'Bắt đầu chuỗi 7 ngày',
      timeout: 15000,
      actions: [
        {
          label: 'Điểm danh',
          primary: true,
          fn: () => doCheckin(game).catch((e) => toast(e.message, 'error')),
        },
      ],
    });
  } catch {
    /* không nhắc được cũng không ảnh hưởng gì */
  }
}
