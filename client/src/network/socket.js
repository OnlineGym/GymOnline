import { io } from 'socket.io-client';
import { SOCKET_URL } from './api.js';

/**
 * Kết nối realtime. connect() trả về Promise với dữ liệu 'init' (danh sách người chơi, khóa máy...)
 */
export class Net {
  constructor() {
    this.socket = null;
    this.selfId = null;
    this.serverOffset = 0; // serverTime - clientTime (ước lượng)
  }

  connect(token) {
    return new Promise((resolve, reject) => {
      this.socket = io(SOCKET_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });
      let first = true;
      this.socket.on('init', (data) => {
        this.selfId = data.selfId;
        if (first) {
          first = false;
          resolve(data);
        } else {
          this.onReinit?.(data);
        }
      });
      this.socket.on('connect_error', (err) => {
        if (first) {
          const map = { UNAUTHORIZED: 'Phiên đăng nhập hết hạn', NO_CHARACTER: 'Chưa tạo nhân vật' };
          reject(new Error(map[err.message] || 'Không kết nối được máy chủ realtime'));
          first = false;
          this.socket.disconnect();
        }
      });
      this.socket.on('snapshot', (s) => {
        const offset = s.t - Date.now();
        this.serverOffset = this.serverOffset === 0 ? offset : this.serverOffset * 0.95 + offset * 0.05;
      });
    });
  }

  serverNow() {
    return Date.now() + this.serverOffset;
  }

  on(event, fn) {
    this.socket.on(event, fn);
  }

  emit(event, data) {
    this.socket?.emit(event, data);
  }

  volatile(event, data) {
    this.socket?.volatile.emit(event, data);
  }

  // emit có phản hồi (ack) + timeout
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
