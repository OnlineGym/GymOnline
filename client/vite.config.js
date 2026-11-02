import { defineConfig, loadEnv } from 'vite';
import path from 'path';

// Proxy /api và /socket.io sang backend => FE và BE cùng origin khi dev (kể cả khi mở bằng điện thoại qua LAN)
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_BACKEND_URL || 'http://localhost:4000';
  return {
    resolve: {
      // Dữ liệu dùng chung với server (cấu hình máy tập, hằng số, giao thức)
      alias: { '@shared': path.resolve(__dirname, '../shared') },
    },
    server: {
      host: true,
      port: 5173,
      fs: { allow: ['..'] },
      proxy: {
        '/api': { target, changeOrigin: true },
        '/socket.io': { target, changeOrigin: true, ws: true },
      },
    },
    build: {
      chunkSizeWarningLimit: 2000,
    },
  };
});
