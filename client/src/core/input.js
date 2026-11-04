import { settings } from './settings.js';

/**
 * Quản lý input PC + mobile:
 *  - PC: WASD / mũi tên di chuyển, Shift chạy, kéo chuột xoay camera, lăn chuột zoom, E tương tác
 *  - Mobile: joystick (nipplejs gán vào qua setJoystick), vuốt màn hình xoay camera, chụm 2 ngón zoom
 */
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.joy = { x: 0, y: 0 };
    this.mobileRun = false;
    this.look = { dx: 0, dy: 0, zoom: 0 };
    this.handlers = {};
    this.enabled = true;

    this._drag = null;
    this._touches = new Map();
    this._pinchDist = 0;

    window.addEventListener('keydown', (e) => this._onKey(e, true));
    window.addEventListener('keyup', (e) => this._onKey(e, false));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    window.addEventListener('pointermove', (e) => this._onPointerMove(e));
    window.addEventListener('pointerup', (e) => this._onPointerUp(e));
    window.addEventListener('pointercancel', (e) => this._onPointerUp(e));
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.look.zoom += Math.sign(e.deltaY) * 0.6;
      },
      { passive: false }
    );
  }

  on(action, fn) {
    (this.handlers[action] ||= []).push(fn);
  }

  emit(action, ...args) {
    (this.handlers[action] || []).forEach((fn) => fn(...args));
  }

  _isTyping(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  _onKey(e, down) {
    if (this._isTyping(e)) {
      if (down && e.key === 'Escape') e.target.blur();
      return;
    }
    if (down) {
      this.keys.add(e.code);
      if (e.repeat) return;
      this.emit('key', e.code, true);
      // Phím mũi tên/A/D dùng cho minigame: chặn cuộn trang
      if (e.code.startsWith('Arrow')) e.preventDefault();
      // Phím người chơi đã đổi được kiểm tra trước; các phím còn lại cố định
      const K = settings.keys;
      const handled = { [K.interact]: 'interact', [K.emote]: 'emoteWheel', [K.map]: 'map', [K.player]: 'interactPlayer', [K.inventory]: 'inventory', [K.social]: 'social', [K.finder]: 'finder', [K.quests]: 'quests' }[e.code];
      if (handled) {
        this.emit(handled);
        return;
      }
      if (e.code === K.sit) return void this.emit('pose', 'sitFloor');
      if (e.code === K.lie) return void this.emit('pose', 'lieRest');
      switch (e.code) {
        case 'Enter':
          e.preventDefault();
          this.emit('chat');
          break;
        case 'Escape':
          this.emit('escape');
          break;
        case 'Space':
          e.preventDefault();
          this.emit('space');
          break;
        case 'KeyJ':
          this.emit('spar', 'punch');
          break;
        case 'KeyK':
          this.emit('spar', 'block');
          break;
        case 'KeyL':
          this.emit('spar', 'dodge');
          break;
        default:
          if (/^Digit[1-8]$/.test(e.code)) this.emit('emoteHotkey', Number(e.code.slice(5)) - 1);
      }
    } else {
      this.keys.delete(e.code);
      this.emit('key', e.code, false);
      if (e.code === 'Space') this.emit('spaceUp');
    }
  }

  _onPointerDown(e) {
    if (e.pointerType === 'touch') {
      this._touches.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
      if (this._touches.size === 2) this._pinchDist = this._touchDistance();
      return;
    }
    this._drag = { x: e.clientX, y: e.clientY, id: e.pointerId, sx: e.clientX, sy: e.clientY, t: performance.now() };
    this.canvas.setPointerCapture?.(e.pointerId);
  }

  _onPointerMove(e) {
    const sens = settings.cameraSensitivity || 1;
    if (e.pointerType === 'touch') {
      const t = this._touches.get(e.pointerId);
      if (!t) return;
      if (this._touches.size >= 2) {
        t.x = e.clientX;
        t.y = e.clientY;
        const d = this._touchDistance();
        this.look.zoom -= (d - this._pinchDist) * 0.02;
        this._pinchDist = d;
        return;
      }
      this.look.dx += (e.clientX - t.x) * 1.3 * sens;
      this.look.dy += (e.clientY - t.y) * 1.3 * sens;
      t.x = e.clientX;
      t.y = e.clientY;
      return;
    }
    if (!this._drag || this._drag.id !== e.pointerId) return;
    this.look.dx += (e.clientX - this._drag.x) * sens;
    this.look.dy += (e.clientY - this._drag.y) * sens;
    this._drag.x = e.clientX;
    this._drag.y = e.clientY;
  }

  _onPointerUp(e) {
    if (e.pointerType === 'touch') {
      const t = this._touches.get(e.pointerId);
      if (t && this._touches.size === 1 && Math.hypot(e.clientX - t.sx, e.clientY - t.sy) < 10 && performance.now() - t.t < 350) this.emit('click', e.clientX, e.clientY);
      this._touches.delete(e.pointerId);
      return;
    }
    if (this._drag?.id === e.pointerId) {
      const d = this._drag;
      // bấm nhanh không kéo = click chọn (vd: bấm vào nhân vật khác)
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 6 && performance.now() - d.t < 350) this.emit('click', e.clientX, e.clientY);
      this._drag = null;
    }
  }

  _touchDistance() {
    const [a, b] = [...this._touches.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  setJoystick(x, y) {
    this.joy.x = x;
    this.joy.y = y;
  }

  // Vector di chuyển: x = sang phải, y = tiến lên (độ dài ≤ 1)
  getMove() {
    if (!this.enabled) return { x: 0, y: 0 };
    let x = 0;
    let y = 0;
    const k = this.keys;
    const K = settings.keys;
    if (k.has(K.forward) || k.has('ArrowUp')) y += 1;
    if (k.has(K.back) || k.has('ArrowDown')) y -= 1;
    if (k.has(K.right) || k.has('ArrowRight')) x += 1;
    if (k.has(K.left) || k.has('ArrowLeft')) x -= 1;
    x += this.joy.x;
    y += this.joy.y;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  isRunning() {
    return this.keys.has(settings.keys.run) || this.mobileRun;
  }

  consumeLook() {
    const l = { ...this.look };
    this.look.dx = this.look.dy = this.look.zoom = 0;
    return l;
  }
}
