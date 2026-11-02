import { h, uiRoot, fmtTime } from './dom.js';
import { STAT_LABELS, STAT_ICONS } from '../equipment/config.js';
import { STAT_COLORS } from '../world/materials.js';
import { isMobile } from '../core/device.js';

const expToNext = (level) => 100 + (level - 1) * 60;

/**
 * HUD trong game: thẻ nhân vật (level/EXP/chỉ số), minimap, menu, nút tương tác, bảng tập, nhiệt kế sauna
 */
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
        return h('div', { class: 'stat', title: STAT_LABELS[k] }, STAT_ICONS[k], val, STAT_LABELS[k], h('div', { class: 'mini' }, fill));
      })
    );
    const card = h(
      'div',
      { class: 'player-card panel interactive' },
      h('div', { class: 'pc-top' }, this.avatar, h('div', { style: { minWidth: 0 } }, this.nameEl, h('div', { class: 'pc-sub' }, this.levelEl, this.coinsEl, this.calEl))),
      h('div', { class: 'bar' }, this.expFill),
      this.expText,
      stats
    );
    card.onclick = () => onMenu('profile');
    this.tl = h('div', { class: 'hud-tl' }, card);

    // ---- Góc trên phải: minimap + menu ----
    this.minimapCanvas = h('canvas');
    this.zoneEl = h('div', { class: 'zone-label' }, '');
    this.onlineEl = h('div', { class: 'online-count' }, '🟢 1');
    this.fpsEl = h('div', { class: 'fps hidden' }, '');
    const menu = (icon, name, title) => h('button', { class: 'icon-btn', title, onclick: () => onMenu(name) }, icon);
    this.minimapWrap = h('div', { class: 'minimap-wrap panel interactive' }, this.minimapCanvas, this.onlineEl, this.zoneEl);
    this.tr = h(
      'div',
      { class: 'hud-tr' },
      this.minimapWrap,
      h(
        'div',
        { class: 'menu-row' },
        menu('🏆', 'leaderboard', 'Bảng xếp hạng'),
        menu('📜', 'history', 'Lịch sử tập'),
        menu('👥', 'online', 'Người đang online'),
        menu('😊', 'emote', 'Biểu cảm (Q)'),
        menu('⚙️', 'settings', 'Cài đặt'),
        menu('🚪', 'logout', 'Đăng xuất')
      ),
      this.fpsEl
    );

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
    this.wkTime = h('b', {}, '00:00');
    this.wkCal = h('b', {}, '0');
    this.wkRepFill = h('div', { style: { width: '0%' } });
    this.workout = h(
      'div',
      { class: 'workout panel interactive hidden' },
      h('div', { class: 'wk-head' }, this.wkTitle, this.wkTag),
      h(
        'div',
        { class: 'wk-grid' },
        h('div', {}, this.wkReps, h('span', {}, 'Số rep')),
        h('div', {}, this.wkTime, h('span', {}, 'Thời gian')),
        h('div', {}, this.wkCal, h('span', {}, 'kcal'))
      ),
      h('div', { class: 'wk-rep' }, h('div', { class: 'bar' }, this.wkRepFill)),
      h('div', { class: 'wk-actions' }, h('button', { class: 'btn danger', onclick: () => this.onStop() }, isMobile() ? '⏹ Dừng' : '⏹ Dừng (E)'))
    );

    // ---- Nhiệt kế sauna ----
    this.thermoFill = h('div', { style: { height: '0%' } });
    this.thermoText = h('b', {}, '60°C');
    this.thermo = h('div', { class: 'thermo panel hidden' }, h('span', {}, '♨️ Nhiệt độ'), h('div', { class: 'tube' }, this.thermoFill), this.thermoText);

    uiRoot().append(this.tl, this.tr, this.prompt, this.workout, this.thermo);
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
  }

  setTodayCalories(cal) {
    this.calEl.textContent = `🔥 ${Math.round(cal)} kcal`;
  }

  setZone(room) {
    this.zoneEl.textContent = `${room.icon} ${room.name}`;
  }

  setOnline(n) {
    this.onlineEl.textContent = `🟢 ${n}`;
  }

  setFps(fps, show) {
    this.fpsEl.classList.toggle('hidden', !show);
    if (show) this.fpsEl.textContent = `${fps} FPS`;
  }

  showPrompt({ title, sub, busy = false }) {
    this.promptTitle.textContent = title;
    this.promptSub.textContent = sub || '';
    this.prompt.classList.toggle('busy', busy);
    this.promptKey.textContent = busy ? '✕' : isMobile() ? '👆' : 'E';
    this.prompt.classList.remove('hidden');
  }

  hidePrompt() {
    this.prompt.classList.add('hidden');
  }

  showWorkout(info, statLabel) {
    this.wkTitle.textContent = `${info.label}`;
    this.wkTag.textContent = statLabel ? `+${statLabel}` : info.en || '';
    this.workout.classList.remove('hidden');
  }

  updateWorkout({ reps, time, cal, repProgress }) {
    this.wkReps.textContent = reps;
    this.wkTime.textContent = fmtTime(time);
    this.wkCal.textContent = cal.toFixed(1);
    this.wkRepFill.style.width = `${repProgress * 100}%`;
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

  toggleMinimap() {
    this.minimapWrap.classList.toggle('hidden');
  }
}
