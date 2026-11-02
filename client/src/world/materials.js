import * as THREE from 'three';

// Cache material theo khóa để tái sử dụng (giảm số shader + cho phép gộp geometry theo material)
const cache = new Map();

export function mat(color, { rough = 0.75, metal = 0, emissive, emissiveIntensity = 1, transparent = false, opacity = 1, side, map, flat = false } = {}) {
  const key = [color, rough, metal, emissive, emissiveIntensity, transparent, opacity, side, map?.uuid, flat].join('|');
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: rough,
    metalness: metal,
    transparent,
    opacity,
    map: map || null,
    flatShading: flat,
  });
  if (emissive) {
    m.emissive = new THREE.Color(emissive);
    m.emissiveIntensity = emissiveIntensity;
  }
  if (side !== undefined) m.side = side;
  cache.set(key, m);
  return m;
}

// Bảng màu chung
export const C = {
  metal: '#2b313b',
  metalLight: '#8892a0',
  chrome: '#c9d1dc',
  pad: '#1e2430',
  wall: '#eef1f6',
  wallAccent: '#dfe5ee',
  cyan: '#22d3ee',
  pink: '#f472b6',
  lime: '#a3e635',
  orange: '#fb923c',
  yellow: '#facc15',
  violet: '#a78bfa',
  wood: '#c8925a',
  woodDark: '#8a5a33',
  white: '#ffffff',
};

// Màu nhấn theo nhóm cơ (dùng chung với server)
export { STAT_COLORS } from '@shared/constants.js';

function canvasTexture(size, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  return tex;
}

const rnd = (a, b) => a + Math.random() * (b - a);

// ===== Texture sinh bằng code =====
export const textures = {
  wood(base = '#c8925a', dark = '#a8723f') {
    return canvasTexture(256, (g, s) => {
      const plankH = s / 8;
      for (let i = 0; i < 8; i++) {
        const shade = rnd(-12, 12);
        g.fillStyle = shadeColor(base, shade);
        g.fillRect(0, i * plankH, s, plankH);
        g.strokeStyle = dark;
        g.globalAlpha = 0.25;
        for (let k = 0; k < 6; k++) {
          g.beginPath();
          const y = i * plankH + rnd(4, plankH - 4);
          g.moveTo(0, y);
          g.bezierCurveTo(s * 0.3, y + rnd(-3, 3), s * 0.6, y + rnd(-3, 3), s, y);
          g.stroke();
        }
        g.globalAlpha = 1;
        g.fillStyle = dark;
        g.fillRect(0, i * plankH, s, 2);
        const off = (i % 2) * s * 0.5 + rnd(0, 30);
        g.fillRect(off % s, i * plankH, 2, plankH);
      }
    });
  },
  tile(base = '#f1f5f9', line = '#cbd5e1', n = 4) {
    return canvasTexture(256, (g, s) => {
      g.fillStyle = base;
      g.fillRect(0, 0, s, s);
      const step = s / n;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          g.fillStyle = shadeColor(base, rnd(-6, 4));
          g.fillRect(i * step + 2, j * step + 2, step - 4, step - 4);
        }
      g.strokeStyle = line;
      g.lineWidth = 3;
      for (let i = 0; i <= n; i++) {
        g.beginPath();
        g.moveTo(i * step, 0);
        g.lineTo(i * step, s);
        g.moveTo(0, i * step);
        g.lineTo(s, i * step);
        g.stroke();
      }
    });
  },
  rubber() {
    return canvasTexture(256, (g, s) => {
      g.fillStyle = '#2a2f3a';
      g.fillRect(0, 0, s, s);
      for (let i = 0; i < 1400; i++) {
        g.fillStyle = Math.random() < 0.5 ? '#3a4150' : Math.random() < 0.3 ? '#22d3ee55' : '#1c2029';
        g.fillRect(rnd(0, s), rnd(0, s), 2, 2);
      }
      g.strokeStyle = '#1a1e26';
      g.lineWidth = 3;
      g.strokeRect(0, 0, s, s);
    });
  },
  mats() {
    return canvasTexture(256, (g, s) => {
      const cols = ['#3b82f6', '#2563eb', '#1d4ed8', '#3b82f6'];
      const n = 4;
      const step = s / n;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          g.fillStyle = cols[(i + j) % cols.length];
          g.fillRect(i * step, j * step, step, step);
          g.strokeStyle = '#1e3a8a';
          g.lineWidth = 2;
          g.strokeRect(i * step + 1, j * step + 1, step - 2, step - 2);
        }
    });
  },
  belt() {
    return canvasTexture(64, (g, s) => {
      g.fillStyle = '#16191f';
      g.fillRect(0, 0, s, s);
      g.fillStyle = '#2b303a';
      for (let i = 0; i < 4; i++) g.fillRect(0, i * 16, s, 5);
    });
  },
  grass() {
    return canvasTexture(256, (g, s) => {
      g.fillStyle = '#7ccf6b';
      g.fillRect(0, 0, s, s);
      for (let i = 0; i < 2500; i++) {
        g.fillStyle = Math.random() < 0.5 ? '#6bbf5b' : '#8fdc7c';
        g.fillRect(rnd(0, s), rnd(0, s), 2, 3);
      }
    });
  },
  turf() {
    return canvasTexture(256, (g, s) => {
      g.fillStyle = '#3f7d2c';
      g.fillRect(0, 0, s, s);
      for (let i = 0; i < 3000; i++) {
        g.fillStyle = Math.random() < 0.5 ? '#4a8f34' : '#366b26';
        g.fillRect(rnd(0, s), rnd(0, s), 1, 3);
      }
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.fillRect(0, 0, s, 4);
    });
  },
  carpet(base = '#2e1065', dot = '#7c3aed') {
    return canvasTexture(128, (g, s) => {
      g.fillStyle = base;
      g.fillRect(0, 0, s, s);
      g.fillStyle = dot;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) g.fillRect(i * 32 + 14, j * 32 + 14, 4, 4);
    });
  },
  track() {
    return canvasTexture(256, (g, s) => {
      g.fillStyle = '#c2410c';
      g.fillRect(0, 0, s, s);
      for (let i = 0; i < 1500; i++) {
        g.fillStyle = Math.random() < 0.5 ? '#b23c0b' : '#d4541c';
        g.fillRect(rnd(0, s), rnd(0, s), 2, 2);
      }
    });
  },
  concrete() {
    return canvasTexture(256, (g, s) => {
      g.fillStyle = '#a8a29e';
      g.fillRect(0, 0, s, s);
      for (let i = 0; i < 2000; i++) {
        g.fillStyle = Math.random() < 0.5 ? '#9c9590' : '#b5afaa';
        g.fillRect(rnd(0, s), rnd(0, s), 2, 2);
      }
      g.strokeStyle = '#8f8883';
      g.lineWidth = 2;
      g.strokeRect(0, 0, s, s);
    });
  },
  water() {
    return canvasTexture(256, (g, s) => {
      g.fillStyle = '#0ea5e9';
      g.fillRect(0, 0, s, s);
      for (let i = 0; i < 60; i++) {
        g.strokeStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.2})`;
        g.lineWidth = 2;
        g.beginPath();
        const y = rnd(0, s);
        const x = rnd(0, s);
        g.moveTo(x, y);
        g.quadraticCurveTo(x + 15, y - 6, x + 30, y);
        g.stroke();
      }
    });
  },
  softDot() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.5)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  },
};

export function shadeColor(hex, amt) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, THREE.MathUtils.clamp(hsl.l + amt / 255, 0, 1));
  return `#${c.getHexString()}`;
}

// Texture chữ cho bảng hiệu
export function textTexture(lines, { w = 512, h = 128, bg = '#0f172a', fg = '#ffffff', accent = '#22d3ee', font = 'Be Vietnam Pro', size = 54 } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  roundRect(g, 0, 0, w, h, 24);
  g.fill();
  g.strokeStyle = accent;
  g.lineWidth = 8;
  roundRect(g, 6, 6, w - 12, h - 12, 20);
  g.stroke();
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const arr = Array.isArray(lines) ? lines : [lines];
  arr.forEach((line, i) => {
    const fs = i === 0 ? size : size * 0.55;
    g.font = `800 ${fs}px "${font}", Arial, sans-serif`;
    const y = arr.length === 1 ? h / 2 : h * (i === 0 ? 0.4 : 0.76);
    g.fillText(line, w / 2, y, w - 40);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
