import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { ANIMS, ANIM_PROPS, BASE_POSE, EMOTES, HIPS } from './animations.js';

/**
 * Nhân vật chibi tròn tròn, lùn lùn: đầu to, thân tròn như quả trứng, tay chân ngắn có khớp.
 * Cấu trúc khớp: root → hips → (spine → neck/head, vai → khuỷu → bàn tay) + (hông → gối → bàn chân)
 */

// Geometry dùng chung cho mọi nhân vật
const G = {
  head: new THREE.SphereGeometry(0.4, 32, 24),
  body: new THREE.SphereGeometry(0.3, 28, 20),
  bodyLow: new THREE.SphereGeometry(0.305, 28, 10, 0, Math.PI * 2, Math.PI * 0.6, Math.PI * 0.4),
  upperArm: new THREE.CapsuleGeometry(0.07, 0.09, 4, 10),
  foreArm: new THREE.CapsuleGeometry(0.065, 0.07, 4, 10),
  hand: new THREE.SphereGeometry(0.078, 14, 10),
  thigh: new THREE.CapsuleGeometry(0.088, 0.06, 4, 10),
  shin: new THREE.CapsuleGeometry(0.08, 0.05, 4, 10),
  foot: new THREE.SphereGeometry(0.095, 14, 10),
  ear: new THREE.SphereGeometry(0.075, 12, 10),
  eye: new THREE.SphereGeometry(0.055, 14, 10),
  eyeShine: new THREE.SphereGeometry(0.018, 8, 6),
  eyeArc: new THREE.TorusGeometry(0.042, 0.012, 6, 14, Math.PI),
  mouthArc: new THREE.TorusGeometry(0.045, 0.011, 6, 14, Math.PI),
  mouthOpen: new THREE.SphereGeometry(0.045, 12, 8),
  cheek: new THREE.SphereGeometry(0.06, 12, 8),
  hairCap: new THREE.SphereGeometry(0.425, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.4),
  hairBack: new THREE.SphereGeometry(0.43, 28, 14, Math.PI, Math.PI, 0, Math.PI * 0.64),
  bead: new THREE.SphereGeometry(0.03, 8, 6),
  blob: new THREE.CircleGeometry(0.42, 24),
  drop: new THREE.SphereGeometry(0.025, 8, 6),
};

const SHARED = {
  eye: new THREE.MeshStandardMaterial({ color: '#1f1a17', roughness: 0.3 }),
  white: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
  cheek: new THREE.MeshStandardMaterial({ color: '#ff8fa3', roughness: 0.8, transparent: true, opacity: 0.55 }),
  mouthDark: new THREE.MeshStandardMaterial({ color: '#7a2e2e', roughness: 0.6 }),
  beads: new THREE.MeshStandardMaterial({ color: '#c46a2b', roughness: 0.5 }),
  sash: new THREE.MeshStandardMaterial({ color: '#f2c94c', roughness: 0.6 }),
  blob: new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false }),
  metal: new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.9, roughness: 0.25 }),
  dumbbell: new THREE.MeshStandardMaterial({ color: '#ef4444', roughness: 0.5 }),
  ball: new THREE.MeshStandardMaterial({ color: '#1d4ed8', roughness: 0.6 }),
  glasses: new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.15, metalness: 0.5 }),
  sweat: new THREE.MeshStandardMaterial({ color: '#7dd3fc', roughness: 0.1, transparent: true, opacity: 0.85 }),
};

export const DEFAULT_APPEARANCE = {
  displayName: 'Gymer',
  gender: 'male',
  skinColor: '#f5c9a0',
  hair: { style: 'short', color: '#3b2a20' },
  outfit: { style: 'tshirt', top: '#22d3ee', bottom: '#334155', shoes: '#f8fafc' },
  level: 1,
};

function mesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export class Character {
  constructor(appearance = DEFAULT_APPEARANCE, { showName = true, isLocal = false } = {}) {
    this.isLocal = isLocal;
    this.root = new THREE.Group();
    this.model = new THREE.Group();
    this.root.add(this.model);

    this.mats = {
      skin: new THREE.MeshStandardMaterial({ roughness: 0.6 }),
      top: new THREE.MeshStandardMaterial({ roughness: 0.75 }),
      bottom: new THREE.MeshStandardMaterial({ roughness: 0.8 }),
      shoes: new THREE.MeshStandardMaterial({ roughness: 0.5 }),
      hair: new THREE.MeshStandardMaterial({ roughness: 0.7 }),
      lips: new THREE.MeshStandardMaterial({ color: '#d9536f', roughness: 0.5 }),
    };

    this._buildSkeleton();

    // Bóng tròn dưới chân (luôn có, giúp nhìn rõ vị trí kể cả khi tắt shadow)
    const blob = new THREE.Mesh(G.blob, SHARED.blob);
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.012;
    blob.renderOrder = 1;
    this.root.add(blob);
    this.blob = blob;

    this.pose = { ...BASE_POSE };
    this.anim = 'idle';
    this.time = Math.random() * 10;
    this.emote = null;
    this.emoteTime = 0;
    this.blinkTimer = 2 + Math.random() * 3;
    this.blinking = 0;
    this.currentProp = null;
    this.sweatDrops = [];
    this.sweatTimer = 0;

    // Nhãn tên + bong bóng chat + icon emote (DOM)
    this.labelEl = document.createElement('div');
    this.labelEl.className = 'char-label';
    this.nameEl = document.createElement('div');
    this.nameEl.className = 'name-tag' + (isLocal ? ' self' : '');
    this.bubbleEl = document.createElement('div');
    this.bubbleEl.className = 'chat-bubble';
    this.emoteEl = document.createElement('div');
    this.emoteEl.className = 'emote-icon';
    this.labelEl.append(this.emoteEl, this.bubbleEl, this.nameEl);
    this.label = new CSS2DObject(this.labelEl);
    this.label.position.set(0, 1.78, 0);
    this.root.add(this.label);
    this.nameEl.style.display = showName ? '' : 'none';

    this.setAppearance(appearance);
  }

  _buildSkeleton() {
    const m = this.mats;
    this.hips = new THREE.Group();
    this.hips.position.y = HIPS;
    this.model.add(this.hips);

    // Thân
    this.spine = new THREE.Group();
    this.hips.add(this.spine);
    this.bodyMesh = mesh(G.body, m.top, 0, 0.2, 0);
    this.bodyMesh.scale.set(1, 1.05, 0.92);
    this.bodyLow = mesh(G.bodyLow, m.bottom, 0, 0.2, 0);
    this.bodyLow.scale.set(1, 1.05, 0.92);
    this.spine.add(this.bodyMesh, this.bodyLow);
    this.outfitExtras = new THREE.Group();
    this.spine.add(this.outfitExtras);

    // Đầu
    this.neck = new THREE.Group();
    this.neck.position.y = 0.46;
    this.spine.add(this.neck);
    this.head = new THREE.Group();
    this.neck.add(this.head);
    this.head.add(mesh(G.head, m.skin, 0, 0.36, 0));
    this.head.add(mesh(G.ear, m.skin, 0.39, 0.34, 0), mesh(G.ear, m.skin, -0.39, 0.34, 0));
    this._buildFace();
    this.hairGroup = new THREE.Group();
    this.head.add(this.hairGroup);
    this.propHead = new THREE.Group();
    this.head.add(this.propHead);

    // Tay
    const makeArm = (side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.255, 0.36, 0);
      shoulder.rotation.order = 'YXZ';
      const upper = mesh(G.upperArm, m.top, 0, -0.075, 0);
      shoulder.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.15;
      elbow.rotation.order = 'YXZ';
      shoulder.add(elbow);
      const fore = mesh(G.foreArm, m.skin, 0, -0.06, 0);
      elbow.add(fore);
      const hand = new THREE.Group();
      hand.position.y = -0.14;
      hand.add(mesh(G.hand, m.skin));
      elbow.add(hand);
      this.spine.add(shoulder);
      return { shoulder, elbow, upper, fore, hand };
    };
    this.armL = makeArm(1);
    this.armR = makeArm(-1);

    // Chân
    const makeLeg = (side) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.12, 0, 0);
      hip.rotation.order = 'YXZ';
      const thigh = mesh(G.thigh, m.bottom, 0, -0.08, 0);
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -0.16;
      hip.add(knee);
      const shin = mesh(G.shin, m.skin, 0, -0.06, 0);
      knee.add(shin);
      const foot = mesh(G.foot, m.shoes, 0, -0.13, 0.035);
      foot.scale.set(1, 0.6, 1.35);
      knee.add(foot);
      this.hips.add(hip);
      return { hip, knee, thigh, shin, foot };
    };
    this.legL = makeLeg(1);
    this.legR = makeLeg(-1);
  }

  _buildFace() {
    const face = new THREE.Group();
    this.head.add(face);
    this.eyesOpen = new THREE.Group();
    this.eyesHappy = new THREE.Group();
    this.eyesClosed = new THREE.Group();
    for (const s of [-1, 1]) {
      const e = mesh(G.eye, SHARED.eye, s * 0.14, 0.33, 0.355);
      e.scale.set(0.85, 1.15, 0.5);
      e.castShadow = false;
      const shine = new THREE.Mesh(G.eyeShine, SHARED.white);
      shine.position.set(s * 0.14 + 0.018, 0.355, 0.38);
      this.eyesOpen.add(e, shine);

      const happy = new THREE.Mesh(G.eyeArc, SHARED.eye);
      happy.position.set(s * 0.14, 0.32, 0.37);
      this.eyesHappy.add(happy);

      const closed = new THREE.Mesh(G.eyeArc, SHARED.eye);
      closed.rotation.z = Math.PI;
      closed.position.set(s * 0.14, 0.345, 0.37);
      this.eyesClosed.add(closed);

      const cheek = new THREE.Mesh(G.cheek, SHARED.cheek);
      cheek.scale.set(1, 0.6, 0.3);
      cheek.position.set(s * 0.235, 0.245, 0.3);
      face.add(cheek);
    }
    this.lashes = new THREE.Group();
    for (const s of [-1, 1]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.01), SHARED.eye);
      l.position.set(s * 0.185, 0.385, 0.35);
      l.rotation.z = s * 0.5;
      this.lashes.add(l);
    }
    this.eyesOpen.add(this.lashes);
    this.mouthSmile = new THREE.Mesh(G.mouthArc, SHARED.eye);
    this.mouthSmile.rotation.z = Math.PI;
    this.mouthSmile.position.set(0, 0.235, 0.375);
    this.mouthOpenMesh = new THREE.Mesh(G.mouthOpen, SHARED.mouthDark);
    this.mouthOpenMesh.scale.set(1, 0.8, 0.4);
    this.mouthOpenMesh.position.set(0, 0.22, 0.37);
    face.add(this.eyesOpen, this.eyesHappy, this.eyesClosed, this.mouthSmile, this.mouthOpenMesh);
    this.setFace('open', 'smile');
  }

  setFace(eyes, mouth) {
    this.eyesOpen.visible = eyes === 'open';
    this.eyesHappy.visible = eyes === 'happy';
    this.eyesClosed.visible = eyes === 'closed';
    this.mouthSmile.visible = mouth !== 'open';
    this.mouthOpenMesh.visible = mouth === 'open';
  }

  setAppearance(app) {
    this.appearance = JSON.parse(JSON.stringify({ ...DEFAULT_APPEARANCE, ...app }));
    const a = this.appearance;
    const o = a.outfit;
    const m = this.mats;
    m.skin.color.set(a.skinColor);
    m.top.color.set(o.top);
    m.bottom.color.set(o.style === 'robe' ? o.top : o.bottom);
    m.shoes.color.set(o.shoes);
    m.hair.color.set(a.hair.color);
    this.lashes.visible = a.gender === 'female';
    this.mouthSmile.material = a.gender === 'female' ? m.lips : SHARED.eye;

    // Tay áo: áo ba lỗ để lộ bắp tay, hoodie/áo cà sa phủ cả cẳng tay
    const longSleeve = o.style === 'hoodie' || o.style === 'robe';
    for (const arm of [this.armL, this.armR]) {
      arm.upper.material = o.style === 'tank' ? m.skin : m.top;
      arm.fore.material = longSleeve ? m.top : m.skin;
    }
    // Quần: nam quần short (lộ cẳng chân), nữ legging; áo cà sa che hết
    for (const leg of [this.legL, this.legR]) {
      leg.thigh.material = m.bottom;
      leg.shin.material = o.style === 'robe' || a.gender === 'female' ? m.bottom : m.skin;
    }
    this._buildOutfitExtras(o);
    this._buildHair(a.hair.style, a.gender);
    this.setName(a.displayName, a.level);
  }

  _buildOutfitExtras(o) {
    const g = this.outfitExtras;
    g.clear();
    if (o.style === 'robe') {
      // Áo cà sa như chú tiểu: tràng hạt + dây đai chéo + vạt áo
      const n = 18;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        // vòng hạt quanh cổ, phía trước võng xuống ngực
        const sag = Math.max(0, Math.sin(a)) * 0.13;
        const b = mesh(G.bead, SHARED.beads, Math.cos(a) * 0.22, 0.43 - sag, Math.sin(a) * 0.24 + 0.03);
        b.castShadow = false;
        g.add(b);
      }
      // đai lưng vàng ôm theo thân + nút thắt
      const sash = new THREE.Mesh(new THREE.TorusGeometry(0.292, 0.026, 6, 32), SHARED.sash);
      sash.scale.set(1, 0.92, 1);
      sash.rotation.x = Math.PI / 2;
      sash.position.y = 0.12;
      g.add(sash);
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), SHARED.sash);
      knot.position.set(0.12, 0.11, 0.25);
      g.add(knot);
      const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.14, 20, 1, true), this.mats.top);
      skirt.position.y = -0.08;
      skirt.castShadow = true;
      g.add(skirt);
    } else if (o.style === 'hoodie') {
      const hood = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.06, 8, 20), this.mats.top);
      hood.rotation.x = Math.PI / 2 - 0.4;
      hood.position.set(0, 0.47, -0.08);
      g.add(hood);
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.02), new THREE.MeshStandardMaterial({ color: this.mats.top.color.clone().multiplyScalar(0.8) }));
      pocket.position.set(0, 0.12, 0.275);
      g.add(pocket);
      for (const s of [-1, 1]) {
        const str = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 5), SHARED.white);
        str.position.set(s * 0.05, 0.38, 0.25);
        g.add(str);
      }
    } else if (o.style === 'tshirt') {
      // Logo tròn trước ngực
      const badge = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), SHARED.white);
      badge.position.set(0.1, 0.3, 0.272);
      badge.rotation.x = -0.25;
      badge.rotation.y = 0.35;
      g.add(badge);
    } else if (o.style === 'tank') {
      for (const s of [-1, 1]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.2), this.mats.top);
        strap.position.set(s * 0.13, 0.5, 0.0);
        g.add(strap);
      }
    }
  }

  _buildHair(style, gender) {
    const g = this.hairGroup;
    g.clear();
    const hm = this.mats.hair;
    if (style === 'bald') return; // đầu trọc như chú tiểu
    const cap = mesh(G.hairCap, hm, 0, 0.36, 0);
    cap.rotation.x = -0.12;
    const back = mesh(G.hairBack, hm, 0, 0.36, 0);
    g.add(cap, back);
    const add = (geo, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => {
      const mm = mesh(geo, hm, x, y, z);
      mm.scale.set(sx, sy, sz);
      mm.rotation.set(rx, 0, rz);
      g.add(mm);
      return mm;
    };
    const sph = (r) => new THREE.SphereGeometry(r, 14, 10);
    const capsule = (r, l) => new THREE.CapsuleGeometry(r, l, 4, 10);

    switch (style) {
      case 'short':
        for (const x of [-0.16, 0, 0.16]) add(sph(0.11), x, 0.62, 0.27, 1.2, 0.8, 0.8);
        break;
      case 'spiky':
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          const cone = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 6), hm);
          cone.position.set(Math.cos(a) * 0.22, 0.72, Math.sin(a) * 0.22);
          cone.lookAt(Math.cos(a) * 0.8, 1.3, Math.sin(a) * 0.8);
          cone.rotateX(Math.PI / 2);
          cone.castShadow = true;
          g.add(cone);
        }
        add(new THREE.ConeGeometry(0.1, 0.26, 6), 0, 0.86, 0);
        break;
      case 'bun':
        add(sph(0.16), 0, 0.8, -0.1);
        add(sph(0.11), -0.18, 0.62, 0.26, 1.2, 0.8, 0.8);
        add(sph(0.11), 0.18, 0.62, 0.26, 1.2, 0.8, 0.8);
        break;
      case 'long':
        add(capsule(0.2, 0.3), 0, 0.22, -0.2, 1.7, 1, 0.8);
        add(capsule(0.08, 0.3), 0.34, 0.24, 0.06);
        add(capsule(0.08, 0.3), -0.34, 0.24, 0.06);
        add(sph(0.12), -0.12, 0.62, 0.27, 1.6, 0.8, 0.8, 0, 0.3);
        break;
      case 'ponytail':
        add(sph(0.06), 0, 0.55, -0.42);
        add(capsule(0.1, 0.28), 0, 0.33, -0.5, 1, 1, 1, 0.35);
        add(sph(0.11), 0.14, 0.62, 0.27, 1.4, 0.8, 0.8, 0, -0.3);
        break;
      case 'twintails':
        for (const s of [-1, 1]) {
          add(sph(0.06), s * 0.4, 0.55, -0.1);
          add(capsule(0.1, 0.3), s * 0.5, 0.32, -0.12, 1, 1, 1, 0, s * 0.25);
        }
        add(sph(0.11), 0, 0.63, 0.27, 2, 0.8, 0.8);
        break;
      default:
        break;
    }
    if (gender === 'female' && style !== 'long') {
      // nơ nhỏ dễ thương
      const bow = new THREE.Group();
      const bm = new THREE.MeshStandardMaterial({ color: '#ff6b9a', roughness: 0.5 });
      for (const s of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.1, 8), bm);
        w.rotation.z = (s * Math.PI) / 2;
        w.position.x = s * 0.05;
        bow.add(w);
      }
      bow.add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), bm));
      bow.position.set(0.24, 0.7, 0.18);
      bow.rotation.z = -0.4;
      g.add(bow);
    }
  }

  setName(name, level) {
    this.nameEl.innerHTML = '';
    const lv = document.createElement('span');
    lv.className = 'lv';
    lv.textContent = `Lv.${level || 1}`;
    const nm = document.createElement('span');
    nm.textContent = name;
    this.nameEl.append(lv, nm);
  }

  setLevel(level) {
    this.appearance.level = level;
    this.setName(this.appearance.displayName, level);
  }

  play(name) {
    if (!ANIMS[name]) name = 'idle';
    if (this.anim === name) return;
    this.anim = name;
    // Đang làm động tác khác thì huỷ emote
    if (name !== 'idle' && name !== 'walk' && name !== 'run') this.stopEmote();
  }

  playEmote(name) {
    const e = EMOTES[name];
    if (!e) return;
    this.emote = name;
    this.emoteTime = 0;
    this.emoteEl.textContent = e.icon;
    this.emoteEl.classList.remove('show');
    void this.emoteEl.offsetWidth; // restart animation CSS
    this.emoteEl.classList.add('show');
  }

  stopEmote() {
    this.emote = null;
    this.emoteEl.classList.remove('show');
  }

  say(text) {
    this.bubbleEl.textContent = text;
    this.bubbleEl.classList.add('show');
    clearTimeout(this._bubbleTimer);
    this._bubbleTimer = setTimeout(() => this.bubbleEl.classList.remove('show'), 5000 + Math.min(4000, text.length * 60));
  }

  _setProp(name) {
    if (this.currentProp === name) return;
    this.currentProp = name;
    for (const arm of [this.armL, this.armR]) {
      const old = arm.hand.getObjectByName('prop');
      if (old) arm.hand.remove(old);
    }
    this.propHead.clear();
    if (name === 'dumbbells') {
      for (const arm of [this.armL, this.armR]) {
        const p = new THREE.Group();
        p.name = 'prop';
        const h = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.24, 6), SHARED.metal);
        h.rotation.z = Math.PI / 2;
        p.add(h);
        for (const s of [-1, 1]) {
          const w = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 10), SHARED.dumbbell);
          w.rotation.z = Math.PI / 2;
          w.position.x = s * 0.11;
          w.castShadow = true;
          p.add(w);
        }
        p.position.y = -0.02;
        arm.hand.add(p);
      }
    } else if (name === 'ball') {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), SHARED.ball);
      p.name = 'prop';
      p.position.set(-0.13, -0.06, 0.06);
      p.castShadow = true;
      this.armL.hand.add(p);
    } else if (name === 'sunglasses') {
      for (const s of [-1, 1]) {
        const lens = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, 0.02), SHARED.glasses);
        lens.position.set(s * 0.14, 0.34, 0.39);
        this.propHead.add(lens);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.02), SHARED.glasses);
      bridge.position.set(0, 0.36, 0.395);
      this.propHead.add(bridge);
    }
  }

  _updateSweat(dt, active) {
    this.sweatTimer -= dt;
    if (active && this.sweatTimer <= 0 && this.sweatDrops.length < 4) {
      this.sweatTimer = 0.5 + Math.random() * 0.6;
      const d = new THREE.Mesh(G.drop, SHARED.sweat);
      const s = Math.random() < 0.5 ? -1 : 1;
      d.position.set(s * (0.3 + Math.random() * 0.1), 0.5 + Math.random() * 0.2, 0.15);
      d.scale.set(1, 1.4, 1);
      d.userData.v = 0;
      this.head.add(d);
      this.sweatDrops.push(d);
    }
    for (let i = this.sweatDrops.length - 1; i >= 0; i--) {
      const d = this.sweatDrops[i];
      d.userData.v += dt * 1.2;
      d.position.y -= d.userData.v * dt;
      if (d.position.y < 0.05) {
        this.head.remove(d);
        this.sweatDrops.splice(i, 1);
      }
    }
  }

  /**
   * ctx: { phase, p, beat } – nhịp tập (dùng cho animation máy tập / aerobic)
   */
  update(dt, ctx = {}) {
    this.time += dt;
    let target;
    let propName = ANIM_PROPS[this.anim] || null;
    if (this.emote) {
      this.emoteTime += dt;
      const e = EMOTES[this.emote];
      target = e.fn(this.emoteTime);
      if (e.prop) propName = e.prop;
      if (this.emoteTime > e.duration) this.stopEmote();
    } else {
      target = ANIMS[this.anim](this.time, { phase: 0, p: 0, beat: 0, ...ctx });
    }
    this._setProp(propName);

    // Nội suy mượt sang tư thế mục tiêu
    const k = 1 - Math.exp(-dt * 14);
    const P = this.pose;
    for (const key in BASE_POSE) {
      const v = target[key] ?? BASE_POSE[key];
      P[key] += (v - P[key]) * k;
    }
    this._applyPose(P);

    // Mặt: chớp mắt ngẫu nhiên
    let eyes = target.eyes || 'open';
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blinking = 0.13;
      this.blinkTimer = 2.5 + Math.random() * 3.5;
    }
    if (this.blinking > 0) {
      this.blinking -= dt;
      if (eyes === 'open') eyes = 'closed';
    }
    this.setFace(eyes, target.mouth || 'smile');
    this._updateSweat(dt, !!target.sweat);
  }

  _applyPose(P) {
    this.hips.position.y = P.hipsY + P.bounce;
    this.spine.rotation.set(P.spineX, P.spineY, P.spineZ);
    this.neck.rotation.set(P.headX, P.headY, P.headZ);
    this.armL.shoulder.rotation.set(P.lArmX, -P.lArmY, P.lArmZ);
    this.armR.shoulder.rotation.set(P.rArmX, P.rArmY, -P.rArmZ);
    this.armL.elbow.rotation.set(P.lElbow, P.lTwist, 0);
    this.armR.elbow.rotation.set(P.rElbow, -P.rTwist, 0);
    this.legL.hip.rotation.set(P.lLegX, 0, P.lLegZ);
    this.legR.hip.rotation.set(P.rLegX, 0, -P.rLegZ);
    this.legL.knee.rotation.x = P.lKnee;
    this.legR.knee.rotation.x = P.rKnee;
    // giữ bóng dưới đất khi nhân vật bị nâng lên (xà đơn, ghế)
    this.blob.position.y = 0.012 - this.root.position.y;
    this.blob.visible = this.root.position.y < 0.3;
  }

  dispose() {
    clearTimeout(this._bubbleTimer);
    this.root.removeFromParent();
    this.labelEl.remove();
    Object.values(this.mats).forEach((m) => m.dispose());
  }
}
