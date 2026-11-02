// Game loop đơn giản dùng setAnimationLoop, giới hạn dt để tránh nhảy cóc khi tab bị ẩn
export class GameLoop {
  constructor(renderer) {
    this.renderer = renderer;
    this.callbacks = [];
    this.elapsed = 0;
    this.fps = 60;
    this._last = performance.now();
    this._frames = 0;
    this._fpsTime = 0;
  }

  add(fn) {
    this.callbacks.push(fn);
    return () => (this.callbacks = this.callbacks.filter((f) => f !== fn));
  }

  start() {
    this.renderer.setAnimationLoop((now) => {
      // timestamp của rAF có thể nhỏ hơn performance.now() lúc khởi tạo -> chặn dt âm
      const dt = Math.max(0, Math.min(0.05, (now - this._last) / 1000));
      this._last = now;
      this.elapsed += dt;
      this._frames++;
      this._fpsTime += dt;
      if (this._fpsTime >= 0.5) {
        this.fps = Math.round(this._frames / this._fpsTime);
        this._frames = 0;
        this._fpsTime = 0;
      }
      for (const fn of this.callbacks) fn(dt, this.elapsed);
    });
  }
}
