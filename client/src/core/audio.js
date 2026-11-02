import { settings, onSettingsChange } from './settings.js';

/**
 * Âm thanh tổng hợp bằng WebAudio (không cần file mp3):
 *  - Nhạc nền aerobic 124 BPM (kick, hi-hat, bass, hợp âm) – âm lượng theo khoảng cách tới phòng aerobic
 *  - Hiệu ứng: click, rep, lên level, tin nhắn, xu
 */
const BPM = 124;
const BEAT = 60 / BPM;
const BASS = [36, 36, 43, 36, 41, 41, 43, 38]; // nốt MIDI theo từng nhịp (8 nhịp lặp)
const CHORDS = [
  [60, 64, 67],
  [57, 60, 64],
  [65, 69, 72],
  [67, 71, 74],
];
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

class AudioManager {
  constructor() {
    this.ctx = null;
    this.musicLevel = 0;
    this.startPerf = performance.now();
    this._beatIndex = 0;
    this._nextBeatTime = 0;
    onSettingsChange(() => this._applyVolumes());
  }

  // Phải gọi sau 1 thao tác người dùng (chính sách autoplay của trình duyệt)
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0;
    this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.connect(this.master);
    this._noise = this._makeNoise();
    this._applyVolumes();
    this._nextBeatTime = this.ctx.currentTime + 0.1;
    this._timer = setInterval(() => this._schedule(), 50);
  }

  _applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(settings.sound ? 1 : 0, t, 0.05);
    this.sfxGain.gain.setTargetAtTime(settings.sfx, t, 0.05);
    this._updateMusicGain();
  }

  _updateMusicGain() {
    if (!this.ctx) return;
    this.musicGain.gain.setTargetAtTime(this.musicLevel * settings.music * 0.55, this.ctx.currentTime, 0.3);
  }

  // level 0..1 theo vị trí người chơi
  setMusicLevel(level) {
    if (Math.abs(level - this.musicLevel) < 0.02) return;
    this.musicLevel = level;
    this._updateMusicGain();
  }

  // Số nhịp đã trôi qua (dùng để đồng bộ điệu nhảy aerobic với nhạc)
  getBeat() {
    if (this.ctx) return this.ctx.currentTime / BEAT;
    return (performance.now() - this.startPerf) / 1000 / BEAT;
  }

  _makeNoise() {
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _schedule() {
    if (!this.ctx) return;
    // Đặt lịch các nhịp trong 0.2s tới. Nếu nhạc tắt hẳn thì bỏ qua cho nhẹ CPU
    while (this._nextBeatTime < this.ctx.currentTime + 0.2) {
      const audible = this.musicLevel > 0.01 && settings.sound && settings.music > 0;
      if (audible) this._playBeat(this._beatIndex, this._nextBeatTime);
      this._nextBeatTime += BEAT;
      this._beatIndex++;
    }
  }

  _playBeat(i, t) {
    const ctx = this.ctx;
    const out = this.musicGain;
    // Kick
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.26);
    // Hi-hat ở nửa nhịp
    this._hat(t + BEAT / 2, 0.18);
    if (i % 2 === 1) this._clap(t);
    // Bass
    const b = ctx.createOscillator();
    const bg = ctx.createGain();
    b.type = 'sawtooth';
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500;
    b.frequency.value = midi(BASS[i % BASS.length]);
    bg.gain.setValueAtTime(0.0001, t + BEAT / 2);
    bg.gain.exponentialRampToValueAtTime(0.25, t + BEAT / 2 + 0.02);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + BEAT * 0.95);
    b.connect(f).connect(bg).connect(out);
    b.start(t + BEAT / 2);
    b.stop(t + BEAT);
    // Hợp âm mỗi 4 nhịp
    if (i % 4 === 0) {
      const chord = CHORDS[Math.floor(i / 4) % CHORDS.length];
      for (const n of chord) {
        const c = ctx.createOscillator();
        const cg = ctx.createGain();
        c.type = 'triangle';
        c.frequency.value = midi(n);
        cg.gain.setValueAtTime(0.0001, t);
        cg.gain.exponentialRampToValueAtTime(0.06, t + 0.05);
        cg.gain.exponentialRampToValueAtTime(0.0001, t + BEAT * 3.5);
        c.connect(cg).connect(out);
        c.start(t);
        c.stop(t + BEAT * 3.6);
      }
    }
  }

  _hat(t, vol) {
    const s = this.ctx.createBufferSource();
    s.buffer = this._noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    s.connect(f).connect(g).connect(this.musicGain);
    s.start(t);
    s.stop(t + 0.06);
  }

  _clap(t) {
    const s = this.ctx.createBufferSource();
    s.buffer = this._noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1500;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    s.connect(f).connect(g).connect(this.musicGain);
    s.start(t);
    s.stop(t + 0.13);
  }

  _tone(freq, dur, { type = 'sine', vol = 0.3, delay = 0, slide = 0 } = {}) {
    if (!this.ctx || !settings.sound) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  sfx(name) {
    switch (name) {
      case 'click':
        this._tone(880, 0.06, { type: 'square', vol: 0.08 });
        break;
      case 'rep':
        this._tone(660, 0.08, { type: 'triangle', vol: 0.15 });
        break;
      case 'pop':
        this._tone(500, 0.1, { vol: 0.2, slide: 2 });
        break;
      case 'coin':
        this._tone(988, 0.08, { type: 'square', vol: 0.1 });
        this._tone(1319, 0.2, { type: 'square', vol: 0.1, delay: 0.08 });
        break;
      case 'levelup':
        [523, 659, 784, 1047].forEach((f, i) => this._tone(f, 0.25, { type: 'triangle', vol: 0.2, delay: i * 0.1 }));
        break;
      case 'error':
        this._tone(200, 0.2, { type: 'sawtooth', vol: 0.1, slide: 0.7 });
        break;
      case 'door':
        this._tone(300, 0.15, { type: 'triangle', vol: 0.06, slide: 0.6 });
        break;
      case 'emote':
        this._tone(700, 0.12, { vol: 0.15, slide: 1.5 });
        break;
      default:
        break;
    }
  }
}

export const audio = new AudioManager();
export const BEAT_SECONDS = BEAT;
