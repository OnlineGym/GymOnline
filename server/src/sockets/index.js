import { Server } from 'socket.io';
import { verifyToken } from '../middleware/auth.js';
import { corsOptions } from '../config/cors.js';
import Character from '../models/Character.js';
import ChatMessage, { dmChannel } from '../models/ChatMessage.js';
import { EQUIPMENT_TYPES } from '../config/equipment.js';
import { filterProfanity, sanitizeMessage } from '../utils/profanity.js';
import { startSession, endSession } from '../services/workoutSessions.js';

let io = null;
export const getIO = () => io;

// ====== STATE PHÒNG (giữ trong bộ nhớ server) ======
const players = new Map(); // socketId -> player
const userSockets = new Map(); // userId -> socketId
const locks = new Map(); // equipmentId -> socketId (1 máy chỉ 1 người dùng)
const equipmentTypeById = new Map(); // equipmentId -> type (ghi nhớ để chống đổi type)

const NEARBY_RADIUS = 14;
const SNAPSHOT_HZ = 15;
const WORLD_BOUNDS = { minX: -26, maxX: 26, minZ: -26, maxZ: 31 };
// Thiết bị tiện ích: vẫn khóa 1 người/lần nhưng không tính buổi tập
const UTILITY_TYPES = ['locker', 'toilet', 'sink'];
const ALLOWED_ANIMS = /^[a-zA-Z_]{1,24}$/;
const EMOTES = ['wave', 'laugh', 'cool', 'tired', 'flex', 'dance', 'cheer', 'bow'];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

function publicPlayer(p) {
  return {
    id: p.id,
    userId: p.userId,
    appearance: p.appearance,
    x: p.x,
    y: p.y,
    z: p.z,
    ry: p.ry,
    anim: p.anim,
    eq: p.eq,
  };
}

function locksObject() {
  return Object.fromEntries(locks);
}

function releaseLock(socket) {
  const p = players.get(socket.id);
  if (!p || !p.eq) return;
  if (locks.get(p.eq) === socket.id) {
    locks.delete(p.eq);
    io.emit('equipment:lock', { equipmentId: p.eq, socketId: null });
  }
  endSession(p.userId);
  p.eq = null;
}

// Chống spam chat: tối đa 5 tin / 8 giây, cách nhau ≥ 700ms, không lặp 1 câu quá 3 lần
function chatAllowed(p, content) {
  const now = Date.now();
  p.chatTimes = p.chatTimes.filter((t) => now - t < 8000);
  if (p.mutedUntil > now) return `Bạn đang bị tạm khóa chat ${Math.ceil((p.mutedUntil - now) / 1000)}s vì spam`;
  if (p.chatTimes.length && now - p.chatTimes[p.chatTimes.length - 1] < 700) return 'Bạn gửi tin quá nhanh';
  if (p.chatTimes.length >= 5) {
    p.mutedUntil = now + 15000;
    return 'Bạn gửi quá nhiều tin, bị khóa chat 15 giây';
  }
  if (content === p.lastMsg) {
    p.repeatCount += 1;
    if (p.repeatCount >= 3) return 'Đừng lặp lại cùng một tin nhắn';
  } else {
    p.repeatCount = 0;
  }
  p.lastMsg = content;
  p.chatTimes.push(now);
  return null;
}

export function initSockets(httpServer) {
  io = new Server(httpServer, {
    cors: corsOptions,
    pingInterval: 10000,
    pingTimeout: 8000,
    maxHttpBufferSize: 1e5,
  });

  // Xác thực JWT khi bắt tay kết nối
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('UNAUTHORIZED'));
      const payload = verifyToken(token);
      const character = await Character.findOne({ userId: payload.sub });
      if (!character) return next(new Error('NO_CHARACTER'));
      socket.data.userId = String(payload.sub);
      socket.data.character = character;
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    const { userId, character } = socket.data;

    // Một tài khoản chỉ online 1 nơi: đá phiên cũ
    const oldSocketId = userSockets.get(userId);
    if (oldSocketId && io.sockets.sockets.get(oldSocketId)) {
      io.to(oldSocketId).emit('session:kicked', { reason: 'Tài khoản đăng nhập ở nơi khác' });
      io.sockets.sockets.get(oldSocketId).disconnect(true);
    }

    const player = {
      id: socket.id,
      userId,
      appearance: character.appearance(),
      x: (Math.random() - 0.5) * 4,
      y: 0,
      z: 15 + Math.random() * 2,
      ry: Math.PI,
      anim: 'idle',
      eq: null,
      dirty: true,
      chatTimes: [],
      mutedUntil: 0,
      lastMsg: '',
      repeatCount: 0,
      lastEmote: 0,
    };
    players.set(socket.id, player);
    userSockets.set(userId, socket.id);

    socket.emit('init', {
      selfId: socket.id,
      spawn: { x: player.x, z: player.z, ry: player.ry },
      players: [...players.values()].filter((p) => p.id !== socket.id).map(publicPlayer),
      locks: locksObject(),
    });
    socket.broadcast.emit('player:join', publicPlayer(player));
    console.log(`[socket] ${player.appearance.displayName} vào phòng (${players.size} online)`);

    // ---- Cập nhật vị trí / animation (client gửi ~12 lần/giây) ----
    socket.on('state', (s) => {
      if (!s || typeof s !== 'object') return;
      player.x = clamp(num(s.x, player.x), WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX);
      player.z = clamp(num(s.z, player.z), WORLD_BOUNDS.minZ, WORLD_BOUNDS.maxZ);
      player.y = clamp(num(s.y, 0), -1, 4);
      player.ry = num(s.ry, player.ry);
      if (typeof s.anim === 'string' && ALLOWED_ANIMS.test(s.anim)) player.anim = s.anim;
      player.dirty = true;
    });

    // ---- Emote ----
    socket.on('emote', (name) => {
      if (!EMOTES.includes(name)) return;
      const now = Date.now();
      if (now - player.lastEmote < 1000) return;
      player.lastEmote = now;
      io.emit('player:emote', { id: socket.id, name });
    });

    // ---- Khóa máy tập ----
    socket.on('equipment:request', (data, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const equipmentId = typeof data?.id === 'string' ? data.id.slice(0, 40) : null;
      const type = data?.type;
      const isUtility = UTILITY_TYPES.includes(type);
      if (!equipmentId || (!EQUIPMENT_TYPES[type] && !isUtility)) return reply({ ok: false, message: 'Máy tập không hợp lệ' });
      const knownType = equipmentTypeById.get(equipmentId);
      if (knownType && knownType !== type) return reply({ ok: false, message: 'Máy tập không hợp lệ' });

      const holder = locks.get(equipmentId);
      if (holder && holder !== socket.id && players.has(holder)) {
        return reply({ ok: false, message: 'Máy này đang có người sử dụng' });
      }
      releaseLock(socket); // nhả máy cũ nếu có
      equipmentTypeById.set(equipmentId, type);
      locks.set(equipmentId, socket.id);
      player.eq = equipmentId;
      if (!isUtility) startSession(userId, equipmentId, type);
      io.emit('equipment:lock', { equipmentId, socketId: socket.id });
      reply({ ok: true });
    });

    socket.on('equipment:release', () => releaseLock(socket));

    // ---- Chat ----
    socket.on('chat', async (data, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        const channel = data?.channel;
        let content = sanitizeMessage(data?.content);
        if (!content) return reply({ ok: false, message: 'Tin nhắn trống' });
        if (!['global', 'nearby', 'dm'].includes(channel)) return reply({ ok: false, message: 'Kênh không hợp lệ' });

        const block = chatAllowed(player, content);
        if (block) return reply({ ok: false, message: block });
        content = filterProfanity(content);

        const displayName = player.appearance.displayName;
        if (channel === 'dm') {
          const toUserId = String(data?.to || '');
          const targetSocketId = userSockets.get(toUserId);
          if (!targetSocketId || toUserId === userId) return reply({ ok: false, message: 'Người nhận không online' });
          const doc = await ChatMessage.create({ userId, displayName, channel: dmChannel(userId, toUserId), content });
          const msg = { ...doc.toPublic(), channel: 'dm', from: userId, to: toUserId, fromSocket: socket.id };
          io.to(targetSocketId).emit('chat', msg);
          socket.emit('chat', msg);
          return reply({ ok: true });
        }

        const doc = await ChatMessage.create({ userId, displayName, channel, content });
        const msg = { ...doc.toPublic(), fromSocket: socket.id };
        if (channel === 'global') {
          io.emit('chat', msg);
        } else {
          // Chat gần: chỉ gửi cho người chơi trong bán kính NEARBY_RADIUS
          for (const p of players.values()) {
            if (Math.hypot(p.x - player.x, p.z - player.z) <= NEARBY_RADIUS) io.to(p.id).emit('chat', msg);
          }
        }
        reply({ ok: true });
      } catch (err) {
        console.error('[socket] chat error', err.message);
        reply({ ok: false, message: 'Không gửi được tin nhắn' });
      }
    });

    // ---- Làm mới ngoại hình sau khi đổi đồ ----
    socket.on('appearance:refresh', async () => {
      const c = await Character.findOne({ userId });
      if (!c) return;
      player.appearance = c.appearance();
      io.emit('player:appearance', { userId, appearance: player.appearance });
    });

    socket.on('disconnect', () => {
      releaseLock(socket);
      players.delete(socket.id);
      if (userSockets.get(userId) === socket.id) userSockets.delete(userId);
      io.emit('player:leave', { id: socket.id });
      console.log(`[socket] ${player.appearance.displayName} rời phòng (${players.size} online)`);
    });
  });

  // Gửi snapshot vị trí các người chơi đã thay đổi ~15 lần/giây (volatile: được phép rớt gói)
  setInterval(() => {
    const changed = [];
    for (const p of players.values()) {
      if (!p.dirty) continue;
      p.dirty = false;
      changed.push([p.id, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +p.ry.toFixed(3), p.anim, p.eq]);
    }
    if (changed.length) io.volatile.emit('snapshot', { t: Date.now(), p: changed });
  }, 1000 / SNAPSHOT_HZ);

  return io;
}

// Được gọi từ REST controller khi ngoại hình/level thay đổi -> cập nhật state phòng + báo mọi người
export function broadcastAppearance(userId, appearance) {
  if (!io) return;
  const sid = userSockets.get(String(userId));
  const p = sid && players.get(sid);
  if (p) p.appearance = appearance;
  io.emit('player:appearance', { userId: String(userId), appearance });
}
