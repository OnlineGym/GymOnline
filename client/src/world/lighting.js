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
  const ambient = new THREE.AmbientLight('#ffffff', 0.12);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight('#fff6e5', 1.9);
  const OFFSET = new THREE.Vector3(10, 30, 14);
  const OFFSET_INDOOR = new THREE.Vector3(3, 30, 5); // trong nhà: nguồn sáng gần như từ đèn trần
  let offset = OFFSET_INDOOR;
  sun.position.copy(OFFSET);
  sun.castShadow = true;
  const cam = sun.shadow.camera;
  cam.left = -20;
  cam.right = 20;
  cam.top = 20;
  cam.bottom = -20;
  cam.near = 5;
  cam.far = 70;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  sun.shadow.intensity = 0.72;
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
  let frame = 0;
  let lastX = NaN;
  let lastZ = NaN;
  const PRESETS = {
    0: { a: { color: '#38bdf8', pos: [-6, 3, -12], i: 6 }, b: { color: '#ff8a3d', pos: [10.5, 3, -16], i: 7 } },
    1: { a: { color: '#22d3ee', pos: [2, 3.2, -10], i: 3 }, b: { color: '#f97316', pos: [32, 3, 16], i: 5 } },
    2: { a: { color: '#f43f5e', pos: [11, 3.2, 15], i: 5 }, b: { color: '#ffffff', pos: [-6, 3.2, -8], i: 2 } },
    3: { a: { color: '#f472b6', pos: [-10.5, 3.2, 14], i: 9, disco: true }, b: { color: '#ef4444', pos: [17, 3.2, 14], i: 7, pulse: true } },
    4: { a: { color: '#ffffff', pos: [0, 10, 0], i: 0 }, b: { color: '#ffffff', pos: [0, 10, 0], i: 0 } },
  };

  return {
    sun,
    // Bóng đổ cập nhật 20 lần/giây (hoặc khi vùng bóng dịch chuyển): cảnh đa phần đứng yên nên mắt không thấy khác
    shadowDirty: true,
    setFloor(id) {
      floorId = id;
      lastX = NaN; // đổi tầng: vẽ lại bóng ngay
      const P = PRESETS[id];
      lightA.color.set(P.a.color);
      lightA.position.set(...P.a.pos);
      lightB.color.set(P.b.color);
      lightB.position.set(...P.b.pos);
      offset = id === 4 ? OFFSET : OFFSET_INDOOR;
      // Mức có phản chiếu môi trường: để ánh sáng môi trường gánh phần chiếu sáng nền, tăng độ tương phản
      const ibl = quality().envProbe;
      hemi.intensity = id === 4 ? (ibl ? 0.75 : 1.3) : id === 0 ? (ibl ? 0.6 : 0.9) : ibl ? 1.0 : 0.72;
      ambient.intensity = ibl ? 0.16 : 0.18;
      sun.intensity = id === 4 ? 2.0 : id === 0 ? 1.1 : ibl ? 1.9 : 1.1;
    },
    update(_dt, t, player) {
      if (player) {
        // khung bóng đổ đi theo người chơi
        // Khung bóng dịch theo bậc 0.5m để cạnh bóng không rung khi đi bộ
        const sx = Math.round(player.x * 2) / 2;
        const sz = Math.round(player.z * 2) / 2;
        sun.target.position.set(sx, 0, sz);
        sun.position.set(sx + offset.x, offset.y, sz + offset.z);
        frame++;
        this.shadowDirty = sx !== lastX || sz !== lastZ || frame % 3 === 0;
        lastX = sx;
        lastZ = sz;
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
