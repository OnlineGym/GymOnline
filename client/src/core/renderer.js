import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { settings, quality, onSettingsChange } from './settings.js';

// Khởi tạo WebGLRenderer + scene + CSS2D (nhãn tên, chat bubble)
export function createRenderer(container, labelContainer) {
  const q = quality();
  const renderer = new THREE.WebGLRenderer({ antialias: q.antialias, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer({ element: labelContainer });

  const scene = new THREE.Scene();
  // Environment map dựng sẵn (phòng ảo) để gương, inox, kim loại phản chiếu đẹp thay vì bị đen
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;
  pmrem.dispose();
  scene.background = new THREE.Color('#bfe3ff');
  scene.fog = new THREE.Fog('#bfe3ff', 45, 110);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);

  function applyQuality() {
    const preset = quality();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.pixelRatio));
    renderer.shadowMap.enabled = preset.shadows;
    renderer.shadowMap.needsUpdate = true;
    // Cập nhật lại material để shader biên dịch theo trạng thái shadow mới
    scene.traverse((o) => {
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true));
    });
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  applyQuality();
  resize();
  window.addEventListener('resize', resize);
  onSettingsChange((_s, patch) => {
    if ('quality' in patch) applyQuality();
  });

  return {
    renderer,
    labelRenderer,
    scene,
    camera,
    render() {
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
    },
    get settings() {
      return settings;
    },
  };
}
