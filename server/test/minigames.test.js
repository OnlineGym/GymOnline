// Cho bot chơi từng minigame 2 phút giả lập: chơi đúng phải được nhiều điểm, không chơi hoặc bấm bừa thì không
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { GAMES, MACHINE_GAME, CANVAS, ActivityMeter, arrowOf } from '../../client/src/core/minigames.js';
import { computeReward } from '../src/utils/progression.js';
import { EQUIPMENT } from '../../shared/equipment.js';

const DT = 1 / 60;
const SECONDS = 120;

function setup(name, opt = {}, rep = 2) {
  let now = 0;
  const log = [];
  const ctx = { rep, beat: () => now / 0.484, sfx: () => {}, say: (t) => log.push(t) };
  const game = new GAMES[name](ctx, opt);
  return { game, advance: (dt) => (now += dt), beat: ctx.beat, log };
}

// Bấm rồi nhả ở frame sau
function tap(game, code) {
  game.key(code, true);
  game.key(code, false);
}

const ARROW_OPP = { ArrowLeft: 'ArrowRight', ArrowRight: 'ArrowLeft', ArrowUp: 'ArrowDown', ArrowDown: 'ArrowUp' };

// Bot chơi đúng luật (đọc trạng thái như mắt người chơi nhìn màn hình)
const BOT = {
  seq(g, env) {
    if (g.idx < g.seq.length) {
      const n = g.seq[g.idx];
      tap(g, n.rev ? ARROW_OPP[n.key] : n.key);
    } else if (Math.abs(g.bar - env.beat()) < 0.05) tap(g, 'Space');
  },
  lift(g) {
    if (g.lock <= 0 && Math.abs(g.needle - g.center) < g.width * 0.1) tap(g, 'Space');
  },
  drag(g) {
    if (g.done) g.key('Space', false);
    else if (g.x < g.zone - 0.03) g.key('Space', true);
    else g.key('Space', false);
  },
  target(g) {
    if (g.target && g.target.t >= g.target.life) g.pointer('down', g.target.x, g.target.y);
  },
  sym(g) {
    g.key('KeyA', g.l < g.band);
    g.key('KeyD', g.r < g.band);
  },
  pump(g) {
    if (g.v < g.band - 0.07) tap(g, 'Space');
  },
  bounce(g) {
    if (g.vy < 0 && g.y < 0.03) tap(g, 'Space');
  },
  charge(g) {
    if (!g.holding) g.key('Space', true);
    else if (g.dir > 0 && Math.abs(g.v - g.zone) < 0.01) g.key('Space', false);
  },
  wave(g) {
    const want = g.pathAt(g.time);
    g.key('KeyW', g.y < want - 0.01);
    g.key('KeyS', g.y > want + 0.01);
  },
  ring(g) {
    let d = Math.abs((((g.a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - g.target);
    d = Math.min(d, Math.PI * 2 - d);
    if (d < g.size * 0.15) tap(g, 'Space');
  },
  stack(g) {
    const top = g.blocks[g.blocks.length - 1];
    if (Math.abs(g.cur.x - top.x) < 3) tap(g, 'Space');
  },
  runner(g) {
    const rate = g.stumble > 0 ? 0.32 : g.speed;
    const o = g.obs.find((q) => !q.passed && q.x > 0.11);
    const eta = o ? (o.x - 0.14) / (0.72 * rate) : 9;
    g.key('KeyS', !!o && o.type === 'bar' && eta < 0.2);
    if (o && o.type === 'hurdle' && g.y <= 0 && eta < 0.2) tap(g, 'Space');
  },
  tiles(g) {
    const n = g.notes.find((q) => !q.done && Math.abs(q.at - g.t) < 0.02);
    if (n) tap(g, ['KeyA', 'KeyS', 'KeyJ', 'KeyK'][n.lane]);
  },
  gears(g) {
    if (g.gear < g.hills[0]) tap(g, 'KeyW');
    else if (g.gear > g.hills[0]) tap(g, 'KeyS');
  },
  row(g) {
    if (g.state === 'catch') g.key('Space', true);
    else if (g.state === 'drive' && g.t >= g.peak) g.key('Space', false);
  },
  mash(g, env) {
    if (g.heat < 0.8 && env.frame % 7 === 0) tap(g, 'Space');
  },
  rope(g) {
    const left = (Math.PI * 2 - g.a) / g.speed;
    if (g.y <= 0 && left < 0.22 && g.trip <= 0) tap(g, 'Space');
  },
  bag(g) {
    if (g.x > 0.8 && g.hitSide !== 1) tap(g, 'KeyK');
    if (g.x < -0.8 && g.hitSide !== -1) tap(g, 'KeyJ');
  },
  pose(g) {
    const [, a, b] = g.pose;
    for (const k of ['ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight']) g.key(k, k === a || k === b);
  },
  roll(g) {
    g.pointer('move', 20 + g.knot * (CANVAS.W - 40), 60);
  },
};

function play(name, botFn) {
  const env = setup(name);
  env.frame = 0;
  for (let i = 0; i < SECONDS * 60; i++) {
    env.frame = i;
    env.advance(DT);
    botFn?.(env.game, env);
    const out = env.game.update(DT) || {};
    for (const v of [out.p, out.phase, out.timeScale]) if (v !== undefined) assert.ok(Number.isFinite(v), `${name}: giá trị hoạt ảnh không hợp lệ ${v}`);
  }
  return { reps: env.game.reps, form: env.game.form };
}

// Canvas giả: chỉ để chắc chắn hàm vẽ không lỗi
const stubCanvas = new Proxy({}, { get: (_t, k) => (k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });

describe('Minigame từng máy', () => {
  test('mọi máy tập đều có trò hợp lệ, có ít nhất 20 trò khác nhau', () => {
    assert.ok(Object.keys(GAMES).length >= 20);
    for (const [type, cfg] of Object.entries(MACHINE_GAME)) {
      assert.ok(EQUIPMENT[type], `máy không tồn tại: ${type}`);
      assert.ok(GAMES[cfg.game], `trò không tồn tại: ${cfg.game}`);
    }
  });

  test('mỗi máy chỉ gán 1 trò và đủ tiêu đề, hướng dẫn, nút cho điện thoại', () => {
    for (const [name, Game] of Object.entries(GAMES)) {
      assert.ok(Game.title, `${name}: thiếu tiêu đề`);
      assert.ok(Game.help, `${name}: thiếu hướng dẫn phím`);
      assert.ok(Game.buttons?.length, `${name}: thiếu nút cho điện thoại`);
    }
  });

  for (const name of Object.keys(GAMES)) {
    test(`${name}: chơi đúng thì được điểm, không chơi thì không`, () => {
      const good = play(name, BOT[name]);
      assert.ok(good.reps >= 15, `${name}: chơi đúng 2 phút chỉ được ${good.reps} lần`);
      assert.ok(good.form >= 0.7, `${name}: chơi đúng mà độ chuẩn chỉ ${good.form.toFixed(2)}`);
      const idle = play(name, null);
      assert.ok(idle.reps <= good.reps * 0.3, `${name}: không chơi vẫn được ${idle.reps} lần (chơi đúng ${good.reps})`);
    });

    test(`${name}: bấm loạn xạ không hơn chơi đúng và không lỗi`, () => {
      const codes = ['Space', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyJ', 'KeyK', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight'];
      const good = play(name, BOT[name]);
      const spam = play(name, (g, env) => {
        if (env.frame % 3 === 0) g.key(codes[Math.floor(Math.random() * codes.length)], Math.random() < 0.6);
        if (env.frame % 11 === 0) g.pointer(['down', 'move', 'up'][Math.floor(Math.random() * 3)], Math.random() * CANVAS.W, Math.random() * CANVAS.H);
      });
      assert.ok(spam.reps <= good.reps, `${name}: bấm bừa được ${spam.reps} lần, nhiều hơn chơi đúng ${good.reps}`);
    });

    test(`${name}: hàm vẽ chạy được ở mọi trạng thái`, () => {
      const env = setup(name);
      for (let i = 0; i < 1200; i++) {
        env.advance(DT);
        BOT[name](env.game, { beat: env.beat, frame: i });
        env.game.update(DT);
        if (i % 20 === 0) env.game.draw(stubCanvas, CANVAS.W, CANVAS.H);
      }
    });
  }
});

describe('Chỉ tính khi thực sự tập', () => {
  test('ngồi không: 0 kcal, không EXP, không chỉ số, không xu', () => {
    const r = computeReward('leg_press', 0, 60, 0, { active: 0 });
    assert.equal(r.calories, 0);
    assert.equal(r.exp, 0);
    assert.equal(r.statGain, 0);
    assert.equal(r.coins, 0);
  });

  test('kcal tỉ lệ với thời gian tập thật, client không thể khai quá thời gian server đo', () => {
    const half = computeReward('leg_press', 0, 60, 5, { active: 30 });
    const full = computeReward('leg_press', 0, 60, 5, { active: 60 });
    assert.ok(Math.abs(full.calories - half.calories * 2) < 0.2);
    assert.equal(computeReward('leg_press', 0, 60, 5, { active: 9999 }).calories, full.calories);
  });

  test('bộ đếm: không thao tác thì không tăng, mỗi lần bấm chỉ tính 1 khoảng ngắn', () => {
    const m = new ActivityMeter();
    for (let i = 0; i < 600; i++) m.update(1 / 60);
    assert.equal(m.active, 0);
    m.key('Space', true);
    m.key('Space', false);
    for (let i = 0; i < 600; i++) m.update(1 / 60);
    assert.ok(m.active > 1.4 && m.active < 1.6, `${m.active}`);
  });

  test('đè 1 phím rồi bỏ đi: chỉ được tính tối đa vài giây', () => {
    const m = new ActivityMeter();
    m.key('Space', true);
    for (let i = 0; i < 60 * 120; i++) m.update(1 / 60);
    assert.ok(m.active < 10, `${m.active}`);
  });
});

describe('W A S D thay cho phím mũi tên', () => {
  test('map đúng 4 hướng, phím khác giữ nguyên', () => {
    assert.equal(arrowOf('KeyW'), 'ArrowUp');
    assert.equal(arrowOf('KeyA'), 'ArrowLeft');
    assert.equal(arrowOf('KeyS'), 'ArrowDown');
    assert.equal(arrowOf('KeyD'), 'ArrowRight');
    assert.equal(arrowOf('Space'), 'Space');
  });

  test('vũ điệu: nhập cả chuỗi bằng W A S D được, trộn với mũi tên cũng được', () => {
    const REV = { ArrowUp: 'KeyW', ArrowLeft: 'KeyA', ArrowDown: 'KeyS', ArrowRight: 'KeyD' };
    const env = setup('seq');
    const g = env.game;
    g.seq.forEach((n, i) => {
      const want = n.rev ? ARROW_OPP[n.key] : n.key;
      tap(g, i % 2 ? want : REV[want]);
    });
    assert.equal(g.idx, g.seq.length);
  });

  test('yoga: giữ 2 phím W A S D vẫn tính đúng tư thế', () => {
    const REV = { ArrowUp: 'KeyW', ArrowLeft: 'KeyA', ArrowDown: 'KeyS', ArrowRight: 'KeyD' };
    const env = setup('pose');
    const g = env.game;
    for (let i = 0; i < 60 * 40; i++) {
      for (const k of ['ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight']) g.key(REV[k], k === g.pose[1] || k === g.pose[2]);
      g.update(1 / 60);
    }
    assert.ok(g.reps >= 5, `${g.reps}`);
  });
});
