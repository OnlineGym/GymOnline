import { Character } from '../character/Character.js';
import { RemotePlayer, lerpAngle } from '../character/RemotePlayer.js';
import { NPCs } from '../character/npcs.js';
import { EMOTES } from '../character/animations.js';
import { EQUIPMENT_INFO, STAT_LABELS, effort } from '../equipment/config.js';
import { roomAt, ROOMS, SPAWN } from '../world/layout.js';
import { LevelUpBurst } from '../world/effects.js';
import { HUD } from '../ui/hud.js';
import { Minimap } from '../ui/minimap.js';
import { ChatUI } from '../ui/chat.js';
import { EmoteWheel } from '../ui/emoteWheel.js';
import { MobileControls } from '../ui/joystick.js';
import { openLeaderboard, openHistory, openProfile, openOnlineList, openSettings } from '../ui/panels.js';
import { showCreatorScreen } from '../ui/creatorScreen.js';
import { toast } from '../ui/dom.js';
import { api, auth } from '../network/api.js';
import { audio } from './audio.js';
import { settings, onSettingsChange } from './settings.js';
import { isMobile } from './device.js';

const WALK_SPEED = 2.6;
const RUN_SPEED = 5.2;
const PLAYER_RADIUS = 0.36;
const SEND_INTERVAL = 1 / 12; // gửi vị trí ~12 lần/giây
const AEROBIC = ROOMS.find((r) => r.id === 'aerobic');

/**
 * Điều phối toàn bộ gameplay sau khi đăng nhập:
 * di chuyển, camera, tương tác máy tập, multiplayer, chat, emote, HUD.
 */
export class Game {
  constructor({ ctx, world, equipment, input, camera, net, initData, user, character }) {
    this.ctx = ctx;
    this.scene = ctx.scene;
    this.world = world;
    this.equipment = equipment;
    this.input = input;
    this.cam = camera;
    this.net = net;
    this.user = user;
    this.character = character; // dữ liệu từ server (level, stats...)
    this.remotes = new Map();
    this.mode = 'free'; // free | approach | working | utility
    this.session = null;
    this.vel = { x: 0, z: 0 };
    this.sendTimer = 0;
    this.lastSent = null;
    this.heartbeat = 0;
    this.todayCalories = 0;
    this.saunaTemp = 60;
    this.zoneId = null;
    this.busyRequest = false;

    // ---- Nhân vật của mình ----
    this.me = new Character(character, { isLocal: true });
    this.scene.add(this.me.root);
    const spawn = initData.spawn || { x: SPAWN.x, z: SPAWN.z, ry: Math.PI };
    this.pos = { x: spawn.x, z: spawn.z };
    this.ry = spawn.ry ?? Math.PI;
    this.me.root.position.set(this.pos.x, 0, this.pos.z);
    this.cam.yaw = this.ry + Math.PI;

    this.npcs = new NPCs(this.scene);
    for (const n of this.npcs.list) world.collision.addRect(n.def.pos[0], n.def.pos[2], 0.7, 0.7, 0, 'npc');
    this.burst = new LevelUpBurst(this.scene);

    this._buildUI();
    this._bindInput();
    this._bindNetwork();
    this._applyInit(initData);

    this.hud.setCharacter(character);
    api
      .history(1)
      .then((h) => {
        this.todayCalories = h.today.calories;
        this.hud.setTodayCalories(this.todayCalories);
      })
      .catch(() => {});
    this._loadChatHistory();
    this.chat.system(`Chào ${character.displayName}! Lại gần máy tập và bấm ${isMobile() ? 'nút Tập' : 'E'} để bắt đầu. Chúc tập vui 💪`);
  }

  // ================= UI =================
  _buildUI() {
    this.hud = new HUD({
      onInteract: () => this.interact(),
      onStop: () => this.stopActivity(),
      onMenu: (name) => this.openMenu(name),
    });
    this.minimap = new Minimap(this.hud.minimapCanvas, this.equipment);
    this.chat = new ChatUI({
      selfUserId: this.user.id,
      onSend: (channel, content, to) => this.sendChat(channel, content, to),
      onOpenDm: (userId) => this._loadDmHistory(userId),
    });
    this.emoteWheel = new EmoteWheel((name) => this.doEmote(name));
    if (isMobile()) {
      this.mobile = new MobileControls(this.input, {
        onInteract: () => this.interact(),
        onEmote: () => this.emoteWheel.toggle(),
        onChat: () => this.chat.toggle(),
      });
      this.chat.onUnread = (n) => this.mobile.setUnread(n);
    }
    this.hud.setFps(0, settings.showFps);
    onSettingsChange(() => this.hud.setFps(this.ctx.loopFps || 0, settings.showFps));
  }

  _bindInput() {
    const i = this.input;
    i.on('interact', () => this.interact());
    i.on('emoteWheel', () => this.emoteWheel.toggle());
    i.on('emoteHotkey', (idx) => {
      const name = Object.keys(EMOTES)[idx];
      if (name) this.doEmote(name);
    });
    i.on('chat', () => this.chat.focus());
    i.on('escape', () => this.emoteWheel.close());
    i.on('toggleMinimap', () => this.hud.toggleMinimap());
  }

  openMenu(name) {
    audio.sfx('click');
    switch (name) {
      case 'leaderboard':
        return openLeaderboard(this.user.id);
      case 'history':
        return openHistory();
      case 'profile':
        return openProfile(this.character, { onEdit: () => this.openWardrobe(false) });
      case 'online':
        return openOnlineList(this.onlinePlayers(), this.user.id, { onDm: (uid, nm) => this.chat.openDm(uid, nm) });
      case 'emote':
        return this.emoteWheel.toggle();
      case 'settings':
        return openSettings();
      case 'logout':
        if (confirm('Bạn muốn đăng xuất?')) {
          auth.token = null;
          location.reload();
        }
        return undefined;
      default:
        return undefined;
    }
  }

  onlinePlayers() {
    const list = [{ userId: this.user.id, name: this.character.displayName, level: this.character.level }];
    for (const r of this.remotes.values()) list.push({ userId: r.userId, name: r.appearance.displayName, level: r.appearance.level });
    return list;
  }

  // ================= MẠNG =================
  _applyInit(data) {
    for (const r of this.remotes.values()) {
      this.equipment.clearUser(r.char);
      r.dispose();
    }
    this.remotes.clear();
    for (const p of data.players) this._addRemote(p);
    this.equipment.setAllLocks(data.locks);
    this.hud.setOnline(this.remotes.size + 1);
  }

  _addRemote(p) {
    if (p.id === this.net.selfId || this.remotes.has(p.id)) return;
    this.remotes.set(p.id, new RemotePlayer(p, this.scene));
    this.hud.setOnline(this.remotes.size + 1);
  }

  _bindNetwork() {
    const n = this.net;
    n.onReinit = (data) => {
      // Kết nối lại sau khi rớt mạng: dựng lại danh sách người chơi
      if (this.mode !== 'free') this.stopActivity();
      this._applyInit(data);
      this.chat.system('🔌 Đã kết nối lại máy chủ.');
    };
    n.on('disconnect', () => this.chat.system('⚠️ Mất kết nối, đang thử kết nối lại...'));
    n.on('player:join', (p) => {
      this._addRemote(p);
      this.chat.system(`👋 ${p.appearance.displayName} vừa vào phòng gym`);
    });
    n.on('player:leave', ({ id }) => {
      const r = this.remotes.get(id);
      if (!r) return;
      this.equipment.clearUser(r.char);
      this.chat.system(`🚪 ${r.appearance.displayName} đã rời phòng`);
      r.dispose();
      this.remotes.delete(id);
      this.hud.setOnline(this.remotes.size + 1);
    });
    n.on('snapshot', ({ t, p }) => {
      for (const [id, x, y, z, ry, anim, eq] of p) {
        if (id === n.selfId) continue;
        this.remotes.get(id)?.push(t, x, y, z, ry, anim, eq);
      }
    });
    n.on('player:emote', ({ id, name }) => {
      if (id === n.selfId) return;
      this.remotes.get(id)?.char.playEmote(name);
    });
    n.on('equipment:lock', ({ equipmentId, socketId }) => this.equipment.setLock(equipmentId, socketId));
    n.on('chat', (msg) => {
      this.chat.add(msg);
      if (msg.channel !== 'dm') {
        const c = msg.fromSocket === n.selfId ? this.me : this.remotes.get(msg.fromSocket)?.char;
        c?.say(msg.content);
      }
      if (msg.fromSocket !== n.selfId) audio.sfx('pop');
    });
    n.on('player:appearance', ({ userId, appearance }) => {
      if (userId === this.user.id) {
        this.me.setAppearance(appearance);
        return;
      }
      for (const r of this.remotes.values()) if (r.userId === userId) r.setAppearance(appearance);
    });
    n.on('player:levelup', ({ userId, level }) => {
      if (userId === this.user.id) return;
      for (const r of this.remotes.values()) {
        if (r.userId !== userId) continue;
        r.char.setLevel(level);
        this.burst.spawn(r.position, '#22d3ee');
        this.chat.system(`🎉 ${r.appearance.displayName} đã lên Level ${level}!`);
      }
    });
    n.on('session:kicked', ({ reason }) => {
      alert(reason || 'Phiên đăng nhập đã kết thúc');
      location.reload();
    });
  }

  async _loadChatHistory() {
    try {
      const [g, nb] = await Promise.all([api.chatHistory('global'), api.chatHistory('nearby')]);
      this.chat.setHistory('global', g.messages);
      this.chat.setHistory('nearby', nb.messages);
    } catch (e) {
      this.chat.system(`Không tải được lịch sử chat: ${e.message}`);
    }
  }

  async _loadDmHistory(otherId) {
    try {
      const res = await api.chatHistory('dm', otherId);
      const msgs = res.messages.map((m) => ({ ...m, channel: 'dm', from: m.userId, to: m.userId === this.user.id ? otherId : this.user.id }));
      this.chat.setHistory('dm', msgs);
    } catch (e) {
      this.chat.system(`Không tải được tin nhắn riêng: ${e.message}`);
    }
  }

  async sendChat(channel, content, to) {
    const res = await this.net.request('chat', { channel, content, to });
    if (!res?.ok) {
      this.chat.system(`⛔ ${res?.message || 'Không gửi được'}`);
      audio.sfx('error');
    }
  }

  // ================= BIỂU CẢM =================
  doEmote(name) {
    if (this.mode !== 'free') {
      toast('Đang bận, hãy dừng tập trước khi dùng biểu cảm', 'error');
      return;
    }
    this.me.playEmote(name);
    this.net.emit('emote', name);
    audio.sfx('emote');
  }

  // ================= TƯƠNG TÁC MÁY TẬP =================
  async interact() {
    audio.unlock();
    if (this.mode === 'working' || this.mode === 'utility') return this.stopActivity();
    if (this.mode !== 'free' || this.busyRequest) return undefined;
    const eq = this.equipment.nearest(this.pos, 1.6);
    if (!eq) return undefined;
    if (!this.equipment.isFreeFor(eq, this.net.selfId)) {
      toast('Máy này đang có người sử dụng 🙅', 'error');
      audio.sfx('error');
      return undefined;
    }
    this.busyRequest = true;
    const res = await this.net.request('equipment:request', { id: eq.id, type: eq.type });
    this.busyRequest = false;
    if (!res?.ok) {
      toast(res?.message || 'Không thể sử dụng máy', 'error');
      audio.sfx('error');
      return undefined;
    }
    audio.sfx('click');
    this.me.stopEmote();
    this.session = { eq, approachTime: 0 };
    this.mode = 'approach';
    this.hud.hidePrompt();
    return undefined;
  }

  // Đã tới vị trí máy: vào tư thế và bắt đầu tập
  _beginActivity() {
    const { eq } = this.session;
    const now = this.ctx.clockTime;
    this.pos.x = eq.seat.x;
    this.pos.z = eq.seat.z;
    this.ry = eq.seat.ry;
    this.vel.x = this.vel.z = 0;
    this.me.root.position.set(eq.seat.x, eq.seat.y, eq.seat.z);
    this.me.play(eq.info.anim);
    this.equipment.setUser(eq, this.me, now);
    this.session.start = now;
    this.session.lastRep = 0;
    if (eq.info.utility) {
      this.mode = 'utility';
      if (eq.info.utility === 'wardrobe') this.openWardrobe(true);
      else this.hud.showWorkout({ label: eq.info.label, en: 'Đang sử dụng...' }, null);
    } else {
      this.mode = 'working';
      this.hud.showWorkout(eq.info, STAT_LABELS[eq.info.stat]);
    }
  }

  async openWardrobe(fromLocker) {
    const result = await showCreatorScreen(this.character, { mode: 'edit' });
    if (result) {
      this.character = { ...this.character, ...result };
      this.me.setAppearance(result);
      this.hud.setCharacter(this.character);
      toast('Đã đổi trang phục mới! ✨', 'success');
    }
    if (fromLocker && this.mode === 'utility') this.stopActivity();
  }

  async stopActivity() {
    if (!this.session || (this.mode !== 'working' && this.mode !== 'utility' && this.mode !== 'approach')) return;
    const { eq, start } = this.session;
    const wasWorking = this.mode === 'working';
    const now = this.ctx.clockTime;
    const duration = start !== undefined ? now - start : 0;
    const reps = start !== undefined ? Math.floor(duration / eq.info.rep) : 0;

    // Rời máy, trả nhân vật về điểm đứng dậy
    this.mode = 'free';
    this.session = null;
    this.equipment.clearUser(this.me);
    this.hud.hideWorkout();
    this.me.play('idle');
    this.me.root.position.y = 0;
    this.pos.x = eq.exit.x;
    this.pos.z = eq.exit.z;
    this.world.collision.resolve(this.pos, PLAYER_RADIUS);

    if (wasWorking) {
      if (duration < 3) {
        this.net.emit('equipment:release');
        toast('Buổi tập quá ngắn (tối thiểu 3 giây) nên không được tính', 'error');
        return;
      }
      // Ghi buổi tập TRƯỚC khi nhả máy để server kiểm chứng phiên tập
      try {
        const res = await api.logWorkout(eq.type, Math.round(duration), reps);
        this._onReward(res);
      } catch (e) {
        toast(`Không lưu được buổi tập: ${e.message}`, 'error');
      } finally {
        this.net.emit('equipment:release');
      }
    } else {
      this.net.emit('equipment:release');
    }
  }

  _onReward({ reward, character }) {
    this.character = character;
    this.hud.setCharacter(character);
    this.todayCalories += reward.calories;
    this.hud.setTodayCalories(this.todayCalories);
    toast(`✅ +${reward.exp} EXP • +${reward.statGain} ${STAT_LABELS[reward.stat]} • 🔥 ${reward.calories} kcal • 🪙 +${reward.coins}`, 'success', 3500);
    audio.sfx('coin');
    if (reward.levelsUp > 0) {
      this.me.setLevel(character.level);
      this.burst.spawn(this.pos);
      setTimeout(() => this.me.playEmote('cheer'), 300);
      toast(`🎉 LÊN LEVEL ${character.level}! +50 xu thưởng`, 'level', 4000);
      audio.sfx('levelup');
    }
  }

  // ================= VÒNG LẶP =================
  update(dt, t) {
    this.ctx.clockTime = t;
    const look = this.input.consumeLook();
    const beat = audio.getBeat();

    if (this.mode === 'free') this._updateMovement(dt);
    else if (this.mode === 'approach') this._updateApproach(dt);
    else this._updateActivity(t);

    // Nhân vật local
    this.me.root.position.x = this.pos.x;
    this.me.root.position.z = this.pos.z;
    this.me.root.rotation.y = lerpAngle(this.me.root.rotation.y, this.ry, 1 - Math.exp(-dt * 14));
    const myCtx = this._animCtx(this.me, t, beat);
    this.me.update(dt, myCtx);

    // Người chơi khác
    const serverNow = this.net.serverNow();
    for (const r of this.remotes.values()) {
      r.update(dt, serverNow);
      const eq = r.eq ? this.equipment.byId.get(r.eq) : null;
      if (eq) this.equipment.setUser(eq, r.char, t);
      else this.equipment.clearUser(r.char);
      r.char.play(r.anim);
      r.char.update(dt, this._animCtx(r.char, t, beat, eq));
    }

    this.npcs.update(dt, t, { beat }, this.pos);
    this.equipment.update(dt, t);
    this.burst.update(dt);

    // Cửa tự mở khi có người lại gần
    const positions = [this.pos];
    for (const r of this.remotes.values()) positions.push(r.position);
    this.world.update(dt, t, positions);

    this.cam.update(dt, this.me.root.position, look);
    this._updateZone(dt);
    this._updatePrompt();
    this._sendState(dt);

    const others = [];
    for (const r of this.remotes.values()) others.push(r.position);
    this.minimap.draw(dt, this.pos, this.cam.yaw, others);
    if (settings.showFps) this.hud.setFps(this.ctx.loopFps, true);
  }

  _animCtx(char, t, beat, eqOverride) {
    const eq = eqOverride || (char === this.me ? this.session?.eq : null);
    if (eq && eq.user === char) {
      const phase = this.equipment.phaseOf(eq, t);
      return { phase, p: effort(phase), beat };
    }
    return { phase: 0, p: 0, beat };
  }

  _updateMovement(dt) {
    const mv = this.input.getMove();
    const mag = Math.hypot(mv.x, mv.y);
    const { f, r } = this.cam.basis();
    let dx = r.x * mv.x + f.x * mv.y;
    let dz = r.z * mv.x + f.z * mv.y;
    const len = Math.hypot(dx, dz);
    if (len > 0) {
      dx /= len;
      dz /= len;
    }
    const running = this.input.isRunning() && mag > 0.5;
    const speed = (running ? RUN_SPEED : WALK_SPEED) * Math.min(1, mag);
    const k = 1 - Math.exp(-dt * 12);
    this.vel.x += (dx * speed - this.vel.x) * k;
    this.vel.z += (dz * speed - this.vel.z) * k;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.world.collision.resolve(this.pos, PLAYER_RADIUS);

    if (mag > 0.08) {
      this.ry = Math.atan2(dx, dz);
      this.me.stopEmote();
      this.me.play(running ? 'run' : 'walk');
    } else {
      this.me.play('idle');
    }
  }

  _updateApproach(dt) {
    const s = this.session;
    s.approachTime += dt;
    const seat = s.eq.seat;
    const dx = seat.x - this.pos.x;
    const dz = seat.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.08 || s.approachTime > 2.5) {
      this._beginActivity();
      return;
    }
    const step = Math.min(d, WALK_SPEED * dt);
    this.pos.x += (dx / d) * step;
    this.pos.z += (dz / d) * step;
    this.ry = Math.atan2(dx, dz);
    this.me.play('walk');
  }

  _updateActivity(t) {
    const s = this.session;
    if (!s) return;
    const { eq } = s;
    const elapsed = t - s.start;
    if (this.mode === 'working') {
      const reps = Math.floor(elapsed / eq.info.rep);
      if (reps > s.lastRep) {
        s.lastRep = reps;
        audio.sfx('rep');
      }
      this.hud.updateWorkout({
        reps,
        time: elapsed,
        cal: (eq.info.cal * elapsed) / 60,
        repProgress: this.equipment.phaseOf(eq, t),
      });
    } else if (eq.info.utility === 'timed') {
      this.hud.updateWorkout({ reps: 0, time: elapsed, cal: 0, repProgress: Math.min(1, elapsed / eq.info.duration) });
      if (elapsed >= eq.info.duration) {
        this.stopActivity();
        toast(eq.type === 'sink' ? '🧼 Tay đã sạch sẽ!' : '🚽 Nhẹ cả người!', 'success');
      }
    }
  }

  _updateZone(dt) {
    const room = roomAt(this.pos.x, this.pos.z);
    if (room.id !== this.zoneId) {
      this.zoneId = room.id;
      this.hud.setZone(room);
    }
    // Nhạc aerobic to dần khi lại gần phòng aerobic
    const ax = Math.max(AEROBIC.x1 - this.pos.x, 0, this.pos.x - AEROBIC.x2);
    const az = Math.max(AEROBIC.z1 - this.pos.z, 0, this.pos.z - AEROBIC.z2);
    const dist = Math.hypot(ax, az);
    audio.setMusicLevel(dist === 0 ? 1 : Math.max(0, 0.45 - dist / 25));
    // Nhiệt kế trong phòng xông hơi
    if (room.id === 'sauna') {
      const target = this.mode === 'working' ? 92 : 82;
      this.saunaTemp += (target - this.saunaTemp) * (1 - Math.exp(-dt * 0.3));
      this.hud.setThermo(this.saunaTemp);
    } else if (this.saunaTemp !== 60) {
      this.saunaTemp = 60;
      this.hud.setThermo(null);
    }
  }

  _updatePrompt() {
    if (this.mode !== 'free') this._lastPromptEq = undefined; // buộc vẽ lại prompt khi quay về chế độ tự do
    if (this.mode === 'working' || this.mode === 'utility') {
      this.hud.hidePrompt();
      this.mobile?.setInteract('⏹ Dừng', true);
      return;
    }
    if (this.mode !== 'free') {
      this.hud.hidePrompt();
      this.mobile?.setInteract(null);
      return;
    }
    const eq = this.equipment.nearest(this.pos, 1.6);
    if (eq === this._lastPromptEq && eq && this.equipment.isFreeFor(eq, this.net.selfId) === this._lastPromptFree) return;
    this._lastPromptEq = eq;
    if (!eq) {
      this.hud.hidePrompt();
      this.mobile?.setInteract(null);
      return;
    }
    const free = this.equipment.isFreeFor(eq, this.net.selfId);
    this._lastPromptFree = free;
    const info = EQUIPMENT_INFO[eq.type];
    const verb = info.utility ? (info.utility === 'wardrobe' ? 'Mở tủ' : 'Dùng') : 'Tập';
    const title = free ? `${verb}: ${eq.label}` : `${eq.label} – đang có người dùng`;
    const sub = info.utility ? info.en : `${info.en} • +${STAT_LABELS[info.stat]} • ~${info.cal} kcal/phút`;
    this.hud.showPrompt({ title, sub, busy: !free });
    this.mobile?.setInteract(free ? `👆 ${verb}: ${eq.label}` : '🙅 Đang có người', !free);
  }

  _sendState(dt) {
    this.sendTimer += dt;
    this.heartbeat += dt;
    if (this.sendTimer < SEND_INTERVAL) return;
    this.sendTimer = 0;
    const st = {
      x: +this.pos.x.toFixed(2),
      y: +this.me.root.position.y.toFixed(2),
      z: +this.pos.z.toFixed(2),
      ry: +this.ry.toFixed(3),
      anim: this.me.anim,
    };
    const l = this.lastSent;
    const changed = !l || l.x !== st.x || l.z !== st.z || l.y !== st.y || l.ry !== st.ry || l.anim !== st.anim;
    if (!changed && this.heartbeat < 1) return;
    this.heartbeat = 0;
    this.lastSent = st;
    this.net.volatile('state', st);
  }
}
