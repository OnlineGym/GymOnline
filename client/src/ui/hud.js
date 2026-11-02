import { h, uiRoot, fmtTime } from './dom.js';
import { STAT_LABELS, STAT_ICONS, STAT_COLORS } from '../equipment/config.js';
import { ITEMS, expToNext, FLOORS } from '@shared/constants.js';
import { isMobile } from '../core/device.js';

/**
 * HUD trong game: thẻ nhân vật (level/EXP/7 chỉ số/buff), minimap + tầng + channel, menu,
 * nút tương tác, bảng tập (rep/thời gian/calo + điểm đồng bộ), nhiệt kế, banner sự kiện, tiến độ party.
 */
const MENU = [
  ['🗺️', 'map', 'Bản đồ tòa nhà (M)'],
  ['🔍', 'finder', 'Tìm máy trống (F)'],
  ['👥', 'social', 'Bạn bè / Party / CLB (O)'],
  ['📍', 'nearby', 'Người xung quanh'],
  ['🎒', 'inventory', 'Túi đồ (I)'],
  ['🏆', 'leaderboard', 'Bảng xếp hạng'],
  ['🏅', 'achievements', 'Thành tích'],
  ['📜', 'history', 'Lịch sử tập'],
  ['📡', 'channel', 'Đổi channel'],
  ['😊', 'emote', 'Biểu cảm (Q)'],
  ['⚙️', 'settings', 'Cài đặt'],
  ['🚪', 'logout', 'Đăng xuất'],
];

export class HUD {
  constructor({ onInteract, onStop, onMenu }) {
    this.onInteract = onInteract;
    this.onStop = onStop;

    // ---- Góc trên trái: thẻ nhân vật ----
    this.avatar = h('div', { class: 'avatar' }, '?');
    this.nameEl = h('div', { class: 'pc-name' }, '');
    this.levelEl = h('span', { class: 'level-badge' }, 'Lv.1');
    this.coinsEl = h('span', {}, '🪙 0');
    this.calEl = h('span', {}, '🔥 0 kcal');
    this.expFill = h('div', { style: { width: '0%' } });
    this.expText = h('div', { class: 'exp-text' }, h('span', {}, 'EXP'), h('span', {}, '0/100'));
    this.statEls = {};
    const stats = h(
      'div',
      { class: 'stats' },
      Object.keys(STAT_LABELS).map((k) => {
        const val = h('b', {}, '0');
        const fill = h('div', { style: { width: '0%', background: STAT_COLORS[k] } });
        this.statEls[k] = { val, fill };
        return h('div', { class: 'stat', title: STAT_LABELS[k] }, STAT_ICONS[k], val, h('div', { class: 'mini' }, fill));
      })
    );
    this.buffsEl = h('div', { class: 'buffs' });
    this.partyEl = h('div', { class: 'party-mini hidden' });
    const card = h(
      'div',
      { class: 'player-card panel interactive' },
      h('div', { class: 'pc-top' }, this.avatar, h('div', { style: { minWidth: 0 } }, this.nameEl, h('div', { class: 'pc-sub' }, this.levelEl, this.coinsEl, this.calEl))),
      h('div', { class: 'bar' }, this.expFill),
      this.expText,
      stats,
      this.buffsEl
    );
    card.onclick = () => onMenu('profile');
    this.tl = h('div', { class: 'hud-tl' }, card, this.partyEl);

    // ---- Góc trên phải ----
    this.minimapCanvas = h('canvas');
    this.zoneEl = h('div', { class: 'zone-label' }, '');
    this.floorEl = h('div', { class: 'floor-badge' }, '1');
    this.onlineEl = h('div', { class: 'online-count' }, '');
    this.fpsEl = h('div', { class: 'fps hidden' }, '');
    this.minimapWrap = h('div', { class: 'minimap-wrap panel interactive', onclick: () => onMenu('map') }, this.minimapCanvas, this.floorEl, this.onlineEl, this.zoneEl);
    this.menuRow = h(
      'div',
      { class: 'menu-row' },
      MENU.map(([icon, name, title]) => h('button', { class: 'icon-btn', title, 'data-menu': name, onclick: () => onMenu(name) }, icon))
    );
    // Mobile: gom menu vào nút ☰ cho gọn màn hình
    const menuToggle = h('button', { class: 'icon-btn menu-toggle', title: 'Menu', onclick: () => this.menuRow.classList.toggle('open') }, '☰');
    this.menuRow.addEventListener('click', () => isMobile() && this.menuRow.classList.remove('open'));
    this.tr = h('div', { class: 'hud-tr' }, this.minimapWrap, menuToggle, this.menuRow, this.fpsEl);

    // ---- Banner sự kiện ----
    this.eventEl = h('div', { class: 'event-banner hidden' });

    // ---- Nút tương tác (PC) ----
    this.promptKey = h('div', { class: 'key' }, 'E');
    this.promptTitle = h('b', {}, '');
    this.promptSub = h('span', {}, '');
    this.prompt = h('div', { class: 'prompt panel interactive hidden' }, this.promptKey, h('div', { class: 'ptext' }, this.promptTitle, this.promptSub));
    this.prompt.onclick = () => this.onInteract();

    // ---- Bảng tập luyện ----
    this.wkTitle = h('div', { class: 'wk-title' });
    this.wkTag = h('div', { class: 'wk-stat-tag' });
    this.wkReps = h('b', {}, '0');
    this.wkRepsLabel = h('span', {}, 'Số rep');
    this.wkTime = h('b', {}, '00:00');
    this.wkCal = h('b', {}, '0');
    this.wkRepFill = h('div', { style: { width: '0%' } });
    this.wkDuo = h('div', { class: 'wk-duo hidden' }, '🤝 Tập cùng +20% EXP');
    this.syncEl = h('div', { class: 'sync hidden' });
    this.syncBeat = h('div', { class: 'sync-beat' });
    this.syncScore = h('span', {}, 'Đồng bộ 0%');
    this.syncFeedback = h('b', { class: 'sync-fb' }, '');
    this.syncEl.append(h('div', { class: 'sync-track' }, this.syncBeat), h('div', { class: 'sync-info' }, this.syncFeedback, this.syncScore));
    this.workout = h(
      'div',
      { class: 'workout panel interactive hidden' },
      h('div', { class: 'wk-head' }, this.wkTitle, this.wkTag),
      h(
        'div',
        { class: 'wk-grid' },
        h('div', {}, this.wkReps, this.wkRepsLabel),
        h('div', {}, this.wkTime, h('span', {}, 'Thời gian')),
        h('div', {}, this.wkCal, h('span', {}, 'kcal'))
      ),
      h('div', { class: 'wk-rep' }, h('div', { class: 'bar' }, this.wkRepFill)),
      this.syncEl,
      this.wkDuo,
      h('div', { class: 'wk-actions' }, h('button', { class: 'btn danger', onclick: () => this.onStop() }, isMobile() ? '⏹ Dừng' : '⏹ Dừng (E)'))
    );

    // ---- Nhiệt kế ----
    this.thermoFill = h('div', { style: { height: '0%' } });
    this.thermoText = h('b', {}, '60°C');
    this.thermo = h('div', { class: 'thermo panel hidden' }, h('span', {}, '♨️ Nhiệt độ'), h('div', { class: 'tube' }, this.thermoFill), this.thermoText);

    // ---- Màn chuyển tầng ----
    this.floorOverlay = h('div', { class: 'floor-overlay hidden' }, h('div', { class: 'fo-icon' }, '🛗'), h('div', { class: 'fo-text' }), h('div', { class: 'loading-bar' }, h('div')));

    uiRoot().append(this.tl, this.tr, this.eventEl, this.prompt, this.workout, this.thermo, this.floorOverlay);
  }

  setCharacter(c) {
    this.character = c;
    this.avatar.textContent = (c.displayName || '?').slice(0, 1).toUpperCase();
    this.avatar.style.background = `linear-gradient(135deg, ${c.outfit?.top || '#22d3ee'}, ${c.skinColor || '#f472b6'})`;
    this.nameEl.textContent = c.displayName;
    this.levelEl.textContent = `Lv.${c.level}`;
    this.coinsEl.textContent = `🪙 ${c.coins}`;
    const need = expToNext(c.level);
    this.expFill.style.width = `${Math.min(100, (c.exp / need) * 100)}%`;
    this.expText.lastChild.textContent = `${Math.floor(c.exp)}/${need}`;
    const max = Math.max(20, ...Object.values(c.stats || {}));
    for (const [k, el] of Object.entries(this.statEls)) {
      const v = c.stats?.[k] || 0;
      el.val.textContent = Math.floor(v);
      el.fill.style.width = `${(v / max) * 100}%`;
    }
    this.setBuffs(c.buffs || []);
  }

  setBuffs(buffs) {
    this.buffs = buffs;
    this._renderBuffs();
  }

  _renderBuffs() {
    const now = Date.now();
    this.buffsEl.innerHTML = '';
    for (const b of this.buffs || []) {
      const left = new Date(b.until).getTime() - now;
      if (left <= 0) continue;
      const item = Object.values(ITEMS).find((i) => i.buff?.kind === b.kind);
      this.buffsEl.append(h('span', { class: 'buff', title: item?.desc || b.kind }, `${item?.icon || '✨'} ${Math.ceil(left / 60000)}′`));
    }
  }

  tickBuffs() {
    this._renderBuffs();
  }

  setTodayCalories(cal) {
    this.calEl.textContent = `🔥 ${Math.round(cal)} kcal`;
  }

  setZone(room) {
    this.zoneEl.textContent = `${room.icon || ''} ${room.name || ''}`;
  }

  setFloor(id) {
    this.floorEl.textContent = FLOORS[id].key;
    this.floorEl.title = FLOORS[id].name;
    this.floorEl.style.background = FLOORS[id].color;
  }

  setChannel(name, nearby) {
    this.onlineEl.textContent = `📡 ${name} • 👀 ${nearby}`;
  }

  setFps(fps, show) {
    this.fpsEl.classList.toggle('hidden', !show);
    if (show) this.fpsEl.textContent = `${fps} FPS`;
  }

  setEvents(events) {
    this.eventEl.classList.toggle('hidden', !events.length);
    this.eventEl.textContent = events.map((e) => `${e.icon} ${e.label}`).join('   •   ');
  }

  setParty(view) {
    if (!view || view.members.length < 2) {
      this.partyEl.classList.add('hidden');
      return;
    }
    const pct = Math.min(100, (view.progress.calories / view.progress.goal) * 100);
    this.partyEl.classList.remove('hidden');
    this.partyEl.innerHTML = '';
    this.partyEl.append(
      h('div', { class: 'pm-head' }, h('b', {}, `👥 Party (${view.members.length})`), h('span', {}, `${view.progress.calories}/${view.progress.goal} kcal`)),
      h('div', { class: 'bar' }, h('div', { style: { width: `${pct}%`, background: 'linear-gradient(90deg,#a78bfa,#22d3ee)' } })),
      h('div', { class: 'pm-members' }, view.members.map((m) => h('span', { class: m.online ? 'on' : '' }, m.name)))
    );
  }

  showPrompt({ title, sub, busy = false, keyLabel }) {
    this.promptTitle.textContent = title;
    this.promptSub.textContent = sub || '';
    this.prompt.classList.toggle('busy', busy);
    this.promptKey.textContent = keyLabel || (busy ? '✕' : isMobile() ? '👆' : 'E');
    this.prompt.classList.remove('hidden');
  }

  hidePrompt() {
    this.prompt.classList.add('hidden');
  }

  showWorkout(info, tag, { klass = false, laps = false } = {}) {
    this.wkTitle.textContent = info.label;
    this.wkTag.textContent = tag || info.en || '';
    this.wkRepsLabel.textContent = laps ? 'Số vòng' : 'Số rep';
    this.syncEl.classList.toggle('hidden', !klass);
    this.wkDuo.classList.add('hidden');
    this.workout.classList.remove('hidden');
  }

  updateWorkout({ reps, time, cal, repProgress }) {
    this.wkReps.textContent = reps;
    this.wkTime.textContent = fmtTime(time);
    this.wkCal.textContent = cal.toFixed(1);
    this.wkRepFill.style.width = `${repProgress * 100}%`;
  }

  setDuo(on) {
    this.wkDuo.classList.toggle('hidden', !on);
  }

  // Thanh nhịp cho lớp nhóm: chấm chạy theo nhịp, bấm SPACE đúng lúc chấm ở giữa
  updateSync(beatFrac, score, feedback) {
    this.syncBeat.style.left = `${beatFrac * 100}%`;
    this.syncScore.textContent = `Đồng bộ ${Math.round(score * 100)}% (SPACE theo nhịp)`;
    if (feedback !== undefined) {
      this.syncFeedback.textContent = feedback;
      this.syncFeedback.className = `sync-fb ${feedback === 'PERFECT' ? 'perfect' : feedback === 'GOOD' ? 'good' : 'miss'}`;
    }
  }

  hideWorkout() {
    this.workout.classList.add('hidden');
  }

  setThermo(temp) {
    if (temp === null) return this.thermo.classList.add('hidden');
    this.thermo.classList.remove('hidden');
    this.thermoFill.style.height = `${((temp - 25) / (95 - 25)) * 100}%`;
    this.thermoText.textContent = `${Math.round(temp)}°C`;
  }

  showFloorOverlay(text) {
    this.floorOverlay.querySelector('.fo-text').textContent = text;
    this.floorOverlay.classList.remove('hidden');
  }

  hideFloorOverlay() {
    this.floorOverlay.classList.add('hidden');
  }

  toggleMinimap() {
    this.minimapWrap.classList.toggle('hidden');
  }
}
