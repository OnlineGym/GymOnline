// Giữ tham chiếu io để các service/controller gửi thông báo tới người chơi (xuyên instance nhờ Redis adapter)
let io = null;
let manager = null;

export function setIO(instance) {
  io = instance;
}
export const getIO = () => io;

export function setManager(m) {
  manager = m;
}
export const getManager = () => manager;

// Gửi tới mọi socket của 1 user (room user:<id>)
export function notifyUser(userId, event, data) {
  io?.to(`user:${userId}`).emit(event, data);
}

export function notifyRoom(room, event, data) {
  io?.to(room).emit(event, data);
}

// Cho mọi socket của user tham gia / rời 1 room (party, guild) – hoạt động xuyên instance
export function userJoin(userId, room) {
  io?.in(`user:${userId}`).socketsJoin(room);
}
export function userLeave(userId, room) {
  io?.in(`user:${userId}`).socketsLeave(room);
}

// Cập nhật ngoại hình/level cho người chơi đang online (instance local) và báo người xung quanh
export function broadcastAppearance(userId, appearance) {
  manager?.updateAppearance(String(userId), appearance);
}
