import * as THREE from 'three';
import { normalMapFrom, STAT_COLORS } from './materials.js';

/**
 * Vật liệu PBR "như thật" sinh hoàn toàn bằng code (không cần ảnh ngoài):
 * thép sơn tĩnh điện, da bọc đệm, chrome, nhôm, nhựa, cao su, màn hình máy cardio.
 * userData:
 *  - worldUV : UV của hộp tính theo mét (vân bề mặt không bị kéo giãn theo kích thước hộp)
 *  - cushion : hộp dùng vật liệu này được dựng thành đệm bọc da (bo tròn, phồng giữa)
 *  - rod     : hộp mảnh dùng vật liệu này được dựng thành thanh tròn
 *  - accent  : màu nhấn theo nhóm cơ (tay nắm nhỏ tự đổi sang cao su đen như máy thật)
 */
const cache = new Map();
const once = (key, make) => {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
};

function canvasOf(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  return c;
}

function tiled(size, draw, rx = 1, ry = 1, srgb = false) {
  const t = new THREE.CanvasTexture(canvasOf(size, draw));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Bề mặt sơn tĩnh điện: gợn "vỏ cam" rất nhỏ
const powderNormal = () =>
  once('n-powder', () =>
    normalMapFrom(
      tiled(256, (g, s) => {
        g.fillStyle = '#808080';
        g.fillRect(0, 0, s, s);
        for (let i = 0; i < 2600; i++) {
          const v = 100 + Math.random() * 60;
          g.fillStyle = `rgb(${v},${v},${v})`;
          g.beginPath();
          g.arc(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 0, 7);
          g.fill();
        }
      }, 5, 5),
      1.1
    )
  );

// Da bọc đệm: các ô vân da nhỏ
const leatherNormal = () =>
  once('n-leather', () =>
    normalMapFrom(
      tiled(256, (g, s) => {
        g.fillStyle = '#a0a0a0';
        g.fillRect(0, 0, s, s);
        g.strokeStyle = '#3c3c3c';
        g.lineWidth = 1.6;
        for (let i = 0; i < 900; i++) {
          g.beginPath();
          g.arc(Math.random() * s, Math.random() * s, 3 + Math.random() * 6, 0, 7);
          g.stroke();
        }
      }, 7, 7),
      2.4
    )
  );

// Vân xước dọc của nhôm xước
const brushedNormal = () =>
  once('n-brushed', () =>
    normalMapFrom(
      tiled(256, (g, s) => {
        for (let x = 0; x < s; x++) {
          const v = 110 + Math.random() * 40;
          g.fillStyle = `rgb(${v},${v},${v})`;
          g.fillRect(x, 0, 1, s);
        }
      }, 6, 1),
      0.7
    )
  );

// Gờ của tay nắm cao su
const ribNormal = () =>
  once('n-rib', () =>
    normalMapFrom(
      tiled(64, (g, s) => {
        g.fillStyle = '#909090';
        g.fillRect(0, 0, s, s);
        g.fillStyle = '#303030';
        for (let i = 0; i < 8; i++) g.fillRect(0, (i * s) / 8, s, 3);
      }),
      3
    )
  );

// Vân khía (knurling) trên thanh đòn
const knurlNormal = () =>
  once('n-knurl', () =>
    normalMapFrom(
      tiled(64, (g, s) => {
        g.fillStyle = '#909090';
        g.fillRect(0, 0, s, s);
        g.strokeStyle = '#2c2c2c';
        g.lineWidth = 2;
        for (let i = -s; i < s * 2; i += 8) {
          g.beginPath();
          g.moveTo(i, 0);
          g.lineTo(i + s, s);
          g.moveTo(i + s, 0);
          g.lineTo(i, s);
          g.stroke();
        }
      }, 3, 16),
      3
    )
  );

function pbr(key, params, userData = {}) {
  return once(key, () => {
    const m = new THREE.MeshStandardMaterial(params);
    Object.assign(m.userData, userData);
    return m;
  });
}

const n2 = (v) => new THREE.Vector2(v, v);

export const surf = {
  // Khung thép sơn tĩnh điện đen
  frame: () => pbr('frame', { color: '#4c5159', roughness: 0.42, metalness: 0.25, normalMap: powderNormal(), normalScale: n2(0.22) }, { worldUV: true }),
  // Khung thép màu bạc (máy cardio)
  frameLight: () => pbr('frameLight', { color: '#aab1bb', roughness: 0.38, metalness: 0.75, normalMap: powderNormal(), normalScale: n2(0.16) }, { worldUV: true }),
  chrome: () => pbr('chrome', { color: '#f1f3f6', roughness: 0.09, metalness: 1 }, { rod: true }),
  alu: () => pbr('alu', { color: '#c6cbd2', roughness: 0.34, metalness: 0.95, normalMap: brushedNormal(), normalScale: n2(0.2) }, { worldUV: true }),
  leather: () => pbr('leather', { color: '#232428', roughness: 0.5, metalness: 0, normalMap: leatherNormal(), normalScale: n2(0.42) }, { cushion: true }),
  // Mặt nhựa ABS của vỏ máy
  plastic: () => pbr('plastic', { color: '#26282d', roughness: 0.36, metalness: 0 }),
  plasticLight: () => pbr('plasticLight', { color: '#d5d9df', roughness: 0.34, metalness: 0 }),
  grip: () => pbr('grip', { color: '#0e0f11', roughness: 0.82, normalMap: ribNormal(), normalScale: n2(0.8) }),
  foam: () => pbr('foam', { color: '#131417', roughness: 0.9, normalMap: leatherNormal(), normalScale: n2(0.3) }),
  rubber: () => pbr('rubber', { color: '#15161a', roughness: 0.94 }),
  stackPlate: () => pbr('stackPlate', { color: '#2c2e33', roughness: 0.36, metalness: 0.3 }),
  knurl: () => pbr('knurl', { color: '#c9cdd3', roughness: 0.42, metalness: 1, normalMap: knurlNormal(), normalScale: n2(0.9) }),
  cable: () => pbr('cable', { color: '#0c0d0f', roughness: 0.55 }),
  // Gỗ dán: bục đứng tập, hộp plyo
  ply: () =>
    once('ply', () => {
      const map = tiled(256, (g, s) => {
        g.fillStyle = '#b98d5d';
        g.fillRect(0, 0, s, s);
        for (let i = 0; i < 90; i++) {
          g.strokeStyle = `rgba(${90 + Math.random() * 40},${60 + Math.random() * 30},30,${0.1 + Math.random() * 0.25})`;
          g.lineWidth = 0.6 + Math.random() * 1.8;
          const y = Math.random() * s;
          g.beginPath();
          g.moveTo(0, y);
          g.bezierCurveTo(s * 0.3, y + Math.random() * 10 - 5, s * 0.7, y + Math.random() * 10 - 5, s, y);
          g.stroke();
        }
      }, 1.4, 1.4, true);
      const m = new THREE.MeshStandardMaterial({ map, roughness: 0.62, normalMap: normalMapFrom(map, 0.9), normalScale: n2(0.35) });
      m.userData.worldUV = true;
      return m;
    }),
  // Thép lỗ của khung rack: hàng lỗ chốt cách đều 5cm
  rackSteel: () =>
    once('rackSteel', () => {
      const map = tiled(128, (g, s) => {
        g.fillStyle = '#4c5159';
        g.fillRect(0, 0, s, s);
        g.fillStyle = '#050506';
        g.beginPath();
        g.arc(s / 2, s / 2, s * 0.17, 0, 7);
        g.fill();
      }, 13.33, 13.33, true);
      map.offset.set(0.5, 0);
      const m = new THREE.MeshStandardMaterial({ map, roughness: 0.44, metalness: 0.25, normalMap: powderNormal(), normalScale: n2(0.2) });
      m.userData.worldUV = true;
      return m;
    }),
  // Màn hình máy cardio: giao diện chạy thật, phát sáng nhẹ
  screen: () =>
    once('screen', () => {
      const map = new THREE.CanvasTexture(
        canvasOf(256, (g, s) => {
          g.fillStyle = '#04121c';
          g.fillRect(0, 0, s, s);
          g.fillStyle = '#22d3ee';
          g.font = '800 62px Arial';
          g.textAlign = 'center';
          g.fillText('8.5', s / 2, 92);
          g.font = '600 20px Arial';
          g.fillStyle = '#7dd3fc';
          g.fillText('KM/H', s / 2, 118);
          g.fillStyle = '#a3e635';
          g.font = '700 26px Arial';
          g.fillText('24:15', 62, 164);
          g.fillStyle = '#fb7185';
          g.fillText('128 ♥', 190, 164);
          for (let i = 0; i < 18; i++) {
            const h = 14 + Math.abs(Math.sin(i * 0.7)) * 44;
            g.fillStyle = i < 11 ? '#22d3ee' : '#164e63';
            g.fillRect(16 + i * 12.6, 244 - h, 9, h);
          }
        })
      );
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 8;
      const m = new THREE.MeshBasicMaterial({ map });
      m.color.setScalar(1.5);
      return m;
    }),
  // Nhãn số kg in cạnh cột tạ
  stackLabel: () =>
    once('stackLabel', () => {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 256;
      const g = c.getContext('2d');
      g.fillStyle = '#1d1f23';
      g.fillRect(0, 0, 64, 256);
      g.fillStyle = '#e5e7eb';
      g.font = '700 22px Arial';
      g.textAlign = 'center';
      for (let i = 0; i < 8; i++) g.fillText(String((i + 1) * 10), 32, 26 + i * 31.5);
      const map = new THREE.CanvasTexture(c);
      map.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshStandardMaterial({ map, roughness: 0.5, metalness: 0.2 });
    }),
  // Màu nhấn theo nhóm cơ: sơn thường, không tự phát sáng
  accent: (stat) =>
    once(`accent-${stat}`, () => {
      const c = new THREE.Color(STAT_COLORS[stat] || '#22d3ee');
      c.lerp(new THREE.Color('#4b5563'), 0.14).multiplyScalar(0.85);
      const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.36, metalness: 0.15 });
      m.userData.accent = true;
      return m;
    }),
  bumper: (color) => pbr(`bumper-${color}`, { color, roughness: 0.74, metalness: 0 }),
};

// Bóng tiếp xúc mềm dưới chân vật thể (rẻ, có ở mọi mức đồ họa)
export const contactShadow = () =>
  once('contact', () => {
    const c = canvasOf(128, (g, s) => {
      g.clearRect(0, 0, s, s);
      g.filter = 'blur(13px)';
      g.fillStyle = 'rgba(0,0,0,0.62)';
      g.fillRect(s * 0.17, s * 0.17, s * 0.66, s * 0.66);
    });
    const map = new THREE.CanvasTexture(c);
    return new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  });

// Ô cửa kính nhìn ra bầu trời + nhà xa (ảnh vẽ bằng code)
export const windowView = () =>
  once('windowView', () => {
    const c = canvasOf(256, (g, s) => {
      const grd = g.createLinearGradient(0, 0, 0, s);
      grd.addColorStop(0, '#8fc4ef');
      grd.addColorStop(0.62, '#dcefff');
      grd.addColorStop(1, '#f6e7d2');
      g.fillStyle = grd;
      g.fillRect(0, 0, s, s);
      for (let i = 0; i < 16; i++) {
        const w = 12 + Math.random() * 26;
        const h = 24 + Math.random() * 70;
        const x = Math.random() * s;
        g.fillStyle = `rgba(${90 + Math.random() * 30},${110 + Math.random() * 30},${135 + Math.random() * 30},0.55)`;
        g.fillRect(x, s - h, w, h);
      }
    });
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.MeshBasicMaterial({ map });
    m.color.setScalar(1.15);
    return m;
  });

// Vết xước/bóng không đều trên sàn: dùng làm roughnessMap cho sàn bóng
export const scuffMap = () =>
  once('scuff', () =>
    tiled(256, (g, s) => {
      g.fillStyle = '#b0b0b0';
      g.fillRect(0, 0, s, s);
      for (let i = 0; i < 70; i++) {
        const v = 120 + Math.random() * 120;
        g.fillStyle = `rgba(${v},${v},${v},0.16)`;
        g.beginPath();
        g.arc(Math.random() * s, Math.random() * s, 8 + Math.random() * 38, 0, 7);
        g.fill();
      }
    })
  );
