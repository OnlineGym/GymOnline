import mongoose from 'mongoose';
import env from './env.js';

// Kết nối MongoDB, tự thử lại nếu thất bại (hữu ích khi Mongo khởi động chậm)
export async function connectDB(retries = 5) {
  mongoose.set('strictQuery', true);
  for (let i = 1; i <= retries; i++) {
    try {
      await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
      console.log(`[db] Đã kết nối MongoDB: ${mongoose.connection.host}/${mongoose.connection.name}`);
      return;
    } catch (err) {
      console.error(`[db] Kết nối thất bại (lần ${i}/${retries}): ${err.message}`);
      if (i === retries) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}
