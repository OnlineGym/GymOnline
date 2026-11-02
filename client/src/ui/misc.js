import { h, openModal } from './dom.js';
import { STATS, STAT_LABELS, STAT_COLORS, FLOORS } from '@shared/constants.js';

// ============== CÂN INBODY: phân tích chỉ số nhân vật ==============
export function openInBody(c) {
  const stats = c.stats || {};
  const total = STATS.reduce((s, k) => s + (stats[k] || 0), 0);
  const muscle = Math.min(60, 25 + total / 40 + c.level * 0.4);
  const fat = Math.max(7, 28 - c.level * 0.5 - (stats.stamina || 0) / 30 - (stats.core || 0) / 50);
  const bmr = Math.round(1300 + muscle * 18);
  const age = Math.max(16, Math.round(35 - c.level * 0.6 - (stats.stamina || 0) / 40));
  const score = Math.min(100, Math.round(55 + muscle * 0.4 - fat * 0.5 + c.level * 0.5));
  const canvas = h('canvas', { width: 320, height: 300, class: 'radar' });
  drawRadar(canvas, stats);
  const weakest = STATS.reduce((a, b) => ((stats[a] || 0) <= (stats[b] || 0) ? a : b));
  openModal(
    '📊 Kết quả cân InBody',
    h(
      'div',
      { class: 'inbody' },
      canvas,
      h(
        'div',
        {},
        h(
          'div',
          { class: 'kpis' },
          h('div', { class: 'kpi' }, h('b', {}, `${muscle.toFixed(1)}%`), h('span', {}, 'Tỉ lệ cơ')),
          h('div', { class: 'kpi' }, h('b', {}, `${fat.toFixed(1)}%`), h('span', {}, 'Tỉ lệ mỡ')),
          h('div', { class: 'kpi' }, h('b', {}, bmr), h('span', {}, 'BMR (kcal)')),
          h('div', { class: 'kpi' }, h('b', {}, age), h('span', {}, 'Tuổi cơ thể')),
          h('div', { class: 'kpi' }, h('b', {}, `${score}/100`), h('span', {}, 'Điểm InBody'))
        ),
        h('p', {}, `💡 Nhóm cơ yếu nhất: `, h('b', {}, STAT_LABELS[weakest]), '. Dùng 🔍 Tìm máy trống để tập nhóm này!')
      )
    ),
    { width: 680 }
  );
}

function drawRadar(canvas, stats) {
  const g = canvas.getContext('2d');
  const cx = canvas.width / 2;
  const cy = canvas.height / 2 + 6;
  const R = 110;
  const max = Math.max(20, ...STATS.map((k) => stats[k] || 0));
  const n = STATS.length;
  const pt = (i, r) => [cx + Math.sin((i / n) * Math.PI * 2) * r, cy - Math.cos((i / n) * Math.PI * 2) * r];
  g.strokeStyle = 'rgba(148,163,184,0.3)';
  for (let ring = 1; ring <= 4; ring++) {
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const [x, y] = pt(i % n, (R * ring) / 4);
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.stroke();
  }
  g.beginPath();
  STATS.forEach((k, i) => {
    const [x, y] = pt(i, R * Math.max(0.05, (stats[k] || 0) / max));
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  });
  g.closePath();
  g.fillStyle = 'rgba(34,211,238,0.3)';
  g.fill();
  g.strokeStyle = '#22d3ee';
  g.lineWidth = 2;
  g.stroke();
  g.font = '700 12px "Be Vietnam Pro", sans-serif';
  g.textAlign = 'center';
  STATS.forEach((k, i) => {
    const [x, y] = pt(i, R + 18);
    g.fillStyle = STAT_COLORS[k];
    g.fillText(`${STAT_LABELS[k]} ${Math.floor(stats[k] || 0)}`, x, y);
  });
}

// ============== CHỌN TẦNG (thang máy) ==============
export function openFloorPicker(current, onPick) {
  const m = openModal(
    '🛗 Thang máy – chọn tầng',
    h(
      'div',
      { class: 'floor-picker' },
      [...FLOORS].reverse().map((f) =>
        h(
          'button',
          {
            type: 'button',
            class: `fp-btn ${f.id === current ? 'current' : ''}`,
            disabled: f.id === current,
            style: { borderColor: f.color },
            onclick: () => {
              m.close();
              onPick(f.id);
            },
          },
          h('span', { class: 'fp-key', style: { background: f.color } }, f.key),
          h('span', {}, f.name),
          f.id === current ? h('small', {}, '(bạn đang ở đây)') : null
        )
      )
    ),
    { width: 440 }
  );
}

// ============== NGƯỜI XUNG QUANH ==============
export function openNearby(players, onSelect) {
  const m = openModal(
    `📍 Người xung quanh (${players.length})`,
    players.length
      ? h(
          'ul',
          { class: 'online-list' },
          players.map((p) =>
            h(
              'li',
              {},
              h('div', { class: 'who' }, h('span', { class: 'dot' }), p.name, h('span', { class: 'muted', style: { fontSize: '12px' } }, `Lv.${p.level} • ${p.dist}m${p.friend ? ' • 🤝 bạn bè' : ''}`)),
              h('button', { class: 'btn ghost', style: { padding: '6px 12px', fontSize: '13px' }, onclick: () => (m.close(), onSelect(p)) }, 'Tương tác')
            )
          )
        )
      : h('p', { class: 'muted' }, 'Không có ai ở gần. Thử sang khu khác hoặc đổi channel đông người hơn!'),
    { width: 460 }
  );
}
