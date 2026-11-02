import * as THREE from 'three';
import { quality, onSettingsChange } from '../core/settings.js';

/**
 * Ánh sáng: Hemisphere (trời/đất) + Directional (mặt trời, đổ bóng) + 2 đèn điểm trang trí.
 * Tối ưu: vùng shadow của mặt trời BÁM THEO người chơi (chỉ ±22m quanh nhân vật) -> vật ở xa không đổ bóng,
 * shadow map nhỏ vẫn sắc nét. Đèn điểm được dời tới đúng phòng của tầng hiện tại.
 */
export function setupLighting(scene) {
  const hemi = new THREE.HemisphereLight('#ffffff', '#c9b9a0', 1.35);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight('#ffffff', 0.25);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight('#fff6e5', 1.9);
  const OFFSET = new THREE.Vector3(10, 30, 14);
  sun.position.copy(OFFSET);
  sun.castShadow = true;
  const cam = sun.shadow.camera;
  cam.left = -22;
  cam.right = 22;
  cam.top = 22;
  cam.bottom = -22;
  cam.near = 5;
  cam.far = 70;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  const applyShadowSize = () => {
    const s = quality().shadowSize;
    sun.shadow.mapSize.set(s, s);
    if (sun.shadow.map) {
      sun.shadow.map.dispose();
      sun.shadow.map = null;
    }
  };
  applyShadowSize();
  onSettingsChange((_s, patch) => 'quality' in patch && applyShadowSize());

  // Đèn điểm dùng lại cho từng tầng (số đèn cố định để không phải biên dịch lại shader)
  const lightA = new THREE.PointLight('#f472b6', 0, 16, 1.6);
  const lightB = new THREE.PointLight('#ff8a3d', 0, 14, 1.5);
  scene.add(lightA, lightB);
  const discoColors = ['#f472b6', '#22d3ee', '#a3e635', '#facc15', '#a78bfa'].map((c) => new THREE.Color(c));
  let floorId = 1;
  const PRESETS = {
    0: { a: { color: '#38bdf8', pos: [-21, 3, -16], i: 6 }, b: { color: '#ff8a3d', pos: [4, 3, -23], i: 7 } },
    1: { a: { color: '#22d3ee', pos: [-10, 3.2, -14], i: 3 }, b: { color: '#f97316', pos: [32, 3, 22], i: 5 } },
    2: { a: { color: '#f43f5e', pos: [4, 3.2, 20], i: 5 }, b: { color: '#ffffff', pos: [-20, 3.2, -10], i: 2 } },
    3: { a: { color: '#f472b6', pos: [-28, 3.2, 18], i: 9, disco: true }, b: { color: '#ef4444', pos: [14, 3.2, 18], i: 7, pulse: true } },
    4: { a: { color: '#ffffff', pos: [0, 10, 0], i: 0 }, b: { color: '#ffffff', pos: [0, 10, 0], i: 0 } },
  };

  return {
    sun,
    setFloor(id) {
      floorId = id;
      const P = PRESETS[id];
      lightA.color.set(P.a.color);
      lightA.position.set(...P.a.pos);
      lightB.color.set(P.b.color);
      lightB.position.set(...P.b.pos);
      hemi.intensity = id === 4 ? 1.6 : 1.35;
      sun.intensity = id === 4 ? 2.6 : 1.9;
    },
    update(_dt, t, player) {
      if (player) {
        // khung bóng đổ đi theo người chơi
        sun.target.position.set(player.x, 0, player.z);
        sun.position.set(player.x + OFFSET.x, OFFSET.y, player.z + OFFSET.z);
      }
      const on = quality().pointLights;
      const P = PRESETS[floorId];
      lightA.intensity = on ? P.a.i : 0;
      lightB.intensity = on ? P.b.i * (P.b.pulse ? 0.7 + Math.abs(Math.sin(t * 4)) * 0.6 : 1) : 0;
      if (on && P.a.disco) {
        const i = Math.abs(Math.floor(t * 1.03)) % discoColors.length;
        lightA.color.lerp(discoColors[i], 0.08);
        lightA.position.x = P.a.pos[0] + Math.sin(t * 1.3) * 6;
        lightA.position.z = P.a.pos[2] + Math.cos(t * 1.1) * 5;
      }
    },
  };
}
