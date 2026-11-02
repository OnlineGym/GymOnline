import * as THREE from 'three';
import { Character } from '../character/Character.js';
import { RemotePlayer, lerpAngle } from '../character/RemotePlayer.js';
import { EMOTES } from '../character/animations.js';
import { EQUIPMENT_INFO, STAT_LABELS, effort } from '../equipment/config.js';
import { LevelUpBurst } from '../world/effects.js';
import { TRACK } from '../world/floors.js';
import { HUD } from '../ui/hud.js';
import { Minimap } from '../ui/minimap.js';
import { ChatUI } from '../ui/chat.js';
import { EmoteWheel } from '../ui/emoteWheel.js';
import { MobileControls } from '../ui/joystick.js';
import { ChallengeUI } from '../ui/challengeUI.js';
import { openLeaderboard, openHistory, openSettings } from '../ui/panels.js';
import { openSocial, openProfile, openGiftDialog, openReportDialog, openAchievements } from '../ui/social.js';
import { openShop } from '../ui/shop.js';
import { openInBody, openFloorPicker, openNearby } from '../ui/misc.js';
import { openBigMap } from '../ui/bigMap.js';
import { openFinder } from '../ui/finder.js';
import { openInteractionMenu, closeInteractionMenu } from '../ui/interactionMenu.js';
import { notify } from '../ui/notifications.js';
import { showCreatorScreen } from '../ui/creatorScreen.js';
import { showChannelScreen } from '../ui/channelScreen.js';
import { toast } from '../ui/dom.js';
import { api, auth } from '../network/api.js';
import { audio } from './audio.js';
import { settings, onSettingsChange, updateSettings } from './settings.js';
import { isMobile } from './device.js';
import { IxController } from './gameIx.js';
import { ANIM_INDEX, ACHIEVEMENTS, FLOORS, WORLD_BOUNDS, FLOOR_BOUNDS, PAIR_EMOTES, CHALLENGES, activeEvents } from '@shared/constants.js';

const WALK_SPEED = 2.6;
const RUN_SPEED = 5.2;
const PLAYER_RADIUS = 0.36;
const SEND_INTERVAL = 1 / 12; // gửi vị trí ~12 lần/giây
const GRAVITY = 13;
const JUMP_V = 4.6;
const BUSY_ANIMS = new Set(['idle', 'walk', 'run', 'jump', 'climb', 'elevator']);
const QUALITY_ORDER = ['low', 'medium', 'high'];
const SMALL_TALK = ['Nóng quá 🥵', 'Thư giãn ghê', 'Hôm nay tập gì?', 'Sauna đã thật', '😌', 'Mai tập chân nhé'];

/**
 * Điều phối gameplay: di chuyển + nhảy, tòa nhà nhiều tầng, AOI người chơi khác (LOD), máy tập,
 * lớp nhóm có điểm đồng bộ, chạy vòng sân thượng, tương tác người chơi, chat, xã hội, chỉ đường.
 */
export class Game {
  constructor({ ctx, building, equipment, input, camera, net, initData, user, character }) {
    this.ctx = ctx;
    this.scene = ctx.scene;
    this.building = building;
    this.equipment = equipment;
    this.input = input;
    this.cam = camera;
    this.net = net;
    this.user = user;
    this.character = character;
    this.remotes = new Map(); // nid -> RemotePlayer (chỉ người trong vùng AOI)
    this.eqByNid = new Map(); // nid -> equipmentId đang dùng
    this.friends = [];
    this.friendIds = new Set();
    this.blocked = new Set(initData.blocked || []);
    this.mode = 'free'; // free | approach | working | utility | running | ix | transit
    this.session = null;
    this.vel = { x: 0, z: 0 };
    this.jumpY = 0;
    this.jumpV = 0;
    this.sendTimer = 0;
    this.lastSent = null;
    this.heartbeat = 0;
    this.todayCalories = 0;
    this.saunaTemp = 60;
    this.zoneId = null;
    this.busyRequest = false;
    this.waypoint = null;
    this.partyId = initData.party || null;
    this.fpsWindow = [];
    this.qualityCooldown = 0;
    this.lodTimer = 0;
    this.talkTimer = 0;

    this.me = new Character(character, { isLocal: true });
    this.scene.add(this.me.root);
    this.burst = new LevelUpBurst(this.scene);
    this._buildWaypointMarkers();
    this._buildUI();
    this._bindInput();
    this._bindNetwork();
    this.ix = new IxController(this);
    this.chat.isBlocked = (uid) => this.blocked.has(uid);
    this.applyInit(initData);

    this.hud.setCharacter(character);
    if (initData.guild) this.me.setTag(initData.guild.tag);
    api
      .history(1)
      .then((h) => {
        this.todayCalories = h.today.calories;
        this.hud.setTodayCalories(this.todayCalories);
      })
      .catch(() => {});
    api.friends().then((r) => this.setFriends(r.friends)).catch(() => {});
    if (this.partyId) api.party().then((r) => this.onPartyUpdate(r.party)).catch(() => {});
    api.pendingGifts().then((r) => r.gifts.forEach((gft) => this._giftNotify({ ...gft, from: { name: gft.from } }))).catch(() => {});
    this.chat.system(`Chào ${character.displayName}! Tòa nhà có 5 tầng – thang máy ở phía Đông (bấm M xem bản đồ). Space để nhảy 🦘`);
  }

  // ======================= KHỞI TẠO / KẾT NỐI =======================
  applyInit(init) {
    for (const r of this.remotes.values()) r.dispose();
    this.remotes.clear();
    this.eqByNid.clear();
    this.channel = init.channel;
    this.floorId = init.f;
    this.building.setFloor(init.f);
    this.pos = { x: init.x, z: init.z };
    this.ry = init.ry ?? Math.PI;
    this.me.root.position.set(this.pos.x, 0, this.pos.z);
    this.cam.yaw = this.ry + Math.PI;
    this.equipment.setFloorLocks(init.f, init.locks);
    for (const [id, nid] of Object.entries(init.locks || {})) this.eqByNid.set(nid, id);
    this.hud.setFloor(init.f);
    this.hud.setEvents(init.events || []);
    this._loadChatHistory();
  }

  async switchChannel({ channel, url, goto } = {}) {
    if (this.mode !== 'free') await this.stopActivity();
    this.hud.showFloorOverlay('Đang chuyển channel...');
    try {
      const init = await this.net.connect(auth.token, { channel, url, goto });
      this.applyInit(init);
      toast(`📡 Đã vào ${init.channel.name}`, 'success');
    } catch (e) {
      toast(e.message, 'error');
      // quay về channel tự động nếu channel mới lỗi
      const init = await this.net.connect(auth.token, { channel: 'auto' }).catch(() => null);
      if (init) this.applyInit(init);
    }
    this.hud.hideFloorOverlay();
  }

  // ======================= UI =======================
  _buildUI() {
    this.hud = new HUD({
      onInteract: () => this.interact(),
      onStop: () => this.stopActivity(),
      onMenu: (name) => this.openMenu(name),
    });
    this.minimap = new Minimap(this.hud.minimapCanvas, this.building, this.equipment);
    this.chat = new ChatUI({
      selfUserId: this.user.id,
      onSend: (channel, content, to) => this.sendChat(channel, content, to),
      onOpenDm: (userId) => this._loadDmHistory(userId),
    });
    this.emoteWheel = new EmoteWheel((name) => this.doEmote(name));
    this.challengeUI = new ChallengeUI({ onInput: (a) => this.ix.input(a), onCancel: (id) => this.ix.cancel(id) });
    if (isMobile()) {
      this.mobile = new MobileControls(this.input, {
        onInteract: () => this.interact(),
        onEmote: () => this.emoteWheel.toggle(),
        onChat: () => this.chat.toggle(),
        onJump: (down) => this.onSpace(down),
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
    i.on('escape', () => {
      this.emoteWheel.close();
      closeInteractionMenu();
    });
    i.on('map', () => this.openMenu('map'));
    i.on('finder', () => this.openMenu('finder'));
    i.on('social', () => this.openMenu('social'));
    i.on('inventory', () => this.openMenu('inventory'));
    i.on('space', () => this.onSpace(true));
    i.on('spaceUp', () => this.onSpace(false));
    i.on('spar', (a) => this.mode === 'ix' && this.ix.active?.kind === 'spar' && this.ix.input(a));
    i.on('interactPlayer', () => {
      const r = this._nearestRemote(4);
      if (r) this.openPlayerMenu(r, window.innerWidth / 2, window.innerHeight / 2);
      else toast('Không có ai ở gần', 'info', 1500);
    });
    i.on('click', (x, y) => this._onClick(x, y));
  }

  onSpace(down) {
    if (this.mode === 'ix') return this.ix.onSpace(down);
    if (!down) return;
    if (this.mode === 'working' && this.session?.eq.info.klass) return this._judgeBeat();
    if ((this.mode === 'free' || this.mode === 'running') && this.jumpY <= 0.001) {
      this.jumpV = JUMP_V;
      this.jumpY = 0.001;
      this.me.stopEmote();
    }
  }

  openMenu(name) {
    audio.sfx('click');
    closeInteractionMenu();
    switch (name) {
      case 'leaderboard':
        return openLeaderboard(this.user.id, (uid) => openProfile(this, uid));
      case 'history':
        return openHistory();
      case 'profile':
        return openProfile(this, this.user.id);
      case 'social':
        return openSocial(this);
      case 'nearby':
        return this.openNearbyList();
      case 'inventory':
        return openShop(this, 'inventory');
      case 'achievements':
        return openAchievements();
      case 'map':
        return openBigMap({
          building: this.building,
          equipment: this.equipment,
          currentFloor: this.floorId,
          self: this.pos,
          friends: this.friends,
          onWaypoint: (w) => this.setWaypoint(w),
        });
      case 'finder':
        return openFinder({
          equipment: this.equipment,
          currentFloor: this.floorId,
          self: this.pos,
          level: this.character.level,
          getLocks: async (f) => (f === this.floorId ? Object.fromEntries([...this.equipment.locks].filter(([k]) => k.startsWith(`f${f}:`))) : (await this.net.request('locks:floor', { f }))?.locks || {}),
          onWaypoint: (w) => this.setWaypoint(w),
        });
      case 'channel':
        return showChannelScreen({ current: this.channel?.id, cancelable: true }).then((c) => c && c.channel !== this.channel?.id && this.switchChannel(c));
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

  async openNearbyList() {
    const res = await this.net.request('nearby:list', {});
    const players = (res?.players || []).map((p) => ({ ...p, friend: this.friendIds.has(p.userId) }));
    openNearby(players, (p) => {
      const r = this.remotes.get(p.nid);
      this.openPlayerMenu(r || { userId: p.userId, name: p.name, appearance: { level: p.level } }, window.innerWidth / 2 - 100, window.innerHeight / 3);
    });
  }

  // ---- Menu tương tác người chơi ----
  openPlayerMenu(r, x, y) {
    const target = { userId: r.userId, name: r.name || r.appearance?.displayName, level: r.appearance?.level };
    openInteractionMenu({
      x,
      y,
      target,
      actions: {
        profile: () => openProfile(this, target.userId),
        friend: async () => {
          try {
            const res = await api.friendRequest(target.userId);
            toast(res.status === 'accepted' ? '🤝 Đã thành bạn bè!' : `📨 Đã gửi lời mời kết bạn tới ${target.name}`, 'success');
          } catch (e) {
            toast(e.message, 'error');
          }
        },
        party: () => this.inviteParty(target.userId, target.name),
        guild: async () => {
          try {
            await api.guildInvite(target.userId);
            toast(`🛡️ Đã mời ${target.name} vào CLB`, 'success');
          } catch (e) {
            toast(e.message, 'error');
          }
        },
        pair: (sub) => this.ix.invite('pair', sub, [target.userId], target.name),
        challenge: (kind) => this.ix.invite(kind, kind, [target.userId], CHALLENGES[kind].label),
        dm: () => this.chat.openDm(target.userId, target.name),
        gift: () => openGiftDialog(this, target),
        block: async () => {
          if (!confirm(`Chặn ${target.name}? Bạn sẽ không thấy tin nhắn và lời mời của họ.`)) return;
          await api.block(target.userId).catch((e) => toast(e.message, 'error'));
          this.blocked.add(target.userId);
          toast(`🚫 Đã chặn ${target.name}`, 'success');
        },
        report: () => openReportDialog(target),
      },
    });
  }

  _onClick(x, y) {
    // Chọn nhân vật gần điểm click nhất trên màn hình (bán kính 60px)
    let best = null;
    let bestD = 60;
    const v = new THREE.Vector3();
    for (const r of this.remotes.values()) {
      if (!r.char.root.visible) continue;
      v.copy(r.position);
      v.y += 1;
      v.project(this.ctx.camera);
      if (v.z > 1) continue;
      const sx = ((v.x + 1) / 2) * window.innerWidth;
      const sy = ((1 - v.y) / 2) * window.innerHeight;
      const d = Math.hypot(sx - x, sy - y);
      if (d < bestD) {
        bestD = d;
        best = r;
      }
    }
    if (best) this.openPlayerMenu(best, x + 12, y - 20);
  }

  _nearestRemote(range) {
    let best = null;
    let bd = range;
    for (const r of this.remotes.values()) {
      const d = Math.hypot(r.position.x - this.pos.x, r.position.z - this.pos.z);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    return best;
  }

  // ======================= MẠNG =======================
  _addRemote(info) {
    if (info.nid === this.net.nid || this.remotes.has(info.nid)) return;
    const r = new RemotePlayer(info, this.scene);
    this.remotes.set(info.nid, r);
    if (info.eq) this.eqByNid.set(info.nid, info.eq);
    if (this.blocked.has(r.userId)) r.char.nameEl.classList.add('blocked');
  }

  _removeRemote(nid) {
    const r = this.remotes.get(nid);
    if (!r) return;
    this.equipment.clearUser(r.char);
    r.dispose();
    this.remotes.delete(nid);
  }

  _bindNetwork() {
    const n = this.net;
    n.onReinit = (data) => {
      if (this.mode !== 'free') this.stopActivity();
      this.applyInit(data);
      this.chat.system('🔌 Đã kết nối lại máy chủ.');
    };
    n.on('disconnect', () => this.chat.system('⚠️ Mất kết nối, đang thử kết nối lại...'));
    n.on('aoi', ({ e, l }) => {
      for (const nid of l) this._removeRemote(nid);
      for (const info of e) this._addRemote(info);
    });
    n.on('s', ({ t, p }) => {
      for (const [nid, x, y, z, r, an] of p) this.remotes.get(nid)?.push(t, x, y, z, r, an);
    });
    n.on('lock', ({ id, nid }) => {
      this.equipment.setLock(id, nid);
      if (nid) this.eqByNid.set(nid, id);
      else for (const [k, v] of this.eqByNid) if (v === id) this.eqByNid.delete(k);
    });
    n.on('emote', ({ nid, name }) => this.remotes.get(nid)?.char.playEmote(name));
    n.on('appearance', ({ nid, a }) => {
      if (nid === this.net.nid) return;
      this.remotes.get(nid)?.setAppearance(a);
    });
    n.on('correct', ({ x, z, f }) => {
      // server kéo về vị trí hợp lệ (di chuyển bất thường)
      if (f !== this.floorId) return;
      this.pos.x = x;
      this.pos.z = z;
    });
    n.on('chat', (msg) => {
      if (this.blocked.has(msg.userId)) return;
      this.chat.add(msg);
      if (msg.channel === 'global' || msg.channel === 'nearby') {
        const c = msg.fromNid === this.net.nid ? this.me : this.remotes.get(msg.fromNid)?.char;
        c?.say(msg.content);
      }
      if (msg.fromNid !== this.net.nid) audio.sfx('pop');
    });
    n.on('character', (c) => this.onCharacter(c));
    n.on('toast', (d) => toast(d.text, d.type || 'info', 4000));
    n.on('achievement', (a) => {
      toast(`🏅 Thành tích mới: ${a.icon} ${a.label}`, 'level', 4500);
      audio.sfx('levelup');
    });
    n.on('event', ({ events }) => {
      this.hud.setEvents(events);
      for (const e of events) notify({ icon: e.icon, title: 'Sự kiện bắt đầu!', text: e.label, timeout: 8000 });
    });
    n.on('notify', (d) => this._onNotify(d));
    n.on('party:update', (v) => this.onPartyUpdate(v));
    n.on('party:progress', (p) => {
      if (this.partyView) this.onPartyUpdate({ ...this.partyView, progress: p });
    });
    n.on('guild:update', (d) => d.joined && this.chat.system(`🛡️ ${d.joined} vừa gia nhập CLB`));
    n.on('session:kicked', ({ reason }) => {
      alert(reason || 'Phiên đăng nhập đã kết thúc');
      location.reload();
    });
  }

  _onNotify(d) {
    const from = d.from?.name || 'Ai đó';
    switch (d.kind) {
      case 'friend_request':
        notify({
          icon: '🤝',
          title: `${from} muốn kết bạn`,
          actions: [
            { label: 'Đồng ý', primary: true, fn: () => api.friendAccept(d.from.userId).then(() => toast('🤝 Đã thành bạn bè!', 'success')).catch((e) => toast(e.message, 'error')) },
            { label: 'Từ chối', fn: () => api.friendRemove(d.from.userId).catch(() => {}) },
          ],
        });
        break;
      case 'friend_accepted':
        toast(`🤝 ${from} đã đồng ý kết bạn`, 'success');
        api.friends().then((r) => this.setFriends(r.friends)).catch(() => {});
        break;
      case 'party_invite':
        notify({
          icon: '👥',
          title: `${from} mời bạn vào party`,
          text: 'Mục tiêu calo chung + 10% EXP khi tập',
          actions: [
            {
              label: 'Tham gia',
              primary: true,
              fn: async () => {
                try {
                  const r = await api.partyJoin(d.partyId);
                  this.onPartyUpdate(r.party);
                  toast('👥 Đã vào party! Chat nhóm ở tab Party', 'success');
                } catch (e) {
                  toast(e.message, 'error');
                }
              },
            },
            { label: 'Bỏ qua' },
          ],
        });
        break;
      case 'party_kicked':
        toast('Bạn đã bị mời ra khỏi party', 'error');
        this.onPartyUpdate(null);
        break;
      case 'guild_invite':
        notify({
          icon: '🛡️',
          title: `${from} mời bạn vào CLB ${d.guildName}`,
          actions: [
            {
              label: 'Tham gia',
              primary: true,
              fn: async () => {
                try {
                  const r = await api.guildJoin(d.guildId);
                  this.onGuildChange(r.guild);
                  toast(`🛡️ Đã vào CLB ${d.guildName}`, 'success');
                } catch (e) {
                  toast(e.message, 'error');
                }
              },
            },
            { label: 'Bỏ qua' },
          ],
        });
        break;
      case 'guild_kicked':
        toast(`Bạn đã rời CLB ${d.guildName}`, 'error');
        this.onGuildChange(null);
        break;
      case 'gift':
        this._giftNotify(d);
        break;
      case 'gift_accepted':
        toast(`🎁 ${from} đã nhận quà của bạn`, 'success');
        break;
      case 'gift_declined':
        toast(`🎁 ${from} từ chối quà – đã hoàn lại cho bạn`, 'info');
        api.getCharacter().then((r) => this.onCharacter(r.character)).catch(() => {});
        break;
      default:
        break;
    }
  }

  _giftNotify(d) {
    const what = [d.coins ? `🪙 ${d.coins} xu` : null, d.item ? `${d.qty}x ${d.item}` : null].filter(Boolean).join(' + ');
    notify({
      icon: '🎁',
      title: `${d.from?.name || d.from} tặng bạn ${what}`,
      text: d.message || '',
      timeout: 60000,
      actions: [
        {
          label: 'Nhận',
          primary: true,
          fn: async () => {
            try {
              const r = await api.acceptGift(d.id);
              this.onCharacter(r.character);
              audio.sfx('coin');
              toast('🎁 Đã nhận quà!', 'success');
            } catch (e) {
              toast(e.message, 'error');
            }
          },
        },
        { label: 'Từ chối', fn: () => api.declineGift(d.id).catch(() => {}) },
      ],
    });
  }

  setFriends(list) {
    this.friends = list;
    this.friendIds = new Set(list.map((f) => f.userId));
  }

  onCharacter(c) {
    this.character = { ...this.character, ...c };
    this.hud.setCharacter(this.character);
  }

  onPartyUpdate(view) {
    this.partyView = view;
    this.partyId = view?.id || null;
    this.hud.setParty(view);
  }

  onGuildChange(g) {
    this.me.setTag(g?.tag || null);
    this.character.guildId = g?.id || null;
  }

  async inviteParty(userId, name) {
    try {
      const r = await api.partyInvite(userId);
      this.onPartyUpdate(r.party);
      toast(`👥 Đã mời ${name} vào party`, 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async gotoFriend(f) {
    if (!f.online || !f.presence) return toast('Bạn bè đang offline', 'error');
    if (this.mode !== 'free') await this.stopActivity();
    if (f.presence.channel !== this.channel?.id) {
      if (!confirm(`${f.name} đang ở ${f.presence.channelName}. Chuyển sang channel đó?`)) return;
      return this.switchChannel({ channel: f.presence.channel, url: f.presence.url, goto: f.userId });
    }
    const r = await this.net.request('goto', { userId: f.userId });
    if (!r?.ok) return toast(r?.message || 'Không tới được', 'error');
    await this.enterFloor(r.f, { x: r.x, z: r.z }, `Đang tới chỗ ${f.name}...`, r.locks);
    toast(`📍 Đã tới chỗ ${f.name}`, 'success');
  }

  async _loadChatHistory() {
    const ch = this.channel?.id;
    try {
      const [g, nb, pt, gd] = await Promise.all([
        api.chatHistory('global', { ch }),
        api.chatHistory('nearby', { ch }),
        api.chatHistory('party'),
        api.chatHistory('guild'),
      ]);
      this.chat.setHistory('global', g.messages.map((m) => ({ ...m, channel: 'global' })));
      this.chat.setHistory('nearby', nb.messages.map((m) => ({ ...m, channel: 'nearby' })));
      this.chat.setHistory('party', pt.messages.map((m) => ({ ...m, channel: 'party' })));
      this.chat.setHistory('guild', gd.messages.map((m) => ({ ...m, channel: 'guild' })));
    } catch (e) {
      this.chat.system(`Không tải được lịch sử chat: ${e.message}`);
    }
  }

  async _loadDmHistory(otherId) {
    try {
      const res = await api.chatHistory('dm', { withUser: otherId });
      this.chat.setHistory('dm', res.messages.map((m) => ({ ...m, channel: 'dm', from: m.userId, to: m.userId === this.user.id ? otherId : this.user.id })));
    } catch (e) {
      this.chat.system(`Không tải được tin nhắn riêng: ${e.message}`);
    }
  }

  async sendChat(channel, content, to) {
    const res = await this.net.request('chat', { channel, content, to });
    if (!res?.ok) {
      this.chat.system(`⛔ ${res?.message || 'Không gửi được'}`);
      audio.sfx('error');
    } else if (res.note) this.chat.system(res.note);
  }

  doEmote(name) {
    if (this.mode !== 'free') return toast('Đang bận, hãy dừng hoạt động trước khi dùng biểu cảm', 'error');
    this.me.playEmote(name);
    this.net.emit('emote', name);
    audio.sfx('emote');
  }

  // ======================= TẦNG =======================
  // Vào tầng (đã được server chấp thuận): hiện loading nếu tầng chưa dựng
  async enterFloor(f, pos, text, locks) {
    const needBuild = !this.building.isBuilt(f);
    if (f !== this.floorId || needBuild) {
      this.hud.showFloorOverlay(text || `Đang tới ${FLOORS[f].name}...`);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      for (const nid of [...this.remotes.keys()]) this._removeRemote(nid);
      this.eqByNid.clear();
      this.building.setFloor(f);
      this.floorId = f;
      this.hud.setFloor(f);
      this.zoneId = null;
      setTimeout(() => this.hud.hideFloorOverlay(), needBuild ? 200 : 450);
    }
    if (locks) {
      this.equipment.setFloorLocks(f, locks);
      for (const [id, nid] of Object.entries(locks)) this.eqByNid.set(nid, id);
    }
    this.pos.x = pos.x;
    this.pos.z = pos.z;
    this.vel.x = this.vel.z = 0;
    this.jumpY = 0;
    this.me.root.position.set(pos.x, 0, pos.z);
    this.cam.snap = true;
    this._checkWaypointFloor();
  }

  async changeFloor(to, via) {
    if (this.busyRequest) return;
    this.busyRequest = true;
    this.mode = 'transit';
    this.me.play(via === 'elevator' ? 'elevator' : 'climb');
    this.hud.showFloorOverlay(`${via === 'elevator' ? '🛗 Thang máy' : via === 'stairs' ? '🪜 Cầu thang' : '🛗 Thang cuốn'} → ${FLOORS[to].name}`);
    const res = await this.net.request('floor:change', { to, via });
    this.busyRequest = false;
    if (!res?.ok) {
      this.hud.hideFloorOverlay();
      this.mode = 'free';
      return toast(res?.message || 'Không đổi được tầng', 'error');
    }
    await new Promise((r) => setTimeout(r, 350));
    await this.enterFloor(res.f, { x: res.x, z: res.z }, null, res.locks);
    this.mode = 'free';
    this.me.play('idle');
    audio.sfx('door');
  }

  // ======================= CHỈ ĐƯỜNG =======================
  _buildWaypointMarkers() {
    const beamMat = new THREE.MeshBasicMaterial({ color: '#f472b6', transparent: true, opacity: 0.35, depthWrite: false });
    this.wpBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 6, 16, 1, true), beamMat);
    this.wpBeam.visible = false;
    this.scene.add(this.wpBeam);
    const arrowMat = new THREE.MeshBasicMaterial({ color: '#f472b6' });
    this.wpArrow = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.45, 12), arrowMat);
    this.wpArrow.rotation.x = Math.PI / 2;
    this.wpArrowPivot = new THREE.Group();
    this.wpArrowPivot.add(this.wpArrow);
    this.wpArrow.position.z = 0.9;
    this.wpArrowPivot.visible = false;
    this.scene.add(this.wpArrowPivot);
  }

  setWaypoint(w) {
    this.waypoint = w;
    toast(`📍 Chỉ đường tới: ${w.label}${w.f !== this.floorId ? ` (tầng ${FLOORS[w.f].key} – đi thang máy)` : ''}`, 'info', 3000);
    this._checkWaypointFloor();
  }

  // Mục tiêu hiện tại: nếu khác tầng thì dẫn tới thang máy trước
  _checkWaypointFloor() {
    const w = this.waypoint;
    if (!w) return (this.wpTarget = null);
    this.wpTarget = w.f === this.floorId ? w : { x: 38.2, z: 0, label: `Thang máy → tầng ${FLOORS[w.f].key}`, transit: true };
  }

  _updateWaypoint(t) {
    const tg = this.wpTarget;
    this.wpBeam.visible = !!tg;
    this.wpArrowPivot.visible = !!tg;
    if (!tg) return;
    this.wpBeam.position.set(tg.x, 3, tg.z);
    this.wpBeam.material.opacity = 0.25 + Math.sin(t * 4) * 0.1;
    this.wpArrowPivot.position.set(this.pos.x, 1.95 + this.jumpY, this.pos.z);
    this.wpArrowPivot.rotation.y = Math.atan2(tg.x - this.pos.x, tg.z - this.pos.z);
    const d = Math.hypot(tg.x - this.pos.x, tg.z - this.pos.z);
    if (d < 1.8 && !tg.transit) {
      toast(`✅ Đã tới ${tg.label}`, 'success');
      this.waypoint = null;
      this.wpTarget = null;
    }
  }

  // ======================= MÁY TẬP / TIỆN ÍCH =======================
  async interact() {
    audio.unlock();
    if (this.mode === 'working' || this.mode === 'utility' || this.mode === 'running') return this.stopActivity();
    if (this.mode !== 'free' || this.busyRequest) return undefined;
    const eq = this.equipment.nearest(this.floorId, this.pos, 1.6);
    if (!eq) return undefined;
    const info = eq.info;
    // ---- tiện ích không cần khóa ----
    if (info.utility === 'transit') {
      if (eq.type === 'elevator') return openFloorPicker(this.floorId, (f) => this.changeFloor(f, 'elevator'));
      const to = this.floorId + info.dir;
      if (to < 0 || to >= FLOORS.length) return undefined;
      return this.changeFloor(to, eq.type.startsWith('stairs') ? 'stairs' : 'escalator');
    }
    if (info.utility === 'shop') {
      this.me.play('shopping');
      setTimeout(() => this.mode === 'free' && this.me.play('idle'), 2500);
      return openShop(this, eq.model?.type || info.model.type);
    }
    if (info.utility === 'inbody') {
      this.me.play('inbody');
      setTimeout(() => this.mode === 'free' && this.me.play('idle'), 3000);
      return openInBody(this.character);
    }
    if ((this.character.level || 1) < (info.unlock || 1)) {
      audio.sfx('error');
      return toast(`🔒 ${eq.label} cần Level ${info.unlock}`, 'error');
    }
    if (!this.equipment.isFreeFor(eq, this.net.nid)) {
      audio.sfx('error');
      return toast('Máy này đang có người sử dụng 🙅', 'error');
    }
    this.busyRequest = true;
    const res = await this.net.request('equipment:request', { id: eq.id, type: eq.type, slot: eq.slot });
    this.busyRequest = false;
    if (!res?.ok) {
      audio.sfx('error');
      return toast(res?.message || 'Không thể sử dụng máy', 'error');
    }
    audio.sfx('click');
    this.me.stopEmote();
    this.waypoint = null;
    this.wpTarget = null;
    if (info.freeMove) return this._beginRunning(eq);
    this.session = { eq, approachTime: 0 };
    this.mode = 'approach';
    this.hud.hidePrompt();
    return undefined;
  }

  _beginActivity() {
    const { eq } = this.session;
    const now = this.ctx.clockTime;
    this.pos.x = eq.seat.x;
    this.pos.z = eq.seat.z;
    this.ry = eq.seat.ry;
    this.vel.x = this.vel.z = 0;
    this.jumpY = 0;
    this.me.root.position.set(eq.seat.x, eq.seat.y, eq.seat.z);
    this.me.play(eq.info.anim);
    this.equipment.setUser(eq, this.me, now);
    Object.assign(this.session, { start: now, lastRep: 0, sync: { points: 0, presses: 0, lastBeat: -1 }, duoShown: false });
    if (eq.info.utility) {
      this.mode = 'utility';
      if (eq.info.utility === 'wardrobe') this.openWardrobe(true);
      else this.hud.showWorkout({ label: eq.info.label, en: 'Đang sử dụng...' }, null);
    } else {
      this.mode = 'working';
      this.hud.showWorkout(eq.info, `+${STAT_LABELS[eq.info.group]}`, { klass: !!eq.info.klass });
      if (eq.info.klass) toast(`🎵 Lớp ${eq.info.label}: bấm SPACE đúng nhịp để tăng điểm đồng bộ (tối đa +30% EXP)`, 'info', 4500);
    }
  }

  // Chạy vòng sân thượng: được di chuyển tự do, đếm vòng theo góc quanh tâm đường chạy
  _beginRunning(eq) {
    const now = this.ctx.clockTime;
    this.mode = 'running';
    this.session = { eq, start: now, laps: 0, angle: 0, lastAngle: null, lastRep: 0 };
    this.hud.showWorkout(eq.info, '+Thể lực • chạy theo vòng', { laps: true });
    toast('🏁 Chạy quanh đường chạy màu cam. Bấm E để kết thúc', 'info', 4000);
  }

  _updateLaps() {
    const s = this.session;
    const { outer, inner, cx, cz } = TRACK;
    const x = this.pos.x;
    const z = this.pos.z;
    const onTrack = x > outer.x1 && x < outer.x2 && z > outer.z1 && z < outer.z2 && !(x > inner.x1 && x < inner.x2 && z > inner.z1 && z < inner.z2);
    const a = Math.atan2(z - cz, x - cx);
    if (onTrack && s.lastAngle !== null) {
      let d = a - s.lastAngle;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      s.angle += d;
      const laps = Math.floor(Math.abs(s.angle) / (Math.PI * 2));
      if (laps > s.laps) {
        s.laps = laps;
        audio.sfx('coin');
        toast(`🏁 Vòng ${laps}!`, 'success', 1500);
      }
    }
    s.lastAngle = onTrack ? a : null;
  }

  // Lớp nhóm: chấm điểm bấm SPACE theo nhịp nhạc
  _judgeBeat() {
    const s = this.session;
    const beat = audio.getBeat();
    const frac = beat % 1;
    const dist = Math.min(frac, 1 - frac);
    const whole = Math.round(beat);
    if (whole === s.sync.lastBeat) return; // 1 lần / nhịp
    s.sync.lastBeat = whole;
    s.sync.presses++;
    let fb = 'MISS';
    if (dist < 0.12) {
      s.sync.points += 1;
      fb = 'PERFECT';
      audio.sfx('rep');
    } else if (dist < 0.25) {
      s.sync.points += 0.6;
      fb = 'GOOD';
    }
    this.hud.updateSync(frac, this._syncScore(), fb);
  }

  _syncScore() {
    const s = this.session;
    if (!s?.sync?.presses) return 0;
    const beats = Math.max(1, ((this.ctx.clockTime - s.start) / 60) * 124);
    return (s.sync.points / s.sync.presses) * Math.min(1, s.sync.presses / (beats * 0.75));
  }

  async openWardrobe(fromLocker) {
    const result = await showCreatorScreen({ ...this.character, ...this.me.appearance }, { mode: 'edit' });
    if (result) {
      this.onCharacter(result);
      this.me.setAppearance(result);
      toast('Đã đổi trang phục mới! ✨', 'success');
    }
    if (fromLocker && this.mode === 'utility') this.stopActivity();
  }

  async stopActivity() {
    if (this.mode === 'ix') {
      if (this.ix.active) this.ix.cancel(this.ix.active.id);
      this.ix.finish();
      return;
    }
    if (!this.session || !['working', 'utility', 'approach', 'running'].includes(this.mode)) return;
    const { eq, start } = this.session;
    const wasMode = this.mode;
    const now = this.ctx.clockTime;
    const duration = start !== undefined ? now - start : 0;
    const reps = wasMode === 'running' ? this.session.laps : start !== undefined ? Math.floor(duration / eq.info.rep) : 0;
    const sync = eq.info.klass ? this._syncScore() : 0;
    this.mode = 'free';
    this.session = null;
    this.equipment.clearUser(this.me);
    this.hud.hideWorkout();
    this.me.play('idle');
    this.me.root.position.y = 0;
    if (wasMode !== 'running') {
      this.pos.x = eq.exit.x;
      this.pos.z = eq.exit.z;
      this.building.collision.resolve(this.pos, PLAYER_RADIUS);
    }
    if (wasMode === 'working' || wasMode === 'running') {
      if (duration < 3) {
        this.net.emit('equipment:release');
        return toast('Buổi tập quá ngắn (tối thiểu 3 giây) nên không được tính', 'error');
      }
      try {
        const res = await api.logWorkout(eq.type, Math.round(duration), reps, { slot: eq.slot || 0, sync: Math.round(sync * 100) / 100 });
        this._onReward(res);
      } catch (e) {
        toast(`Không lưu được buổi tập: ${e.message}`, 'error');
      } finally {
        this.net.emit('equipment:release');
      }
    } else this.net.emit('equipment:release');
  }

  _onReward({ reward, character, achievements }) {
    this.onCharacter(character);
    this.todayCalories += reward.calories;
    this.hud.setTodayCalories(this.todayCalories);
    const B = { golden: '🌅x2', buff_exp: '🥤', buff_cal: '🧃', buff_stat: '💧', duo: '🤝', spotter: '🫡', party: '👥', sync: '🎵' };
    const bonus = reward.bonuses.map((b) => B[b] || '').join('');
    toast(`✅ +${reward.exp} EXP ${bonus} • +${reward.statGain} ${STAT_LABELS[reward.stat]} • 🔥 ${reward.calories} kcal • 🪙 +${reward.coins}`, 'success', 4000);
    audio.sfx('coin');
    if (reward.levelsUp > 0) {
      this.me.setLevel(character.level);
      this.burst.spawn(this.pos);
      setTimeout(() => this.me.playEmote('cheer'), 300);
      toast(`🎉 LÊN LEVEL ${character.level}! +50 xu thưởng`, 'level', 4000);
      audio.sfx('levelup');
    }
    for (const k of achievements || []) if (ACHIEVEMENTS[k]) toast(`🏅 ${ACHIEVEMENTS[k].icon} ${ACHIEVEMENTS[k].label}`, 'level', 4000);
  }

  // ======================= VÒNG LẶP =======================
  update(dt, t) {
    this.ctx.clockTime = t;
    const look = this.input.consumeLook();
    const beat = audio.getBeat();

    if (this.mode === 'free' || this.mode === 'running') this._updateMovement(dt);
    else if (this.mode === 'approach') this._updateApproach(dt);
    else if (this.mode === 'working' || this.mode === 'utility') this._updateActivity(t);
    if (this.mode === 'running') {
      this._updateLaps();
      const s = this.session;
      this.hud.updateWorkout({ reps: s.laps, time: t - s.start, cal: (s.eq.info.cal * (t - s.start)) / 60, repProgress: (Math.abs(s.angle) % (Math.PI * 2)) / (Math.PI * 2) });
    }
    const ixCtx = this.ix.update(dt);

    // Nhân vật local
    this.me.root.position.x = this.pos.x;
    this.me.root.position.z = this.pos.z;
    if (this.mode === 'free' || this.mode === 'running') this.me.root.position.y = this.jumpY;
    this.me.root.rotation.y = lerpAngle(this.me.root.rotation.y, this.ry, 1 - Math.exp(-dt * 14));
    this.me.update(dt, { ...this._animCtx(this.me, t, beat, this.session?.eq), ...ixCtx });

    // Người chơi khác (AOI) + LOD
    const serverNow = this.net.serverNow();
    this.lodTimer -= dt;
    const doLod = this.lodTimer <= 0;
    if (doLod) {
      this.lodTimer = 0.2;
      this._updateLOD();
    }
    let duo = false;
    for (const [nid, r] of this.remotes) {
      r.update(dt, serverNow);
      const eqId = this.eqByNid.get(nid);
      const eq = eqId ? this.equipment.byId.get(eqId) : null;
      if (eq) this.equipment.setUser(eq, r.char, t);
      else if (r.char._eqUser) this.equipment.clearUser(r.char);
      r.char._eqUser = !!eq;
      r.char.play(r.anim);
      r.char.update(dt, this._animCtx(r.char, t, beat, eq));
      if (this.mode === 'working' && r.dist < 3.5 && !BUSY_ANIMS.has(r.anim)) duo = true;
    }
    if (this.mode === 'working') this._updateDuo(duo);

    this.equipment.update(this.floorId, dt, t, this.pos);
    this.burst.update(dt);
    const positions = [this.pos];
    for (const r of this.remotes.values()) if (r.dist < 12) positions.push(r.position);
    this.building.update(dt, t, positions, { beat });

    this.cam.ceiling = this.floorId === 4 ? 40 : 3.75;
    this.cam.update(dt, this.me.root.position, look);
    this._updateZone(dt, t);
    this._updatePrompt();
    this._updateWaypoint(t);
    this._sendState(dt);
    this._autoQuality(dt);
    this._saunaTalk(dt);

    const others = [];
    for (const r of this.remotes.values()) others.push({ x: r.position.x, z: r.position.z, userId: r.userId });
    this.minimap.draw(dt, { floor: this.floorId, self: this.pos, yaw: this.cam.yaw, others, friends: this.friendIds, waypoint: this.wpTarget });
    if (doLod) {
      this.hud.setChannel(this.channel?.name || '', this.remotes.size);
      this.hud.tickBuffs();
    }
    if (settings.showFps) this.hud.setFps(this.ctx.loopFps, true);
  }

  // LOD nhân vật: gần = đầy đủ, vừa = giảm, xa = hình nộm, rất xa = ẩn; tối đa N nhân vật chi tiết
  _updateLOD() {
    const list = [];
    for (const r of this.remotes.values()) {
      r.dist = Math.hypot(r.position.x - this.pos.x, r.position.z - this.pos.z);
      list.push(r);
    }
    list.sort((a, b) => a.dist - b.dist);
    const maxDetailed = settings.maxDetailed || 50;
    list.forEach((r, i) => {
      let lod = r.dist < 18 ? 0 : r.dist < 34 ? 1 : r.dist < 54 ? 2 : 3;
      if (i >= maxDetailed && lod < 2) lod = 2;
      if (i >= maxDetailed * 3) lod = 3;
      r.char.setLOD(lod);
      r.char.setLabelVisibility(r.dist < 14 && lod < 2, r.dist < 24);
    });
  }

  _animCtx(char, t, beat, eq) {
    if (eq && eq.user === char) {
      const phase = this.equipment.phaseOf(eq, t);
      return { phase, p: effort(phase), beat, params: eq.info.params };
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
    const speedBuff = (this.character.buffs || []).find((b) => b.kind === 'speed' && new Date(b.until) > new Date());
    const speed = (running ? RUN_SPEED : WALK_SPEED) * Math.min(1, mag) * (speedBuff ? speedBuff.mult : 1);
    const k = 1 - Math.exp(-dt * 12);
    this.vel.x += (dx * speed - this.vel.x) * k;
    this.vel.z += (dz * speed - this.vel.z) * k;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.building.collision.resolve(this.pos, PLAYER_RADIUS);
    const B = this.floorId === 1 ? WORLD_BOUNDS : FLOOR_BOUNDS;
    this.pos.x = Math.max(B.minX + 0.4, Math.min(B.maxX - 0.4, this.pos.x));
    this.pos.z = Math.max(B.minZ + 0.4, Math.min(B.maxZ - 0.4, this.pos.z));
    // Nhảy
    if (this.jumpY > 0) {
      this.jumpV -= GRAVITY * dt;
      this.jumpY = Math.max(0, this.jumpY + this.jumpV * dt);
      if (this.jumpY === 0) this.jumpV = 0;
    }
    if (mag > 0.08) {
      this.ry = Math.atan2(dx, dz);
      this.me.stopEmote();
    }
    if (this.jumpY > 0.02) this.me.play('jump');
    else if (mag > 0.08) this.me.play(running ? 'run' : 'walk');
    else this.me.play('idle');
  }

  _updateApproach(dt) {
    const s = this.session;
    s.approachTime += dt;
    const seat = s.eq.seat;
    const dx = seat.x - this.pos.x;
    const dz = seat.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.08 || s.approachTime > 2.5) return this._beginActivity();
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
        if (!eq.info.klass) audio.sfx('rep');
      }
      this.hud.updateWorkout({ reps, time: elapsed, cal: (eq.info.cal * elapsed) / 60, repProgress: this.equipment.phaseOf(eq, t) });
      if (eq.info.klass) this.hud.updateSync(audio.getBeat() % 1, this._syncScore());
    } else if (eq.info.utility === 'timed') {
      this.hud.updateWorkout({ reps: 0, time: elapsed, cal: 0, repProgress: Math.min(1, elapsed / eq.info.duration) });
      if (elapsed >= eq.info.duration) {
        this.stopActivity();
        toast(eq.type === 'sink' ? '🧼 Tay đã sạch sẽ!' : '🚽 Nhẹ cả người!', 'success');
      }
    }
  }

  _updateDuo(on) {
    this.hud.setDuo(on);
    if (on && this.session && !this.session.duoShown) {
      this.session.duoShown = true;
      this.me.flashIcon('🤝');
      toast('🤝 Đang tập cùng người khác: +20% EXP khi hoàn thành!', 'info', 2500);
    }
  }

  // Ngồi chung ghế sauna/xông hơi: hiệu ứng trò chuyện
  _saunaTalk(dt) {
    const a = this.me.anim;
    if (a !== 'sauna' && a !== 'steam') return;
    this.talkTimer -= dt;
    if (this.talkTimer > 0) return;
    this.talkTimer = 5 + Math.random() * 4;
    const near = [...this.remotes.values()].filter((r) => r.dist < 3.5 && (r.anim === 'sauna' || r.anim === 'steam'));
    if (!near.length) return;
    const who = Math.random() < 0.5 ? this.me : near[Math.floor(Math.random() * near.length)].char;
    who.flashIcon('💬');
    if (who === this.me) this.me.say(SMALL_TALK[Math.floor(Math.random() * SMALL_TALK.length)]);
  }

  _updateZone(dt) {
    const room = this.building.roomAt(this.pos.x, this.pos.z);
    if (room.id !== this.zoneId) {
      this.zoneId = room.id;
      this.hud.setZone(room);
      this.net.emit('presence', { zone: room.name || '' });
    }
    // Nhạc lớp nhóm: to dần khi ở studio aerobic/spin (tầng 3)
    let music = 0;
    if (this.floorId === 3) {
      if (room.id === 'aerobic' || room.id === 'spin') music = 1;
      else if (this.pos.z > 0) music = 0.25;
    }
    audio.setMusicLevel(music);
    if (room.id === 'sauna' || room.id === 'steam') {
      const target = this.mode === 'working' ? 92 : 82;
      this.saunaTemp += (target - this.saunaTemp) * (1 - Math.exp(-dt * 0.3));
      this.hud.setThermo(this.saunaTemp);
    } else if (this.saunaTemp !== 60) {
      this.saunaTemp = 60;
      this.hud.setThermo(null);
    }
  }

  _updatePrompt() {
    if (this.mode !== 'free') this._lastPromptKey = undefined;
    if (this.mode === 'working' || this.mode === 'utility' || this.mode === 'running') {
      this.hud.hidePrompt();
      this.mobile?.setInteract('⏹ Dừng', true);
      return;
    }
    if (this.mode !== 'free') {
      this.hud.hidePrompt();
      this.mobile?.setInteract(null);
      return;
    }
    const eq = this.equipment.nearest(this.floorId, this.pos, 1.6);
    const free = eq ? this.equipment.isFreeFor(eq, this.net.nid) : false;
    const key = eq ? `${eq.id}|${free}|${this.character.level}` : '';
    if (key === this._lastPromptKey) return;
    this._lastPromptKey = key;
    if (!eq) {
      this.hud.hidePrompt();
      this.mobile?.setInteract(null);
      return;
    }
    const info = eq.info;
    const locked = (this.character.level || 1) < (info.unlock || 1);
    const verb = info.utility ? { transit: 'Đi', wardrobe: 'Mở tủ', shop: 'Mua sắm', inbody: 'Đo' }[info.utility] || 'Dùng' : eq.slot ? 'Vào' : 'Tập';
    let title = `${verb}: ${eq.label}`;
    if (!free) title = `${eq.label} – đang có người dùng`;
    if (locked) title = `🔒 ${eq.label} – cần Level ${info.unlock}`;
    const sub = info.utility ? info.en : `${info.en} • +${STAT_LABELS[info.group]} • ~${info.cal} kcal/phút${info.klass ? ' • 🎵 lớp nhóm' : ''}`;
    this.hud.showPrompt({ title, sub, busy: !free || locked });
    this.mobile?.setInteract(free && !locked ? `👆 ${verb}: ${eq.label}` : locked ? `🔒 Lv.${info.unlock}` : '🙅 Đang có người', !free || locked);
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
      a: ANIM_INDEX[this.me.anim] ?? 0,
    };
    const l = this.lastSent;
    const changed = !l || l.x !== st.x || l.z !== st.z || l.y !== st.y || l.ry !== st.ry || l.a !== st.a;
    if (!changed && this.heartbeat < 1) return;
    this.heartbeat = 0;
    this.lastSent = st;
    this.net.volatile('state', st);
  }

  // Tự giảm đồ họa nếu FPS < 30 trong ~6 giây
  _autoQuality(dt) {
    if (!settings.autoQuality) return;
    this.qualityCooldown -= dt;
    this.fpsWindow.push(this.ctx.loopFps || 60);
    if (this.fpsWindow.length < 360) return;
    const avg = this.fpsWindow.reduce((a, b) => a + b, 0) / this.fpsWindow.length;
    this.fpsWindow.length = 0;
    const idx = QUALITY_ORDER.indexOf(settings.quality);
    if (avg < 30 && idx > 0 && this.qualityCooldown <= 0) {
      this.qualityCooldown = 20;
      updateSettings({ quality: QUALITY_ORDER[idx - 1] });
      toast(`⚙️ FPS thấp (${Math.round(avg)}) – đã giảm đồ họa xuống "${QUALITY_ORDER[idx - 1] === 'low' ? 'Thấp' : 'Trung bình'}"`, 'info', 4000);
    }
  }
}

export { PAIR_EMOTES, activeEvents };
