import './styles/main.css';
import './styles/v2.css';
import { createRenderer } from './core/renderer.js';
import { GameLoop } from './core/loop.js';
import { Input } from './core/input.js';
import { ThirdPersonCamera } from './core/camera.js';
import { Game } from './core/Game.js';
import { audio } from './core/audio.js';
import { Building } from './world/Building.js';
import { EquipmentManager } from './equipment/EquipmentManager.js';
import { showAuthScreen } from './ui/authScreen.js';
import { showCreatorScreen } from './ui/creatorScreen.js';
import { showChannelScreen } from './ui/channelScreen.js';
import { toast } from './ui/dom.js';
import { api, auth } from './network/api.js';
import { Net } from './network/socket.js';
import { isMobile } from './core/device.js';
import { SPAWN_FLOOR } from '@shared/constants.js';

/**
 * Luồng chính: dựng tầng 1 (làm nền cho màn đăng nhập) → đăng nhập/đăng ký
 * → tạo nhân vật (nếu chưa có) → chọn channel → kết nối realtime → vào game
 */
if (isMobile()) document.body.classList.add('is-mobile');
const ctx = createRenderer(document.getElementById('game'), document.getElementById('labels'));
ctx.clockTime = 0;
const equipment = new EquipmentManager();
const building = new Building(ctx.scene, equipment);
building.setFloor(SPAWN_FLOOR);
const input = new Input(ctx.renderer.domElement);
const camera = new ThirdPersonCamera(ctx.camera);

const loop = new GameLoop(ctx.renderer);
let game = null;

loop.add((dt, t) => {
  ctx.loopFps = loop.fps;
  camera.setBlockers(building.cameraBlockers);
  if (game) {
    game.update(dt, t);
  } else {
    // Trước khi vào game: camera bay vòng quanh sảnh làm nền
    ctx.clockTime = t;
    const a = t * 0.06;
    ctx.camera.position.set(Math.sin(a) * 14, 3.4, 18 + Math.cos(a) * 9);
    ctx.camera.lookAt(0, 1, 10);
    building.update(dt, t, [{ x: 0, z: 20 }], { beat: audio.getBeat() });
    equipment.update(building.id, dt, t);
  }
  ctx.render();
});
loop.start();

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
    if (!character) character = await showCreatorScreen(null, { mode: 'create' });
    // Chọn channel (mỗi channel tối đa ~120 người)
    let initData = null;
    const net = new Net();
    while (!initData) {
      const pick = await showChannelScreen({});
      try {
        initData = await net.connect(auth.token, pick);
      } catch (e) {
        toast(e.message, 'error', 4000);
        if (e.code === 'UNAUTHORIZED') throw e;
      }
    }
    game = new Game({ ctx, building, equipment, input, camera, net, initData, user: me.user, character });
    if (import.meta.env.DEV) window.__game = game; // hỗ trợ debug khi phát triển
  } catch (e) {
    console.error(e);
    toast(e.message || 'Có lỗi xảy ra', 'error', 5000);
    if (e.status === 401 || e.code === 'UNAUTHORIZED') auth.token = null;
    setTimeout(boot, 2500);
  }
}

boot();
