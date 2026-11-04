/**
 * Cấp hoặc gỡ quyền quản trị cho tài khoản đã đăng ký:
 *   npm run admin -- <tên đăng nhập>          cấp quyền
 *   npm run admin -- <tên đăng nhập> --remove gỡ quyền
 */
import mongoose from 'mongoose';
import env from '../src/config/env.js';
import User from '../src/models/User.js';

const [username, flag] = process.argv.slice(2);
if (!username) {
  console.error('Cách dùng: npm run admin -- <tên đăng nhập> [--remove]');
  process.exit(1);
}
await mongoose.connect(env.mongoUri);
const role = flag === '--remove' ? 'user' : 'admin';
const user = await User.findOneAndUpdate({ username }, { role }, { new: true });
if (!user) console.error(`Không tìm thấy tài khoản "${username}"`);
else console.log(`${user.username} giờ có quyền: ${user.role}`);
await mongoose.disconnect();
process.exit(user ? 0 : 1);
