import { h, openModal, fmtDate, fmtTime, toast } from './dom.js';
import { api } from '../network/api.js';
import { settings, updateSettings, QUALITY_ORDER, QUALITY_LABEL } from '../core/settings.js';
import { DEFAULT_KEYS, KEY_LABELS, RESERVED_KEYS, keyLabel } from '../core/settings.js';
import { EQUIPMENT_INFO, STAT_LABELS, STAT_ICONS } from '../equipment/config.js';
import { isMobile } from '../core/device.js';

const loading = () => h('div', { class: 'muted', style: { textAlign: 'center', padding: '20px' } }, 'Đang tải...');
const errorBox = (msg) => h('div', { class: 'error-text' }, msg);
const medal = (r) => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : `#${r}`);

// ===== Bảng xếp hạng: level / calo / tuần / theo nhóm cơ / CLB (server cache 30s) =====
export function openLeaderboard(selfUserId, onPlayer) {
  const body = h('div');
  openModal('🏆 Bảng xếp hạng', body, { width: 640 });
  let tab = 'level';
  let stat = 'chest';
  const render = async () => {
    body.innerHTML = '';
    const tabs = h(
      'div',
      { class: 'tabs wrap' },
      [
        ['level', '⭐ Level'],
        ['calories', '🔥 Calo'],
        ['weekly', '📅 Tuần này'],
        ['stat', '💪 Nhóm cơ'],
        ['guild', '🛡️ CLB'],
      ].map(([k, l]) => h('button', { type: 'button', class: tab === k ? 'active' : '', onclick: () => ((tab = k), render()) }, l))
    );
    body.append(tabs);
    if (tab === 'stat') {
      body.append(
        h(
          'div',
          { class: 'opt-row', style: { marginBottom: '10px' } },
          Object.keys(STAT_LABELS).map((k) => h('button', { type: 'button', class: `chip${k === stat ? ' active' : ''}`, onclick: () => ((stat = k), render()) }, `${STAT_ICONS[k]} ${STAT_LABELS[k]}`))
        )
      );
    }
    const box = h('div', {}, loading());
    body.append(box);
    try {
      const d = await api.leaderboard(tab === 'calories' ? 'level' : tab, tab === 'stat' ? stat : undefined);
      box.innerHTML = '';
      let rows;
      let valueLabel;
      let value;
      if (tab === 'level') [rows, valueLabel, value] = [d.topLevel, 'Sức mạnh', (r) => r.power];
      else if (tab === 'calories') [rows, valueLabel, value] = [d.topCalories, 'Calo', (r) => `${r.totalCalories} kcal`];
      else if (tab === 'weekly') [rows, valueLabel, value] = [d.rows, 'EXP tuần', (r) => r.value];
      else if (tab === 'stat') [rows, valueLabel, value] = [d.rows, STAT_LABELS[stat], (r) => r.value];
      else [rows, valueLabel, value] = [d.rows, 'Tổng level', (r) => r.value];
      if (!rows.length) return box.append(h('p', { class: 'muted' }, 'Chưa có dữ liệu. Hãy là người đầu tiên!'));
      box.append(
        h(
          'table',
          { class: 'lb' },
          h('tr', {}, h('th', {}, 'Hạng'), h('th', {}, tab === 'guild' ? 'Câu lạc bộ' : 'Tên'), h('th', {}, tab === 'guild' ? 'Thành viên' : 'Level'), h('th', {}, valueLabel)),
          rows.map((r) =>
            h(
              'tr',
              { class: `${r.userId === selfUserId ? 'me' : ''} ${r.userId ? 'clickable' : ''}`, onclick: () => r.userId && onPlayer?.(r.userId) },
              h('td', { class: `rank rank-${r.rank}` }, medal(r.rank)),
              h('td', {}, r.displayName),
              h('td', {}, tab === 'guild' ? r.members : `Lv.${r.level}`),
              h('td', {}, value(r))
            )
          )
        ),
        h('p', { class: 'muted', style: { fontSize: '11px' } }, 'Bảng xếp hạng được làm mới mỗi 30 giây.')
      );
    } catch (e) {
      box.innerHTML = '';
      box.append(errorBox(e.message));
    }
  };
  render();
}

// ===== Lịch sử tập =====
export function openHistory() {
  const body = h('div', {}, loading());
  openModal('📜 Lịch sử tập luyện', body, { width: 680 });
  api
    .history(40)
    .then(({ logs, totals, today, byGroup }) => {
      body.innerHTML = '';
      body.append(
        h(
          'div',
          { class: 'kpis' },
          h('div', { class: 'kpi' }, h('b', {}, totals.sessions), h('span', {}, 'Tổng buổi tập')),
          h('div', { class: 'kpi' }, h('b', {}, Math.round(totals.calories)), h('span', {}, 'Tổng kcal')),
          h('div', { class: 'kpi' }, h('b', {}, fmtTime(totals.durationSec)), h('span', {}, 'Tổng thời gian')),
          h('div', { class: 'kpi' }, h('b', {}, Math.round(today.calories)), h('span', {}, 'kcal hôm nay'))
        ),
        byGroup?.length ? h('div', { class: 'badges' }, byGroup.map((g) => h('span', { class: 'badge' }, `${STAT_ICONS[g._id] || ''} ${STAT_LABELS[g._id] || g._id}: ${g.sessions} buổi`))) : null
      );
      if (!logs.length) return body.append(h('p', { class: 'muted' }, 'Bạn chưa có buổi tập nào. Bấm 🔍 để tìm máy trống!'));
      body.append(
        h(
          'table',
          { class: 'lb' },
          h('tr', {}, h('th', {}, 'Thời điểm'), h('th', {}, 'Máy tập'), h('th', {}, 'Rep'), h('th', {}, 'Thời gian'), h('th', {}, 'kcal'), h('th', {}, 'EXP')),
          logs.map((l) => {
            const [type] = l.equipmentType.split('#');
            return h(
              'tr',
              {},
              h('td', {}, fmtDate(l.createdAt)),
              h('td', {}, `${STAT_ICONS[l.stat] || ''} ${EQUIPMENT_INFO[type]?.label || type}${l.bonuses?.length ? ' ✨' : ''}`),
              h('td', {}, l.reps),
              h('td', {}, fmtTime(l.durationSec)),
              h('td', {}, l.caloriesBurned),
              h('td', {}, `+${l.expGained}`)
            );
          })
        )
      );
    })
    .catch((e) => body.replaceChildren(errorBox(e.message)));
}

// ===== Cài đặt =====
export function openSettings() {
  const sw = (key) => {
    const input = h('input', { type: 'checkbox' });
    input.checked = !!settings[key];
    input.onchange = () => updateSettings({ [key]: input.checked });
    return h('label', { class: 'switch' }, input, h('span'));
  };
  const range = (key, min = 0, max = 1, step = 0.05, fmt) => {
    const input = h('input', { type: 'range', min, max, step, value: settings[key] });
    const val = fmt ? h('span', { class: 'muted', style: { minWidth: '48px', textAlign: 'right', fontSize: '12px' } }, fmt(settings[key])) : null;
    input.oninput = () => {
      updateSettings({ [key]: Number(input.value) });
      if (val) val.textContent = fmt(Number(input.value));
    };
    return val ? h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, input, val) : input;
  };
  const qualitySel = h(
    'div',
    { class: 'opt-row' },
    QUALITY_ORDER.map((v) => [v, QUALITY_LABEL[v]]).map(([v, label]) => {
      const b = h('button', { type: 'button', class: `chip${settings.quality === v ? ' active' : ''}` }, label);
      b.onclick = () => {
        updateSettings({ quality: v });
        qualitySel.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
        b.classList.add('active');
      };
      return b;
    })
  );
  // Đổi phím: bấm nút rồi nhấn phím mới; trùng phím khác thì 2 phím đổi chỗ cho nhau
  const keysBox = h('div', { class: 'keybinds' });
  const renderKeys = () => {
    keysBox.innerHTML = '';
    for (const action of Object.keys(DEFAULT_KEYS)) {
      const btn = h('button', { type: 'button', class: 'chip' }, keyLabel(settings.keys[action]));
      btn.onclick = () => {
        btn.textContent = 'Nhấn phím...';
        const onKey = (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.removeEventListener('keydown', onKey, true);
          if (e.code === 'Escape') return renderKeys();
          if (RESERVED_KEYS.test(e.code)) {
            toast(`Phím ${keyLabel(e.code)} đang dùng cố định, hãy chọn phím khác`, 'error');
            return renderKeys();
          }
          const keys = { ...settings.keys };
          const clash = Object.keys(keys).find((a) => keys[a] === e.code && a !== action);
          if (clash) keys[clash] = keys[action];
          keys[action] = e.code;
          updateSettings({ keys });
          return renderKeys();
        };
        window.addEventListener('keydown', onKey, true);
      };
      keysBox.append(h('div', { class: 'keybind-row' }, h('span', {}, KEY_LABELS[action]), btn));
    }
    keysBox.append(h('button', { type: 'button', class: 'btn ghost', style: { marginTop: '8px' }, onclick: () => (updateSettings({ keys: { ...DEFAULT_KEYS } }), renderKeys()) }, 'Khôi phục mặc định'));
  };
  renderKeys();
  const body = h(
    'div',
    {},
    h('div', { class: 'setting' }, h('div', {}, h('b', {}, 'Chất lượng đồ họa'), h('div', { class: 'muted', style: { fontSize: '12px' } }, 'Thấp: tắt hậu kỳ/bóng đổ (điện thoại) • Cao: bloom, AO, phản chiếu • Siêu: vật liệu vật lý, bóng mềm')), qualitySel),
    h('div', { class: 'setting' }, h('div', {}, h('span', {}, '🤖 Tự giảm đồ họa khi FPS thấp'), h('div', { class: 'muted', style: { fontSize: '12px' } }, 'Dưới 30 FPS trong vài giây sẽ tự hạ 1 mức')), sw('autoQuality')),
    h('div', { class: 'setting' }, h('div', {}, h('span', {}, '🔭 Góc nhìn rộng (FOV)'), h('div', { class: 'muted', style: { fontSize: '12px' } }, 'Càng lớn càng thấy rộng hai bên')), range('fov', 50, 95, 1, (v) => v + '°')),
    h('div', { class: 'setting' }, h('div', {}, h('span', {}, '🌫️ Tầm nhìn xa'), h('div', { class: 'muted', style: { fontSize: '12px' } }, 'Khoảng cách sương mù & vẽ vật thể (xa hơn = nặng hơn)')), range('viewDistance', 0.6, 1.8, 0.1, (v) => Math.round(v * 100) + '%')),
    h('div', { class: 'setting' }, h('span', {}, '🎥 Camera lùi xa tối đa'), range('maxZoom', 4, 16, 0.5, (v) => v + 'm')),
    h('div', { class: 'setting' }, h('span', {}, '🛗 Góc nhìn thứ nhất trong thang máy'), sw('firstPersonElevator')),
    h('div', { class: 'setting' }, h('span', {}, '👥 Số nhân vật hiển thị chi tiết'), range('maxDetailed', 10, 80, 5)),
    h('div', { class: 'setting' }, h('span', {}, '🔊 Âm thanh'), sw('sound')),
    h('div', { class: 'setting' }, h('span', {}, '🎵 Nhạc phòng tập'), range('music')),
    h('div', { class: 'setting' }, h('span', {}, '🔔 Hiệu ứng âm thanh'), range('sfx')),
    h('div', { class: 'setting' }, h('span', {}, '🖱️ Độ nhạy camera'), range('cameraSensitivity', 0.3, 2, 0.1)),
    h('div', { class: 'setting' }, h('span', {}, '📈 Hiện FPS'), sw('showFps')),
    isMobile() ? null : h('details', { class: 'keybind-wrap' }, h('summary', {}, '⌨️ Đổi phím điều khiển'), keysBox),
    isMobile()
      ? h('div', { class: 'keys-help' }, 'Joystick trái: di chuyển • Vuốt: xoay camera • Chụm 2 ngón: zoom • ⤴️: nhảy / nổi • ⤵️: lặn • 🏃: chạy • 🧘: ngồi/nằm • Đi vào thang bộ/thang cuốn để lên xuống tầng • Bước vào thang máy để chọn tầng • Khi tập: bấm các nút trên màn hình theo minigame')
      : h('div', {
          class: 'keys-help',
          html:
            '<b>Phím mặc định</b><br><kbd>WASD</kbd> di chuyển • <kbd>Shift</kbd> chạy • <kbd>Space</kbd> nhảy • Kéo chuột: xoay camera • Lăn: zoom<br>' +
            'Thang bộ/thang cuốn: cứ đi vào là lên/xuống tầng • Thang máy: bước vào rồi bấm <kbd>0</kbd>-<kbd>4</kbd> chọn tầng<br>' +
            'Hồ bơi: <kbd>Space</kbd> nổi • <kbd>C</kbd> lặn • sát thành hồ + <kbd>Space</kbd>/<kbd>E</kbd> lên bờ<br>' +
            'Tập luyện: mỗi máy là một trò riêng (click, kéo chuột, nhảy, bấm theo nhịp...), hướng dẫn hiện ngay trên bảng tập. Chơi chuẩn được thêm EXP<br>' +
            '<kbd>E</kbd> tập/tương tác • <kbd>F</kbd> tương tác người gần nhất • Bấm vào nhân vật để mở menu<br>' +
            '<kbd>C</kbd> ngồi • <kbd>Z</kbd> nằm (bấm lại hoặc di chuyển để đứng dậy) • <kbd>Q</kbd> biểu cảm • <kbd>1</kbd>-<kbd>8</kbd> emote nhanh • <kbd>M</kbd> bản đồ • <kbd>N</kbd> tìm máy trống • <kbd>O</kbd> bạn bè • <kbd>I</kbd> túi đồ • <kbd>Enter</kbd> chat<br>' +
            'Thách đấu: <kbd>Space</kbd> bấm/giữ • Sparring <kbd>J</kbd> đấm <kbd>K</kbd> đỡ <kbd>L</kbd> né',
        })
  );
  openModal('⚙️ Cài đặt', body, { width: 560 });
}
