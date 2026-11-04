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
  // Địa chỉ giao diện web, dùng để tạo link trong email
  clientUrl: (process.env.CLIENT_URL || (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',')[0]).trim().replace(/\/$/, ''),
  smtp: {
    url: process.env.SMTP_URL || '',
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'Gym Online <no-reply@gymonline.local>',
  },
  // Nhạc phòng Aerobic: API key YouTube Data v3 (tự tìm nhạc) và/hoặc playlist mặc định (ID hoặc link)
  youtubeApiKey: process.env.YOUTUBE_API_KEY || '',
  aerobicPlaylist: process.env.AEROBIC_YT_PLAYLIST || '',
};

if (env.isProd && env.jwtSecret === 'dev-secret-change-me') {
  console.error('[env] JWT_SECRET chưa được cấu hình cho production!');
  process.exit(1);
}

export default env;
