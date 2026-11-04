import { h, uiRoot } from './dom.js';
import { isMobile } from '../core/device.js';
import { audio } from '../core/audio.js';

/**
 * Lớp phủ cho thách đấu / minigame 2+ người (server làm trọng tài, client chỉ hiển thị + gửi input):
 * vật tay (thanh lực), sparring (thanh máu, đấm/đỡ/né), hít đất/squat (đếm rep), plank (giữ phím), đua (làn chạy).
 */
const HINT = {
  armWrestle: 'Bấm SPACE liên tục để kéo tay đối thủ!',
  spar: 'J/SPACE: Đấm • K: Đỡ • L: Né',
  pushup: 'Bấm SPACE mỗi lần hít đất (≥ 0.45s / rep)',
  squat: 'Bấm SPACE mỗi lần squat (≥ 0.45s / rep)',
  plank: 'GIỮ phím SPACE – buông ra là thua!',
  race: 'Bấm SPACE liên tục để tăng tốc!',
  raceRow: 'Bấm SPACE liên tục để chèo nhanh hơn!',
  raceBike: 'Bấm SPACE liên tục để đạp nhanh hơn!',
};

export class ChallengeUI {
  constructor({ onInput, onCancel }) {
    this.onInput = onInput;
    this.onCancel = onCancel;
    this.el = h('div', { class: 'challenge panel interactive hidden' });
    uiRoot().append(this.el);
    this.state = null;
    this._raf = null;
  }

  get active() {
    return !!this.state;
  }

  waiting(id, label) {
    this.state = { id, kind: 'waiting' };
    this.el.innerHTML = '';
    this.el.classList.remove('hidden');
    this.el.append(h('div', { class: 'ch-title' }, `⏳ Đang chờ đối thủ nhận lời: ${label}`), h('button', { class: 'btn ghost', onclick: () => this.onCancel(id) }, 'Hủy lời mời'));
  }

  start(p, selfNid, serverNow) {
    this.selfNid = selfNid;
    this.state = { ...p, scores: {}, hp: {}, pos: 0, live: false, dist: {} };
    this.clockOffset = p.serverNow - Date.now();
    if (p.kind === 'pair') {
      this.hide();
      this.state = { ...p, kind: 'pair' };
      return;
    }
    const names = Object.fromEntries(p.participants.map((x) => [x.nid, x.name]));
    this.names = names;
    this.el.innerHTML = '';
    this.el.classList.remove('hidden');
    this.countEl = h('div', { class: 'ch-count' }, '3');
    this.timerEl = h('span', { class: 'ch-timer' }, '');
    this.bodyEl = h('div', { class: 'ch-body' });
    this.noteEl = h('div', { class: 'ch-note' }, '');
    const btns = h('div', { class: 'ch-btns' });
    const btn = (label, a, cls = '') => {
      const b = h('button', { class: `btn ${cls}`, type: 'button' }, label);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.onInput(a === 'holdToggle' ? 'hold' : a);
      });
      if (a === 'holdToggle') b.addEventListener('pointerup', () => this.onInput('release'));
      return b;
    };
    if (p.kind === 'spar') btns.append(btn('👊 Đấm', 'punch'), btn('🛡️ Đỡ', 'block', 'ghost'), btn('💨 Né', 'dodge', 'ghost'));
    else if (p.kind === 'plank') btns.append(btn('🧱 GIỮ', 'holdToggle'));
    else if (p.kind === 'armWrestle' || p.distance) btns.append(btn(p.distance ? `${p.icon} TĂNG TỐC` : '💪 BẤM', 'tap'));
    else btns.append(btn('⬇️ REP', 'rep'));
    if (!isMobile()) btns.classList.add('desktop-hint');
    this.el.append(
      h('div', { class: 'ch-title' }, `${p.icon} ${p.label}`, this.timerEl),
      h('div', { class: 'ch-hint' }, HINT[p.kind] || ''),
      this.countEl,
      this.bodyEl,
      this.noteEl,
      btns,
      h('button', { class: 'close-x ch-quit', title: 'Bỏ cuộc', onclick: () => this.onCancel(p.id) }, '🏳️')
    );
    this.render();
    cancelAnimationFrame(this._raf);
    const loop = () => {
      if (!this.state || this.state.kind === 'waiting') return;
      const now = Date.now() + this.clockOffset;
      const s = this.state;
      if (s.startAt > now) {
        const n = Math.ceil((s.startAt - now) / 1000);
        if (this.countEl.textContent !== String(n)) audio.sfx('click');
        this.countEl.textContent = n;
        this.countEl.classList.remove('hidden');
      } else {
        if (!s.live) {
          s.live = true;
          this.countEl.textContent = 'GO!';
          audio.sfx('levelup');
          setTimeout(() => this.countEl.classList.add('hidden'), 700);
        }
        this.timerEl.textContent = ` ⏱ ${Math.max(0, Math.ceil((s.endAt - now) / 1000))}s`;
      }
      this._raf = requestAnimationFrame(loop);
    };
    loop();
  }

  myScore() {
    return this.state?.scores?.[this.selfNid] || 0;
  }

  update(d) {
    const s = this.state;
    if (!s || s.id !== d.id) return;
    if (d.scores) s.scores = d.scores;
    if (d.hp) s.hp = d.hp;
    if (d.pos !== undefined) {
      s.pos = d.pos;
      s.order = d.order;
    }
    if (d.dist) s.dist = d.dist;
    if (d.note) this.noteEl.textContent = d.note;
    if (d.action) {
      const who = this.names[d.actor] || '';
      const txt = { hit: `💥 ${who} đấm trúng!`, block: `🛡️ Đòn bị đỡ`, dodge: `💨 Né thành công`, guard: `${who} thủ thế`, dodge_move: `${who} né người` }[d.result];
      if (txt) this.noteEl.textContent = txt;
      if (d.result === 'hit') audio.sfx(d.actor === this.selfNid ? 'rep' : 'error');
    }
    this.render();
  }

  render() {
    const s = this.state;
    if (!s || !this.bodyEl) return;
    const b = this.bodyEl;
    b.innerHTML = '';
    const me = this.selfNid;
    const others = s.participants.filter((x) => x.nid !== me);
    switch (s.kind) {
      case 'armWrestle': {
        const adv = s.order ? (s.order[0] === me ? s.pos : -s.pos) : 0;
        const pct = 50 + (adv / 40) * 50;
        b.append(
          h('div', { class: 'aw-names' }, h('b', {}, 'Bạn'), h('b', {}, others[0]?.name || '')),
          h('div', { class: 'aw-bar' }, h('div', { class: 'aw-fill', style: { width: `${Math.max(0, Math.min(100, pct))}%` } }), h('div', { class: 'aw-mid' }))
        );
        break;
      }
      case 'spar': {
        for (const p of s.participants) {
          const hp = s.hp[p.nid] ?? 100;
          b.append(h('div', { class: 'hp-row' }, h('b', {}, p.nid === me ? `Bạn` : p.name), h('div', { class: 'bar hp' }, h('div', { style: { width: `${hp}%` } })), h('span', {}, hp)));
        }
        break;
      }
      case 'race':
      case 'raceRow':
      case 'raceBike': {
        const icon = { race: '🏃', raceRow: '🚣', raceBike: '🚴' }[s.kind];
        for (const p of s.participants) {
          const d = s.dist[p.nid] || 0;
          b.append(
            h('div', { class: 'lane' }, h('span', { class: 'lane-name' }, p.nid === me ? 'Bạn' : p.name), h('div', { class: 'lane-track' }, h('div', { class: 'lane-runner', style: { left: `${(d / s.distance) * 100}%` } }, icon)), h('span', {}, `${d}m`))
          );
        }
        break;
      }
      default: {
        const rows = s.participants.map((p) => ({ p, v: s.scores[p.nid] || 0 })).sort((x, y) => y.v - x.v);
        b.append(h('div', { class: 'ch-big' }, String(this.myScore()), h('small', {}, s.kind === 'plank' ? ' giây' : ' rep')));
        b.append(h('div', { class: 'ch-scores' }, rows.map((r) => h('span', { class: r.p.nid === me ? 'me' : '' }, `${r.p.nid === me ? 'Bạn' : r.p.name}: ${r.v}`))));
      }
    }
  }

  end(d) {
    cancelAnimationFrame(this._raf);
    const s = this.state;
    this.state = null;
    if (d.kind === 'pair') return this.hide();
    this.el.innerHTML = '';
    this.el.classList.remove('hidden');
    const mine = d.results.find((r) => r.nid === this.selfNid);
    const title = d.tie ? '🤝 Hòa!' : mine?.win ? '🏆 CHIẾN THẮNG!' : '💪 Cố gắng lần sau!';
    if (mine?.win) audio.sfx('levelup');
    this.el.append(
      h('div', { class: 'ch-title' }, `${s?.icon || '⚔️'} ${d.label || ''} – ${title}`),
      h(
        'table',
        { class: 'lb' },
        h('tr', {}, h('th', {}, '#'), h('th', {}, 'Người chơi'), h('th', {}, 'Điểm'), h('th', {}, 'Thưởng')),
        d.results.map((r) => h('tr', { class: r.nid === this.selfNid ? 'me' : '' }, h('td', {}, r.rank), h('td', {}, r.name), h('td', {}, r.score < 0 ? 'Bỏ cuộc' : r.score), h('td', {}, `🪙${r.coins} ⭐${r.exp}`)))
      ),
      h('button', { class: 'btn', onclick: () => this.hide() }, 'Đóng')
    );
    setTimeout(() => !this.state && this.hide(), 9000);
  }

  cancel(reason) {
    cancelAnimationFrame(this._raf);
    this.state = null;
    this.el.innerHTML = '';
    this.el.append(h('div', { class: 'ch-title' }, `❌ ${reason || 'Đã hủy'}`));
    setTimeout(() => !this.state && this.hide(), 2500);
  }

  hide() {
    cancelAnimationFrame(this._raf);
    this.el.classList.add('hidden');
  }
}
