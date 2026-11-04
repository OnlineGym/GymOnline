// Gọi REST API backend. Token JWT lưu ở localStorage.
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const TOKEN_KEY = 'gym_token';

export const auth = {
  get token() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set token(v) {
    try {
      if (v) localStorage.setItem(TOKEN_KEY, v);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* bỏ qua */
    }
  },
};

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, 'Không kết nối được máy chủ. Kiểm tra backend đã chạy chưa?');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = data?.error?.message || `Lỗi ${res.status}`;
    const details = data?.error?.details;
    throw new ApiError(res.status, details?.length ? `${msg}: ${details.join('; ')}` : msg, details);
  }
  return data;
}

const q = encodeURIComponent;

export const api = {
  // Tài khoản / nhân vật / tập luyện
  register: (username, email, password) => request('POST', '/auth/register', { username, email, password }),
  login: (login, password) => request('POST', '/auth/login', { login, password }),
  me: () => request('GET', '/auth/me'),
  forgot: (email) => request('POST', '/auth/forgot', { email }),
  resetPassword: (token, password) => request('POST', '/auth/reset', { token, password }),
  verifyEmail: (token) => request('POST', '/auth/verify', { token }),
  resendVerify: () => request('POST', '/auth/resend-verify'),
  changePassword: (current, password) => request('POST', '/auth/change-password', { current, password }),
  changeEmail: (password, email) => request('POST', '/auth/change-email', { password, email }),
  logoutAll: () => request('POST', '/auth/logout-all'),
  refresh: () => request('POST', '/auth/refresh'),
  deleteAccount: (password, confirm) => request('DELETE', '/auth/account', { password, confirm }),
  finishTutorial: (finished) => request('POST', '/character/tutorial', { finished }),
  // Nhiệm vụ + điểm danh
  daily: () => request('GET', '/daily'),
  checkin: () => request('POST', '/daily/checkin'),
  claimQuest: (key) => request('POST', `/daily/quests/${q(key)}/claim`),
  // Quản trị
  adminOverview: () => request('GET', '/admin/overview'),
  adminReports: (status) => request('GET', `/admin/reports?status=${q(status)}`),
  adminResolve: (id, status, note) => request('POST', `/admin/reports/${q(id)}/resolve`, { status, note }),
  adminUsers: (s = '') => request('GET', `/admin/users?q=${q(s)}`),
  adminUser: (id) => request('GET', `/admin/users/${q(id)}`),
  adminBan: (id, hours, reason) => request('POST', `/admin/users/${q(id)}/ban`, { hours, reason }),
  adminUnban: (id) => request('POST', `/admin/users/${q(id)}/unban`),
  adminMute: (id, minutes, reason) => request('POST', `/admin/users/${q(id)}/mute`, { minutes, reason }),
  adminUnmute: (id) => request('POST', `/admin/users/${q(id)}/unmute`),
  adminAnnounce: (text) => request('POST', '/admin/announce', { text }),
  adminActions: () => request('GET', '/admin/actions'),
  getCharacter: () => request('GET', '/character'),
  saveCharacter: (data) => request('PUT', '/character', data),
  logWorkout: (equipmentType, durationSec, reps, extra = {}) => request('POST', '/workouts', { equipmentType, durationSec, reps, ...extra }),
  history: (limit = 30) => request('GET', `/workouts/history?limit=${limit}`),
  leaderboard: (type = 'level', stat) => request('GET', `/leaderboard?type=${type}${stat ? `&stat=${stat}` : ''}`),
  chatHistory: (channel, { withUser, ch } = {}) =>
    request('GET', `/chat/history?channel=${q(channel)}${withUser ? `&with=${q(withUser)}` : ''}${ch ? `&ch=${q(ch)}` : ''}`),
  channels: () => request('GET', '/channels'),
  // Người chơi / bạn bè
  player: (userId) => request('GET', `/players/${q(userId)}`),
  searchPlayers: (s) => request('GET', `/players?q=${q(s)}`),
  friends: () => request('GET', '/friends'),
  friendRequest: (userId) => request('POST', '/friends/request', { userId }),
  friendRequestByName: (name) => request('POST', '/friends/request', { name }),
  friendAccept: (userId) => request('POST', `/friends/${q(userId)}/accept`),
  friendRemove: (userId) => request('DELETE', `/friends/${q(userId)}`),
  block: (userId) => request('POST', '/friends/block', { userId }),
  unblock: (userId) => request('DELETE', `/friends/block/${q(userId)}`),
  blocked: () => request('GET', '/friends/blocked'),
  report: (userId, reason, details) => request('POST', '/reports', { userId, reason, details }),
  // Party
  party: () => request('GET', '/party'),
  partyCreate: () => request('POST', '/party'),
  partyInvite: (userId) => request('POST', '/party/invite', { userId }),
  partyJoin: (partyId) => request('POST', '/party/join', { partyId }),
  partyLeave: () => request('POST', '/party/leave'),
  partyKick: (userId) => request('POST', '/party/kick', { userId }),
  // Guild
  guilds: (s = '') => request('GET', `/guilds?q=${q(s)}`),
  myGuild: () => request('GET', '/guilds/mine'),
  guild: (id) => request('GET', `/guilds/${q(id)}`),
  guildCreate: (data) => request('POST', '/guilds', data),
  guildJoin: (id) => request('POST', `/guilds/${q(id)}/join`),
  guildInvite: (userId) => request('POST', '/guilds/invite', { userId }),
  guildLeave: () => request('POST', '/guilds/leave'),
  guildKick: (userId) => request('POST', '/guilds/kick', { userId }),
  guildUpdate: (data) => request('PATCH', '/guilds/mine', data),
  guildTransfer: (userId) => request('POST', '/guilds/transfer', { userId }),
  guildDisband: () => request('DELETE', '/guilds/mine'),
  // Kinh tế
  shop: () => request('GET', '/shop'),
  buy: (item, qty = 1) => request('POST', '/shop/buy', { item, qty }),
  useItem: (item) => request('POST', '/inventory/use', { item }),
  equip: (item) => request('POST', '/inventory/equip', { item }),
  sendGift: (data) => request('POST', '/gifts', data),
  pendingGifts: () => request('GET', '/gifts/pending'),
  acceptGift: (id) => request('POST', `/gifts/${q(id)}/accept`),
  declineGift: (id) => request('POST', `/gifts/${q(id)}/decline`),
  // Thành tích / thách đấu
  achievements: () => request('GET', '/achievements'),
  matches: () => request('GET', '/challenges/history'),
};

export const SOCKET_URL = BASE || undefined;
