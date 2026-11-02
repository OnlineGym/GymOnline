import './styles/main.css';
import { createRenderer } from './core/renderer.js';
import { GameLoop } from './core/loop.js';
import { Input } from './core/input.js';
import { ThirdPersonCamera } from './core/camera.js';
import { Game } from './core/Game.js';
import { audio } from './core/audio.js';
import { buildGym } from './world/buildGym.js';
import { EquipmentManager } from './equipment/EquipmentManager.js';
import { showAuthScreen } from './ui/authScreen.js';
import { showCreatorScreen } from './ui/creatorScreen.js';
import { toast } from './ui/dom.js';
import { api, auth } from './network/api.js';
import { Net } from './network/socket.js';
import { isMobile } from './core/device.js';

/**
 * Luồng chính: dựng thế giới 3D (làm nền cho màn đăng nhập) → đăng nhập/đăng ký
 * → tạo nhân vật (nếu chưa có) → kết nối realtime → vào game
 */
if (isMobile()) document.body.classList.add('is-mobile');
const ctx = createRenderer(document.getElementById('game'), document.getElementById('labels'));
ctx.clockTime = 0;
const equipment = new EquipmentManager();
const world = buildGym(ctx.scene, equipment);
const input = new Input(ctx.renderer.domElement);
const camera = new ThirdPersonCamera(ctx.camera);
camera.setBlockers(world.cameraBlockers);

const loop = new GameLoop(ctx.renderer);
let game = null;

// Trước khi vào game: camera bay vòng quanh sảnh làm nền
loop.add((dt, t) => {
  ctx.loopFps = loop.fps;
  if (game) {
    game.update(dt, t);
  } else {
    ctx.clockTime = t;
    const a = t * 0.08;
    ctx.camera.position.set(Math.sin(a) * 9, 3.3, 6 + Math.cos(a) * 7);
    ctx.camera.lookAt(-4, 1, -4);
    world.update(dt, t, []);
    equipment.update(dt, t);
  }
  ctx.render();
});
loop.start();

// Mở khóa âm thanh ở lần chạm/bấm đầu tiên (chính sách autoplay)
const unlockAudio = () => audio.unlock();
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });

requestAnimationFrame(() => document.getElementById('loading').classList.add('done'));
setTimeout(() => document.getElementById('loading')?.remove(), 800);

async function ensureLogin() {
  if (auth.token) {
    try {
      return await api.me();
    } catch (e) {
      if (e.status !== 401) toast(e.message, 'error', 4000);
      auth.token = null;
    }
  }
  await showAuthScreen();
  return api.me();
}

async function boot() {
  try {
    const me = await ensureLogin();
    let character = me.character;
    if (!character) {
      character = await showCreatorScreen(null, { mode: 'create' });
    }
    const net = new Net();
    const initData = await net.connect(auth.token);
    game = new Game({ ctx, world, equipment, input, camera, net, initData, user: me.user, character });
    if (import.meta.env.DEV) window.__game = game; // hỗ trợ debug khi phát triển
  } catch (e) {
    console.error(e);
    toast(e.message || 'Có lỗi xảy ra', 'error', 5000);
    if (e.status === 401 || /hết hạn/.test(e.message)) auth.token = null;
    setTimeout(boot, 1500);
  }
}

boot();
