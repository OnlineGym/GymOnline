import { h, uiRoot, toast } from './dom.js';
import { settings, onSettingsChange } from '../core/settings.js';
import { MUSIC_ROOMS, musicRoomAt } from '@shared/constants.js';
import { isMobile } from '../core/device.js';

/**
 * Phòng nhạc Aerobic (client): trình phát YouTube nhúng CHÍNH THỨC (IFrame Player API) hiện khi đứng trong studio.
 *  - Server giữ bài hiện tại + thời điểm bắt đầu -> mọi người nghe đồng bộ (tự seek nếu lệch > 2.5s)
 *  - Hết bài / lỗi video -> báo server chuyển bài; nút bỏ phiếu bỏ qua; dán link YouTube để thêm bài
 *  - Trình phát hiển thị (≥ 200x200) theo điều khoản YouTube; ra khỏi phòng thì dừng
 *  - Phòng có noPanel (Yoga): theo yêu cầu chủ dự án, không hiện bảng, trình phát nằm ngoài màn hình.
 *    Lưu ý: điều này không theo quy định hiển thị của YouTube API
 */
let apiPromise = null;
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => {
      apiPromise = null;
      reject(new Error('Không tải được trình phát YouTube'));
    };
    document.head.appendChild(s);
  });
  return apiPromise;
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class MusicRoom {
  constructor(game) {
    this.g = game;
    this.inside = false;
    this.room = null; // id phòng nhạc đang đứng trong (aerobic / yoga)
    this.state = null;
    this.player = null;
    this.ready = false;
    this.loadedId = null;
    this.seeding = false;
    this.syncTimer = 0;
    this.offset = 0; // lệch đồng hồ server - client (ms)
    this._build();
    game.net.on('music:state', (s) => this._onState(s));
    onSettingsChange((_s, patch) => {
      if ('music' in patch || 'sound' in patch) this._applyVolume();
    });
  }

  /** Đang phát nhạc YouTube (để tắt nhạc nền tự tạo của game) */
  get playing() {
    return this.inside && !!this.state?.cur && this.ready;
  }

  _build() {
    this.labelEl = h('b', {}, '🎵 Nhạc');
    this.titleEl = h('div', { class: 'mr-title' }, 'Đang tải...');
    this.byEl = h('div', { class: 'mr-by' });
    this.timeEl = h('span', { class: 'mr-time' });
    this.fill = h('div');
    this.skipBtn = h('button', { class: 'btn ghost mr-skip', type: 'button', onclick: () => this._skip() }, '⏭ Bỏ qua');
    this.playBtn = h('button', { class: 'btn primary mr-play hidden', type: 'button', onclick: () => this.player?.playVideo() }, '▶ Bấm để nghe');
    this.vol = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: settings.music, class: 'mr-vol', title: 'Âm lượng nhạc' });
    this.vol.oninput = () => {
      settings.music = Number(this.vol.value);
      this._applyVolume();
    };
    this.vol.onchange = () => import('../core/settings.js').then((m) => m.updateSettings({ music: Number(this.vol.value) }));
    this.input = h('input', { class: 'input mr-input', placeholder: 'Dán link YouTube để thêm bài...', maxlength: 200 });
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') this._add();
      if (e.key === 'Escape') this.input.blur();
    });
    this.addBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => this._add() }, 'Thêm');
    this.queueEl = h('div', { class: 'mr-queue' });
    this.emptyEl = h('div', { class: 'mr-empty hidden' });
    this.ytHost = h('div', { class: 'mr-yt' }, h('div', { id: 'mr-yt-player' }));
    this.el = h(
      'div',
      { class: 'music-room panel interactive hidden' },
      h('div', { class: 'mr-head' }, this.labelEl, h('span', { class: 'mr-live' }, '● LIVE')),
      this.ytHost,
      this.emptyEl,
      this.playBtn,
      h('div', { class: 'mr-now' }, this.titleEl, this.byEl),
      h('div', { class: 'mr-prog' }, h('div', { class: 'bar' }, this.fill), this.timeEl),
      h('div', { class: 'mr-row' }, this.skipBtn, h('span', { class: 'mr-volicon' }, '🔊'), this.vol),
      h('div', { class: 'mr-add' }, this.input, this.addBtn),
      this.queueEl
    );
    // Phòng không có bảng: nút nhỏ chỉ hiện khi trình duyệt chặn tự phát nhạc
    this.chip = h('button', { class: 'btn primary mr-chip interactive hidden', type: 'button', onclick: () => this.player?.playVideo() }, '🎵 Bấm để nghe nhạc');
    uiRoot().append(this.el, this.chip);
  }

  get noPanel() {
    return !!MUSIC_ROOMS[this.room]?.noPanel;
  }

  _setNeedPlay(need) {
    this.playBtn.classList.toggle('hidden', !need || this.noPanel);
    this.chip.classList.toggle('hidden', !need || !this.noPanel);
  }

  update(dt) {
    const g = this.g;
    const room = musicRoomAt(g.floorId, g.pos.x, g.pos.z);
    if (room !== this.room) {
      if (this.room) this._leave();
      this.room = room;
      this.inside = !!room;
      if (room) this._enter();
    }
    if (!this.inside) return;
    this.syncTimer -= dt;
    if (this.syncTimer <= 0) {
      this.syncTimer = 1;
      this._sync();
    }
  }

  _now() {
    return Date.now() + this.offset;
  }

  async _enter() {
    const room = this.room;
    this.state = null;
    this.labelEl.textContent = MUSIC_ROOMS[room].label;
    this.el.classList.toggle('yoga', room === 'yoga');
    this.el.classList.toggle('no-panel', this.noPanel);
    this._render();
    this.el.classList.remove('hidden');
    this._place();
    try {
      await this._ensurePlayer();
    } catch (e) {
      this.titleEl.textContent = e.message;
      return;
    }
    if (this.room !== room) return;
    const res = await this.g.net.request('music:get', { room });
    if (res?.ok) this._onState(res.state);
  }

  _leave() {
    this.el.classList.add('hidden');
    this._setNeedPlay(false);
    this.input.blur();
    if (this.ready) this.player.stopVideo();
    this.loadedId = null;
  }

  // Desktop: nằm bên phải, dưới minimap + cụm nút; mobile: góc trên
  _place() {
    const tr = document.querySelector('.hud-tr');
    if (tr && !isMobile() && window.innerWidth > 700) this.el.style.top = `${Math.round(tr.getBoundingClientRect().bottom + 22)}px`;
    else this.el.style.top = '';
  }

  _ensurePlayer() {
    if (this.player) return Promise.resolve();
    return loadYouTubeApi().then(
      (YT) =>
        new Promise((resolve) => {
          this.player = new YT.Player('mr-yt-player', {
            width: '100%',
            height: '100%',
            playerVars: { autoplay: 1, controls: 0, disablekb: 1, modestbranding: 1, rel: 0, playsinline: 1, fs: 0, iv_load_policy: 3 },
            events: {
              onReady: () => {
                this.ready = true;
                this._applyVolume();
                resolve();
              },
              onStateChange: (e) => this._onPlayerState(e.data),
              onError: () => {
                if (this.state?.cur?.id && this.loadedId === this.state.cur.id) this.g.net.emit('music:error', { room: this.room, id: this.state.cur.id });
              },
            },
          });
        })
    );
  }

  _applyVolume() {
    if (!this.ready) return;
    const v = settings.sound ? Math.round(settings.music * 100) : 0;
    this.player.setVolume(v);
    if (v === 0) this.player.mute();
    else this.player.unMute();
  }

  _onState(s) {
    if (!s || s.room !== this.room) return; // trạng thái của phòng khác
    this.offset = s.now - Date.now(); // đồng hồ server (đủ chính xác cho nhạc)
    this.state = s;
    if (s.msg && this.inside) toast(s.msg, 'info', 2500);
    this._render();
    if (this.inside) this._apply();
  }

  _apply() {
    const s = this.state;
    if (!this.ready || !s) return;
    if (s.seed && !this.seeding) this._readPlaylist(s.room, s.seed);
    if (!s.cur) {
      this.loadedId = null;
      this.player.stopVideo();
      return;
    }
    if (this.loadedId !== s.cur.id) {
      this.loadedId = s.cur.id;
      const start = Math.max(0, (this._now() - s.cur.startedAt) / 1000);
      this.player.loadVideoById({ videoId: s.cur.id, startSeconds: start });
      this._applyVolume();
      clearTimeout(this._autoplayCheck);
      this._autoplayCheck = setTimeout(() => {
        const st = this.player.getPlayerState?.();
        this._setNeedPlay(!(st === 1 || st === 3) && this.inside);
      }, 2500);
    }
  }

  _onPlayerState(st) {
    const YTS = window.YT.PlayerState;
    if (st === YTS.PLAYING) {
      this._setNeedPlay(false);
      const cur = this.state?.cur;
      if (cur && !cur.title) {
        const d = this.player.getVideoData?.();
        if (d?.title) {
          cur.title = d.title;
          cur.artist = d.author;
          this._render();
        }
      }
    }
    if (st === YTS.ENDED && this.state?.cur && this.loadedId === this.state.cur.id) this.g.net.emit('music:ended', { room: this.room, id: this.state.cur.id });
  }

  // Giữ đồng bộ với server + cập nhật thanh tiến độ
  _sync() {
    const c = this.state?.cur;
    if (!c || !this.ready || this.loadedId !== c.id) return this._renderProgress(0, 0);
    const expected = (this._now() - c.startedAt) / 1000;
    const dur = c.dur || this.player.getDuration?.() || 0;
    const st = this.player.getPlayerState?.();
    if (st === 1 && expected > 0) {
      const t = this.player.getCurrentTime();
      if (Math.abs(t - expected) > 2.5 && (!dur || expected < dur - 1)) this.player.seekTo(expected, true);
    }
    this._renderProgress(Math.max(0, expected), dur);
  }

  _renderProgress(t, dur) {
    this.fill.style.width = dur ? `${Math.min(100, (t / dur) * 100)}%` : '0%';
    this.timeEl.textContent = dur ? `${fmt(Math.min(t, dur))} / ${fmt(dur)}` : '';
  }

  _render() {
    const s = this.state;
    const c = s?.cur;
    this.titleEl.textContent = c ? c.title || 'Đang tải bài hát...' : 'Chưa có bài nào';
    this.byEl.textContent = c ? `${c.artist ? c.artist + ' • ' : ''}thêm bởi ${c.by}` : '';
    this.ytHost.classList.toggle('idle', !c);
    this.emptyEl.classList.toggle('hidden', !!c);
    this.emptyEl.textContent = !s ? 'Đang kết nối...' : s.auto ? '🔎 Đang tìm nhạc mới trên YouTube...' : MUSIC_ROOMS[this.room]?.playlist ? '📀 Đang tải playlist...' : '💡 Dán link YouTube bên dưới để mở nhạc cho cả phòng!';
    this.skipBtn.disabled = !c;
    this.skipBtn.textContent = s?.skips ? `⏭ Bỏ qua (${s.skips}/${s.need})` : '⏭ Bỏ qua';
    this.queueEl.innerHTML = '';
    if (s?.queue?.length) {
      this.queueEl.append(
        h('div', { class: 'mr-qh' }, 'Tiếp theo'),
        ...s.queue.slice(0, 4).map((q, i) => h('div', { class: 'mr-qi' }, h('span', {}, `${i + 1}.`), h('b', {}, q.title || 'Bài trong playlist'), h('em', {}, q.by)))
      );
    } else if (s?.auto) this.queueEl.append(h('div', { class: 'mr-qh' }, '🤖 Tự động đổi bài liên tục từ YouTube'));
    else if (s?.cur && MUSIC_ROOMS[this.room]?.playlist) this.queueEl.append(h('div', { class: 'mr-qh' }, '📀 Phát liên tục theo playlist của phòng'));
  }

  async _add() {
    const url = this.input.value.trim();
    if (!url) return;
    this.addBtn.disabled = true;
    const res = await this.g.net.request('music:add', { room: this.room, url }, 8000);
    this.addBtn.disabled = false;
    if (res?.ok) {
      this.input.value = '';
      toast(`✅ Đã thêm: ${res.title}`, 'success', 2500);
    } else toast(res?.message || 'Không thêm được bài', 'error');
  }

  // Đọc danh sách bài của playlist mặc định bằng 1 trình phát tạm (không phát, không làm gián đoạn bài đang nghe)
  _readPlaylist(room, list) {
    this.seeding = true;
    const host = h('div', { class: 'mr-probe' }, h('div', { id: 'mr-yt-probe' }));
    document.body.append(host);
    let done = false;
    const finish = (ids) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (ids?.length && this.room === room) this.g.net.emit('music:seed', { room, ids });
      setTimeout(() => {
        try {
          probe?.destroy();
        } catch {
          /* bỏ qua */
        }
        host.remove();
        this.seeding = false;
      }, 500);
    };
    const timer = setTimeout(() => finish(probe?.getPlaylist?.()), 10000);
    let probe = null;
    loadYouTubeApi().then((YT) => {
      probe = new YT.Player('mr-yt-probe', {
        width: 200,
        height: 200,
        playerVars: { listType: 'playlist', list, autoplay: 0, controls: 0 },
        events: {
          onReady: () => {
            probe.mute();
            const ids = probe.getPlaylist?.();
            if (ids?.length) finish(ids);
          },
          onStateChange: () => {
            const ids = probe.getPlaylist?.();
            if (ids?.length) finish(ids);
          },
          onError: () => finish(null),
        },
      });
    }, () => finish(null));
  }

  async _skip() {
    const res = await this.g.net.request('music:skip', { room: this.room });
    if (!res?.ok) toast(res?.message || 'Không bỏ qua được', 'error');
  }
}
