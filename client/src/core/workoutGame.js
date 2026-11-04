import { h } from '../ui/dom.js';
import { audio } from './audio.js';
import { isMobile } from './device.js';
import { GAMES, MACHINE_GAME, CANVAS, ActivityMeter, arrowOf } from './minigames.js';

/**
 * MINIGAME TẬP LUYỆN – người chơi tự thực hiện từng rep, nhân vật + máy chuyển động theo thao tác.
 * Phần lớn máy có trò riêng trong minigames.js (bảng MACHINE_GAME). File này giữ khung giao diện
 * và các trò gốc:
 *  - tempo   (máy tạ, ghế đẩy, squat, kéo xà...): GIỮ để đẩy lên, THẢ để hạ; bám theo "bóng mờ" nhịp chuẩn.
 *             Lên tới đỉnh rồi hạ về đáy = 1 rep. Có thanh sức bền: đẩy liên tục sẽ mỏi, nghỉ để hồi.
 *  - cadence (chạy bộ, đạp xe, chèo thuyền, dây kéo...): bấm XEN KẼ Trái/Phải để giữ tốc độ trong vùng mục tiêu
 *             (vùng đổi theo bài: khởi động → tăng tốc → nước rút).
 *  - rhythm  (lớp aerobic / yoga / spin): mũi tên rơi theo nhịp nhạc, bấm đúng phím khi chạm vạch.
 *  - balance (plank, giãn cơ, con lăn): giữ con trỏ đang chao đảo nằm trong vùng giữa bằng Trái/Phải.
 *  - combo   (bao cát, bóng tốc độ, đấm đích): bấm đúng chuỗi đòn J/K/L trong thời gian cho phép.
 *  - relax   (sauna, xông hơi, massage): thư giãn – hít thở theo vòng tròn (giữ khi phình, thả khi co).
 * Kết quả: số rep thực hiện + độ chuẩn (form 0..1) gửi server (server vẫn giới hạn theo thời gian thật).
 */
const CADENCE = new Set(['battle_rope']);
const BALANCE = new Set(['plank_mat', 'stretch_mat', 'pilates_teaser']);
const COMBO = new Set(['heavy_bag']);
const RELAX = new Set(['sauna_seat', 'steam_seat', 'massage_chair']);

export function gameTypeOf(eq) {
  const info = eq.info;
  if (!eq.slot && MACHINE_GAME[eq.type]) return MACHINE_GAME[eq.type].game;
  if (info.klass) return 'rhythm';
  if (eq.slot && info.key === 'holder') return 'relax';
  if (RELAX.has(eq.type)) return 'relax';
  if (COMBO.has(eq.type)) return 'combo';
  if (BALANCE.has(eq.type)) return 'balance';
  if (CADENCE.has(eq.type)) return 'cadence';
  return 'tempo';
}

const TITLE = {
  tempo: '🏋️ GIỮ để đẩy lên • THẢ để hạ – bám theo vạch mờ',
  cadence: '🏃 Bấm XEN KẼ Trái / Phải – giữ tốc độ trong vùng xanh',
  rhythm: '🎵 Bấm W A S D hoặc phím mũi tên đúng lúc chạm vạch theo nhạc',
  balance: '⚖️ Giữ con trỏ trong vùng giữa bằng Trái / Phải',
  combo: '🥊 Ra đòn theo chuỗi: J = Jab • K = Cross • L = Hook',
  relax: '😌 Hít vào (GIỮ) khi vòng tròn phình, thở ra (THẢ) khi co',
};
const KEYS_HELP = {
  tempo: 'SPACE / chuột giữ nút',
  cadence: 'A ↔ D hoặc ← ↔ →',
  rhythm: 'W A S D hoặc ← ↑ ↓ →',
  balance: 'A / D hoặc ← / →',
  combo: 'J  K  L',
  relax: 'SPACE',
};
const ARROWS = ['ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight'];
const ARROW_ICON = { ArrowLeft: '←', ArrowUp: '↑', ArrowDown: '↓', ArrowRight: '→' };
const PUNCH = { KeyJ: 'Jab', KeyK: 'Cross', KeyL: 'Hook' };

export class WorkoutGame {
  constructor(container) {
    this.container = container;
    this.active = false;
  }

  start(eq, { beatFn }) {
    this.eq = eq;
    this.type = gameTypeOf(eq);
    this.beatFn = beatFn;
    this.rep = eq.info.rep || 2;
    this.active = true;
    this.reps = 0;
    this.formSum = 0;
    this.formN = 0;
    this.p = 0;
    this.phase = 0;
    this.time = 0;
    this.holding = false;
    this.stamina = 1;
    this.feedback = '';
    this.fbTimer = 0;
    this.top = false;
    // cadence
    this.speed = 0;
    this.lastSide = null;
    this.steps = 0;
    this.zone = [0.3, 0.55];
    this.zoneTimer = 0;
    this.stage = 0;
    // rhythm
    this.notes = [];
    this.nextBeat = Math.ceil(beatFn()) + 2;
    this.combo = 0;
    // balance
    this.bx = 0;
    this.bv = 0;
    this.push = 0;
    this.inZone = 0;
    // combo
    this.seq = [];
    this.seqIdx = 0;
    this.seqTimer = 0;
    this.punchPulse = 0;
    // relax
    this.breath = 0;
    this.meter = new ActivityMeter();
    this.lastReps = 0;
    // Trò riêng của máy (nếu có)
    const Game = GAMES[this.type];
    this.impl = Game
      ? new Game({ rep: this.rep, beat: beatFn, sfx: (n) => audio.sfx(n), say: (t, c) => this.say(t, c) }, MACHINE_GAME[eq.type]?.opt || {})
      : null;
    this._buildUI();
    this._newCombo();
  }

  _buildUI() {
    this.container.innerHTML = '';
    const Game = GAMES[this.type];
    this.canvas = h('canvas', { width: Game ? CANVAS.W : 520, height: Game ? CANVAS.H : 80, class: 'mg-canvas' });
    this.titleEl = h('div', { class: 'mg-title' }, Game ? Game.title : TITLE[this.type]);
    this.fbEl = h('div', { class: 'mg-fb' }, '');
    const btns = h('div', { class: 'mg-btns' });
    const btn = (label, onDown, onUp, cls = '') => {
      const b = h('button', { class: `btn ${cls}`, type: 'button' }, label);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        onDown();
      });
      if (onUp) {
        b.addEventListener('pointerup', onUp);
        b.addEventListener('pointerleave', onUp);
      }
      return b;
    };
    if (Game) {
      for (const [label, code, hold] of Game.buttons) btns.append(btn(label, () => this.key(code, true), () => this.key(code, false), hold ? 'mg-hold' : ''));
      this._bindPointer();
    }
    switch (Game ? '' : this.type) {
      case 'tempo':
      case 'relax':
        btns.append(btn(this.type === 'relax' ? '😮‍💨 GIỮ ĐỂ HÍT VÀO' : '💪 GIỮ ĐỂ ĐẨY', () => this.key('Space', true), () => this.key('Space', false), 'mg-hold'));
        break;
      case 'cadence':
        btns.append(btn('◀ TRÁI', () => this.key('KeyA', true)), btn('PHẢI ▶', () => this.key('KeyD', true)));
        break;
      case 'balance':
        btns.append(btn('◀', () => this.key('KeyA', true), () => this.key('KeyA', false)), btn('▶', () => this.key('KeyD', true), () => this.key('KeyD', false)));
        break;
      case 'rhythm':
        for (const k of ARROWS) btns.append(btn(ARROW_ICON[k], () => this.key(k, true)));
        break;
      case 'combo':
        for (const k of Object.keys(PUNCH)) btns.append(btn(`${k.slice(3)} ${PUNCH[k]}`, () => this.key(k, true)));
        break;
      default:
        break;
    }
    if (!isMobile()) btns.classList.add('desktop');
    this.container.append(this.titleEl, this.canvas, h('div', { class: 'mg-row' }, this.fbEl, h('span', { class: 'mg-keys' }, `⌨️ ${Game ? Game.help : KEYS_HELP[this.type]}`)), btns);
  }

  // Chuột / cảm ứng trên khung trò chơi: quy đổi về toạ độ canvas
  _bindPointer() {
    const c = this.canvas;
    c.style.touchAction = 'none';
    const at = (e) => {
      const r = c.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height];
    };
    c.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      c.setPointerCapture?.(e.pointerId);
      this.meter.touch();
      this.impl?.pointer('down', ...at(e));
    });
    c.addEventListener('pointermove', (e) => {
      this.meter.touch();
      this.impl?.pointer('move', ...at(e));
    });
    const up = (e) => this.impl?.pointer('up', ...at(e));
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
  }

  stop() {
    this.active = false;
    this.container.innerHTML = '';
    if (this.impl) {
      const r = { reps: this.impl.reps, form: this.impl.form, active: this.meter.active };
      this.impl = null;
      return r;
    }
    return { active: this.meter.active, reps: this.reps, form: this.formN ? Math.max(0, Math.min(1, this.formSum / this.formN)) : 0 };
  }

  get activeSec() {
    return this.meter?.active || 0;
  }

  say(text, cls = '') {
    this.feedback = text;
    this.fbEl.textContent = text;
    this.fbEl.className = `mg-fb ${cls}`;
    this.fbTimer = 1.2;
  }

  // Rời tab khi đang giữ phím: trình duyệt không báo nhả phím nên phải tự nhả
  releaseKeys() {
    if (!this.active) return;
    for (const code of [...this.meter.held]) this.key(code, false);
  }

  // Phím / nút từ người chơi
  key(code, down) {
    if (!this.active) return;
    this.meter.key(code, down);
    if (this.impl) {
      this.impl.key(code, down);
      this.reps = this.impl.reps;
      return;
    }
    const t = this.type;
    if (t === 'tempo' || t === 'relax') {
      if (code === 'Space') this.holding = down;
      return;
    }
    if (t === 'balance') {
      if (code === 'KeyA' || code === 'ArrowLeft') this.push = down ? -1 : this.push === -1 ? 0 : this.push;
      if (code === 'KeyD' || code === 'ArrowRight') this.push = down ? 1 : this.push === 1 ? 0 : this.push;
      return;
    }
    if (!down) return;
    if (t === 'cadence') {
      const side = code === 'KeyA' || code === 'ArrowLeft' ? 'L' : code === 'KeyD' || code === 'ArrowRight' ? 'R' : null;
      if (!side) return;
      if (side === this.lastSide) {
        this.speed = Math.max(0, this.speed - 0.06);
        this.say('Xen kẽ trái/phải!', 'bad');
        return;
      }
      this.lastSide = side;
      this.speed = Math.min(1, this.speed + 0.085);
      this.steps++;
      if (this.steps % 2 === 0) {
        this.reps++;
        if (this.reps % 10 === 0) audio.sfx('rep');
      }
      return;
    }
    if (t === 'rhythm') {
      code = arrowOf(code);
      if (!ARROWS.includes(code)) return;
      const beat = this.beatFn();
      const note = this.notes.find((n) => !n.done && Math.abs(n.beat - beat) < 0.5);
      if (!note) return this.say('Sớm quá', 'bad');
      const err = Math.abs(note.beat - beat);
      note.done = true;
      if (note.key !== code) {
        this.combo = 0;
        this.formN++;
        return this.say('Sai phím ✗', 'bad');
      }
      const score = err < 0.12 ? 1 : err < 0.25 ? 0.6 : 0.25;
      this.formSum += score;
      this.formN++;
      this.reps++;
      this.combo++;
      audio.sfx('rep');
      this.say(score === 1 ? `PERFECT x${this.combo}` : score > 0.5 ? `GOOD x${this.combo}` : 'Trễ nhịp', score === 1 ? 'good' : score > 0.5 ? 'ok' : 'bad');
      return;
    }
    if (t === 'combo') {
      if (!PUNCH[code]) return;
      const want = this.seq[this.seqIdx];
      this.punchPulse = 1;
      this.lastPunch = code;
      if (code === want) {
        this.seqIdx++;
        this.reps++;
        this.formSum += 1;
        this.formN++;
        audio.sfx('rep');
        if (this.seqIdx >= this.seq.length) {
          this.say('COMBO HOÀN HẢO! 🔥', 'good');
          this._newCombo();
        }
      } else {
        this.formN++;
        this.say(`Sai đòn! Cần ${PUNCH[want]}`, 'bad');
        this.seqIdx = 0;
        this.seqTimer = 0;
      }
    }
  }

  _newCombo() {
    const n = 3 + Math.floor(Math.random() * 3);
    const keys = Object.keys(PUNCH);
    this.seq = Array.from({ length: n }, () => keys[Math.floor(Math.random() * keys.length)]);
    this.seqIdx = 0;
    this.seqTimer = 0;
  }

  // Bóng mờ nhịp chuẩn (tempo): lên 40% chu kỳ, giữ 10%, hạ 50%
  _guide(t) {
    const k = (t / this.rep) % 1;
    if (k < 0.4) return k / 0.4;
    if (k < 0.5) return 1;
    return 1 - (k - 0.5) / 0.5;
  }

  /**
   * Cập nhật mỗi frame. Trả về trạng thái cho animation nhân vật + bộ phận máy.
   */
  update(dt) {
    if (!this.active) return {};
    this.time += dt;
    // Có rep mới cũng là đang tập (trò giữ yên, trò không cần bấm liên tục)
    if (this.reps !== this.lastReps) {
      this.lastReps = this.reps;
      this.meter.touch();
    }
    this.meter.update(dt);
    this.fbTimer -= dt;
    if (this.fbTimer <= 0 && this.feedback) {
      this.feedback = '';
      this.fbEl.textContent = '';
    }
    if (this.impl) {
      const res = this.impl.update(dt) || {};
      this.reps = this.impl.reps;
      const g = this.canvas.getContext('2d');
      g.clearRect(0, 0, CANVAS.W, CANVAS.H);
      g.fillStyle = 'rgba(2,6,23,0.55)';
      g.fillRect(0, 0, CANVAS.W, CANVAS.H);
      this.impl.draw(g, CANVAS.W, CANVAS.H);
      return res;
    }
    const R = this.rep;
    let out = {};
    switch (this.type) {
      case 'tempo': {
        const liftSpeed = (1 / (R * 0.4)) * (0.35 + this.stamina * 0.75);
        const lowerSpeed = 1 / (R * 0.5);
        if (this.holding) {
          this.p = Math.min(1, this.p + liftSpeed * dt);
          this.stamina = Math.max(0, this.stamina - dt * 0.045);
        } else {
          this.p = Math.max(0, this.p - lowerSpeed * dt);
          if (this.p < 0.05) this.stamina = Math.min(1, this.stamina + dt * 0.12);
        }
        const guide = this._guide(this.time);
        const err = Math.abs(this.p - guide);
        this.formSum += Math.max(0, 1 - err * 2) * dt;
        this.formN += dt;
        if (this.p >= 0.97 && !this.top) {
          this.top = true;
          this.say('Đỉnh! Hạ xuống từ từ', 'ok');
        }
        if (this.top && this.p <= 0.05) {
          this.top = false;
          this.reps++;
          audio.sfx('rep');
          this.say(err < 0.25 ? `Rep ${this.reps} chuẩn ✔` : `Rep ${this.reps}`, err < 0.25 ? 'good' : 'ok');
        }
        if (this.stamina < 0.15 && this.holding) this.say('Mỏi cơ! Nghỉ chút để hồi sức', 'bad');
        out = { p: this.p, phase: this.p * 0.5 };
        break;
      }
      case 'cadence': {
        this.speed = Math.max(0, this.speed - dt * 0.16);
        this.zoneTimer += dt;
        if (this.zoneTimer > 15) {
          this.zoneTimer = 0;
          this.stage = (this.stage + 1) % 3;
          this.zone = [
            [0.3, 0.55],
            [0.5, 0.75],
            [0.7, 0.95],
          ][this.stage];
          this.say(['🔄 Khởi động', '⚡ Tăng tốc!', '🔥 NƯỚC RÚT!'][this.stage], 'ok');
          audio.sfx('click');
        }
        const inZ = this.speed >= this.zone[0] && this.speed <= this.zone[1];
        this.formSum += (inZ ? 1 : 0.2) * dt;
        this.formN += dt;
        this.phase = (this.phase + dt * (0.2 + this.speed * 1.6) / R) % 1;
        out = { phase: this.phase, timeScale: 0.15 + this.speed * 1.3 };
        break;
      }
      case 'rhythm': {
        const beat = this.beatFn();
        const every = this.eq.info.klass === 'yoga' ? 2 : 1;
        while (this.nextBeat < beat + 3) {
          this.notes.push({ beat: this.nextBeat, key: ARROWS[Math.floor(Math.random() * 4)], done: false });
          this.nextBeat += every;
        }
        for (const n of this.notes) {
          if (!n.done && beat - n.beat > 0.5) {
            n.done = true;
            n.miss = true;
            this.formN++;
            this.combo = 0;
            this.say('Lỡ nhịp', 'bad');
          }
        }
        this.notes = this.notes.filter((n) => beat - n.beat < 1);
        out = {};
        break;
      }
      case 'balance': {
        // Lực chao đảo ngẫu nhiên + lực đẩy của người chơi
        const t = this.time;
        const wobble = Math.sin(t * 1.3) * 0.9 + Math.sin(t * 2.7 + 1) * 0.6 + Math.sin(t * 0.6 + 2) * 0.5;
        this.bv += (wobble * 0.9 + this.push * 2.2 - this.bv * 1.2) * dt;
        this.bx = Math.max(-1, Math.min(1, this.bx + this.bv * dt));
        const inZ = Math.abs(this.bx) < 0.3;
        this.formSum += (inZ ? 1 : 0) * dt;
        this.formN += dt;
        if (inZ) {
          this.inZone += dt;
          if (this.inZone >= R) {
            this.inZone = 0;
            this.reps++;
            audio.sfx('rep');
            this.say(`Giữ vững! +1 (${this.reps})`, 'good');
          }
        } else if (Math.abs(this.bx) > 0.85) this.say('Sắp mất thăng bằng!', 'bad');
        out = { phase: (this.time / R) % 1, wobble: this.bx };
        break;
      }
      case 'combo': {
        this.seqTimer += dt;
        if (this.seqTimer > 1.2 + this.seq.length * 0.7) {
          this.say('Hết giờ! Combo mới', 'bad');
          this.formN++;
          this._newCombo();
        }
        this.punchPulse = Math.max(0, this.punchPulse - dt * 4);
        // phase: jab tay trái (0..0.5), cross/hook tay phải (0.5..1)
        const left = this.lastPunch === 'KeyJ';
        out = { phase: left ? 0.25 * this.punchPulse : 0.5 + 0.25 * this.punchPulse, p: this.punchPulse };
        break;
      }
      case 'relax': {
        // Vòng thở: 4s hít vào – 4s thở ra
        const k = (this.time % 8) / 8;
        const target = k < 0.5;
        this.breath = k < 0.5 ? k * 2 : (1 - k) * 2;
        const good = this.holding === target;
        this.formSum += (good ? 1 : 0.3) * dt;
        this.formN += dt;
        this.inZone += dt;
        if (this.inZone >= R) {
          this.inZone = 0;
          this.reps++;
        }
        out = {};
        break;
      }
      default:
        break;
    }
    this._draw();
    return out;
  }

  // ---------- Vẽ giao diện minigame ----------
  _draw() {
    const c = this.canvas;
    const g = c.getContext('2d');
    const W = c.width;
    const H = c.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(2,6,23,0.55)';
    g.fillRect(0, 0, W, H);
    g.font = '700 19px "Be Vietnam Pro", sans-serif';
    g.textBaseline = 'middle';
    const t = this.type;
    if (t === 'tempo') {
      // Thanh dọc lực đẩy: vạch mờ = nhịp chuẩn, khối sáng = của bạn
      const x = 24;
      const top = 8;
      const bh = H - 16;
      g.fillStyle = 'rgba(148,163,184,0.25)';
      g.fillRect(x, top, 34, bh);
      const guide = this._guide(this.time);
      g.fillStyle = 'rgba(163,230,53,0.35)';
      g.fillRect(x - 6, top + (1 - guide) * bh - 6, 46, 12);
      const grd = g.createLinearGradient(0, top + bh, 0, top);
      grd.addColorStop(0, '#22d3ee');
      grd.addColorStop(1, '#f472b6');
      g.fillStyle = grd;
      g.fillRect(x, top + (1 - this.p) * bh, 34, this.p * bh);
      g.fillStyle = '#fff';
      g.fillRect(x - 4, top + (1 - this.p) * bh - 2, 42, 4);
      g.fillStyle = '#e2e8f0';
      g.fillText(`REP ${this.reps}`, 84, 20);
      g.fillText(`Sức bền`, 84, 44);
      g.fillStyle = 'rgba(148,163,184,0.25)';
      g.fillRect(170, 38, 200, 12);
      g.fillStyle = this.stamina > 0.3 ? '#a3e635' : '#f87171';
      g.fillRect(170, 38, 200 * this.stamina, 12);
      g.fillStyle = '#94a3b8';
      g.fillText(`Độ chuẩn ${Math.round((this.formN ? this.formSum / this.formN : 0) * 100)}%`, 84, 66);
    } else if (t === 'cadence') {
      const x0 = 20;
      const w = W - 40;
      g.fillStyle = 'rgba(148,163,184,0.25)';
      g.fillRect(x0, 28, w, 22);
      g.fillStyle = 'rgba(163,230,53,0.45)';
      g.fillRect(x0 + this.zone[0] * w, 28, (this.zone[1] - this.zone[0]) * w, 22);
      g.fillStyle = '#22d3ee';
      g.fillRect(x0, 34, this.speed * w, 10);
      g.fillStyle = '#fff';
      g.fillRect(x0 + this.speed * w - 2, 24, 4, 30);
      g.fillStyle = '#e2e8f0';
      g.fillText(`Tốc độ ${Math.round(this.speed * 100)}%   •   ${this.reps} nhịp   •   ${['Khởi động', 'Tăng tốc', 'Nước rút'][this.stage]} (${Math.ceil(15 - this.zoneTimer)}s)`, x0, 13);
      g.fillStyle = '#94a3b8';
      g.fillText(`Bước tiếp theo: ${this.lastSide === 'L' ? 'PHẢI ▶' : '◀ TRÁI'}`, x0, 67);
    } else if (t === 'rhythm') {
      const beat = this.beatFn();
      const hitX = 60;
      g.strokeStyle = '#f472b6';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(hitX, 10);
      g.lineTo(hitX, H - 10);
      g.stroke();
      g.font = '800 30px sans-serif';
      g.textAlign = 'center';
      for (const n of this.notes) {
        const x = hitX + (n.beat - beat) * 110;
        if (x < -20 || x > W + 20) continue;
        g.fillStyle = n.done ? (n.miss ? 'rgba(248,113,113,0.4)' : 'rgba(163,230,53,0.4)') : '#facc15';
        g.fillText(ARROW_ICON[n.key], x, H / 2);
      }
      g.textAlign = 'left';
      g.font = '700 19px "Be Vietnam Pro", sans-serif';
      g.fillStyle = '#e2e8f0';
      g.fillText(`Combo ${this.combo}  •  ${this.reps} nhịp đúng`, W - 230, 14);
    } else if (t === 'balance') {
      const cx = W / 2;
      const w = W - 60;
      g.fillStyle = 'rgba(148,163,184,0.25)';
      g.fillRect(30, 34, w, 20);
      g.fillStyle = 'rgba(163,230,53,0.45)';
      g.fillRect(cx - 0.3 * (w / 2), 34, 0.6 * (w / 2), 20);
      g.fillStyle = Math.abs(this.bx) < 0.3 ? '#a3e635' : '#f87171';
      g.beginPath();
      g.arc(cx + this.bx * (w / 2), 44, 10, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#e2e8f0';
      g.fillText(`Giữ thăng bằng: ${this.reps} lần  •  ${Math.round((this.inZone / this.rep) * 100)}%`, 30, 15);
    } else if (t === 'combo') {
      g.font = '800 26px sans-serif';
      this.seq.forEach((k, i) => {
        const x = 30 + i * 66;
        g.fillStyle = i < this.seqIdx ? 'rgba(163,230,53,0.35)' : i === this.seqIdx ? '#facc15' : 'rgba(148,163,184,0.4)';
        g.fillRect(x, 20, 56, 46);
        g.fillStyle = '#0b0f1a';
        g.textAlign = 'center';
        g.fillText(k.slice(3), x + 28, 44);
      });
      g.textAlign = 'left';
      g.font = '700 18px "Be Vietnam Pro", sans-serif';
      g.fillStyle = '#e2e8f0';
      g.fillText(`Đòn trúng: ${this.reps}`, W - 150, 44);
      const limit = 1.2 + this.seq.length * 0.7;
      g.fillStyle = 'rgba(248,113,113,0.6)';
      g.fillRect(30, 6, (1 - this.seqTimer / limit) * (W - 60), 6);
    } else if (t === 'relax') {
      const r = 12 + this.breath * 24;
      g.fillStyle = this.holding === (this.time % 8 < 4) ? 'rgba(163,230,53,0.5)' : 'rgba(248,113,113,0.4)';
      g.beginPath();
      g.arc(W / 2, H / 2, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#e2e8f0';
      g.textAlign = 'center';
      g.fillText(this.time % 8 < 4 ? 'HÍT VÀO' : 'THỞ RA', W / 2, H / 2);
      g.textAlign = 'left';
    }
  }
}
