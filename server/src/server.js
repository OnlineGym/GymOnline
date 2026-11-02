import http from 'http';
import mongoose from 'mongoose';
import env from './config/env.js';
import { connectDB } from './config/db.js';
import { createApp } from './app.js';
import { initSockets } from './sockets/index.js';

async function main() {
  await connectDB();

  const app = createApp();
  const server = http.createServer(app);
  initSockets(server);

  server.listen(env.port, () => {
    console.log(`[server] Gym Online backend đang chạy tại http://localhost:${env.port}`);
    console.log(`[server] CORS cho phép: ${env.clientOrigins.join(', ')}`);
  });

  // Tắt server an toàn
  const shutdown = async (signal) => {
    console.log(`[server] Nhận ${signal}, đang tắt...`);
    server.close();
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
