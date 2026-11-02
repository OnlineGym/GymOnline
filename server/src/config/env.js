import dotenv from 'dotenv';

dotenv.config();

// Gom toàn bộ biến môi trường vào 1 chỗ, có giá trị mặc định an toàn cho môi trường dev
const env = {
  port: Number(process.env.PORT) || 4000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/gym_online',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  isProd: process.env.NODE_ENV === 'production',
};

if (env.isProd && env.jwtSecret === 'dev-secret-change-me') {
  console.error('[env] JWT_SECRET chưa được cấu hình cho production!');
  process.exit(1);
}

export default env;
