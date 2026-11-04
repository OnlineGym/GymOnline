import env from '../config/env.js';
import { MUSIC_ROOMS, musicRoomAt } from '../../../shared/constants.js';

/**
 * Phòng nhạc Aerobic: mỗi channel có 1 hàng đợi nhạc YouTube chung, mọi người trong phòng nghe đồng bộ.
 *  - Nhạc được PHÁT qua trình phát YouTube nhúng chính thức (IFrame Player) ở client – server không tải nhạc về.
 *  - Nguồn bài: người chơi dán link YouTube (kiểm tra qua oEmbed, không cần key)
 *              + tự động tìm theo từ khóa nếu có YOUTUBE_API_KEY (YouTube Data API v3)
 *              + playlist mặc định AEROBIC_YT_PLAYLIST (client đọc danh sách bài rồi gửi lên)
 *  - Hết bài tự chuyển; bỏ phiếu bỏ qua (quá nửa người trong phòng)
 */
const ID_RE = /^[A-Za-z0-9_-]{11}$/;
const QUERIES = [
  'aerobic dance workout music',
  'zumba fitness dance music',
  'nhạc aerobic sôi động',
  'dance workout mix',
  'kpop dance workout',
  'cardio dance music',
  'nhạc nhảy dân vũ sôi động',
  'gym motivation dance music',
];
const MAX_QUEUE = 25;
const PER_USER = 2;
const START_DELAY = 1500; // ms chờ client tải video trước khi tính giờ

export function parseYouTubeId(input) {
  const s = String(input || '').trim();
  if (ID_RE.test(s)) return s;
  try {
    const u = new URL(s.startsWith('http') ? s : `https://${s}`);
    const host = u.hostname.replace(/^(www\.|m\.|music\.)/, '');
    if (host === 'youtu.be') return ID_RE.test(u.pathname.slice(1, 12)) ? u.pathname.slice(1, 12) : null;
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      const v = u.searchParams.get('v');
      if (v && ID_RE.test(v)) return v;
      const m = /^\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/.exec(u.pathname);
      if (m) return m[1];
    }
  } catch {
    /* không phải URL */
  }
  return null;
}

export function parsePlaylistId(input) {
  const s = String(input || '').trim();
  if (/^[A-Za-z0-9_-]{12,64}$/.test(s)) return s;
  try {
    const list = new URL(s).searchParams.get('list');
    return list && /^[A-Za-z0-9_-]{12,64}$/.test(list) ? list : null;
  } catch {
    return null;
  }
}

// ISO 8601 (PT3M25S) -> giây
const isoDur = (d) => {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(d || '');
  return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
};

const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Kho bài tự tìm dùng chung cho mọi channel (tiết kiệm quota API: mỗi lần search = 100 đơn vị/ngày 10.000)
const pool = { items: [], fetching: null, qi: Math.floor(Math.random() * QUERIES.length), failUntil: 0 };

async function ytApi(path, params) {
  const url = `https://www.googleapis.com/youtube/v3/${path}?${new URLSearchParams({ ...params, key: env.youtubeApiKey })}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`YouTube API ${res.status}`);
  return res.json();
}

async function fetchDetails(ids) {
  if (!env.youtubeApiKey || !ids.length) return new Map();
  const data = await ytApi('videos', { part: 'contentDetails,snippet,status', id: ids.join(',') });
  return new Map(
    (data.items || [])
      .filter((v) => v.status?.embeddable !== false)
      .map((v) => [v.id, { title: v.snippet?.title || '', channel: v.snippet?.channelTitle || '', dur: isoDur(v.contentDetails?.duration) }])
  );
}

async function refillPool() {
  if (!env.youtubeApiKey || Date.now() < pool.failUntil) return;
  if (pool.fetching) return pool.fetching;
  pool.fetching = (async () => {
    try {
      const q = QUERIES[pool.qi++ % QUERIES.length];
      const s = await ytApi('search', {
        part: 'id',
        type: 'video',
        videoEmbeddable: 'true',
        videoSyndicated: 'true',
        maxResults: '25',
        safeSearch: 'strict',
        q,
      });
      const ids = (s.items || []).map((i) => i.id?.videoId).filter((id) => ID_RE.test(id));
      const det = await fetchDetails(ids);
      const fresh = [];
      for (const [id, d] of det) if (d.dur >= 90 && d.dur <= 12 * 60) fresh.push({ id, title: d.title, artist: d.channel, dur: d.dur, by: '🤖 Tự động' });
      pool.items.push(...shuffle(fresh));
      console.log(`[music] Tìm "${q}": +${fresh.length} bài (kho ${pool.items.length})`);
    } catch (e) {
      console.warn('[music] Không tìm được nhạc:', e.message);
      pool.failUntil = Date.now() + 5 * 60 * 1000; // lỗi (hết quota / key sai) -> nghỉ 5 phút
    } finally {
      pool.fetching = null;
    }
  })();
  return pool.fetching;
}

// Kiểm tra link người chơi gửi: còn tồn tại + cho phép nhúng (oEmbed trả 401 nếu tắt nhúng)
async function lookup(id) {
  if (env.youtubeApiKey) {
    try {
      const d = (await fetchDetails([id])).get(id);
      if (d) return { ok: true, title: d.title, artist: d.channel, dur: d.dur };
      return { ok: false, message: 'Video không tồn tại hoặc không cho phép phát nhúng' };
    } catch {
      /* rơi xuống oEmbed */
    }
  }
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, { signal: AbortSignal.timeout(6000) });
    if (res.status === 401 || res.status === 403) return { ok: false, message: 'Video này không cho phép phát nhúng' };
    if (!res.ok) return { ok: false, message: 'Không tìm thấy video' };
    const j = await res.json();
    return { ok: true, title: j.title || '', artist: j.author_name || '', dur: 0 };
  } catch {
    return { ok: false, message: 'Không kiểm tra được video, thử lại sau' };
  }
}

export class MusicRoom {
  constructor(channel, roomId) {
    this.ch = channel;
    this.roomId = roomId;
    this.cfg = MUSIC_ROOMS[roomId];
    this.queue = []; // bài người chơi thêm (ưu tiên)
    this.seeded = []; // bài từ playlist mặc định
    this.cur = null;
    this.recent = [];
    this.skips = new Set();
    this.timer = null;
    // Playlist mặc định: cấu hình của phòng, riêng Aerobic có thể đặt qua AEROBIC_YT_PLAYLIST
    this.playlist = this.cfg.playlist || (roomId === 'aerobic' ? parsePlaylistId(env.aerobicPlaylist) : null);
    this.seedAll = []; // toàn bộ bài playlist (phát hết thì trộn lại)
    this.seedTried = false;
    this.seedTimer = null;
    this.msg = '';
  }

  inRoom(p) {
    return musicRoomAt(p.f, p.x, p.z) === this.roomId;
  }

  get auto() {
    return !!(this.cfg.search && env.youtubeApiKey);
  }

  listeners() {
    let n = 0;
    for (const p of this.ch.players.values()) if (!p.bot && this.inRoom(p)) n++;
    return n;
  }

  skipNeed() {
    return Math.max(1, Math.ceil(this.listeners() / 2));
  }

  state() {
    const c = this.cur;
    return {
      room: this.roomId,
      cur: c ? { id: c.id, title: c.title, artist: c.artist, by: c.by, dur: c.dur || 0, startedAt: c.startedAt } : null,
      queue: [...this.queue, ...this.seeded].slice(0, 6).map((s) => ({ id: s.id, title: s.title, by: s.by })),
      queued: this.queue.length,
      auto: this.auto,
      seed: this.playlist && !this.seedAll.length && this.seedTried ? this.playlist : null,
      skips: this.skips.size,
      need: this.skipNeed(),
      msg: this.msg,
      now: Date.now(),
    };
  }

  broadcast() {
    this.ch.io.to(this.ch.floorRoom(this.cfg.f)).emit('music:state', this.state());
    this.msg = '';
  }

  // Có người vào phòng: đảm bảo đang phát (hoặc chuyển bài nếu bài cũ đã hết từ lâu)
  async touch() {
    const c = this.cur;
    if (c && c.dur && Date.now() - c.startedAt > (c.dur + 5) * 1000) return this.next();
    if (c) return undefined;
    // Có playlist mặc định nhưng chưa đọc được danh sách: nhờ client đọc (tối đa 8s), quá hạn thì phát bài mở đầu
    if (this.playlist && !this.seedAll.length && !this.seedTried) {
      this.seedTried = true;
      clearTimeout(this.seedTimer);
      this.seedTimer = setTimeout(() => !this.cur && this.next(), 8000);
      return undefined;
    }
    return this.next();
  }

  async next() {
    clearTimeout(this.timer);
    this.skips.clear();
    if (!this.seeded.length && this.seedAll.length) this.seeded = shuffle(this.seedAll.filter((x) => !this.recent.slice(-5).includes(x.id)).map((x) => ({ ...x })));
    let item = this.queue.shift() || this.seeded.shift();
    if (!item && this.cfg.first) item = { id: this.cfg.first, title: '', by: '📀 Mặc định' };
    if (!item && this.auto) {
      if (pool.items.length < 3) await refillPool();
      // tránh lặp bài vừa phát
      const i = pool.items.findIndex((s) => !this.recent.includes(s.id));
      if (i >= 0) item = pool.items.splice(i, 1)[0];
    }
    if (!item) {
      this.cur = null;
      this.broadcast();
      return;
    }
    this.cur = { ...item, startedAt: Date.now() + START_DELAY };
    this.recent.push(item.id);
    if (this.recent.length > 40) this.recent.shift();
    if (item.dur) this.timer = setTimeout(() => this.next(), (item.dur + 4) * 1000 + START_DELAY);
    this.broadcast();
    if (this.auto && pool.items.length < 4) refillPool();
  }

  async add(p, input) {
    if (!this.inRoom(p)) return { ok: false, message: 'Hãy vào trong phòng để thêm nhạc' };
    const id = parseYouTubeId(input);
    if (!id) return { ok: false, message: 'Link YouTube không hợp lệ' };
    if (this.queue.length >= MAX_QUEUE) return { ok: false, message: 'Hàng đợi đã đầy' };
    if (this.queue.filter((s) => s.userId === p.userId).length >= PER_USER) return { ok: false, message: `Mỗi người chỉ được chờ tối đa ${PER_USER} bài` };
    if (this.cur?.id === id || this.queue.some((s) => s.id === id)) return { ok: false, message: 'Bài này đã có trong danh sách' };
    const info = await lookup(id);
    if (!info.ok) return info;
    const name = p.appearance.displayName;
    this.queue.push({ id, title: info.title, artist: info.artist, dur: info.dur, by: name, userId: p.userId });
    this.msg = `🎵 ${name} đã thêm "${info.title}"`;
    if (!this.cur) await this.next();
    else this.broadcast();
    return { ok: true, title: info.title };
  }

  skip(p) {
    if (!this.cur) return { ok: false, message: 'Chưa có bài nào' };
    if (!this.inRoom(p)) return { ok: false, message: 'Bạn không ở trong phòng nhạc' };
    this.skips.add(p.userId);
    if (this.skips.size >= this.skipNeed()) {
      this.msg = '⏭ Đã bỏ qua bài hát';
      this.next();
    } else this.broadcast();
    return { ok: true };
  }

  // Client báo hết bài (khi không biết thời lượng) / video lỗi
  ended(p, id) {
    const c = this.cur;
    if (!c || c.id !== id || !this.inRoom(p)) return;
    const el = (Date.now() - c.startedAt) / 1000;
    if (el < 20 || (c.dur && el < c.dur - 8)) return;
    this.next();
  }

  error(p, id) {
    const c = this.cur;
    if (!c || c.id !== id || !this.inRoom(p)) return;
    this.msg = `⚠️ Không phát được "${c.title || id}", chuyển bài`;
    this.next();
  }

  // Danh sách bài từ playlist mặc định (client đọc qua trình phát YouTube rồi gửi lên)
  seed(p, ids) {
    if (!this.playlist || this.seedAll.length || !Array.isArray(ids)) return;
    if (!this.inRoom(p)) return;
    const uniq = [...new Set(ids.filter((id) => ID_RE.test(id)))].slice(0, 200);
    if (!uniq.length) return;
    this.seedAll = uniq.map((id) => ({ id, title: '', by: '📀 Playlist' }));
    // Bài mở đầu của phòng phát trước, phần còn lại trộn ngẫu nhiên
    // Bài mở đầu luôn phát trước (danh sách Mix của YouTube có thể không chứa chính bài gốc)
    const first = this.cfg.first && !this.recent.includes(this.cfg.first) ? [this.cfg.first] : [];
    if (this.cfg.first && !uniq.includes(this.cfg.first)) this.seedAll.unshift({ id: this.cfg.first, title: '', by: '📀 Playlist' });
    const rest = shuffle(uniq.filter((id) => !first.includes(id)));
    this.seeded = [...first, ...rest].map((id) => ({ id, title: '', by: '📀 Playlist' }));
    clearTimeout(this.seedTimer);
    if (!this.cur) this.next();
    else this.broadcast();
  }

  dispose() {
    clearTimeout(this.timer);
    clearTimeout(this.seedTimer);
  }
}
