import * as THREE from 'three';
import { quality, onSettingsChange } from '../core/settings.js';

// Ánh sáng: Hemisphere (trời/đất) + Directional (mặt trời, đổ bóng) + vài đèn điểm trang trí
export function setupLighting(scene) {
  const hemi = new THREE.HemisphereLight('#ffffff', '#c9b9a0', 1.35);
  scene.add(hemi);

  const ambient = new THREE.AmbientLight('#ffffff', 0.25);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight('#fff6e5', 1.9);
  sun.position.set(10, 40, 14);
  sun.target.position.set(0, 0, -2);
  sun.castShadow = true;
  const cam = sun.shadow.camera;
  cam.left = -30;
  cam.right = 30;
  cam.top = 30;
  cam.bottom = -30;
  cam.near = 5;
  cam.far = 80;
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

  // Đèn màu: phòng aerobic (disco) và phòng xông hơi (ánh cam ấm)
  const disco = new THREE.PointLight('#f472b6', 0, 14, 1.6);
  disco.position.set(-15, 3.2, -17);
  const sauna = new THREE.PointLight('#ff8a3d', 0, 12, 1.5);
  sauna.position.set(17, 3, -17);
  scene.add(disco, sauna);

  const discoColors = ['#f472b6', '#22d3ee', '#a3e635', '#facc15', '#a78bfa'].map((c) => new THREE.Color(c));

  return {
    sun,
    update(_dt, t) {
      const on = quality().pointLights;
      disco.intensity = on ? 9 : 0;
      sauna.intensity = on ? 7 + Math.sin(t * 3) * 0.6 : 0;
      if (on) {
        const i = Math.abs(Math.floor(t * 1.03)) % discoColors.length;
        disco.color.lerp(discoColors[i], 0.08);
        disco.position.x = -15 + Math.sin(t * 1.3) * 5;
        disco.position.z = -17 + Math.cos(t * 1.1) * 4;
      }
    },
  };
}
