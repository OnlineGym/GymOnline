/**
 * Rate limit cho từng event socket (token bucket): mỗi event có tốc độ nạp lại + dung lượng tối đa.
 * Vượt giới hạn -> bỏ qua gói tin và đếm vi phạm; quá nhiều vi phạm -> ngắt kết nối.
 */
const LIMITS = {
  state: [25, 30], // [tokens/giây, burst]
  chat: [1, 5],
  emote: [1, 3],
  'equipment:request': [3, 6],
  'equipment:release': [3, 6],
  'floor:change': [1, 3],
  'ix:invite': [1, 4],
  'ix:respond': [3, 6],
  'ix:input': [20, 25],
  'ix:cancel': [2, 4],
  presence: [1, 3],
  goto: [0.5, 2],
  default: [8, 15],
};

export class SocketRateLimiter {
  constructor() {
    this.buckets = new Map();
    this.violations = 0;
  }

  allow(event) {
    const [rate, burst] = LIMITS[event] || LIMITS.default;
    const now = Date.now();
    let b = this.buckets.get(event);
    if (!b) {
      b = { tokens: burst, at: now };
      this.buckets.set(event, b);
    }
    b.tokens = Math.min(burst, b.tokens + ((now - b.at) / 1000) * rate);
    b.at = now;
    if (b.tokens < 1) {
      this.violations++;
      return false;
    }
    b.tokens -= 1;
    return true;
  }
}
