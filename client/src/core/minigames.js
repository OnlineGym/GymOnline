/**
 * Thư viện minigame theo từng loại máy. Mỗi trò mô phỏng đúng cảm giác động tác:
 * kéo cáp thì kéo chuột, tập tay thì click vòng tròn, chạy bộ thì nhảy rào...
 * File này không phụ thuộc DOM (test tự động cho bot chơi được).
 *
 * Mỗi trò: key(code, down), pointer(kind, x, y), update(dt) -> { p, phase, timeScale }, draw(g, W, H)
 * Kết quả chung: reps (số lần làm được), form = formSum / formN (độ chuẩn 0..1).
 */
export const CANVAS = { W: 560, H: 120 };

/**
 * Đo thời gian người chơi thực sự thao tác. Mỗi lần bấm, rê chuột hoặc có rep mới sẽ tính thêm 1 khoảng ngắn;
 * giữ phím chỉ được tính tối đa HOLD_MAX giây để không thể đè phím rồi bỏ đi.
 */
const ACTIVE_WINDOW = 1.5;
const HOLD_MAX = 8;
export class ActivityMeter {
  constructor() {
    this.active = 0;
    this.left = 0;
    this.holdLeft = 0;
    this.held = new Set();
  }

  touch() {
    this.left = ACTIVE_WINDOW;
  }

  key(code, down) {
    if (down) {
      if (!this.held.has(code)) this.holdLeft = HOLD_MAX;
      this.held.add(code);
      this.touch();
    } else this.held.delete(code);
  }

  update(dt) {
    if (this.held.size && this.holdLeft > 0) {
      this.holdLeft -= dt;
      this.touch();
    }
    if (this.left > 0) {
      this.left -= dt;
      this.active += dt;
    }
  }
}

// Trò kiểu nhảy theo nhịp: W A S D dùng thay được cho phím mũi tên
const WASD = { KeyW: 'ArrowUp', KeyA: 'ArrowLeft', KeyS: 'ArrowDown', KeyD: 'ArrowRight' };
export const arrowOf = (code) => WASD[code] || code;
const { W: CW, H: CH } = CANVAS;

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const C = { bg: 'rgba(148,163,184,0.22)', zone: 'rgba(163,230,53,0.5)', hot: '#f472b6', cyan: '#22d3ee', lime: '#a3e635', red: '#f87171', yellow: '#facc15', text: '#e2e8f0', muted: '#94a3b8', white: '#ffffff' };
const FONT = '700 18px "Be Vietnam Pro", sans-serif';
const FONT_BIG = '800 26px "Be Vietnam Pro", sans-serif';

const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const UP = new Set(['KeyW', 'ArrowUp']);
const DOWN = new Set(['KeyS', 'ArrowDown']);
const HIT = new Set(['Space']);

const ARROWS = ['ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight'];
const ARROW_ICON = { ArrowLeft: '←', ArrowUp: '↑', ArrowDown: '↓', ArrowRight: '→' };
const OPPOSITE = { ArrowLeft: 'ArrowRight', ArrowRight: 'ArrowLeft', ArrowUp: 'ArrowDown', ArrowDown: 'ArrowUp' };

function text(g, s, x, y, { color = C.text, font = FONT, align = 'left' } = {}) {
  g.fillStyle = color;
  g.font = font;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillText(s, x, y);
  g.textAlign = 'left';
}
function rect(g, x, y, w, h, color) {
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
}
function circle(g, x, y, r, color) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}
function ring(g, x, y, r, color, width = 3) {
  g.strokeStyle = color;
  g.lineWidth = width;
  g.beginPath();
  g.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2);
  g.stroke();
}

class Base {
  constructor(ctx, opt = {}) {
    this.ctx = ctx;
    this.opt = opt;
    this.rep = ctx.rep || 2;
    this.reps = 0;
    this.formSum = 0;
    this.formN = 0;
    this.time = 0;
    this.p = 0;
    this.phase = 0;
  }

  score(v) {
    this.formSum += v;
    this.formN += 1;
  }

  // Điểm tính theo thời gian cho các trò giữ liên tục
  scoreFor(v, dt) {
    this.formSum += v * dt;
    this.formN += dt;
  }

  addRep(n = 1) {
    this.reps += n;
    this.ctx.sfx('rep');
  }

  get form() {
    return this.formN ? clamp(this.formSum / this.formN) : 0;
  }

  say(t, cls) {
    this.ctx.say(t, cls);
  }

  key() {}

  pointer() {}

  update() {
    return {};
  }

  draw() {}

  // Hoạt ảnh động tác tạ: lên rồi xuống theo p
  lift(dt, target, speed = 6) {
    this.p += (target - this.p) * (1 - Math.exp(-dt * speed));
    return { p: this.p, phase: this.p * 0.5 };
  }

  // Hoạt ảnh động tác lặp (đạp, chạy): phase quay theo tốc độ
  cycle(dt, speed) {
    this.phase = (this.phase + (dt * (0.2 + speed * 1.6)) / this.rep) % 1;
    return { phase: this.phase, timeScale: 0.15 + speed * 1.3 };
  }

  drawHud(g, W) {
    text(g, `${this.reps} lần • Chuẩn ${Math.round(this.form * 100)}%`, W - 10, 13, { align: 'right', color: C.muted });
  }
}

// ========== Vũ điệu: nhập chuỗi mũi tên rồi bấm SPACE đúng nhịp cuối ô nhịp ==========
class SeqDance extends Base {
  static title = '💃 Nhập ĐÚNG chuỗi mũi tên (W A S D hoặc phím mũi tên), rồi bấm SPACE khi vạch chạy tới cuối ô nhịp';
  static help = 'W A S D hoặc ← ↑ ↓ →, rồi SPACE';
  static buttons = [['←', 'ArrowLeft'], ['↑', 'ArrowUp'], ['↓', 'ArrowDown'], ['→', 'ArrowRight'], ['NHỊP', 'Space']];

  constructor(ctx, opt) {
    super(ctx, opt);
    this.level = 3;
    this.combo = 0;
    this.newSeq();
  }

  newSeq() {
    const beat = this.ctx.beat();
    this.bar = Math.ceil((beat + 2) / 4) * 4; // chốt ở cuối ô nhịp, luôn đủ ít nhất 2 nhịp để nhập
    // Từ cấp 5: có mũi tên cam phải bấm NGƯỢC hướng
    this.seq = Array.from({ length: this.level }, () => ({ key: pick(ARROWS), rev: this.level >= 5 && Math.random() < 0.22 }));
    this.idx = 0;
  }

  key(rawCode, down) {
    if (!down) return;
    const code = arrowOf(rawCode);
    if (ARROWS.includes(code)) {
      const n = this.seq[this.idx];
      if (!n) return;
      if (code === (n.rev ? OPPOSITE[n.key] : n.key)) {
        this.idx++;
        this.ctx.sfx('click');
      } else {
        this.idx = 0;
        this.say('Sai mũi tên, nhập lại!', 'bad');
      }
      return;
    }
    if (!HIT.has(code)) return;
    const d = this.bar - this.ctx.beat();
    if (d > 0.6) return this.say('Sớm quá, chờ vạch tới cuối', 'bad');
    const dist = Math.abs(d);
    if (this.idx < this.seq.length) return this.judge(0, 'Chưa nhập xong chuỗi!');
    if (dist < 0.13) return this.judge(1, 'PERFECT');
    if (dist < 0.28) return this.judge(0.8, 'GREAT');
    return this.judge(0.5, 'COOL');
  }

  judge(v, label) {
    this.score(v);
    if (v > 0) {
      this.combo++;
      this.addRep(this.seq.length);
      this.say(`${label}${this.combo > 1 ? ` x${this.combo}` : ''}`, v === 1 ? 'good' : 'ok');
      if (this.combo % 2 === 0) this.level = Math.min(8, this.level + 1);
    } else {
      this.combo = 0;
      this.level = Math.max(3, this.level - 1);
      this.say(label, 'bad');
    }
    this.newSeq();
  }

  update() {
    if (this.ctx.beat() - this.bar > 0.6) this.judge(0, 'Lỡ nhịp!');
    return {};
  }

  draw(g, W, H) {
    const n = this.seq.length;
    const box = Math.min(46, (W - 40) / n - 6);
    const x0 = (W - n * (box + 6)) / 2;
    this.seq.forEach((a, i) => {
      const x = x0 + i * (box + 6);
      rect(g, x, 26, box, box, i < this.idx ? 'rgba(163,230,53,0.55)' : a.rev ? 'rgba(249,115,22,0.85)' : 'rgba(148,163,184,0.3)');
      text(g, ARROW_ICON[a.key], x + box / 2, 26 + box / 2, { font: FONT_BIG, align: 'center', color: i < this.idx ? '#0b0f1a' : C.white });
    });
    text(g, `Cấp ${this.level} • Combo ${this.combo}`, 10, 13);
    this.drawHud(g, W);
    const y = H - 22;
    rect(g, 20, y, W - 40, 12, C.bg);
    rect(g, W - 20 - (W - 40) * 0.07, y - 3, (W - 40) * 0.07, 18, C.zone);
    const k = clamp(1 - (this.bar - this.ctx.beat()) / 4);
    rect(g, 20 + k * (W - 40) - 3, y - 5, 6, 22, this.idx >= n ? C.yellow : C.white);
  }
}

// ========== Nâng tạ: kim quét, bấm đúng vùng xanh 3 lần để đẩy đòn lên hết tầm ==========
class SweetSpot extends Base {
  static title = '🏋️ Kim quét qua lại: bấm SPACE / click đúng vùng xanh 3 lần để đẩy tạ lên';
  static help = 'SPACE hoặc click';
  static buttons = [['💪 ĐẨY', 'Space']];

  constructor(ctx, opt) {
    super(ctx, opt);
    this.stage = 0;
    this.t = 0;
    this.lock = 0;
    this.width = 0.3;
    this.center = 0.5;
  }

  get needle() {
    return 0.5 + 0.5 * Math.sin(this.t);
  }

  hit() {
    if (this.lock > 0) return;
    const d = Math.abs(this.needle - this.center);
    if (d <= this.width / 2) {
      const perfect = d < this.width * 0.15;
      this.score(perfect ? 1 : 0.8);
      this.stage++;
      this.ctx.sfx('click');
      this.say(perfect ? 'Đẩy cực chuẩn!' : 'Lên!', perfect ? 'good' : 'ok');
      this.center = rand(0.28, 0.72);
      if (this.stage >= 3) {
        this.stage = 0;
        this.addRep();
        this.lock = 0.55; // hạ tạ
        this.width = Math.max(0.14, 0.3 - this.reps * 0.008);
      }
    } else {
      this.score(0);
      this.stage = Math.max(0, this.stage - 1);
      this.lock = 0.5;
      this.say('Trượt nhịp, tạ tụt xuống!', 'bad');
    }
  }

  key(code, down) {
    if (down && HIT.has(code)) this.hit();
  }

  pointer(kind) {
    if (kind === 'down') this.hit();
  }

  update(dt) {
    this.lock = Math.max(0, this.lock - dt);
    this.t += dt * (2.6 + Math.min(this.reps, 12) * 0.14);
    return this.lift(dt, this.lock > 0.05 && this.stage === 0 ? 0 : this.stage / 3 + (this.stage ? 0.02 : 0));
  }

  draw(g, W, H) {
    const x = 20;
    const w = W - 40;
    const y = 52;
    rect(g, x, y, w, 26, C.bg);
    rect(g, x + (this.center - this.width / 2) * w, y, this.width * w, 26, C.zone);
    rect(g, x + (this.center - this.width * 0.15) * w, y, this.width * 0.3 * w, 26, 'rgba(163,230,53,0.9)');
    rect(g, x + this.needle * w - 3, y - 7, 6, 40, this.lock > 0 ? C.red : C.white);
    for (let i = 0; i < 3; i++) circle(g, W / 2 - 34 + i * 34, H - 20, 11, i < this.stage ? C.lime : C.bg);
    text(g, 'Lực đẩy', 10, 13);
    this.drawHud(g, W);
  }
}

// ========== Kéo cáp: kéo chuột thật (hoặc giữ nút) tới vùng đích, giữ lại rồi thả ==========
class DragPull extends Base {
  static title = '🪢 KÉO tay cầm bằng chuột (hoặc giữ SPACE) vào vùng đích, GIỮ 1 nhịp rồi thả về';
  static help = 'Kéo chuột hoặc giữ SPACE';
  static buttons = [['🪢 GIỮ ĐỂ KÉO', 'Space', true]];

  constructor(ctx, opt) {
    super(ctx, opt);
    this.x = 0;
    this.pulling = false;
    this.dragging = false;
    this.mouseX = 0;
    this.hold = 0;
    this.done = false;
    this.zone = 0.7;
    this.prevX = 0;
    this.strain = 0;
  }

  key(code, down) {
    if (HIT.has(code)) this.pulling = down;
  }

  pointer(kind, x) {
    const k = clamp((x - 20) / (CW - 40));
    if (kind === 'down' && Math.abs(k - this.x) < 0.14) {
      this.dragging = true;
      this.mouseX = k;
    } else if (kind === 'move' && this.dragging) this.mouseX = k;
    else if (kind === 'up') this.dragging = false;
  }

  update(dt) {
    if (this.dragging) this.x += (this.mouseX - this.x) * (1 - Math.exp(-dt * 18));
    else if (this.pulling) this.x = Math.min(1, this.x + dt * 0.75);
    else this.x = Math.max(0, this.x - dt * 1.05); // cáp kéo ngược lại
    const inZone = !this.done && Math.abs(this.x - this.zone) < 0.075;
    if (inZone) {
      this.hold += dt;
      this.scoreFor(1, dt);
      if (this.hold >= 0.4) {
        this.done = true;
        this.hold = 0;
        this.addRep();
        this.say(`Chuẩn! Thả về từ từ (${this.reps})`, 'good');
      }
    } else if (!this.done && this.x > this.zone + 0.075) {
      this.hold = 0;
      this.scoreFor(0, dt);
      this.strain += dt;
      if (this.strain > 0.2) this.say('Kéo quá đà, lùi lại!', 'bad');
    } else {
      this.hold = Math.max(0, this.hold - dt);
      this.strain = 0;
    }
    if (this.done && this.x < 0.1) {
      this.done = false;
      this.zone = rand(0.45, 0.88);
    }
    return { p: this.x, phase: this.x * 0.5 };
  }

  draw(g, W) {
    const x = 20;
    const w = W - 40;
    const y = 66;
    rect(g, x, y, w, 8, C.bg);
    if (!this.done) rect(g, x + (this.zone - 0.075) * w, y - 18, 0.15 * w, 44, C.zone);
    else text(g, 'Thả về đầu ray ◀', W / 2, 36, { align: 'center', color: C.yellow });
    rect(g, x, y + 2, this.x * w, 4, C.cyan);
    circle(g, x + this.x * w, y + 4, 15, this.dragging || this.pulling ? C.yellow : C.cyan);
    circle(g, x + this.x * w, y + 4, 6, '#0b0f1a');
    if (this.hold > 0) rect(g, x + (this.zone - 0.075) * w, y + 30, (this.hold / 0.4) * 0.15 * w, 6, C.lime);
    text(g, 'Kéo tay cầm', 10, 13);
    this.drawHud(g, W);
  }
}

// ========== Click vòng tròn: vòng ngoài co lại, click đúng lúc khớp vòng trong ==========
class TargetClick extends Base {
  static title = '🎯 Click vào vòng tròn đúng lúc vòng ngoài co khít (hoặc bấm SPACE)';
  static help = 'Click chuột hoặc SPACE';
  static buttons = [['👆 BẤM', 'Space']];

  constructor(ctx, opt) {
    super(ctx, opt);
    this.life = opt.life || 1.15;
    this.target = null;
    this.wait = 0.3;
    this.flash = 0;
    this.combo = 0;
  }

  spawn() {
    this.target = { x: rand(60, CW - 60), y: rand(50, CH - 30), t: 0, life: Math.max(0.6, this.life - this.reps * 0.008) };
  }

  judge() {
    const tg = this.target;
    if (!tg) return;
    const k = tg.t / tg.life; // 1 = vòng khít
    const err = Math.abs(1 - k);
    let v = 0;
    if (err < 0.1) v = 1;
    else if (err < 0.24) v = 0.7;
    else if (err < 0.42) v = 0.4;
    this.score(v);
    this.target = null;
    this.wait = 0.22;
    if (v) {
      this.combo++;
      this.addRep();
      this.flash = 1;
      this.say(v === 1 ? `Hoàn hảo x${this.combo}` : v > 0.5 ? 'Tốt' : 'Tạm được', v === 1 ? 'good' : 'ok');
    } else {
      this.combo = 0;
      this.say(k < 1 ? 'Sớm quá!' : 'Trễ rồi!', 'bad');
    }
  }

  key(code, down) {
    if (down && HIT.has(code)) this.judge();
  }

  pointer(kind, x, y) {
    if (kind !== 'down' || !this.target) return;
    if (Math.hypot(x - this.target.x, y - this.target.y) < 44) this.judge();
  }

  update(dt) {
    this.flash = Math.max(0, this.flash - dt * 3);
    if (this.target) {
      this.target.t += dt;
      if (this.target.t > this.target.life * 1.42) {
        this.score(0);
        this.combo = 0;
        this.target = null;
        this.wait = 0.25;
        this.say('Lỡ mất rồi', 'bad');
      }
    } else {
      this.wait -= dt;
      if (this.wait <= 0) this.spawn();
    }
    return { p: this.flash, phase: this.flash * 0.5 };
  }

  draw(g, W) {
    if (this.target) {
      const tg = this.target;
      const k = tg.t / tg.life;
      circle(g, tg.x, tg.y, 19, 'rgba(34,211,238,0.35)');
      ring(g, tg.x, tg.y, 19, C.cyan, 3);
      ring(g, tg.x, tg.y, 19 + (1 - k) * 34, k > 1 ? C.red : C.hot, 3);
      text(g, '💪', tg.x, tg.y, { align: 'center' });
    }
    text(g, `Combo ${this.combo}`, 10, 13);
    this.drawHud(g, W);
  }
}

// ========== Cân 2 bên: giữ A và D để 2 thanh cùng nằm trong vùng, tay phải yếu hơn ==========
class Symmetry extends Base {
  static title = '⚖️ Giữ A và D để nâng 2 bên: giữ CẢ HAI thanh cùng nằm trong vùng xanh';
  static help = 'Giữ A + D (hoặc ← →)';
  static buttons = [['◀ TRÁI', 'KeyA', true], ['PHẢI ▶', 'KeyD', true]];

  constructor(ctx, opt) {
    super(ctx, opt);
    this.l = 0;
    this.r = 0;
    this.hL = false;
    this.hR = false;
    this.band = 0.55;
    this.prog = 0;
    this.weakL = rand(0.8, 1.1);
    this.weakR = rand(0.8, 1.1);
    this.switchAt = 5;
  }

  key(code, down) {
    if (LEFT.has(code)) this.hL = down;
    if (RIGHT.has(code)) this.hR = down;
  }

  update(dt) {
    this.band = 0.55 + Math.sin(this.time * 0.5) * 0.22;
    this.time += dt;
    if (this.time > this.switchAt) {
      // Đổi bên yếu theo thời gian: phải tự điều chỉnh, không giữ chết tay được
      this.switchAt = this.time + 5;
      this.weakL = rand(0.8, 1.2);
      this.weakR = rand(0.8, 1.2);
    }
    this.l = clamp(this.l + (this.hL ? 0.85 * this.weakL : -0.55) * dt);
    this.r = clamp(this.r + (this.hR ? 0.85 * this.weakR : -0.55) * dt);
    const inL = Math.abs(this.l - this.band) < 0.1;
    const inR = Math.abs(this.r - this.band) < 0.1;
    this.scoreFor(inL && inR ? 1 : inL || inR ? 0.35 : 0, dt);
    if (inL && inR) {
      this.prog += dt;
      if (this.prog >= Math.max(1, this.rep * 0.8)) {
        this.prog = 0;
        this.addRep();
        this.say(`Cân đều 2 bên! (${this.reps})`, 'good');
      }
    } else if (Math.abs(this.l - this.r) > 0.3) this.say('Lệch 2 bên rồi!', 'bad');
    return this.lift(dt, (this.l + this.r) / 2, 10);
  }

  draw(g, W, H) {
    const top = 24;
    const h = H - 34;
    const bar = (x, v, label) => {
      rect(g, x, top, 56, h, C.bg);
      rect(g, x - 8, top + (1 - this.band - 0.1) * h, 72, 0.2 * h, C.zone);
      rect(g, x, top + (1 - v) * h, 56, v * h, C.cyan);
      rect(g, x - 4, top + (1 - v) * h - 2, 64, 4, C.white);
      text(g, label, x + 28, top + h / 2, { align: 'center', color: '#0b0f1a', font: FONT_BIG });
    };
    bar(W / 2 - 120, this.l, 'A');
    bar(W / 2 + 64, this.r, 'D');
    rect(g, W / 2 - 30, H / 2, 60, 8, C.bg);
    rect(g, W / 2 - 30, H / 2, 60 * clamp(this.prog / Math.max(1, this.rep * 0.8)), 8, C.lime);
    text(g, 'Cân bằng', 10, 13);
    this.drawHud(g, W);
  }
}

// ========== Bơm áp lực: nhấp SPACE giữ kim trong vùng xanh đang trôi ==========
class Pump extends Base {
  static title = '🦵 Nhấp SPACE liên tục để bơm lực: giữ kim trong vùng xanh, quá tay là tụt';
  static help = 'Nhấp SPACE';
  static buttons = [['🦵 ĐẠP', 'Space']];

  constructor(ctx, opt) {
    super(ctx, opt);
    this.v = 0;
    this.prog = 0;
    this.over = 0;
  }

  get band() {
    return 0.55 + Math.sin(this.time * 0.65) * 0.2;
  }

  key(code, down) {
    if (!down || !HIT.has(code) || this.over > 0) return;
    this.v += 0.125;
    if (this.v > 1) {
      this.v = 0.35;
      this.over = 0.9;
      this.prog = 0;
      this.score(0);
      this.say('Quá tải! Chờ chút', 'bad');
    }
  }

  update(dt) {
    this.time += dt;
    this.over = Math.max(0, this.over - dt);
    this.v = Math.max(0, this.v - dt * 0.42);
    const inZ = Math.abs(this.v - this.band) < 0.11;
    this.scoreFor(inZ ? 1 : 0.15, dt);
    if (inZ) {
      this.prog += dt;
      if (this.prog >= Math.max(1, this.rep * 0.7)) {
        this.prog = 0;
        this.addRep();
        this.say(`Đẩy đều! (${this.reps})`, 'good');
      }
    }
    return this.lift(dt, this.v, 12);
  }

  draw(g, W, H) {
    const cx = W / 2;
    const cy = H - 12;
    const R = 78;
    const arc = (a, b, color, wd) => {
      g.strokeStyle = color;
      g.lineWidth = wd;
      g.beginPath();
      g.arc(cx, cy, R, Math.PI + a * Math.PI, Math.PI + b * Math.PI);
      g.stroke();
    };
    arc(0, 1, C.bg, 14);
    arc(this.band - 0.11, this.band + 0.11, C.zone, 14);
    const a = Math.PI + this.v * Math.PI;
    g.strokeStyle = this.over > 0 ? C.red : C.white;
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * (R + 6), cy + Math.sin(a) * (R + 6));
    g.stroke();
    circle(g, cx, cy, 8, C.yellow);
    rect(g, 20, H - 20, 120, 8, C.bg);
    rect(g, 20, H - 20, 120 * clamp(this.prog / Math.max(1, this.rep * 0.7)), 8, C.lime);
    text(g, 'Áp lực', 10, 13);
    this.drawHud(g, W);
  }
}

// ========== Bật nảy: bấm đúng lúc chạm đất để nảy cao tới vạch đích ==========
class Bounce extends Base {
  static title = '🏀 Bấm SPACE ngay lúc bóng chạm sàn để nảy cao hơn, vượt vạch đích là ghi điểm';
  static help = 'SPACE đúng lúc chạm sàn';
  static buttons = [['⬆️ NẢY', 'Space']];

  constructor(ctx, opt) {
    super(ctx, opt);
    this.y = 0.5;
    this.vy = 0;
    this.goal = 0.6;
    this.pressAt = -9;
    this.scored = false;
  }

  key(code, down) {
    if (down && HIT.has(code)) this.pressAt = this.time;
  }

  update(dt) {
    this.time += dt;
    this.vy -= 2.6 * dt;
    this.y += this.vy * dt;
    if (this.y <= 0) {
      this.y = 0;
      const timed = this.time - this.pressAt < 0.14;
      this.pressAt = -9;
      if (timed) {
        this.vy = Math.min(2.25, Math.max(1.4, Math.abs(this.vy) * 0.95 + 0.42));
        this.score(1);
        this.say('Bật mạnh!', 'good');
      } else {
        this.vy = Math.max(0.7, Math.abs(this.vy) * 0.68);
        this.score(0.1);
      }
      this.ctx.sfx('click');
      this.scored = false;
    }
    if (!this.scored && this.y >= this.goal) {
      this.scored = true;
      this.addRep();
      this.goal = rand(0.5, 0.88);
      this.say(`Vượt đích! (${this.reps})`, 'good');
    }
    this.y = Math.min(1, this.y);
    return { p: this.y, phase: this.y * 0.5 };
  }

  draw(g, W, H) {
    const floor = H - 12;
    const top = 26;
    rect(g, 40, floor, W - 80, 4, C.muted);
    const gy = floor - this.goal * (floor - top);
    g.setLineDash?.([8, 6]);
    g.strokeStyle = C.lime;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(40, gy);
    g.lineTo(W - 40, gy);
    g.stroke();
    g.setLineDash?.([]);
    const by = floor - 12 - this.y * (floor - top - 12);
    circle(g, W / 2, by, 13, this.y < 0.1 ? C.yellow : C.hot);
    text(g, 'Nảy lên', 10, 13);
    this.drawHud(g, W);
  }
}

// ========== Tích lực: giữ để tích, thả đúng vùng để bùng nổ động tác ==========
class Charge extends Base {
  static title = '💥 GIỮ để tích lực, THẢ khi thanh lực nằm trong vùng xanh để bùng nổ';
  static help = 'Giữ rồi thả SPACE';
  static buttons = [['💥 GIỮ TÍCH LỰC', 'Space', true]];

  constructor(ctx, opt) {
    super(ctx, opt);
    this.v = 0;
    this.dir = 1;
    this.holding = false;
    this.zone = 0.78;
    this.w = 0.16;
    this.burst = 0;
  }

  key(code, down) {
    if (!HIT.has(code)) return;
    if (down && !this.holding) {
      this.holding = true;
      this.v = 0;
      this.dir = 1;
    } else if (!down && this.holding) {
      this.holding = false;
      const err = Math.abs(this.v - this.zone);
      if (err <= this.w / 2) {
        const perfect = err < this.w * 0.2;
        this.score(perfect ? 1 : 0.8);
        this.addRep();
        this.burst = 1;
        this.say(perfect ? 'BÙNG NỔ! 🔥' : 'Tốt!', perfect ? 'good' : 'ok');
        this.zone = rand(0.5, 0.88);
        this.w = Math.max(0.09, 0.16 - this.reps * 0.004);
      } else {
        this.score(0);
        this.say(this.v < this.zone ? 'Chưa đủ lực' : 'Quá sức, trượt tay!', 'bad');
      }
      this.v = 0;
    }
  }

  update(dt) {
    if (this.holding) {
      this.v += this.dir * dt * (0.8 + Math.min(this.reps, 15) * 0.03);
      if (this.v >= 1) {
        this.v = 1;
        this.dir = -1;
      } else if (this.v <= 0) {
        this.v = 0;
        this.dir = 1;
      }
    }
    this.burst = Math.max(0, this.burst - dt * 1.6);
    const target = this.burst > 0 ? this.burst : this.holding ? this.v * 0.25 : 0;
    return this.lift(dt, target, 12);
  }

  draw(g, W) {
    const x = 30;
    const w = W - 60;
    const y = 52;
    rect(g, x, y, w, 30, C.bg);
    rect(g, x + (this.zone - this.w / 2) * w, y, this.w * w, 30, C.zone);
    rect(g, x, y + 7, this.v * w, 16, this.holding ? C.yellow : C.bg);
    rect(g, x + this.v * w - 2, y - 5, 4, 40, C.white);
    if (this.burst > 0) text(g, '💥', W / 2, 32, { align: 'center', font: FONT_BIG });
    text(g, 'Tích lực', 10, 13);
    this.drawHud(g, W);
  }
}

// ========== Bám đường: giữ điểm chạy theo đường sóng bằng W/S hoặc rê chuột ==========
class WaveTrack extends Base {
  static title = '〰️ Giữ chấm đi theo đường sóng: rê chuột lên xuống hoặc giữ W / S';
  static help = 'Rê chuột hoặc W / S';
  static buttons = [['▲', 'KeyW', true], ['▼', 'KeyS', true]];

  constructor(ctx, opt) {
    super(ctx, opt);
    this.y = 0.5;
    this.up = false;
    this.dn = false;
    this.mouseY = null;
    this.prog = 0;
    this.seed = rand(0, 10);
  }

  pathAt(t) {
    return 0.5 + Math.sin((t + this.seed) * 0.9) * 0.28 + Math.sin((t + this.seed) * 2.1) * 0.12;
  }

  key(code, down) {
    if (UP.has(code)) this.up = down;
    if (DOWN.has(code)) this.dn = down;
    if (down) this.mouseY = null;
  }

  pointer(kind, _x, y) {
    if (kind === 'down' || kind === 'move') this.mouseY = clamp(1 - (y - 22) / (CH - 30));
  }

  update(dt) {
    this.time += dt;
    if (this.mouseY !== null) this.y += (this.mouseY - this.y) * (1 - Math.exp(-dt * 12));
    else this.y = clamp(this.y + ((this.up ? 1 : 0) - (this.dn ? 1 : 0)) * dt * 0.95);
    const inTube = Math.abs(this.y - this.pathAt(this.time)) < 0.12;
    this.scoreFor(inTube ? 1 : 0, dt);
    if (inTube) {
      this.prog += dt;
      if (this.prog >= Math.max(1, this.rep * 0.8)) {
        this.prog = 0;
        this.addRep();
        this.say(`Mượt! (${this.reps})`, 'good');
      }
    } else this.prog = Math.max(0, this.prog - dt * 0.5);
    return this.lift(dt, this.y, 12);
  }

  draw(g, W, H) {
    const top = 22;
    const h = H - 30;
    const px = 90;
    const toY = (v) => top + (1 - v) * h;
    g.strokeStyle = 'rgba(163,230,53,0.28)';
    g.lineWidth = 0.24 * h;
    g.beginPath();
    for (let x = 0; x <= W; x += 12) {
      const v = this.pathAt(this.time + (x - px) / 90);
      if (x === 0) g.moveTo(x, toY(v));
      else g.lineTo(x, toY(v));
    }
    g.stroke();
    circle(g, px, toY(this.y), 10, Math.abs(this.y - this.pathAt(this.time)) < 0.12 ? C.lime : C.red);
    text(g, 'Bám theo đường', 110, 13);
    this.drawHud(g, W);
  }
}

// ========== Vòng quay: kim xoay, bấm đúng lúc qua cung sáng, mỗi lần đổi chiều ==========
class RingLock extends Base {
  static title = '🌀 Kim quay vòng: bấm SPACE / click đúng lúc kim đi qua cung sáng, mỗi lần đổi chiều';
  static help = 'SPACE hoặc click';
  static buttons = [['🌀 XOAY', 'Space']];

  constructor(ctx, opt) {
    super(ctx, opt);
    this.a = 0;
    this.dir = 1;
    this.speed = 2.4;
    this.size = 0.9;
    this.place();
  }

  place() {
    // Cung mới luôn cách kim một đoạn để không trúng sẵn
    this.target = (this.a + this.dir * rand(1.4, 4.2) + Math.PI * 4) % (Math.PI * 2);
  }

  hit() {
    let d = Math.abs(((this.a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - this.target);
    d = Math.min(d, Math.PI * 2 - d);
    if (d <= this.size / 2) {
      this.score(d < this.size * 0.2 ? 1 : 0.8);
      this.addRep();
      this.dir *= -1;
      this.speed = Math.min(4.4, this.speed + 0.09);
      this.size = Math.max(0.42, this.size - 0.02);
      this.say(`Khóa! (${this.reps})`, 'good');
      this.place();
    } else {
      this.score(0);
      this.speed = Math.max(2.4, this.speed - 0.3);
      this.say('Trượt cung', 'bad');
    }
  }

  key(code, down) {
    if (down && HIT.has(code)) this.hit();
  }

  pointer(kind) {
    if (kind === 'down') this.hit();
  }

  update(dt) {
    this.a += this.dir * this.speed * dt;
    this.phase = (((this.a / (Math.PI * 2)) % 1) + 1) % 1;
    return { phase: this.phase, p: 0.5 + Math.sin(this.a) * 0.5 };
  }

  draw(g, W, H) {
    const cx = W / 2;
    const cy = H / 2 + 8;
    const R = 40;
    ring(g, cx, cy, R, C.bg, 12);
    g.strokeStyle = C.lime;
    g.lineWidth = 12;
    g.beginPath();
    g.arc(cx, cy, R, this.target - this.size / 2, this.target + this.size / 2);
    g.stroke();
    g.strokeStyle = C.white;
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(this.a) * (R + 8), cy + Math.sin(this.a) * (R + 8));
    g.stroke();
    circle(g, cx, cy, 6, C.yellow);
    text(g, this.dir > 0 ? 'Chiều kim đồng hồ ↻' : 'Ngược chiều ↺', 10, 13);
    this.drawHud(g, W);
  }
}

// ========== Xếp tháp: khối chạy ngang, bấm thả cho khớp khối dưới ==========
class StackTower extends Base {
  static title = '🧱 Bấm SPACE / click thả khối cho khớp khối dưới: lệch bao nhiêu mất bấy nhiêu';
  static help = 'SPACE hoặc click';
  static buttons = [['🧱 THẢ', 'Space']];

  constructor(ctx, opt) {
    super(ctx, opt);
    this.reset();
    this.pulse = 0;
  }

  reset() {
    this.blocks = [{ x: 180, w: 200 }];
    this.cur = { x: 0, w: 200, dir: 1 };
  }

  drop() {
    const top = this.blocks[this.blocks.length - 1];
    const a = Math.max(top.x, this.cur.x);
    const b = Math.min(top.x + top.w, this.cur.x + this.cur.w);
    const overlap = b - a;
    if (overlap <= 4) {
      this.score(0);
      this.say('Đổ tháp! Làm lại', 'bad');
      this.reset();
      return;
    }
    const miss = this.cur.w - overlap;
    const perfect = miss < 6;
    this.score(perfect ? 1 : clamp(overlap / this.cur.w));
    const w = perfect ? this.cur.w : overlap;
    const x = perfect ? top.x : a;
    this.blocks.push({ x, w });
    if (this.blocks.length > 5) this.blocks.shift();
    this.addRep();
    this.pulse = 1;
    this.say(perfect ? `Khớp tuyệt đối! (${this.reps})` : `Lệch ${Math.round(miss)}`, perfect ? 'good' : 'ok');
    // Tháp hẹp quá thì nới lại chút để còn chơi tiếp
    const nw = Math.max(w, 34);
    this.cur = { x: this.cur.dir > 0 ? CW - nw : 0, w: nw, dir: -this.cur.dir };
  }

  key(code, down) {
    if (down && HIT.has(code)) this.drop();
  }

  pointer(kind) {
    if (kind === 'down') this.drop();
  }

  update(dt) {
    const c = this.cur;
    c.x += c.dir * dt * (190 + Math.min(this.reps, 30) * 6);
    if (c.x < 0) {
      c.x = 0;
      c.dir = 1;
    } else if (c.x + c.w > CW) {
      c.x = CW - c.w;
      c.dir = -1;
    }
    this.pulse = Math.max(0, this.pulse - dt * 2.4);
    return this.lift(dt, this.pulse, 14);
  }

  draw(g, W, H) {
    const bh = 15;
    this.blocks.forEach((b, i) => rect(g, b.x, H - 6 - (i + 1) * bh, b.w, bh - 2, i === this.blocks.length - 1 ? C.cyan : 'rgba(34,211,238,0.5)'));
    rect(g, this.cur.x, H - 6 - (this.blocks.length + 1) * bh, this.cur.w, bh - 2, C.yellow);
    text(g, 'Xếp tháp', 10, 13);
    this.drawHud(g, W);
  }
}

// ========== Chạy vượt rào: SPACE nhảy qua rào, giữ S cúi qua thanh ngang ==========
class Runner extends Base {
  static title = '🏃 SPACE / W nhảy qua rào đỏ • giữ S cúi qua thanh ngang vàng';
  static help = 'SPACE nhảy • giữ S cúi';
  static buttons = [['⬆️ NHẢY', 'Space'], ['⬇️ CÚI', 'KeyS', true]];

  constructor(ctx, opt) {
    super(ctx, opt);
    this.y = 0;
    this.vy = 0;
    this.duck = false;
    this.obs = [];
    this.next = 1.2;
    this.speed = 0.75;
    this.stumble = 0;
    this.dist = 0;
  }

  key(code, down) {
    if (DOWN.has(code)) this.duck = down;
    if (down && (HIT.has(code) || UP.has(code)) && this.y <= 0) {
      this.vy = 2.9;
      this.y = 0.001;
    }
  }

  update(dt) {
    this.stumble = Math.max(0, this.stumble - dt);
    const rate = this.stumble > 0 ? 0.32 : this.speed;
    if (this.stumble <= 0) this.speed = Math.min(1.25, this.speed + dt * 0.006);
    this.dist += rate * dt;
    this.vy -= 10 * dt;
    this.y = Math.max(0, this.y + this.vy * dt);
    if (this.y === 0) this.vy = 0;
    this.next -= dt * rate;
    if (this.next <= 0) {
      this.obs.push({ x: 1.05, type: Math.random() < 0.3 ? 'bar' : 'hurdle', hit: false, passed: false });
      this.next = rand(1.1, 1.9); // luôn đủ thời gian tiếp đất rồi xử lý chướng ngại kế
    }
    const PX = 0.14;
    for (const o of this.obs) {
      o.x -= dt * rate * 0.72;
      const near = Math.abs(o.x - PX) < 0.028;
      if (near && !o.hit) {
        const safe = o.type === 'hurdle' ? this.y > 0.22 : this.duck && this.y <= 0.05;
        if (!safe) {
          o.hit = true;
          this.stumble = 0.8;
          this.speed = Math.max(0.75, this.speed - 0.08);
          this.score(0);
          this.say(o.type === 'hurdle' ? 'Vấp rào!' : 'Đập đầu!', 'bad');
          this.ctx.sfx('error');
        }
      }
      if (!o.passed && o.x < PX - 0.03) {
        o.passed = true;
        if (!o.hit) {
          this.score(1);
          this.addRep();
          if (this.reps % 5 === 0) this.say(`Vượt ${this.reps} chướng ngại!`, 'good');
        }
      }
    }
    this.obs = this.obs.filter((o) => o.x > -0.1);
    return this.cycle(dt, this.stumble > 0 ? 0.25 : Math.min(1, this.speed * 0.8));
  }

  draw(g, W, H) {
    const ground = H - 14;
    rect(g, 0, ground, W, 3, C.muted);
    for (let i = 0; i < 12; i++) {
      const x = ((i * 60 - this.dist * 420) % W + W) % W;
      rect(g, x, ground + 5, 26, 3, C.bg);
    }
    for (const o of this.obs) {
      const x = o.x * W;
      if (o.type === 'hurdle') {
        rect(g, x - 3, ground - 24, 6, 24, C.red);
        rect(g, x - 11, ground - 26, 22, 5, C.red);
      } else {
        rect(g, x - 16, ground - 54, 32, 10, C.yellow);
        rect(g, x - 2, ground - 54, 3, 54, 'rgba(250,204,21,0.25)');
      }
    }
    const px = 0.14 * W;
    const py = ground - this.y * 62;
    const color = this.stumble > 0 ? C.red : C.cyan;
    rect(g, px - 9, py - (this.duck ? 16 : 32), 18, this.duck ? 16 : 32, color);
    circle(g, px, py - (this.duck ? 22 : 40), 8, color);
    text(g, `Tốc độ ${Math.round(this.speed * 10)} km/h`, 10, 13);
    this.drawHud(g, W);
  }
}

// ========== Bậc thang 4 làn: khối rơi xuống, bấm đúng làn khi chạm vạch ==========
const LANE_KEYS = ['KeyA', 'KeyS', 'KeyJ', 'KeyK'];
class Tiles extends Base {
  static title = '🪜 Khối rơi 4 làn: bấm A S J K (hoặc click làn) đúng lúc khối chạm vạch';
  static help = 'A  S  J  K hoặc click làn';
  static buttons = [['A', 'KeyA'], ['S', 'KeyS'], ['J', 'KeyJ'], ['K', 'KeyK']];

  constructor(ctx, opt) {
    super(ctx, opt);
    this.notes = [];
    this.t = 0;
    this.nextT = 1;
    this.combo = 0;
    this.flash = [0, 0, 0, 0];
    this.lastLane = 0;
    this.speed = 1.05;
  }

  hit(lane) {
    this.flash[lane] = 1;
    const cand = this.notes.filter((n) => n.lane === lane && !n.done).sort((a, b) => a.at - b.at)[0];
    if (!cand || Math.abs(cand.at - this.t) > 0.3) {
      this.combo = 0;
      this.score(0.2);
      return this.say('Bấm hụt', 'bad');
    }
    const err = Math.abs(cand.at - this.t);
    cand.done = true;
    const v = err < 0.08 ? 1 : err < 0.18 ? 0.75 : 0.45;
    this.score(v);
    this.combo++;
    this.addRep();
    this.phase = (this.phase + 0.5) % 1;
    this.say(v === 1 ? `Chuẩn x${this.combo}` : 'Được', v === 1 ? 'good' : 'ok');
    return undefined;
  }

  key(code, down) {
    if (!down) return;
    const lane = LANE_KEYS.indexOf(code);
    if (lane >= 0) this.hit(lane);
  }

  pointer(kind, x) {
    if (kind === 'down') this.hit(Math.max(0, Math.min(3, Math.floor(((x - (CW - 300) / 2) / 300) * 4))));
  }

  update(dt) {
    this.t += dt;
    this.flash = this.flash.map((f) => Math.max(0, f - dt * 5));
    while (this.nextT < this.t + 1.2) {
      // Không ra 2 làn liền nhau quá xa để tay còn kịp
      let lane = Math.floor(Math.random() * 4);
      if (lane === this.lastLane) lane = (lane + 1) % 4;
      this.lastLane = lane;
      this.notes.push({ at: this.nextT, lane, done: false });
      this.nextT += Math.max(0.36, this.speed - this.reps * 0.006) * (Math.random() < 0.2 ? 0.55 : 1);
    }
    for (const n of this.notes) {
      if (!n.done && this.t - n.at > 0.3) {
        n.done = true;
        n.miss = true;
        this.combo = 0;
        this.score(0);
      }
    }
    this.notes = this.notes.filter((n) => this.t - n.at < 0.5);
    const rate = this.formN ? this.form : 0.5;
    return { phase: (this.phase + (this.t * 0.6) / this.rep) % 1, timeScale: 0.3 + rate };
  }

  draw(g, W, H) {
    const lw = 75;
    const x0 = (W - lw * 4) / 2;
    const hitY = H - 22;
    for (let i = 0; i < 4; i++) {
      rect(g, x0 + i * lw + 2, 0, lw - 4, H, this.flash[i] > 0 ? `rgba(34,211,238,${0.15 + this.flash[i] * 0.35})` : 'rgba(148,163,184,0.1)');
      text(g, LANE_KEYS[i].slice(3), x0 + i * lw + lw / 2, H - 9, { align: 'center', color: C.muted });
    }
    rect(g, x0, hitY, lw * 4, 3, C.hot);
    for (const n of this.notes) {
      const y = hitY - (n.at - this.t) * 90;
      if (y < -14 || y > H) continue;
      rect(g, x0 + n.lane * lw + 6, y - 7, lw - 12, 14, n.done ? (n.miss ? 'rgba(248,113,113,0.4)' : 'rgba(163,230,53,0.3)') : C.yellow);
    }
    text(g, `Combo ${this.combo}`, 10, 13);
    this.drawHud(g, W);
  }
}

// ========== Sang số: địa hình đổi dốc, đổi số W/S cho khớp để đạp nhanh nhất ==========
class Gears extends Base {
  static title = '🚴 Địa hình đổi dốc: W tăng số, S giảm số sao cho số khớp với độ dốc đang tới';
  static help = 'W tăng số • S giảm số';
  static buttons = [['S ➖', 'KeyS'], ['W ➕', 'KeyW']];

  constructor(ctx, opt) {
    super(ctx, opt);
    this.gear = 3;
    this.want = 3;
    this.timer = 3;
    this.prog = 0;
    this.dist = 0;
    this.hills = [3];
    for (let i = 0; i < 6; i++) this.hills.push(1 + Math.floor(Math.random() * 5));
    this.segT = 0;
  }

  key(code, down) {
    if (!down) return;
    if (UP.has(code)) this.gear = Math.min(5, this.gear + 1);
    else if (DOWN.has(code)) this.gear = Math.max(1, this.gear - 1);
    else return;
    this.ctx.sfx('click');
  }

  update(dt) {
    this.segT += dt;
    const segLen = 3.2;
    if (this.segT >= segLen) {
      this.segT -= segLen;
      this.hills.shift();
      let n;
      do n = 1 + Math.floor(Math.random() * 5);
      while (n === this.hills[this.hills.length - 1]);
      this.hills.push(n);
      this.say(`Số ${this.hills[0]} cho đoạn này`, 'ok');
    }
    this.want = this.hills[0];
    const diff = Math.abs(this.gear - this.want);
    const eff = diff === 0 ? 1 : diff === 1 ? 0.45 : 0.1;
    this.scoreFor(eff, dt);
    this.dist += eff * dt;
    if (diff === 0) this.prog += dt; // chỉ đúng số mới tính, lệch số không được điểm
    if (this.prog >= Math.max(1, this.rep)) {
      this.prog = 0;
      this.addRep();
    }
    if (diff >= 2) this.say(this.gear > this.want ? 'Số nặng quá! Bấm S' : 'Số nhẹ quá! Bấm W', 'bad');
    return this.cycle(dt, eff);
  }

  draw(g, W, H) {
    const base = H - 6;
    const segW = 110;
    const off = (this.segT / 3.2) * segW;
    this.hills.forEach((h, i) => {
      const x = 80 + i * segW - off;
      const hh = 8 + h * 10;
      rect(g, x, base - hh, segW - 3, hh, i === 0 ? 'rgba(34,211,238,0.55)' : 'rgba(148,163,184,0.3)');
      text(g, String(h), x + segW / 2, base - hh - 9, { align: 'center', color: i === 0 ? C.yellow : C.muted });
    });
    rect(g, 74, 22, 3, H - 28, C.hot);
    for (let i = 1; i <= 5; i++) {
      rect(g, 10, H - 8 - i * 15, 42, 12, i === this.gear ? (this.gear === this.want ? C.lime : C.red) : C.bg);
      text(g, String(i), 31, H - 2 - i * 15, { align: 'center', color: i === this.gear ? '#0b0f1a' : C.muted });
    }
    text(g, 'Số', 10, 13);
    this.drawHud(g, W);
  }
}

// ========== Chèo: bắt nhịp bằng cách giữ khi mái vào nước, thả ở đỉnh lực ==========
class RowStroke extends Base {
  static title = '🚣 GIỮ để kéo mái: thanh lực dâng rồi tụt, THẢ ngay đỉnh cao nhất. Chờ mái hồi xong mới kéo tiếp';
  static help = 'Giữ rồi thả SPACE';
  static buttons = [['🚣 GIỮ ĐỂ KÉO', 'Space', true]];

  constructor(ctx, opt) {
    super(ctx, opt);
    this.state = 'catch'; // catch -> drive -> recover
    this.t = 0;
    this.peak = 0.6;
    this.boat = 0.2;
    this.dist = 0;
    this.recover = 0;
    this.lastPower = 0;
  }

  key(code, down) {
    if (!HIT.has(code)) return;
    if (down && this.state === 'catch') {
      this.state = 'drive';
      this.t = 0;
    } else if (down && this.state === 'recover') {
      this.score(0.2);
      this.say('Chưa hồi xong, đừng vội!', 'bad');
    } else if (!down && this.state === 'drive') this.release();
  }

  power() {
    const d = (this.t - this.peak) / 0.42;
    return Math.exp(-d * d * 2.2);
  }

  release() {
    const pw = this.power();
    this.lastPower = pw;
    this.score(pw);
    if (pw > 0.45) {
      this.addRep();
      this.boat = Math.min(1, this.boat + pw * 0.32);
      this.say(pw > 0.85 ? `Mái hoàn hảo! (${this.reps})` : 'Được', pw > 0.85 ? 'good' : 'ok');
    } else this.say(this.t < this.peak ? 'Thả sớm quá' : 'Thả muộn quá', 'bad');
    this.state = 'recover';
    this.recover = 0.75;
    this.peak = rand(0.45, 0.8);
  }

  update(dt) {
    this.boat = Math.max(0.05, this.boat - dt * 0.09);
    this.dist += this.boat * dt;
    if (this.state === 'drive') {
      this.t += dt;
      if (this.t > 1.6) this.release();
    } else if (this.state === 'recover') {
      this.recover -= dt;
      if (this.recover <= 0) this.state = 'catch';
    }
    const target = this.state === 'drive' ? Math.min(1, this.t / this.peak) : this.state === 'recover' ? this.recover / 0.75 * 0.6 : 0;
    return this.lift(dt, target, 14);
  }

  draw(g, W, H) {
    const x0 = 24;
    const cw = 300;
    const y0 = H - 14;
    const ch = 70;
    g.strokeStyle = 'rgba(163,230,53,0.7)';
    g.lineWidth = 3;
    g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const tt = (i / 40) * 1.6;
      const d = (tt - this.peak) / 0.42;
      const v = Math.exp(-d * d * 2.2);
      const x = x0 + (tt / 1.6) * cw;
      const y = y0 - v * ch;
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.stroke();
    rect(g, x0, y0, cw, 2, C.muted);
    if (this.state === 'drive') {
      const x = x0 + (this.t / 1.6) * cw;
      rect(g, x - 2, y0 - ch - 4, 4, ch + 6, C.white);
    }
    const label = this.state === 'catch' ? '⬇️ GIỮ ĐỂ KÉO' : this.state === 'drive' ? 'THẢ Ở ĐỈNH!' : 'Mái đang hồi...';
    text(g, label, x0 + cw + 18, 40, { color: this.state === 'recover' ? C.muted : C.yellow });
    const by = H - 34;
    rect(g, x0 + cw + 18, by, 200, 8, C.bg);
    rect(g, x0 + cw + 18, by, 200 * this.boat, 8, C.cyan);
    text(g, `Tốc độ thuyền ${Math.round(this.boat * 100)}%`, x0 + cw + 18, by + 20, { color: C.muted });
    text(g, 'Lực kéo', 10, 13);
    this.drawHud(g, W);
  }
}

// ========== Dồn sức: bấm thật nhanh nhưng coi chừng quá nhiệt ==========
class Mash extends Base {
  static title = '🔥 Bấm SPACE thật nhanh để tăng công suất, nhưng thả ra trước khi QUÁ NHIỆT';
  static help = 'Bấm nhanh SPACE hoặc click';
  static buttons = [['🔥 BẤM NHANH', 'Space']];

  constructor(ctx, opt) {
    super(ctx, opt);
    this.power = 0;
    this.heat = 0;
    this.lock = 0;
    this.prog = 0;
  }

  press() {
    if (this.lock > 0) return;
    this.power = Math.min(1, this.power + 0.09);
    this.heat += 0.034;
    if (this.heat >= 1) {
      this.heat = 1;
      this.lock = 2.2;
      this.power = 0;
      this.score(0);
      this.say('QUÁ NHIỆT! Nghỉ 2 giây', 'bad');
      this.ctx.sfx('error');
    }
  }

  key(code, down) {
    if (down && HIT.has(code)) this.press();
  }

  pointer(kind) {
    if (kind === 'down') this.press();
  }

  update(dt) {
    this.lock = Math.max(0, this.lock - dt);
    this.power = Math.max(0, this.power - dt * 0.42);
    this.heat = Math.max(0, this.heat - dt * (this.lock > 0 ? 0.46 : 0.17));
    const high = this.power > 0.55;
    this.scoreFor(high ? 1 : this.power, dt);
    if (high) {
      this.prog += dt * (0.6 + this.power);
      if (this.prog >= Math.max(0.9, this.rep * 0.8)) {
        this.prog = 0;
        this.addRep();
      }
    }
    return this.cycle(dt, this.power);
  }

  draw(g, W) {
    const x = 20;
    const w = W - 40;
    rect(g, x, 34, w, 24, C.bg);
    rect(g, x + 0.55 * w, 34, 0.45 * w, 24, C.zone);
    rect(g, x, 40, this.power * w, 12, C.cyan);
    text(g, 'Công suất', x, 72, { color: C.muted });
    rect(g, x, 84, w, 16, C.bg);
    rect(g, x, 84, this.heat * w, 16, this.heat > 0.75 ? C.red : C.yellow);
    if (this.lock > 0) text(g, `QUÁ NHIỆT ${this.lock.toFixed(1)}s`, W / 2, 92, { align: 'center', color: C.white });
    else text(g, 'Nhiệt', x + 6, 92, { color: '#0b0f1a' });
    text(g, 'Dồn sức', 10, 13);
    this.drawHud(g, W);
  }
}

// ========== Nhảy dây: dây quay đều dần, bấm nhảy đúng lúc dây sát đất ==========
class JumpRope extends Base {
  static title = '🪢 Bấm SPACE nhảy đúng lúc dây quay xuống sát đất. Dây quay nhanh dần!';
  static help = 'SPACE đúng nhịp dây';
  static buttons = [['⬆️ NHẢY', 'Space']];

  constructor(ctx, opt) {
    super(ctx, opt);
    this.a = Math.PI; // đỉnh trên, 0 = sát đất
    this.speed = 3.1;
    this.y = 0;
    this.vy = 0;
    this.trip = 0;
    this.streak = 0;
  }

  key(code, down) {
    if (down && HIT.has(code) && this.y <= 0 && this.trip <= 0) {
      this.vy = 2.8;
      this.y = 0.001;
    }
  }

  update(dt) {
    this.trip = Math.max(0, this.trip - dt);
    this.vy -= 9 * dt;
    this.y = Math.max(0, this.y + this.vy * dt);
    if (this.y === 0) this.vy = 0;
    if (this.trip <= 0) {
      const prev = this.a;
      this.a += this.speed * dt;
      if (this.a >= Math.PI * 2) {
        this.a -= Math.PI * 2;
        // Dây vừa quét qua chân
        if (this.y > 0.09) {
          this.streak++;
          this.score(1);
          this.addRep();
          this.speed = Math.min(6.2, 3.1 + this.streak * 0.09);
          if (this.streak % 5 === 0) this.say(`${this.streak} nhịp liên tiếp!`, 'good');
        } else {
          this.streak = 0;
          this.speed = 3.1;
          this.score(0);
          this.trip = 0.8;
          this.a = Math.PI;
          this.say('Vướng dây!', 'bad');
          this.ctx.sfx('error');
        }
      } else if (prev > this.a) this.a = prev;
    }
    this.phase = (this.a / (Math.PI * 2)) % 1;
    return { phase: this.phase, timeScale: this.speed / 3.1 };
  }

  draw(g, W, H) {
    const cx = W / 2;
    const ground = H - 12;
    const rx = 60;
    const py = ground - this.y * 50;
    rect(g, cx - 100, ground, 200, 3, C.muted);
    const color = this.trip > 0 ? C.red : C.cyan;
    rect(g, cx - 8, py - 34, 16, 34, color);
    circle(g, cx, py - 42, 9, color);
    // a = 2π là sát đất: dây chạy trên 1 đường cong qua 2 tay
    const k = (Math.cos(this.a) + 1) / 2; // 1 = sát đất
    const handY = py - 22;
    const low = ground - 2;
    const high = handY - 48;
    const my = high + (low - high) * k;
    g.strokeStyle = k > 0.8 ? C.hot : C.yellow;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(cx - rx, handY);
    g.quadraticCurveTo(cx, my * 2 - handY, cx + rx, handY);
    g.stroke();
    text(g, `Chuỗi ${this.streak}`, 10, 13);
    this.drawHud(g, W);
  }
}

// ========== Bóng tốc độ: bóng dao động, đánh J bên trái, K bên phải đúng lúc bóng tới ==========
class SpeedBag extends Base {
  static title = '🥊 Bóng lắc 2 bên: bấm J khi bóng sang TRÁI, K khi sang PHẢI, đúng lúc chạm vùng sáng';
  static help = 'J trái • K phải';
  static buttons = [['J TRÁI', 'KeyJ'], ['K PHẢI', 'KeyK']];

  constructor(ctx, opt) {
    super(ctx, opt);
    this.a = 0;
    this.speed = 2.2;
    this.hitSide = 0;
    this.combo = 0;
    this.pulse = 0;
  }

  get x() {
    return Math.sin(this.a);
  }

  key(code, down) {
    if (!down) return;
    const side = code === 'KeyJ' ? -1 : code === 'KeyK' ? 1 : 0;
    if (!side) return;
    const inZone = this.x * side > 0.72;
    if (inZone && this.hitSide !== side) {
      this.hitSide = side;
      this.score(1);
      this.combo++;
      this.addRep();
      this.pulse = 1;
      this.speed = Math.min(5.2, 2.2 + this.combo * 0.07);
      if (this.combo % 5 === 0) this.say(`Combo ${this.combo}!`, 'good');
    } else {
      this.score(0);
      this.combo = 0;
      this.speed = 2.2;
      this.say('Lệch nhịp', 'bad');
    }
  }

  update(dt) {
    const before = this.x;
    this.a += this.speed * dt;
    // Bóng về giữa: mở lại lượt đánh và trừ combo nếu vừa bỏ lỡ
    if (Math.sign(before) !== Math.sign(this.x)) {
      const side = before > 0 ? 1 : -1;
      if (this.hitSide !== side && this.combo > 0) {
        this.combo = 0;
        this.speed = 2.2;
        this.score(0);
        this.say('Bỏ lỡ nhịp', 'bad');
      }
    }
    this.pulse = Math.max(0, this.pulse - dt * 5);
    const side = this.hitSide;
    return { phase: side < 0 ? 0.25 * this.pulse : 0.5 + 0.25 * this.pulse, p: this.pulse };
  }

  draw(g, W, H) {
    const cx = W / 2;
    const cy = H / 2 + 8;
    const A = 170;
    rect(g, cx - A - 22, cy - 26, 48, 52, 'rgba(163,230,53,0.3)');
    rect(g, cx + A - 26, cy - 26, 48, 52, 'rgba(163,230,53,0.3)');
    text(g, 'J', cx - A, cy - 34, { align: 'center' });
    text(g, 'K', cx + A, cy - 34, { align: 'center' });
    rect(g, cx - A, cy - 2, A * 2, 4, C.bg);
    circle(g, cx + this.x * A, cy, 17, Math.abs(this.x) > 0.72 ? C.yellow : C.red);
    text(g, `Combo ${this.combo}`, 10, 13);
    this.drawHud(g, W);
  }
}

// ========== Yoga: giữ đúng tổ hợp 2 phím theo tư thế, không buông tới hết hơi thở ==========
const POSES = [
  ['Chiến binh', 'ArrowLeft', 'ArrowUp'],
  ['Cây', 'ArrowUp', 'ArrowDown'],
  ['Cánh cung', 'ArrowLeft', 'ArrowRight'],
  ['Rắn hổ mang', 'ArrowDown', 'ArrowRight'],
  ['Tam giác', 'ArrowUp', 'ArrowRight'],
  ['Em bé', 'ArrowLeft', 'ArrowDown'],
];
class PoseHold extends Base {
  static title = '🧘 Giữ ĐÚNG 2 phím theo tư thế (W A S D hoặc mũi tên) cho tới hết hơi thở';
  static help = 'Giữ 2 phím (W A S D hoặc mũi tên)';
  static buttons = [['←', 'ArrowLeft', true], ['↑', 'ArrowUp', true], ['↓', 'ArrowDown', true], ['→', 'ArrowRight', true]];

  constructor(ctx, opt) {
    super(ctx, opt);
    this.held = new Set();
    this.pose = pick(POSES);
    this.hold = 0;
    this.len = Math.max(2.4, this.rep * 0.8);
    this.rest = 0;
  }

  key(rawCode, down) {
    const code = arrowOf(rawCode);
    if (!ARROWS.includes(code)) return;
    if (down) this.held.add(code);
    else this.held.delete(code);
  }

  update(dt) {
    this.rest = Math.max(0, this.rest - dt);
    if (this.rest > 0) return this.lift(dt, 0, 3);
    const [, a, b] = this.pose;
    const ok = this.held.has(a) && this.held.has(b) && this.held.size === 2;
    this.scoreFor(ok ? 1 : 0, dt);
    if (ok) {
      this.hold += dt;
      if (this.hold >= this.len) {
        this.addRep();
        this.say(`Namaste 🙏 (${this.reps})`, 'good');
        this.hold = 0;
        this.rest = 0.7;
        let next;
        do next = pick(POSES);
        while (next === this.pose);
        this.pose = next;
      }
    } else if (this.hold > 0) {
      this.hold = Math.max(0, this.hold - dt * 1.5);
      if (this.held.size) this.say('Sai tư thế', 'bad');
    }
    return { phase: ((this.reps + this.hold / this.len) / 2) % 1, timeScale: 0.5 };
  }

  draw(g, W, H) {
    const [name, a, b] = this.pose;
    const keys = [a, b];
    if (this.rest > 0) text(g, 'Thả lỏng...', W / 2, 46, { align: 'center', color: C.muted });
    else text(g, name, W / 2, 28, { align: 'center', font: FONT_BIG, color: C.yellow });
    keys.forEach((k, i) => {
      const x = W / 2 - 56 + i * 64;
      rect(g, x, 44, 48, 40, this.held.has(k) ? C.lime : C.bg);
      text(g, ARROW_ICON[k], x + 24, 64, { align: 'center', font: FONT_BIG, color: this.held.has(k) ? '#0b0f1a' : C.white });
    });
    rect(g, 60, H - 20, W - 120, 10, C.bg);
    rect(g, 60, H - 20, (W - 120) * clamp(this.hold / this.len), 10, C.cyan);
    text(g, 'Hơi thở', 10, 13);
    this.drawHud(g, W);
  }
}

// ========== Lăn cơ / massage: rê tới điểm căng rồi giữ yên cho tới khi tan ==========
class RollKnot extends Base {
  static title = '💆 Rê con lăn (chuột hoặc A / D) tới điểm căng đỏ rồi GIỮ YÊN cho tới khi tan';
  static help = 'Rê chuột hoặc A / D';
  static buttons = [['◀', 'KeyA', true], ['▶', 'KeyD', true]];

  constructor(ctx, opt) {
    super(ctx, opt);
    this.x = 0.5;
    this.mouseX = null;
    this.dir = 0;
    this.knot = rand(0.1, 0.9);
    this.melt = 0;
    this.lastX = 0.5;
  }

  key(code, down) {
    if (LEFT.has(code)) this.dir = down ? -1 : this.dir === -1 ? 0 : this.dir;
    if (RIGHT.has(code)) this.dir = down ? 1 : this.dir === 1 ? 0 : this.dir;
    if (down) this.mouseX = null;
  }

  pointer(kind, x) {
    if (kind === 'down' || kind === 'move') this.mouseX = clamp((x - 20) / (CW - 40));
  }

  update(dt) {
    this.time += dt;
    this.lastX = this.x;
    if (this.mouseX !== null) this.x += (this.mouseX - this.x) * (1 - Math.exp(-dt * 10));
    else this.x = clamp(this.x + this.dir * dt * 0.6);
    const speed = Math.abs(this.x - this.lastX) / Math.max(dt, 1e-3);
    const on = Math.abs(this.x - this.knot) < 0.05;
    const still = speed < 0.12;
    this.scoreFor(on ? (still ? 1 : 0.5) : 0.25, dt);
    if (on && still) {
      this.melt += dt;
      if (this.melt >= Math.max(1, this.rep * 0.4)) {
        this.melt = 0;
        this.addRep();
        this.say(`Tan cơ rồi! Thoải mái quá (${this.reps})`, 'good');
        let nx;
        do nx = rand(0.08, 0.92);
        while (Math.abs(nx - this.x) < 0.25);
        this.knot = nx;
      }
    } else this.melt = Math.max(0, this.melt - dt * 0.4);
    this.phase = (this.x * 2) % 1;
    return { phase: this.phase, p: this.x };
  }

  draw(g, W, H) {
    const x = 20;
    const w = W - 40;
    const y = H / 2 + 6;
    rect(g, x, y - 10, w, 20, C.bg);
    circle(g, x + this.knot * w, y, 13 + Math.sin(this.time * 5) * 2, C.red);
    ring(g, x + this.knot * w, y, 22, C.red, 2);
    rect(g, x + this.x * w - 11, y - 24, 22, 48, C.cyan);
    rect(g, 60, H - 14, W - 120, 8, C.bg);
    rect(g, 60, H - 14, (W - 120) * clamp(this.melt / Math.max(1, this.rep * 0.4)), 8, C.lime);
    text(g, 'Điểm căng', 10, 13);
    this.drawHud(g, W);
  }
}

export const GAMES = {
  seq: SeqDance,
  lift: SweetSpot,
  drag: DragPull,
  target: TargetClick,
  sym: Symmetry,
  pump: Pump,
  bounce: Bounce,
  charge: Charge,
  wave: WaveTrack,
  ring: RingLock,
  stack: StackTower,
  runner: Runner,
  tiles: Tiles,
  gears: Gears,
  row: RowStroke,
  mash: Mash,
  rope: JumpRope,
  bag: SpeedBag,
  pose: PoseHold,
  roll: RollKnot,
};

// Máy nào chơi trò nào: chọn theo cảm giác của động tác thật
const G = (name, types, opt) => types.map((t) => [t, { game: name, opt }]);
export const MACHINE_GAME = Object.fromEntries([
  ...G('seq', ['aerobic_spot']),
  ...G('lift', ['bench_flat', 'bench_incline', 'bench_decline', 'smith_machine', 'power_rack', 'hack_squat']),
  ...G('drag', ['lat_pulldown', 'seated_row', 'tbar_row', 'assisted_pullup', 'pullup_bar', 'face_pull', 'tricep_pushdown', 'cable_curl']),
  ...G('target', ['bicep_machine', 'preacher_curl', 'ez_barbell', 'dumbbell_bench']),
  ...G('target', ['pad_mitts'], { life: 0.85 }),
  ...G('sym', ['pec_deck', 'cable_crossover', 'rear_delt_fly', 'hip_abduction', 'hip_adduction', 'farmers_walk']),
  ...G('pump', ['leg_press', 'leg_extension', 'leg_curl_lying', 'leg_curl_seated']),
  ...G('bounce', ['calf_standing', 'calf_seated', 'plyo_box']),
  ...G('charge', ['trap_bar', 'kettlebell', 'tire_flip', 'slam_ball', 'medicine_ball', 'hip_thrust', 'glute_machine', 'landmine_press']),
  ...G('wave', ['lateral_raise', 'dip_station', 'trx', 'pilates_mat', 'hyperextension']),
  ...G('ring', ['torso_rotation', 'roman_chair']),
  ...G('stack', ['ab_crunch', 'pilates_reformer']),
  ...G('runner', ['treadmill']),
  ...G('tiles', ['stair_climber', 'elliptical']),
  ...G('gears', ['upright_bike', 'recumbent_bike']),
  ...G('row', ['rowing_machine', 'ski_erg']),
  ...G('mash', ['assault_bike', 'sled']),
  ...G('rope', ['jump_rope']),
  ...G('bag', ['speed_bag']),
  ...G('pose', ['yoga_mat']),
  ...G('roll', ['foam_roller', 'massage_table']),
]);
