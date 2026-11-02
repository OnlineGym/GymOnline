import http from 'http';
import mongoose from 'mongoose';
import env from './config/env.js';
import { connectDB } from './config/db.js';
import { createApp } from './app.js';
import { initRealtime } from './realtime/index.js';
import { connectRedis } from './services/redis.js';
import { runMigrations } from './services/migrations.js';
import { startWriteBuffer, stopWriteBuffer } from './services/writeBuffer.js';
import { startGiftExpiry } from './controllers/economyController.js';

async function main() {
  await connectDB();
  await runMigrations();
  await connectRedis();
  startWriteBuffer();
  startGiftExpiry();

  const app = createApp();
  const server = http.createServer(app);
  initRealtime(server);

  server.listen(env.port, () => {
    console.log(`[server] Gym Online backend (${env.instanceId}) đang chạy tại http://localhost:${env.port}`);
    console.log(`[server] CORS cho phép: ${env.clientOrigins.join(', ')}`);
  });

  // Tắt an toàn: ghi nốt dữ liệu trong bộ đệm rồi mới thoát
  const shutdown = async (signal) => {
    console.log(`[server] Nhận ${signal}, đang ghi dữ liệu còn lại và tắt...`);
    server.close();
    await stopWriteBuffer();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[server] Không thể khởi động:', err.message);
  process.exit(1);
});
