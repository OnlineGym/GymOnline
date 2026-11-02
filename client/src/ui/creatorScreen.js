import * as THREE from 'three';
import { h, uiRoot } from './dom.js';
import { Character, DEFAULT_APPEARANCE } from '../character/Character.js';
import { EMOTE_LIST } from '../character/animations.js';
import { api } from '../network/api.js';
import { audio } from '../core/audio.js';

const SKIN = ['#ffe3cc', '#f5c9a0', '#e8b48a', '#c98e62', '#8d5a3b', '#5c3a24'];
const HAIR_COLORS = ['#1f1a17', '#3b2a20', '#7a4a2a', '#d4a056', '#f2e2b0', '#e85d75', '#6d5bd0', '#22b5c9'];
const CLOTH = ['#22d3ee', '#f472b6', '#a3e635', '#facc15', '#fb923c', '#ef4444', '#8b5cf6', '#6b7f99', '#334155', '#f8fafc', '#111827', '#7c8fa6'];
const HAIR_STYLES = [
  ['bald', 'Trọc (chú tiểu)'],
  ['short', 'Ngắn'],
  ['spiky', 'Dựng'],
  ['bun', 'Búi'],
  ['long', 'Dài'],
  ['ponytail', 'Đuôi ngựa'],
  ['twintails', 'Hai bím'],
];
const OUTFITS = [
  ['tshirt', 'Áo thun'],
  ['tank', 'Ba lỗ'],
  ['hoodie', 'Hoodie'],
  ['robe', 'Áo cà sa'],
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * Màn hình tạo / chỉnh sửa nhân vật với xem trước 3D xoay được.
 * mode 'create' bắt buộc lưu; mode 'edit' có nút Hủy (dùng ở tủ locker).
 * Trả về Promise<character | null>
 */
export function showCreatorScreen(initial, { mode = 'create' } = {}) {
  return new Promise((resolve) => {
    const app = JSON.parse(JSON.stringify({ ...DEFAULT_APPEARANCE, ...(initial || {}) }));

    // ---- Xem trước 3D ----
    const preview = h('div', { class: 'creator-preview' }, h('div', { class: 'hint' }, 'Kéo để xoay nhân vật'));
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    preview.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
    cam.position.set(0, 1.0, 4.2);
    cam.lookAt(0, 0.72, 0);
    scene.add(new THREE.HemisphereLight('#ffffff', '#445566', 1.6));
    const key = new THREE.DirectionalLight('#ffffff', 2);
    key.position.set(2, 4, 3);
    key.castShadow = true;
    scene.add(key);
    const rim = new THREE.DirectionalLight('#22d3ee', 1.2);
    rim.position.set(-3, 2, -3);
    scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.2, 40), new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.8 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.02, 8, 64), new THREE.MeshBasicMaterial({ color: '#22d3ee' }));
    ring.rotation.x = -Math.PI / 2;
    scene.add(ring);
    const char = new Character(app, { showName: false });
    scene.add(char.root);

    let rotY = 0.4;
    let drag = null;
    renderer.domElement.addEventListener('pointerdown', (e) => (drag = e.clientX));
    const onUp = () => (drag = null);
    const onMove = (e) => {
      if (drag === null) return;
      rotY += (e.clientX - drag) * 0.01;
      drag = e.clientX;
    };
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointermove', onMove);

    let running = true;
    let last = performance.now();
    const loop = (now) => {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const w = preview.clientWidth;
      const hh = preview.clientHeight;
      const pr = renderer.getPixelRatio();
      if (hh > 0 && (renderer.domElement.width !== Math.floor(w * pr) || renderer.domElement.height !== Math.floor(hh * pr))) {
        renderer.setSize(w, hh, false);
        cam.aspect = w / Math.max(1, hh);
        cam.updateProjectionMatrix();
      }
      if (drag === null) rotY += dt * 0.25;
      char.root.rotation.y = rotY;
      char.update(dt);
      renderer.render(scene, cam);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    const refresh = (emote = true) => {
      char.setAppearance(app);
      // emote=false: đang kéo bảng chọn màu tự do -> không vẽ lại form để không đóng color picker
      if (emote) {
        char.playEmote(pick(['wave', 'flex', 'cheer', 'laugh', 'cool']));
        renderForm();
      }
    };

    // ---- Form ----
    const form = h('div', { class: 'creator-form' });
    const err = h('div', { class: 'error-text' });
    const nameInput = h('input', { class: 'input', maxlength: 16, value: app.displayName === 'Gymer' && mode === 'create' ? '' : app.displayName, placeholder: 'Tên hiển thị (2-16 ký tự)' });
    nameInput.oninput = () => (app.displayName = nameInput.value);

    const chips = (list, current, onPick) =>
      h('div', { class: 'opt-row' }, list.map(([v, label]) => h('button', { type: 'button', class: `chip${v === current ? ' active' : ''}`, onclick: () => onPick(v) }, label)));

    const swatches = (colors, current, onPick) => {
      const custom = h('input', { type: 'color', class: 'swatch-custom', value: current, title: 'Chọn màu khác' });
      custom.oninput = () => onPick(custom.value, false);
      return h(
        'div',
        { class: 'swatches' },
        colors.map((c) =>
          h('button', { type: 'button', class: `swatch${c.toLowerCase() === current.toLowerCase() ? ' active' : ''}`, style: { background: c }, title: c, onclick: () => onPick(c) })
        ),
        custom
      );
    };

    const field = (label, content) => h('div', { class: 'field' }, h('label', {}, label), content);
    const formBody = h('div');

    function renderForm() {
      formBody.innerHTML = '';
      formBody.append(
        field(
          'Giới tính',
          chips(
            [
              ['male', '👦 Nam'],
              ['female', '👧 Nữ'],
            ],
            app.gender,
            (v) => {
              app.gender = v;
              refresh();
            }
          )
        ),
        field('Màu da', swatches(SKIN, app.skinColor, (c, e = true) => ((app.skinColor = c), refresh(e)))),
        field('Kiểu tóc', chips(HAIR_STYLES, app.hair.style, (v) => ((app.hair.style = v), refresh()))),
        field('Màu tóc', swatches(HAIR_COLORS, app.hair.color, (c, e = true) => ((app.hair.color = c), refresh(e)))),
        field('Trang phục', chips(OUTFITS, app.outfit.style, (v) => ((app.outfit.style = v), refresh()))),
        field('Màu áo', swatches(CLOTH, app.outfit.top, (c, e = true) => ((app.outfit.top = c), refresh(e)))),
        field('Màu quần', swatches(CLOTH, app.outfit.bottom, (c, e = true) => ((app.outfit.bottom = c), refresh(e)))),
        field('Màu giày', swatches(CLOTH, app.outfit.shoes, (c, e = true) => ((app.outfit.shoes = c), refresh(e))))
      );
    }

    const randomize = () => {
      app.gender = pick(['male', 'female']);
      app.skinColor = pick(SKIN);
      app.hair = { style: pick(HAIR_STYLES)[0], color: pick(HAIR_COLORS) };
      app.outfit = { style: pick(OUTFITS)[0], top: pick(CLOTH), bottom: pick(CLOTH), shoes: pick(CLOTH) };
      audio.sfx('click');
      refresh();
    };

    const close = (result) => {
      running = false;
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointermove', onMove);
      char.dispose();
      renderer.dispose();
      screen.remove();
      resolve(result);
    };

    const saveBtn = h('button', { class: 'btn', type: 'button' }, mode === 'create' ? 'Vào phòng gym 🏋️' : 'Lưu trang phục');
    saveBtn.onclick = async () => {
      audio.unlock();
      err.textContent = '';
      const name = nameInput.value.trim();
      if (name.length < 2 || name.length > 16) return (err.textContent = 'Tên hiển thị phải từ 2-16 ký tự');
      saveBtn.disabled = true;
      try {
        const res = await api.saveCharacter({
          displayName: name,
          gender: app.gender,
          skinColor: app.skinColor,
          hair: app.hair,
          outfit: app.outfit,
        });
        audio.sfx('coin');
        close(res.character);
      } catch (ex) {
        err.textContent = ex.message;
        audio.sfx('error');
      } finally {
        saveBtn.disabled = false;
      }
    };

    form.append(
      h('h2', {}, mode === 'create' ? '✨ Tạo nhân vật' : '🧥 Tủ đồ – Đổi trang phục'),
      field('Tên hiển thị', nameInput),
      formBody,
      err,
      h(
        'div',
        { class: 'creator-actions' },
        h('button', { class: 'btn ghost', type: 'button', onclick: randomize }, '🎲 Ngẫu nhiên'),
        mode === 'edit' ? h('button', { class: 'btn ghost', type: 'button', onclick: () => close(null) }, 'Hủy') : null,
        saveBtn
      )
    );
    renderForm();

    const screen = h('div', { class: 'screen' }, h('div', { class: 'creator panel' }, preview, form));
    uiRoot().append(screen);
    char.playEmote(pick(EMOTE_LIST));
  });
}
