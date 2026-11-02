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

export const api = {
  register: (username, email, password) => request('POST', '/auth/register', { username, email, password }),
  login: (login, password) => request('POST', '/auth/login', { login, password }),
  me: () => request('GET', '/auth/me'),
  getCharacter: () => request('GET', '/character'),
  saveCharacter: (data) => request('PUT', '/character', data),
  logWorkout: (equipmentType, durationSec, reps) => request('POST', '/workouts', { equipmentType, durationSec, reps }),
  history: (limit = 30) => request('GET', `/workouts/history?limit=${limit}`),
  leaderboard: () => request('GET', '/leaderboard'),
  chatHistory: (channel, withUser) =>
    request('GET', `/chat/history?channel=${encodeURIComponent(channel)}${withUser ? `&with=${encodeURIComponent(withUser)}` : ''}`),
};

export const SOCKET_URL = BASE || undefined;
