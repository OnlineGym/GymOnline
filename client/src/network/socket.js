import { io } from 'socket.io-client';
import msgpackParser from 'socket.io-msgpack-parser';
import { SOCKET_URL } from './api.js';

/**
 * Kết nối realtime tới channel. connect() trả về Promise với dữ liệu 'init'.
 * - Dùng msgpack (nhị phân) để giảm băng thông
 * - Chỉ dùng websocket (không cần sticky session khi chạy nhiều instance)
 * - channel = id channel muốn vào ('auto' = server tự phân bổ), url = instance giữ channel đó
 */
export class Net {
  constructor() {
    this.socket = null;
    this.nid = null;
    this.serverOffset = 0;
    this._offsetInit = false;
    this.handlers = new Map(); // giữ handler để gắn lại khi đổi channel
  }

  connect(token, { channel = 'auto', url = null, goto = null } = {}) {
    this.disconnect();
    return new Promise((resolve, reject) => {
      const s = io(url || SOCKET_URL, {
        auth: { token, channel, goto },
        transports: ['websocket'],
        parser: msgpackParser,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });
      this.socket = s;
      let first = true;
      for (const [ev, fns] of this.handlers) for (const fn of fns) s.on(ev, fn);
      s.on('init', (data) => {
        this.nid = data.nid;
        this.channel = data.channel;
        this._syncClock(data.serverNow);
        if (first) {
          first = false;
          resolve(data);
        } else this.onReinit?.(data);
      });
      s.on('fatal', (e) => {
        if (first) {
          first = false;
          reject(Object.assign(new Error(e.message || 'Không vào được channel'), { code: e.code }));
        }
        s.disconnect();
      });
      s.on('connect_error', (err) => {
        if (!first) return;
        const map = { UNAUTHORIZED: 'Phiên đăng nhập hết hạn', NO_CHARACTER: 'Chưa tạo nhân vật' };
        first = false;
        reject(Object.assign(new Error(map[err.message] || 'Không kết nối được máy chủ realtime'), { code: err.message }));
        s.disconnect();
      });
      s.on('s', (snap) => this._syncClock(snap.t));
    });
  }

  _syncClock(serverT) {
    if (!serverT) return;
    const offset = serverT - Date.now();
    if (!this._offsetInit) {
      this.serverOffset = offset;
      this._offsetInit = true;
    } else this.serverOffset = this.serverOffset * 0.95 + offset * 0.05;
  }

  disconnect() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
  }

  serverNow() {
    return Date.now() + this.serverOffset;
  }

  on(event, fn) {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event).push(fn);
    this.socket?.on(event, fn);
  }

  emit(event, data) {
    this.socket?.emit(event, data);
  }

  volatile(event, data) {
    this.socket?.volatile.emit(event, data);
  }

  request(event, data, timeout = 5000) {
    return new Promise((resolve) => {
      if (!this.socket?.connected) return resolve({ ok: false, message: 'Mất kết nối máy chủ' });
      this.socket.timeout(timeout).emit(event, data, (err, res) => {
        if (err) resolve({ ok: false, message: 'Máy chủ không phản hồi' });
        else resolve(res);
      });
    });
  }

  get connected() {
    return !!this.socket?.connected;
  }
}
