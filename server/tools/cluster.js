/**
 * Chạy nhiều instance server (mỗi instance 1 tiến trình, 1 cổng, giữ các channel riêng).
 * Các instance chia sẻ qua Redis: Socket.IO adapter (chat/thông báo/party/guild xuyên instance),
 * registry channel (danh sách channel gộp + URL instance), presence bạn bè, cache leaderboard.
 *
 *   REDIS_URL=redis://127.0.0.1:6379 npm run start:cluster -- 4        (4 instance, cổng 4001-4004)
 *
 * Client kết nối thẳng tới instance giữ channel (URL lấy từ /api/channels) bằng websocket
 * nên KHÔNG cần sticky session. Đặt reverse proxy (nginx) trỏ /api tới bất kỳ instance nào.
 */
import { fork } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const n = Number(process.argv[2]) || 2;
const basePort = Number(process.env.CLUSTER_BASE_PORT) || 4001;
const host = process.env.CLUSTER_PUBLIC_HOST || 'http://localhost';
if (!process.env.REDIS_URL) {
  console.error('Chạy nhiều instance cần REDIS_URL (Redis) để chia sẻ trạng thái. Ví dụ: REDIS_URL=redis://127.0.0.1:6379');
  process.exit(1);
}
const children = [];
for (let i = 0; i < n; i++) {
  const port = basePort + i;
  const child = fork(path.join(__dirname, '..', 'src', 'server.js'), [], {
    env: { ...process.env, PORT: String(port), INSTANCE_ID: `s${i + 1}`, PUBLIC_URL: `${host}:${port}` },
  });
  child.on('exit', (code) => console.log(`[cluster] instance s${i + 1} (cổng ${port}) thoát: ${code}`));
  children.push(child);
  console.log(`[cluster] khởi động instance s${i + 1} tại cổng ${port}`);
}
const stop = () => {
  children.forEach((c) => c.kill('SIGTERM'));
  setTimeout(() => process.exit(0), 1500);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
