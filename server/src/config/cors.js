import env from './env.js';

// Regex nhận diện các origin cục bộ / mạng nội bộ LAN (localhost, 127.0.0.1, 192.168.x.x, 10.x.x.x, 172.16-31.x.x)
const LOCAL_ORIGIN_REGEX = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/;

// Kiểm tra origin theo danh sách CLIENT_ORIGIN (cho phép request không có origin như curl/Postman)
export const corsOptions = {
  origin(origin, cb) {
    if (!origin || env.clientOrigins.includes('*') || env.clientOrigins.includes(origin)) {
      return cb(null, true);
    }
    // Ở môi trường dev, tự động cho phép thiết bị di động truy cập qua mạng Wi-Fi/LAN
    if (!env.isProd && LOCAL_ORIGIN_REGEX.test(origin)) {
      return cb(null, true);
    }
    const err = new Error(`Origin ${origin} không được phép (CORS)`);
    err.status = 403;
    cb(err);
  },
  credentials: true,
};
