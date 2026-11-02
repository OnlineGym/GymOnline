import env from './env.js';

// Kiểm tra origin theo danh sách CLIENT_ORIGIN (cho phép request không có origin như curl/Postman)
export const corsOptions = {
  origin(origin, cb) {
    if (!origin || env.clientOrigins.includes('*') || env.clientOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`Origin ${origin} không được phép (CORS)`));
  },
  credentials: true,
};
