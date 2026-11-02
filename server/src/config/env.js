import dotenv from 'dotenv';
import os from 'os';

dotenv.config();

// Gom toàn bộ biến môi trường vào 1 chỗ, có giá trị mặc định an toàn cho môi trường dev
const port = Number(process.env.PORT) || 4000;
const env = {
  port,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/gym_online',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  isProd: process.env.NODE_ENV === 'production',
  // Scale ngang: Redis cho Socket.IO adapter + registry channel + presence + cache (tùy chọn)
  redisUrl: process.env.REDIS_URL || '',
  // Mỗi instance có ID riêng; channel của instance này mang tiền tố ID
  instanceId: process.env.INSTANCE_ID || `i${port}`,
  // URL công khai của instance (client kết nối thẳng tới instance giữ channel). Để trống = cùng origin
  publicUrl: process.env.PUBLIC_URL || '',
  channelsPerInstance: Number(process.env.CHANNELS_INITIAL) || 1,
  adminSecret: process.env.ADMIN_SECRET || '',
  loadtestSecret: process.env.LOADTEST_SECRET || '',
  hostname: os.hostname(),
};

if (env.isProd && env.jwtSecret === 'dev-secret-change-me') {
  console.error('[env] JWT_SECRET chưa được cấu hình cho production!');
  process.exit(1);
}

export default env;
