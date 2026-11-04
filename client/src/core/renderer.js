import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { settings, quality, onSettingsChange } from './settings.js';

/**
 * Renderer + scene + hậu kỳ:
 *  RenderPass (MSAA) → GTAO (bóng tối góc khuất, mức Cao trở lên) → Bloom (đèn neon/màn hình phát sáng)
 *  → OutputPass (tone mapping ACES + sRGB) → chỉnh màu điện ảnh (tương phản, bão hòa, tối 4 góc).
 * Mức Thấp render thẳng không hậu kỳ.
 */
const BLOOM = 0.26;

// Chỉnh màu cuối cùng: rẻ (1 pass), tạo cảm giác ảnh chụp thay vì đồ họa phẳng
const GradeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float l = dot(col, vec3(0.2126,0.7152,0.0722));
      col = mix(vec3(l), col, 1.1);
      col = mix(col, col*col*(3.0-2.0*col), 0.22);
      col *= mix(vec3(1.0,0.985,0.96), vec3(0.97,0.99,1.03), 1.0 - smoothstep(0.1,0.6,l));
      vec2 d = vUv - 0.5;
      col *= 1.0 - dot(d,d) * 0.42;
      gl_FragColor = vec4(col, c.a);
    }`,
};

export function createRenderer(container, labelContainer) {
  const q = quality();
  const renderer = new THREE.WebGLRenderer({ antialias: q.antialias && !q.post, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer({ element: labelContainer });

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = roomEnv;
  scene.environmentIntensity = 0.45;
  scene.background = new THREE.Color('#bfe3ff');
  scene.fog = new THREE.Fog('#bfe3ff', 45, 110);

  const camera = new THREE.PerspectiveCamera(settings.fov || 62, 1, 0.08, 400);

  // ---------- Hậu kỳ ----------
  let bloomLevel = BLOOM; // ngoài trời giảm mạnh: bầu trời quá sáng sẽ làm bloom loang trắng cả hình
  let underwater = false;
  let resScale = 1; // độ phân giải động: tự giảm khi FPS thấp, GUI vẫn nét
  let composer = null;
  let gtao = null;
  let bloom = null;
  function buildComposer() {
    composer?.dispose();
    composer = null;
    gtao = null;
    bloom = null;
    const preset = quality();
    if (!preset.post) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pr = renderer.getPixelRatio();
    const target = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: preset.msaa || 0 });
    composer = new EffectComposer(renderer, target);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    composer.addPass(new RenderPass(scene, camera));
    if (preset.ao) {
      gtao = new GTAOPass(scene, camera, w, h);
      // AO tính ở 1/2 độ phân giải rồi phóng lại: nhẹ hơn ~4 lần, bóng góc vốn mềm nên gần như không khác
      const gtaoSize = gtao.setSize.bind(gtao);
      gtao.setSize = (sw, sh) => gtaoSize(Math.round(sw / 2), Math.round(sh / 2));
      gtao.output = GTAOPass.OUTPUT.Default;
      gtao.blendIntensity = 1;
      gtao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.4, thickness: 1.2, scale: 1, samples: settings.quality === 'ultra' ? 10 : 8 });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 6 });
      composer.addPass(gtao);
    }
    if (preset.bloom) {
      // Chỉ những vùng RẤT sáng (neon, màn hình, đèn) mới tỏa sáng – tường/sàn trắng không bị lóa
      bloom = new UnrealBloomPass(new THREE.Vector2(w, h), underwater ? 0.12 : bloomLevel, 0.5, 2.1);
      const bloomSize = bloom.setSize.bind(bloom);
      bloom.setSize = (sw, sh) => bloomSize(Math.round(sw / 2), Math.round(sh / 2));
      composer.addPass(bloom);
    }
    composer.addPass(new OutputPass());
    composer.addPass(new ShaderPass(GradeShader));
  }

  function applyQuality() {
    const preset = quality();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.pixelRatio) * resScale);
    renderer.shadowMap.enabled = preset.shadows;
    renderer.shadowMap.autoUpdate = false; // Building quyết định khi nào vẽ lại bóng
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.needsUpdate = true;
    scene.traverse((o) => {
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true));
    });
    buildComposer();
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
    composer?.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  applyQuality();
  resize();
  window.addEventListener('resize', resize);
  onSettingsChange((_s, patch) => {
    if ('quality' in patch) applyQuality();
    if ('fov' in patch) {
      camera.fov = settings.fov;
      camera.updateProjectionMatrix();
    }
  });

  return {
    renderer,
    labelRenderer,
    scene,
    camera,
    pmrem,
    roomEnv,
    get resolutionScale() {
      return resScale;
    },
    setResolutionScale(s) {
      resScale = s;
      const pr = Math.min(window.devicePixelRatio || 1, quality().pixelRatio) * s;
      renderer.setPixelRatio(pr);
      composer?.setPixelRatio(pr);
      resize();
    },
    // Hiệu ứng dưới nước: màu sương + giảm bloom
    setUnderwater(on) {
      underwater = on;
      if (bloom) bloom.strength = on ? 0.12 : bloomLevel;
    },
    setOutdoor(on) {
      bloomLevel = on ? 0.03 : BLOOM;
      if (bloom && !underwater) bloom.strength = bloomLevel;
    },
    render() {
      if (composer) composer.render();
      else renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
    },
    get settings() {
      return settings;
    },
  };
}
