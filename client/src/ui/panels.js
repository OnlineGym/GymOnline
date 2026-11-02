import { h, openModal, fmtDate, fmtTime } from './dom.js';
import { api } from '../network/api.js';
import { settings, updateSettings } from '../core/settings.js';
import { EQUIPMENT_INFO, STAT_LABELS, STAT_ICONS } from '../equipment/config.js';
import { STAT_COLORS } from '../world/materials.js';
import { isMobile } from '../core/device.js';

const loading = () => h('div', { class: 'muted', style: { textAlign: 'center', padding: '20px' } }, 'Đang tải...');
const errorBox = (msg) => h('div', { class: 'error-text' }, msg);

// ===== Bảng xếp hạng =====
export function openLeaderboard(selfUserId) {
  const body = h('div', {}, loading());
  openModal('🏆 Bảng xếp hạng', body, { width: 600 });
  let tab = 'level';
  let data = null;
  const render = () => {
    body.innerHTML = '';
    const t1 = h('button', { class: tab === 'level' ? 'active' : '', onclick: () => ((tab = 'level'), render()) }, '⭐ Top Level');
    const t2 = h('button', { class: tab === 'cal' ? 'active' : '', onclick: () => ((tab = 'cal'), render()) }, '🔥 Top Calo');
    body.append(h('div', { class: 'tabs' }, t1, t2));
    const rows = tab === 'level' ? data.topLevel : data.topCalories;
    if (!rows.length) return body.append(h('p', { class: 'muted' }, 'Chưa có dữ liệu. Hãy là người đầu tiên tập luyện!'));
    const medal = (r) => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : `#${r}`);
    body.append(
      h(
        'table',
        { class: 'lb' },
        h('tr', {}, h('th', {}, 'Hạng'), h('th', {}, 'Tên'), h('th', {}, 'Level'), h('th', {}, tab === 'level' ? 'Sức mạnh' : 'Calo'), h('th', {}, 'Buổi tập')),
        rows.map((r) =>
          h(
            'tr',
            { class: r.userId === selfUserId ? 'me' : '' },
            h('td', { class: `rank rank-${r.rank}` }, medal(r.rank)),
            h('td', {}, r.displayName),
            h('td', {}, `Lv.${r.level}`),
            h('td', {}, tab === 'level' ? Math.round(r.power) : `${r.totalCalories} kcal`),
            h('td', {}, r.totalWorkouts)
          )
        )
      )
    );
  };
  api
    .leaderboard()
    .then((d) => {
      data = d;
      render();
    })
    .catch((e) => body.replaceChildren(errorBox(e.message)));
}

// ===== Lịch sử tập =====
export function openHistory() {
  const body = h('div', {}, loading());
  openModal('📜 Lịch sử tập luyện', body, { width: 620 });
  api
    .history(40)
    .then(({ logs, totals, today }) => {
      body.innerHTML = '';
      body.append(
        h(
          'div',
          { class: 'kpis' },
          h('div', { class: 'kpi' }, h('b', {}, totals.sessions), h('span', {}, 'Tổng buổi tập')),
          h('div', { class: 'kpi' }, h('b', {}, Math.round(totals.calories)), h('span', {}, 'Tổng kcal')),
          h('div', { class: 'kpi' }, h('b', {}, fmtTime(totals.durationSec)), h('span', {}, 'Tổng thời gian')),
          h('div', { class: 'kpi' }, h('b', {}, Math.round(today.calories)), h('span', {}, 'kcal hôm nay'))
        )
      );
      if (!logs.length) return body.append(h('p', { class: 'muted' }, 'Bạn chưa có buổi tập nào. Lại gần một máy tập và bấm "Tập" nhé!'));
      body.append(
        h(
          'table',
          { class: 'lb' },
          h('tr', {}, h('th', {}, 'Thời điểm'), h('th', {}, 'Máy tập'), h('th', {}, 'Rep'), h('th', {}, 'Thời gian'), h('th', {}, 'kcal'), h('th', {}, 'EXP')),
          logs.map((l) =>
            h(
              'tr',
              {},
              h('td', {}, fmtDate(l.createdAt)),
              h('td', {}, `${STAT_ICONS[l.stat] || ''} ${EQUIPMENT_INFO[l.equipmentType]?.label || l.equipmentType}`),
              h('td', {}, l.reps),
              h('td', {}, fmtTime(l.durationSec)),
              h('td', {}, l.caloriesBurned),
              h('td', {}, `+${l.expGained}`)
            )
          )
        )
      );
    })
    .catch((e) => body.replaceChildren(errorBox(e.message)));
}

// ===== Hồ sơ nhân vật =====
export function openProfile(character, { onEdit }) {
  const c = character;
  const need = 100 + (c.level - 1) * 60;
  const max = Math.max(20, ...Object.values(c.stats));
  const body = h(
    'div',
    {},
    h(
      'div',
      { class: 'kpis' },
      h('div', { class: 'kpi' }, h('b', {}, `Lv.${c.level}`), h('span', {}, `${Math.floor(c.exp)}/${need} EXP`)),
      h('div', { class: 'kpi' }, h('b', {}, `🪙 ${c.coins}`), h('span', {}, 'Xu')),
      h('div', { class: 'kpi' }, h('b', {}, c.totalWorkouts), h('span', {}, 'Buổi tập')),
      h('div', { class: 'kpi' }, h('b', {}, c.totalCalories), h('span', {}, 'Tổng kcal'))
    ),
    h('h4', { style: { margin: '6px 0 12px' } }, 'Chỉ số cơ bắp'),
    Object.keys(STAT_LABELS).map((k) =>
      h(
        'div',
        { class: 'stat-row' },
        h('span', {}, `${STAT_ICONS[k]} ${STAT_LABELS[k]}`),
        h('div', { class: 'bar' }, h('div', { style: { width: `${(c.stats[k] / max) * 100}%`, background: STAT_COLORS[k] } })),
        h('b', { style: { textAlign: 'right' } }, Math.floor(c.stats[k]))
      )
    ),
    h('p', { class: 'muted', style: { fontSize: '13px' } }, 'Mẹo: mỗi loại máy tăng một nhóm cơ. Ghé phòng thay đồ và mở tủ để đổi trang phục.'),
    h('button', { class: 'btn', style: { width: '100%', marginTop: '6px' }, onclick: () => (m.close(), onEdit()) }, '🧥 Chỉnh sửa ngoại hình')
  );
  const m = openModal(`👤 ${c.displayName}`, body, { width: 520 });
}

// ===== Người đang online =====
export function openOnlineList(players, selfUserId, { onDm }) {
  const list = h(
    'ul',
    { class: 'online-list' },
    players.map((p) =>
      h(
        'li',
        {},
        h('div', { class: 'who' }, h('span', { class: 'dot' }), `${p.name}`, h('span', { class: 'muted', style: { fontSize: '12px' } }, `Lv.${p.level}`), p.userId === selfUserId ? h('span', { class: 'muted' }, '(bạn)') : null),
        p.userId !== selfUserId ? h('button', { class: 'btn ghost', style: { padding: '6px 12px', fontSize: '13px' }, onclick: () => (m.close(), onDm(p.userId, p.name)) }, '💬 Nhắn riêng') : null
      )
    )
  );
  const m = openModal(`👥 Đang online (${players.length})`, list, { width: 440 });
}

// ===== Cài đặt =====
export function openSettings() {
  const sw = (key) => {
    const input = h('input', { type: 'checkbox' });
    input.checked = !!settings[key];
    input.onchange = () => updateSettings({ [key]: input.checked });
    return h('label', { class: 'switch' }, input, h('span'));
  };
  const range = (key, min = 0, max = 1, step = 0.05) => {
    const input = h('input', { type: 'range', min, max, step, value: settings[key] });
    input.oninput = () => updateSettings({ [key]: Number(input.value) });
    return input;
  };
  const qualitySel = h(
    'div',
    { class: 'opt-row' },
    [
      ['low', 'Thấp'],
      ['medium', 'Trung bình'],
      ['high', 'Cao'],
    ].map(([v, label]) => {
      const b = h('button', { type: 'button', class: `chip${settings.quality === v ? ' active' : ''}` }, label);
      b.onclick = () => {
        updateSettings({ quality: v });
        qualitySel.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
        b.classList.add('active');
      };
      return b;
    })
  );
  const body = h(
    'div',
    {},
    h('div', { class: 'setting' }, h('div', {}, h('b', {}, 'Chất lượng đồ họa'), h('div', { class: 'muted', style: { fontSize: '12px' } }, 'Thấp: tắt bóng đổ, gương; phù hợp điện thoại')), qualitySel),
    h('div', { class: 'setting' }, h('span', {}, '🔊 Âm thanh'), sw('sound')),
    h('div', { class: 'setting' }, h('span', {}, '🎵 Nhạc phòng aerobic'), range('music')),
    h('div', { class: 'setting' }, h('span', {}, '🔔 Hiệu ứng âm thanh'), range('sfx')),
    h('div', { class: 'setting' }, h('span', {}, '🖱️ Độ nhạy camera'), range('cameraSensitivity', 0.3, 2, 0.1)),
    h('div', { class: 'setting' }, h('span', {}, '📈 Hiện FPS'), sw('showFps')),
    isMobile()
      ? h('div', { class: 'keys-help' }, 'Joystick trái: di chuyển • Vuốt màn hình: xoay camera • Chụm 2 ngón: zoom • 🏃: chạy • 😊: biểu cảm')
      : h(
          'div',
          { class: 'keys-help', html: '<kbd>W A S D</kbd>/<kbd>↑↓←→</kbd> di chuyển • <kbd>Shift</kbd> chạy • Kéo chuột: xoay camera • Lăn chuột: zoom<br><kbd>E</kbd> tương tác/tập • <kbd>Q</kbd> biểu cảm • <kbd>1</kbd>-<kbd>8</kbd> emote nhanh • <kbd>Enter</kbd> chat • <kbd>M</kbd> ẩn/hiện bản đồ' }
        )
  );
  openModal('⚙️ Cài đặt', body, { width: 520 });
}
