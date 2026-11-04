import mongoose from 'mongoose';
import { Server } from 'socket.io';
import msgpackParser from 'socket.io-msgpack-parser';
import { createAdapter } from '@socket.io/redis-adapter';
import { verifyToken, checkAccount } from '../middleware/auth.js';
import User from '../models/User.js';
import { corsOptions } from '../config/cors.js';
import env from '../config/env.js';
import Character from '../models/Character.js';
import ChatMessage, { dmChannel } from '../models/ChatMessage.js';
import { Friendship, Party, Guild } from '../models/social.js';
import { EQUIPMENT, slotInfo } from '../config/equipment.js';
import {
  ANIM_NAMES, EMOTES, MUSIC_ROOMS, FLOORS, SPAWN, SPAWN_FLOOR, TRANSIT_ARRIVAL, FLOOR_BOUNDS, WORLD_BOUNDS, AOI, MAX_SPEED, activeEvents,
} from '../../../shared/constants.js';
import { filterProfanity, sanitizeMessage } from '../utils/profanity.js';
import { startSession, endSession } from '../services/workoutSessions.js';
import { queue } from '../services/writeBuffer.js';
import { setPresence, updatePresence, clearPresence, getPresence } from '../services/presence.js';
import { listChannels } from '../services/channelRegistry.js';
import { ChannelManager } from './ChannelManager.js';
import { createPlayer } from './Channel.js';
import { SocketRateLimiter } from './rateLimit.js';
import { MusicRoom } from './musicRoom.js';
import { setIO, setManager } from './notify.js';
import { redis, redisSub } from '../services/redis.js';

let manager = null;
export const getChannelManager = () => manager;

// Vị trí vừa rời đi (đổi channel/kết nối lại): mới hơn bản đã ghi trong DB lúc bắt tay
const recentPos = new Map();
/**
 * Kết nối rớt mà tab chưa báo đóng (trình duyệt đóng băng tab nền, mất mạng, điện thoại khóa màn hình):
 * giữ nhân vật thêm một lúc thay vì xóa ngay. Tắt tab thì client gửi 'bye' nên offline tức thì.
 */
const GRACE_MS = 120000;
const CLEAN_REASONS = new Set(['server namespace disconnect', 'client namespace disconnect', 'server shutting down']);
const ghosts = new Map(); // userId -> { finalize, timer }
const EQ_ID = /^f([0-4]):([a-z_]+)_(\d+)(#(\d))?$/;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export function initRealtime(httpServer) {
  const io = new Server(httpServer, {
    cors: corsOptions,
    parser: msgpackParser, // nén payload nhị phân (nhỏ hơn JSON ~30-50%)
    pingInterval: 10000,
    pingTimeout: 20000, // tab nền phản hồi chậm hơn, đừng vội coi là mất kết nối
    maxHttpBufferSize: 1e5,
    perMessageDeflate: false, // tắt nén deflate để tiết kiệm CPU khi đông người
  });
  if (redis()) {
    io.adapter(createAdapter(redis(), redisSub()));
    console.log('[realtime] Bật Socket.IO Redis adapter (chạy nhiều instance)');
  }
  setIO(io);
  manager = new ChannelManager(io);
  setManager(manager);
  manager.start();

  // ===== Xác thực khi bắt tay =====
  io.use(async (socket, next) => {
    try {
      const a = socket.handshake.auth || {};
      if (env.loadtestSecret && a.bot === env.loadtestSecret) {
        // Bot load test: không cần tài khoản DB
        socket.data.bot = true;
        socket.data.userId = new mongoose.Types.ObjectId().toString();
        socket.data.appearance = botAppearance(a.name);
        return next();
      }
      if (!a.token) return next(new Error('UNAUTHORIZED'));
      const payload = verifyToken(a.token);
      const bad = await checkAccount(payload);
      if (bad) return next(new Error(bad.code));
      const character = await Character.findOne({ userId: payload.sub });
      if (!character) return next(new Error('NO_CHARACTER'));
      socket.data.userId = String(payload.sub);
      socket.data.character = character;
      socket.data.appearance = character.appearance();
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => onConnection(io, socket).catch((e) => {
    console.error('[realtime] connection error', e);
    socket.emit('fatal', { message: 'Lỗi máy chủ' });
    socket.disconnect(true);
  }));

  // Thông báo sự kiện định kỳ (giờ vàng, cuối tuần) – mỗi instance chỉ gửi cho socket của mình
  let lastEvents = '';
  setInterval(() => {
    const ev = activeEvents();
    const key = ev.map((e) => e.key).join(',');
    if (key !== lastEvents) {
      if (ev.some((e) => !lastEvents.includes(e.key))) io.local.emit('event', { events: ev, started: true });
      lastEvents = key;
    }
  }, 15000).unref();

  return io;
}

function botAppearance(name) {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  return {
    displayName: String(name || 'Bot').slice(0, 16),
    gender: pick(['male', 'female']),
    skinColor: pick(['#ffe3cc', '#f5c9a0', '#c98e62', '#8d5a3b']),
    hair: { style: pick(['short', 'bald', 'bun', 'spiky']), color: pick(['#1f1a17', '#7a4a2a', '#e85d75']) },
    outfit: { style: pick(['tshirt', 'tank', 'hoodie']), top: pick(['#22d3ee', '#f472b6', '#a3e635']), bottom: '#334155', shoes: '#f8fafc' },
    accessory: null,
    level: 1 + Math.floor(Math.random() * 20),
  };
}

async function onConnection(io, socket) {
  const { userId, bot } = socket.data;
  const a = socket.handshake.auth || {};

  // Một tài khoản chỉ online 1 nơi: đá phiên cũ (xuyên instance qua Redis adapter)
  if (!bot) {
    // Quay lại trong thời gian giữ chỗ: bỏ nhân vật cũ, xuất hiện lại đúng chỗ đó
    const ghost = ghosts.get(userId);
    if (ghost) {
      clearTimeout(ghost.timer);
      ghost.finalize();
    }
    io.to(`user:${userId}`).emit('session:kicked', { reason: 'Tài khoản đăng nhập ở nơi khác' });
    io.in(`user:${userId}`).disconnectSockets(true);
  }

  // ----- Chọn channel -----
  let goto = null;
  if (a.goto && !bot) {
    const found = manager.findUser(String(a.goto));
    if (found && (await isFriend(userId, a.goto))) goto = found;
  }
  const pick = manager.pick(goto ? goto.channel.id : a.channel, { viaFriend: !!goto });
  if (pick.error) {
    socket.emit('fatal', { code: pick.error, message: pick.error === 'CHANNEL_FULL' ? 'Channel đã đầy, hãy chọn channel khác' : 'Channel không tồn tại' });
    return socket.disconnect(true);
  }
  const channel = pick.channel;

  // Vị trí xuất hiện: cạnh bạn bè (nếu đi theo bạn) hoặc sảnh tầng 1
  let f = SPAWN_FLOOR;
  let x = SPAWN.x + (Math.random() - 0.5) * 6;
  let z = SPAWN.z + (Math.random() - 0.5) * 3;
  if (bot) {
    f = Math.floor(Math.random() * FLOORS.length);
    x = -15 + Math.random() * 50;
    z = (Math.random() - 0.5) * 36;
  }
  // Quay lại đúng chỗ lần trước (vị trí không còn hợp lệ thì về sảnh)
  if (!bot && !goto) {
    const last = recentPos.get(userId) || socket.data.character?.lastPos;
    recentPos.delete(userId);
    const b = FLOOR_BOUNDS;
    if (last && last.f >= 0 && last.f < FLOORS.length && Number.isFinite(last.x) && Number.isFinite(last.z) && last.x > b.minX && last.x < b.maxX && last.z > b.minZ && last.z < b.maxZ) {
      f = last.f;
      x = last.x;
      z = last.z;
    }
  }
  if (goto) {
    f = goto.player.f;
    x = goto.player.x + 1;
    z = goto.player.z + 0.5;
  }

  const extra = { blocked: new Set(), blockedBy: new Set() };
  let partyDoc = null;
  let guildDoc = null;
  if (!bot) {
    const c = socket.data.character;
    const [blocks, party, guild] = await Promise.all([
      Friendship.find({ status: 'blocked', $or: [{ requester: userId }, { recipient: userId }] }).lean(),
      Party.findOne({ members: userId }).lean(),
      c.guildId ? Guild.findById(c.guildId).lean() : null,
    ]);
    for (const b of blocks) {
      if (String(b.requester) === userId) extra.blocked.add(String(b.recipient));
      else extra.blockedBy.add(String(b.requester));
    }
    partyDoc = party;
    guildDoc = guild;
    if (party) extra.party = String(party._id);
    if (guild) {
      extra.guild = String(guild._id);
      extra.guildTag = guild.tag;
    }
  }

  const p = createPlayer({ socket, userId, appearance: socket.data.appearance, bot, f, x, z, ry: Math.PI, extra });
  if (!bot) {
    const mod = await User.findById(userId).select('chatMutedUntil').lean();
    p.adminMutedUntil = mod?.chatMutedUntil ? new Date(mod.chatMutedUntil).getTime() : 0;
  }
  p.limiter = new SocketRateLimiter();
  channel.add(p);
  socket.data.player = p;
  socket.data.channel = channel;
  const rooms = [`user:${userId}`];
  if (p.party) rooms.push(`party:${p.party}`);
  if (p.guild) rooms.push(`guild:${p.guild}`);
  socket.join(rooms);

  socket.emit('init', {
    nid: p.nid,
    userId,
    channel: { ...channel.summary(), url: env.publicUrl || null },
    f: p.f,
    x: p.x,
    z: p.z,
    ry: p.ry,
    locks: channel.locksForFloor(p.f),
    events: activeEvents(),
    party: partyDoc ? String(partyDoc._id) : null,
    guild: guildDoc ? { id: String(guildDoc._id), name: guildDoc.name, tag: guildDoc.tag } : null,
    blocked: [...extra.blocked],
    serverNow: Date.now(),
  });
  if (!bot) {
    await setPresence(userId, {
      channel: channel.id,
      channelName: channel.name,
      url: env.publicUrl || null,
      floor: p.f,
      zone: '',
      activity: '',
      name: p.appearance.displayName,
      level: p.appearance.level,
    });
  }

  // Bọc handler: rate limit + bắt lỗi. Quá nhiều vi phạm -> ngắt kết nối
  const on = (event, fn) =>
    socket.on(event, (data, ack) => {
      if (!p.limiter.allow(event)) {
        if (typeof ack === 'function') ack({ ok: false, message: 'Bạn thao tác quá nhanh' });
        if (p.limiter.violations > 300) socket.disconnect(true);
        return;
      }
      try {
        const r = fn(data || {}, typeof ack === 'function' ? ack : () => {});
        if (r?.catch) r.catch((e) => console.error(`[realtime] ${event}`, e.message));
      } catch (e) {
        console.error(`[realtime] ${event}`, e.message);
      }
    });

  // ----- Vị trí / animation (client gửi ~12 lần/giây) – kiểm tra chống hack tốc độ -----
  on('state', (s) => {
    const now = Date.now();
    const dt = Math.max(0.03, (now - p.lastStateAt) / 1000);
    p.lastStateAt = now;
    const nx = num(s.x, p.x);
    const nz = num(s.z, p.z);
    const b = p.f === 1 ? WORLD_BOUNDS : FLOOR_BOUNDS;
    const cx = clamp(nx, b.minX, b.maxX);
    const cz = clamp(nz, b.minZ, b.maxZ);
    const dist = Math.hypot(cx - p.x, cz - p.z);
    const maxDist = MAX_SPEED * 1.3 * dt + 0.6;
    if (dist > maxDist && now > p.teleportUntil) {
      // Di chuyển bất thường (hack tốc độ / teleport) -> trả về vị trí hợp lệ
      p.violations++;
      socket.emit('correct', { x: p.x, z: p.z, f: p.f });
      if (p.violations > 50) socket.disconnect(true);
      return;
    }
    p.x = cx;
    p.z = cz;
    p.y = clamp(num(s.y, 0), -5, 5); // đi trên dốc thang (tới +4.45m) / lặn trong hồ (-2.4m)
    p.pp = typeof s.p === 'number' ? Math.round(clamp(s.p, 0, 1) * 100) : 0; // nhịp động tác cho người xem
    p.ry = num(s.ry, p.ry);
    const an = Number.isInteger(s.a) && s.a >= 0 && s.a < ANIM_NAMES.length ? s.a : 0;
    p.anim = an;
    p.ver++;
    channel.move(p);
  });

  // ----- Đổi tầng (thang máy / cầu thang / thang cuốn) -----
  on('floor:change', ({ to, via, x: ax, z: az }, ack) => {
    const target = Number(to);
    if (!Number.isInteger(target) || target < 0 || target >= FLOORS.length || target === p.f) return ack({ ok: false, message: 'Tầng không hợp lệ' });
    const nearHub = p.x > 22 && p.x < 41 && Math.abs(p.z) < 12;
    if (!nearHub && Date.now() > p.teleportUntil) return ack({ ok: false, message: 'Hãy tới sảnh thang máy' });
    if ((via === 'stairs' || via === 'escalator') && Math.abs(target - p.f) !== 1) return ack({ ok: false, message: 'Cầu thang chỉ đi được 1 tầng' });
    if (p.ix) return ack({ ok: false, message: 'Đang trong thách đấu' });
    endSession(userId);
    // Thang bộ / thang cuốn / cabin thang máy: đến đúng vị trí đầu thang (phải nằm trong sảnh thang)
    const okPos = typeof ax === 'number' && typeof az === 'number' && ax > 22 && ax < 40 && Math.abs(az) < 11;
    const nx = okPos ? ax : TRANSIT_ARRIVAL.x + (Math.random() - 0.5) * 2;
    const nz = okPos ? az : TRANSIT_ARRIVAL.z + (Math.random() - 0.5) * 4;
    channel.setFloor(p, target, nx, nz);
    p.teleportUntil = Date.now() + 4000;
    if (!bot) updatePresence(userId, { floor: target, activity: '' }).catch(() => {});
    ack({ ok: true, f: target, x: nx, z: nz, locks: channel.locksForFloor(target) });
  });

  // Khóa của 1 tầng khác (cho "Tìm máy trống")
  on('locks:floor', ({ f }, ack) => {
    const fl = Number(f);
    if (!Number.isInteger(fl) || fl < 0 || fl >= FLOORS.length) return ack({ ok: false });
    ack({ ok: true, locks: channel.locksForFloor(fl) });
  });

  // ----- Khóa máy tập -----
  on('equipment:request', ({ id, type, slot }, ack) => {
    const m = typeof id === 'string' ? EQ_ID.exec(id) : null;
    const s = Number(slot) || 0;
    const info = EQUIPMENT[type] && slotInfo(type, s);
    if (!m || !info || m[2] !== type || Number(m[1]) !== p.f || (Number(m[5] || 0) !== s)) return ack({ ok: false, message: 'Thiết bị không hợp lệ' });
    if ((p.appearance.level || 1) < (info.unlock || 1)) return ack({ ok: false, message: `Cần đạt Level ${info.unlock} để dùng máy này` });
    if (p.ix) return ack({ ok: false, message: 'Đang trong thách đấu' });
    if (info.shared) return ack({ ok: true }); // thang máy, cầu thang: không khóa
    if (info.freeMove) {
      // đường chạy vòng: nhiều người chạy cùng lúc -> có phiên tập nhưng không khóa
      endSession(userId);
      startSession(userId, { equipmentId: id, base: id, type, slot: 0, channel: channel.id, floor: p.f, x: p.x, z: p.z });
      if (!bot) updatePresence(userId, { activity: info.label }).catch(() => {});
      return ack({ ok: true });
    }
    const holder = channel.holder(id);
    if (holder && holder !== p) return ack({ ok: false, message: 'Máy này đang có người sử dụng' });
    if (s > 0 && info.key === 'spot') {
      const main = channel.holder(id.split('#')[0]);
      if (!main || main === p) return ack({ ok: false, message: 'Chưa có ai tập ở máy này để hỗ trợ' });
    }
    endSession(userId);
    channel.lock(p, id);
    p.teleportUntil = Date.now() + 3500;
    if (!info.utility) {
      startSession(userId, { equipmentId: id, base: id.split('#')[0], type, slot: s, channel: channel.id, floor: p.f, x: p.x, z: p.z });
    }
    if (!bot) updatePresence(userId, { activity: info.label }).catch(() => {});
    ack({ ok: true });
  });

  on('equipment:release', () => {
    channel.releaseAll(p);
    endSession(userId);
    p.teleportUntil = Date.now() + 2000;
    if (!bot) updatePresence(userId, { activity: '' }).catch(() => {});
  });

  // ----- Emote: chỉ gửi cho người xung quanh (AOI) -----
  on('emote', (name) => {
    if (!EMOTES.includes(name)) return;
    for (const o of channel.nearby(p, AOI.mid)) if (o !== p) o.socket.emit('emote', { nid: p.nid, name });
  });

  // ----- Phòng nhạc Aerobic (YouTube nhúng, đồng bộ theo channel) -----
  // Mỗi phòng nhạc (aerobic, yoga...) 1 hàng đợi riêng; null nếu tên phòng không hợp lệ
  const music = (room) => {
    if (!Object.hasOwn(MUSIC_ROOMS, room)) return null;
    channel.music ||= {};
    return (channel.music[room] ||= new MusicRoom(channel, room));
  };
  on('music:get', async ({ room }, ack) => {
    const m = music(room);
    if (!m) return ack({ ok: false });
    await m.touch();
    ack({ ok: true, state: m.state() });
  });
  on('music:add', async ({ room, url }, ack) => ack((await music(room)?.add(p, url)) || { ok: false, message: 'Phòng không hợp lệ' }));
  on('music:skip', ({ room }, ack) => ack(music(room)?.skip(p) || { ok: false, message: 'Phòng không hợp lệ' }));
  on('music:ended', ({ room, id }) => music(room)?.ended(p, String(id || '')));
  on('music:error', ({ room, id }) => music(room)?.error(p, String(id || '')));
  on('music:seed', ({ room, ids }) => music(room)?.seed(p, ids));

  // ----- Chat: kênh channel / gần (AOI) / party / guild / riêng -----
  on('chat', async ({ channel: chName, content: raw, to }, ack) => {
    let content = sanitizeMessage(raw);
    if (!content) return ack({ ok: false, message: 'Tin nhắn trống' });
    const block = chatAllowed(p, content);
    if (block) return ack({ ok: false, message: block });
    content = filterProfanity(content);
    const displayName = p.appearance.displayName;
    const base = { userId, displayName, content, createdAt: new Date(), fromNid: p.nid };
    const store = (key) => (bot ? { _id: new mongoose.Types.ObjectId() } : queue(ChatMessage, { userId, displayName, channel: key, content }));

    switch (chName) {
      case 'global': {
        const doc = store(`ch:${channel.id}`);
        io.to(channel.room).emit('chat', { ...base, id: String(doc._id), channel: 'global' });
        break;
      }
      case 'nearby': {
        const doc = store(`near:${channel.id}`);
        const msg = { ...base, id: String(doc._id), channel: 'nearby' };
        for (const o of channel.nearby(p, AOI.nearbyChat)) o.socket.emit('chat', msg);
        break;
      }
      case 'party': {
        if (!p.party) return ack({ ok: false, message: 'Bạn chưa ở trong party' });
        const doc = store(`party:${p.party}`);
        io.to(`party:${p.party}`).emit('chat', { ...base, id: String(doc._id), channel: 'party' });
        break;
      }
      case 'guild': {
        if (!p.guild) return ack({ ok: false, message: 'Bạn chưa tham gia CLB' });
        const doc = store(`guild:${p.guild}`);
        io.to(`guild:${p.guild}`).emit('chat', { ...base, id: String(doc._id), channel: 'guild' });
        break;
      }
      case 'dm': {
        const toId = String(to || '');
        if (!mongoose.isValidObjectId(toId) || toId === userId) return ack({ ok: false, message: 'Người nhận không hợp lệ' });
        if (p.blocked.has(toId) || p.blockedBy.has(toId)) return ack({ ok: false, message: 'Không thể nhắn tin cho người này' });
        // Lưu kể cả khi người nhận offline -> họ đọc lại trong lịch sử chat riêng
        const doc = store(dmChannel(userId, toId));
        const msg = { ...base, id: String(doc._id), channel: 'dm', from: userId, to: toId };
        io.to(`user:${toId}`).to(`user:${userId}`).emit('chat', msg);
        const online = (await getPresence([toId]))[toId];
        return ack({ ok: true, note: online ? null : 'Người nhận đang offline, tin nhắn đã được lưu' });
      }
      default:
        return ack({ ok: false, message: 'Kênh không hợp lệ' });
    }
    ack({ ok: true });
  });

  // ----- Trạng thái hiển thị cho bạn bè (khu đang đứng) -----
  on('presence', ({ zone }) => {
    if (bot || typeof zone !== 'string') return;
    p.zone = zone.slice(0, 40);
    updatePresence(userId, { zone: p.zone, floor: p.f }).catch(() => {});
  });

  // ----- Nhảy tới chỗ bạn bè -----
  on('goto', async ({ userId: friendId }, ack) => {
    const fid = String(friendId || '');
    if (!(await isFriend(userId, fid))) return ack({ ok: false, message: 'Chỉ đi tới được chỗ bạn bè' });
    const target = channel.byUser.get(fid);
    if (!target) {
      const pres = (await getPresence([fid]))[fid];
      if (!pres) return ack({ ok: false, message: 'Bạn bè không online' });
      return ack({ ok: false, switchChannel: pres.channel, url: pres.url, message: `Bạn bè đang ở ${pres.channelName || pres.channel}` });
    }
    if (p.ix) return ack({ ok: false, message: 'Đang trong thách đấu' });
    channel.releaseAll(p);
    endSession(userId);
    const nx = target.x + 1;
    const nz = target.z + 0.6;
    if (target.f !== p.f) channel.setFloor(p, target.f, nx, nz);
    p.x = nx;
    p.z = nz;
    p.ver++;
    p.teleportUntil = Date.now() + 4000;
    channel.move(p);
    ack({ ok: true, f: p.f, x: nx, z: nz, locks: channel.locksForFloor(p.f) });
  });

  // ----- Tương tác nhiều người (trọng tài server) -----
  on('ix:invite', (d, ack) => ack(channel.ix.invite(p, d)));
  on('ix:respond', (d, ack) => ack(channel.ix.respond(p, d)));
  on('ix:input', (d) => channel.ix.input(p, d));
  on('ix:cancel', ({ id }) => channel.ix.userCancel(p, id));

  // Danh sách channel (để đổi channel trong game)
  on('channels', async (_d, ack) => ack({ ok: true, channels: await listChannels() }));

  // Danh sách người chơi xung quanh
  on('nearby:list', (_d, ack) => {
    const list = channel
      .nearby(p, AOI.far)
      .filter((o) => o !== p)
      .map((o) => ({ nid: o.nid, userId: o.userId, name: o.appearance.displayName, level: o.appearance.level, dist: Math.round(Math.hypot(o.x - p.x, o.z - p.z)) }))
      .sort((x, y) => x.dist - y.dist)
      .slice(0, 50);
    ack({ ok: true, players: list });
  });

  socket.on('bye', () => {
    p.saidBye = true;
  });

  let finalized = false;
  const finalize = () => {
    if (finalized) return;
    finalized = true;
    if (ghosts.get(userId)?.finalize === finalize) ghosts.delete(userId);
    if (!bot) {
      // Đang ở trên thang/dưới nước hoặc đang nhảy thì lưu điểm an toàn ở sảnh thang của tầng đó
      const safe = Math.abs(p.y || 0) < 0.05;
      const pos = { f: p.f, x: safe ? p.x : TRANSIT_ARRIVAL.x, z: safe ? p.z : TRANSIT_ARRIVAL.z };
      recentPos.set(userId, pos);
      setTimeout(() => recentPos.delete(userId), 30000).unref();
      Character.updateOne({ userId }, { $set: { lastPos: pos } }).catch(() => {});
    }
    channel.remove(p);
    endSession(userId);
    if (!bot) clearPresence(userId).catch(() => {});
  };

  socket.on('disconnect', (reason) => {
    if (bot || p.saidBye || CLEAN_REASONS.has(reason)) return finalize();
    ghosts.set(userId, { finalize, timer: setTimeout(finalize, GRACE_MS).unref() });
    return undefined;
  });
}

// Chống spam chat: tối đa 5 tin / 8 giây, cách nhau ≥ 700ms, không lặp 1 câu quá 3 lần
function chatAllowed(p, content) {
  const c = p.chat;
  const now = Date.now();
  c.times = c.times.filter((t) => now - t < 8000);
  if (p.adminMutedUntil > now) return `🔇 Bạn đang bị cấm chat thêm ${Math.ceil((p.adminMutedUntil - now) / 60000)} phút`;
  if (c.mutedUntil > now) return `Bạn đang bị tạm khóa chat ${Math.ceil((c.mutedUntil - now) / 1000)}s vì spam`;
  if (c.times.length && now - c.times[c.times.length - 1] < 700) return 'Bạn gửi tin quá nhanh';
  if (c.times.length >= 5) {
    c.mutedUntil = now + 15000;
    return 'Bạn gửi quá nhiều tin, bị khóa chat 15 giây';
  }
  if (content === c.last) {
    c.repeat++;
    if (c.repeat >= 3) return 'Đừng lặp lại cùng một tin nhắn';
  } else c.repeat = 0;
  c.last = content;
  c.times.push(now);
  return null;
}

async function isFriend(a, b) {
  if (!mongoose.isValidObjectId(String(b))) return false;
  return !!(await Friendship.exists({
    status: 'accepted',
    $or: [
      { requester: a, recipient: b },
      { requester: b, recipient: a },
    ],
  }));
}
