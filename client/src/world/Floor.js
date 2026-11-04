import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, cyl, bar, bakeStatic } from './helpers.js';
import { mat, textures, textTexture, C, normalMapFrom, plasterNormal, lightPoolMaterial } from './materials.js';
import { scuffMap, windowView } from './surfaces.js';
import { Collision } from './collision.js';
import { Door } from './doors.js';
import { Instancer } from './instancer.js';
import { generateWalls, outerWalls } from './wallGen.js';
import { tpl, plant } from './decor.js';
import { FLOOR_BOUNDS, FLOORS } from '@shared/constants.js';
import {
  FLOOR_H, RAMP_X1, RAMP_X2, RAMP_LEN, ESC_SPEED, ELEVATORS, CAB_X1, CAB_X2,
  rampsUpFrom, rampsDownFrom, floorHoles, ceilingHoles, subtractRects,
} from './transit.js';
import { viewMul } from '../core/settings.js';

export const WALL_H = 4;
export const WALL_T = 0.3;
export const DOOR_H = 2.6;
const HALF_PI = Math.PI / 2;

const FLOOR_TEX = {
  lobby: () => textures.stone(),
  rubber: () => textures.rubber(),
  wood: () => textures.wood('#d9a86c', '#a8723f'),
  mats: () => textures.mats(),
  lockerTile: () => textures.tile('#d5f5ef', '#6fd8c6', 4),
  sauna: () => textures.wood('#a36e40', '#6b4426'),
  wcTile: () => textures.tile('#f8fafc', '#9cc3f5', 6),
  turf: () => textures.turf(),
  carpet: () => textures.carpet(),
  carpetBlue: () => textures.carpet('#0c4a6e', '#38bdf8'),
  track: () => textures.track(),
  concrete: () => textures.concrete(),
  poolDeck: () => textures.tile('#e0f2fe', '#7dd3fc', 4),
  darkTile: () => textures.tile('#1e293b', '#0f172a', 4),
};
const TEX_SCALE = { lobby: 3.2, rubber: 2, mats: 2, wood: 3, sauna: 2.5, wcTile: 2, turf: 5, carpet: 2, carpetBlue: 2, track: 3, concrete: 4, darkTile: 2 };
// Độ nhám + độ nổi bề mặt: sàn gạch/gỗ bóng phản chiếu đèn, cao su/thảm nhám
const FLOOR_LOOK = {
  lobby: [0.28, 1.6],
  wood: [0.32, 2.2],
  darkTile: [0.34, 1.6],
  wcTile: [0.25, 1.4],
  lockerTile: [0.3, 1.4],
  poolDeck: [0.35, 1.4],
  rubber: [0.92, 3],
  mats: [0.75, 1.5],
  carpet: [0.95, 2],
  carpetBlue: [0.95, 2],
  turf: [1, 4],
  track: [0.85, 3],
  concrete: [0.8, 2.5],
  sauna: [0.7, 2.2],
};

// Lưới mặt phẳng nằm ngang từ nhiều hình chữ nhật, UV theo toạ độ thế giới (texture liền mạch)
function planeGeo(rects, scale, y = 0) {
  const pos = [];
  const uv = [];
  const idx = [];
  for (const r of rects) {
    const b = pos.length / 3;
    for (const [x, z] of [[r.x1, r.z1], [r.x1, r.z2], [r.x2, r.z2], [r.x2, r.z1]]) {
      pos.push(x, y, z);
      uv.push(x / scale, -z / scale);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/**
 * 1 tầng của tòa nhà (các tầng xếp chồng thật, cao FLOOR_H). Dựng khi cần (lazy).
 *  - nội dung chia theo "khu"; khu xa hoặc bị tường che sẽ bị ẩn (culling theo tầm nhìn xa trong cài đặt)
 *  - geometry tĩnh gộp theo khu; vật lặp lại dùng InstancedMesh
 *  - sảnh thang: thang bộ / thang cuốn là đường dốc thật xuyên qua giếng, cabin thang máy bước vào được
 */
export class Floor {
  constructor(def, { scene, equipment }) {
    this.def = def;
    this.id = def.id;
    this.info = FLOORS[def.id];
    this.scene = scene;
    this.equipment = equipment;
    this.built = false;
    this.group = new THREE.Group();
    this.group.name = `floor-${def.id}`;
    this.group.visible = false;
    this.collision = new Collision();
    this.doors = [];
    this.cabinDoors = {};
    this.cabinDisplays = {};
    this.updaters = [];
    this.zones = [];
    this.cameraBlockers = [];
    this.npcs = null;
    this.envMap = null;
    scene.add(this.group);
  }

  rooms() {
    return this.def.rooms;
  }

  roomAt(x, z) {
    for (const r of this.def.rooms) if (x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2) return r;
    if (this.def.id === 1 && z > FLOOR_BOUNDS.maxZ) return { id: 'plaza', name: 'Sân trước', icon: '🌳' };
    return { id: 'hall', name: this.def.hallName || 'Hành lang', icon: '🚶' };
  }

  build() {
    if (this.built) return;
    const t0 = performance.now();
    const def = this.def;
    const S = new THREE.Group();
    this.shell = new THREE.Group();
    this.shell.name = 'shell';
    this.group.add(this.shell);
    const inst = new Instancer();
    const col = (cx, cz, w, d) => this.collision.addRect(cx, cz, w, d, 0, 'decor');
    const ctx = {
      floor: this,
      scene: this.scene,
      group: this.group,
      S,
      inst,
      col,
      collision: this.collision,
      updaters: this.updaters,
      add: (type, x, z, ry = 0, opts = {}) => this.equipment.add(def.id, type, x, z, ry, opts, { parent: S, collision: this.collision }),
    };
    for (const r of def.rooms) {
      const g = new THREE.Group();
      g.name = `zone-${r.id}`;
      this.group.add(g);
      this.zones.push({ room: r, group: g });
    }
    this.hallZone = { room: { id: 'hall', x1: FLOOR_BOUNDS.minX, x2: FLOOR_BOUNDS.maxX, z1: FLOOR_BOUNDS.minZ, z2: FLOOR_BOUNDS.maxZ }, group: new THREE.Group() };
    this.group.add(this.hallZone.group);

    this.buildFloors(S);
    this.buildWalls(S);
    if (def.ceiling !== false) this.buildCeiling(inst);
    this.buildTransit(ctx);
    def.build(ctx);
    this.buildSigns(S);

    const route = (x, z) => this.zoneAt(x, z).group;
    const box3 = new THREE.Box3();
    const center = new THREE.Vector3();
    for (const child of [...S.children]) {
      box3.setFromObject(child);
      box3.getCenter(center);
      route(center.x, center.z).add(child);
    }
    this.details = [];
    for (const z of [...this.zones, this.hallZone]) bakeStatic(z.group, mergeGeometries, { cell: 18, details: this.details });
    this.cameraBlockers = bakeStatic(this.shell, mergeGeometries);
    inst.build(route);
    for (const d of this.doors) d.group.traverse((o) => o.isMesh && this.cameraBlockers.push(o));
    if (def.npcs) this.npcs = def.npcs(this);
    this.built = true;
    console.log(`[world] Dựng ${this.info.name} trong ${Math.round(performance.now() - t0)}ms`);
  }

  zoneAt(x, z) {
    for (const zn of this.zones) {
      const r = zn.room;
      if (x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2) return zn;
    }
    return this.hallZone;
  }

  holes() {
    return [...floorHoles(this.id), ...(this.def.holes || [])];
  }

  // ---------- Sàn (có lỗ cho giếng thang / hồ bơi) ----------
  buildFloors(S) {
    const def = this.def;
    const B = FLOOR_BOUNDS;
    const holes = this.holes();
    const baseType = def.baseFloor || 'lobby';
    const base = new THREE.Mesh(planeGeo(subtractRects({ x1: B.minX, x2: B.maxX, z1: B.minZ, z2: B.maxZ }, holes), TEX_SCALE[baseType] || 3), this.floorMat(baseType));
    base.receiveShadow = true;
    base.userData.noBake = true;
    this.shell.add(base);
    def.rooms.forEach((r, i) => {
      if (!r.floor) return;
      const rects = subtractRects({ x1: r.x1, x2: r.x2, z1: r.z1, z2: r.z2 }, holes);
      if (!rects.length) return;
      const m = new THREE.Mesh(planeGeo(rects, TEX_SCALE[r.floor] || 3, 0.004 + (def.rooms.length - i) * 0.002), this.floorMat(r.floor));
      m.receiveShadow = true;
      m.userData.noBake = true;
      S.add(m);
    });
    // Mép sàn quanh lỗ (độ dày sàn nhìn từ trên giếng xuống)
    const edge = mat('#94a3b8', { rough: 0.5, metal: 0.3 });
    for (const h of holes) {
      if (h.noEdge) continue;
      const w = h.x2 - h.x1;
      const d = h.z2 - h.z1;
      this.shell.add(box(w, 0.35, 0.06, edge, (h.x1 + h.x2) / 2, -0.17, h.z1, { cast: false }));
      this.shell.add(box(w, 0.35, 0.06, edge, (h.x1 + h.x2) / 2, -0.17, h.z2, { cast: false }));
      this.shell.add(box(0.06, 0.35, d, edge, h.x1, -0.17, (h.z1 + h.z2) / 2, { cast: false }));
    }
  }

  floorMat(type) {
    const tex = (FLOOR_TEX[type] || FLOOR_TEX.lobby)();
    tex.repeat.set(1, 1);
    const [rough, bump] = FLOOR_LOOK[type] || [0.8, 2];
    // Sàn bóng: độ bóng không đều (vết đi lại, lau chùi) nên phản chiếu trông thật hơn
    const polished = rough < 0.5;
    return new THREE.MeshStandardMaterial({
      map: tex,
      normalMap: normalMapFrom(tex, bump),
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughness: polished ? rough * 1.5 : rough,
      roughnessMap: polished ? scuffMap() : null,
      metalness: 0,
    });
  }

  // ---------- Tường + cửa ----------
  buildWalls() {
    const def = this.def;
    const roof = def.id === 4;
    const H = roof ? 1.1 : WALL_H;
    const wallMat = mat(def.wallColor || C.wall, { rough: 0.85, normalMap: plasterNormal(), normalScale: 0.35 });
    const baseMat = mat('#1f2937', { rough: 0.7 });
    const dadoMat = mat(def.dadoColor || '#3a3f4a', { rough: 0.55, normalMap: plasterNormal(), normalScale: 0.2 });
    const neon = this.info.color;
    // Đèn hắt LED ở sát trần theo màu tầng (thay dải neon ngang lưng tường)
    const neonMat = mat(neon, { emissive: neon, emissiveIntensity: 2.4 });
    const COVE_Y = WALL_H - 0.24;
    const all = [...outerWalls(FLOOR_BOUNDS, def.outerDoors || []), ...generateWalls(def.rooms, def.doors || [], FLOOR_BOUNDS)];
    for (const w of all) {
      const alongX = w.z1 === w.z2;
      const a = alongX ? Math.min(w.x1, w.x2) : Math.min(w.z1, w.z2);
      const b = alongX ? Math.max(w.x1, w.x2) : Math.max(w.z1, w.z2);
      const fixed = alongX ? w.z1 : w.x1;
      const gaps = (w.doors || []).slice().sort((p, q) => p.c - q.c);
      const pieces = [];
      let cur = a - WALL_T / 2;
      for (const g of gaps) {
        pieces.push([cur, g.c - g.w / 2]);
        cur = g.c + g.w / 2;
      }
      pieces.push([cur, b + WALL_T / 2]);
      const place = (along, y, len, h, thick, material, root, opts) => {
        const m = box(alongX ? len : thick, h, alongX ? thick : len, material, alongX ? along : fixed, y, alongX ? fixed : along, opts);
        root.add(m);
        return m;
      };
      for (const [p0, p1] of pieces) {
        const len = p1 - p0;
        if (len <= 0.01) continue;
        const mid = (p0 + p1) / 2;
        place(mid, H / 2, len, H, WALL_T, wallMat, this.shell, { cast: false, receive: true });
        place(mid, 0.07, len, 0.14, WALL_T + 0.04, baseMat, this.shell, { cast: false });
        if (!roof) {
          // Ốp chân tường cao 1.1m + nẹp kim loại + đèn hắt
          place(mid, 0.62, len, 0.96, WALL_T + 0.025, dadoMat, this.shell, { cast: false });
          place(mid, 1.115, len, 0.03, WALL_T + 0.035, mat('#aeb4bd', { rough: 0.3, metal: 0.9 }), this.shell, { cast: false });
          place(mid, COVE_Y, len, 0.04, WALL_T + 0.05, neonMat, this.shell, { cast: false, receive: false });
        }
        if (alongX) this.collision.addBox(p0, p1, fixed - WALL_T / 2, fixed + WALL_T / 2, 'wall');
        else this.collision.addBox(fixed - WALL_T / 2, fixed + WALL_T / 2, p0, p1, 'wall');
      }
      for (const g of gaps) {
        if (!roof) place(g.c, (DOOR_H + WALL_H) / 2, g.w, WALL_H - DOOR_H, WALL_T, wallMat, this.shell, { cast: false });
        if (g.type !== 'open') {
          const door = new Door({ type: g.type, x: alongX ? g.c : fixed, z: alongX ? fixed : g.c, w: g.w, alongX, color: g.color });
          this.group.add(door.group);
          this.doors.push(door);
        } else if (!roof) {
          place(g.c, DOOR_H + 0.05, g.w, 0.1, WALL_T + 0.06, neonMat, this.shell, { cast: false, receive: false });
        }
      }
    }
    if (!roof && def.windows !== false) {
      // Cửa kính thật: khung nhôm + nhìn ra bầu trời, có thanh chia ô
      const frameMat = mat('#2b2e33', { rough: 0.35, metal: 0.8 });
      const pane = (x, z, alongX) => {
        const gl = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.7), windowView());
        gl.position.set(x, 2.5, z);
        gl.rotation.y = alongX ? 0 : HALF_PI;
        gl.userData.noBake = true;
        this.shell.add(gl);
        const bar = (lx, ly, w, h) => this.shell.add(box(alongX ? w : 0.05, h, alongX ? 0.05 : w, frameMat, alongX ? x + lx : x, 2.5 + ly, alongX ? z : z + lx, { cast: false }));
        bar(0, 0.87, 4.1, 0.06);
        bar(0, -0.87, 4.1, 0.06);
        for (const lx of [-2.02, -0.67, 0.67, 2.02]) bar(lx, 0, 0.05, 1.7);
      };
      for (let x = -12; x <= 34; x += 10) {
        if ((def.id === 1 && Math.abs(x) < 6) || def.windowSkip?.includes(x)) continue;
        pane(x, FLOOR_BOUNDS.minZ + 0.17, true);
      }
      for (let z = -15; z <= 5; z += 10) pane(FLOOR_BOUNDS.minX + 0.17, z, false);
    }
  }

  // ---------- Trần (có lỗ phía trên đường dốc đi lên) + đèn + vệt sáng ----------
  buildCeiling(inst) {
    const B = FLOOR_BOUNDS;
    const slabMat = mat(this.def.ceiling || '#f4f6fa', { rough: 0.95 });
    const holes = ceilingHoles(this.id);
    for (const r of subtractRects({ x1: B.minX - 0.3, x2: B.maxX + 0.3, z1: B.minZ - 0.3, z2: B.maxZ + 0.3 }, holes)) {
      this.shell.add(box(r.x2 - r.x1, 0.3, r.z2 - r.z1, slabMat, (r.x1 + r.x2) / 2, WALL_H + 0.15, (r.z1 + r.z2) / 2, { cast: false, receive: false }));
    }
    const lamp = tpl().lamp;
    const poolTpl = new THREE.Group();
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 5), lightPoolMaterial());
    pm.rotation.x = -HALF_PI;
    poolTpl.add(pm);
    const inHole = (x, z) => [...holes, ...this.holes()].some((h) => x > h.x1 - 1 && x < h.x2 + 1 && z > h.z1 - 1 && z < h.z2 + 1);
    for (let x = B.minX + 4; x <= B.maxX - 4; x += 7) {
      for (let z = B.minZ + 4; z <= B.maxZ - 3; z += 6) {
        if (inHole(x, z)) continue;
        inst.add(lamp, x, WALL_H - 0.03, z, 0);
        inst.add(poolTpl, x, 0.02, z, 0);
      }
    }
    // Trần kỹ thuật lộ thiên: dầm sát trần + ống gió men theo tường (không che camera, không chặn tia camera)
    if (this.def.ducts) {
      const tech = new THREE.Group();
      const beamMat = mat('#34373c', { rough: 0.7 });
      for (const x of [-12, -2, 8]) tech.add(box(0.2, 0.1, B.maxZ - B.minZ, beamMat, x, WALL_H - 0.05, 0, { cast: false, receive: false }));
      const ductMat = mat('#8d949e', { rough: 0.42, metal: 0.85 });
      const ringMat = mat('#6f7680', { rough: 0.4, metal: 0.9 });
      for (const z of [B.minZ + 0.7, B.maxZ - 0.7]) {
        const duct = cyl(0.2, 0.2, 21.6 - B.minX, ductMat, (21.6 + B.minX) / 2, 3.72, z, 16, { cast: false, receive: false });
        duct.rotation.z = HALF_PI;
        tech.add(duct);
        for (let x = B.minX + 2; x < 21; x += 4) {
          const ring = cyl(0.208, 0.208, 0.05, ringMat, x, 3.72, z, 16, { cast: false, receive: false });
          ring.rotation.z = HALF_PI;
          tech.add(ring);
        }
      }
      this.group.add(tech);
      bakeStatic(tech, mergeGeometries);
    }
  }

  // ---------- Sảnh thang: thang bộ, thang cuốn, thang máy ----------
  buildTransit(ctx) {
    const f = this.id;
    const S = ctx.S;
    const steel = mat('#cbd5e1', { metal: 0.85, rough: 0.25 });
    const dark = mat('#1e293b', { rough: 0.5 });
    const glass = mat('#bae6fd', { rough: 0.05, metal: 0.1, transparent: true, opacity: 0.25 });
    const stepMat = mat('#e2e8f0', { rough: 0.45 });
    const nose = mat('#facc15', { emissive: '#facc15', emissiveIntensity: 0.6 });
    const railGlow = mat(this.info.color, { emissive: this.info.color, emissiveIntensity: 1.6 });
    const slope = Math.atan2(FLOOR_H, RAMP_LEN);
    const rampMid = (RAMP_X1 + RAMP_X2) / 2;
    const rampLen3 = Math.hypot(RAMP_LEN, FLOOR_H);
    // Lan can kính nghiêng dọc 1 cạnh đường dốc
    const sideRail = (z, y0 = 0) => {
      const g = new THREE.Group();
      g.position.set(rampMid, y0 + FLOOR_H / 2, z);
      g.rotation.z = slope;
      g.add(box(rampLen3, 1.0, 0.04, glass, 0, 0.55, 0, { cast: false }));
      g.add(box(rampLen3, 0.06, 0.08, steel, 0, 1.08, 0));
      g.add(box(rampLen3, 0.03, 0.09, railGlow, 0, 0.05, 0, { cast: false }));
      S.add(g);
    };
    const flatRail = (x1, x2, z, h = 1.05) => {
      S.add(box(x2 - x1, h, 0.04, glass, (x1 + x2) / 2, h / 2, z, { cast: false }));
      S.add(box(x2 - x1, 0.06, 0.08, steel, (x1 + x2) / 2, h, z));
    };

    // --- Đường dốc đi LÊN từ tầng này ---
    for (const r of rampsUpFrom(f)) {
      const w = r.z2 - r.z1;
      const zc = (r.z1 + r.z2) / 2;
      if (r.kind === 'stairs') {
        const n = 24;
        const run = RAMP_LEN / n;
        const rise = FLOOR_H / n;
        for (let i = 0; i < n; i++) {
          S.add(box(run + 0.02, rise * (i + 1), w, stepMat, RAMP_X1 + run * (i + 0.5), (rise * (i + 1)) / 2, zc));
          S.add(box(0.04, 0.02, w, nose, RAMP_X1 + run * (i + 1) - 0.02, rise * (i + 1) + 0.005, zc, { cast: false }));
        }
      } else {
        // Thang cuốn: thân giàn + bậc chạy thật
        const truss = new THREE.Group();
        truss.position.set(rampMid, FLOOR_H / 2 - 0.35, zc);
        truss.rotation.z = slope;
        truss.add(box(rampLen3 + 1.2, 0.6, w + 0.2, dark, 0, 0, 0));
        S.add(truss);
        S.add(box(1.2, 0.08, w, steel, RAMP_X1 - 0.6, 0.04, zc));
        S.add(box(1.2, 0.08, w, steel, RAMP_X2 + 0.6, FLOOR_H + 0.04, zc));
        // Bậc thang cuốn: 1 InstancedMesh = 1 draw call cho cả 30 bậc, chỉ chạy khi người chơi ở gần
        const N = 30;
        const sm = new THREE.MeshStandardMaterial({ color: '#475569', metalness: 0.6, roughness: 0.35 });
        const steps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.12, w - 0.1), sm, N);
        steps.userData.dynamic = true;
        steps.castShadow = false;
        steps.receiveShadow = true;
        steps.frustumCulled = false;
        this.group.add(steps);
        const stepM = new THREE.Matrix4();
        const dir = r.kind === 'escUp' ? 1 : -1;
        let off = 0;
        const place = () => {
          for (let i = 0; i < N; i++) {
            const k = (((i / N + off) % 1) + 1) % 1;
            const x = RAMP_X1 + k * RAMP_LEN;
            stepM.setPosition(x, k * FLOOR_H + 0.06, zc);
            steps.setMatrixAt(i, stepM);
          }
          steps.instanceMatrix.needsUpdate = true;
        };
        place();
        ctx.updaters.push((dt) => {
          if (!steps.parent?.visible) return;
          // Ở xa sảnh thang: ẩn hẳn, không tính toán
          const near = this.px === undefined || Math.hypot(this.px - 31, this.pz) < 28;
          steps.visible = near;
          if (!near) return;
          off += (dir * ESC_SPEED * dt) / RAMP_LEN;
          place();
        });
        const arrow = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.5), new THREE.MeshBasicMaterial({ map: textTexture([r.kind === 'escUp' ? '▲ LÊN' : '▼ XUỐNG'], { w: 256, h: 128, size: 54, accent: r.kind === 'escUp' ? '#22c55e' : '#f97316' }) }));
        arrow.rotation.x = -HALF_PI;
        arrow.position.set(RAMP_X1 - 0.9, 0.09, zc);
        arrow.userData.noBake = true;
        S.add(arrow);
        // Thang cuốn đi xuống: không cho bước vào từ chân dốc (chỉ là lối ra)
        if (r.kind === 'escDown') ctx.collision.addBox(RAMP_X1 - 0.05, RAMP_X1 + 0.25, r.z1, r.z2, 'esc');
      }
      sideRail(r.z1);
      sideRail(r.z2);
      // Không chui xuống gầm dốc từ 2 bên / phía đỉnh
      ctx.collision.addBox(RAMP_X1, RAMP_X2 + 0.3, r.z1 - 0.05, r.z1 + 0.05, 'ramp');
      ctx.collision.addBox(RAMP_X1, RAMP_X2 + 0.3, r.z2 - 0.05, r.z2 + 0.05, 'ramp');
      ctx.collision.addBox(RAMP_X1 + 2.5, RAMP_X2 + 0.3, r.z1, r.z2, 'under');
      const label = r.kind === 'stairs' ? `THANG BỘ ▲ ${FLOORS[f + 1].key}` : r.kind === 'escUp' ? `THANG CUỐN ▲ ${FLOORS[f + 1].key}` : `THANG CUỐN ▼ (từ ${FLOORS[f + 1].key})`;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.45), new THREE.MeshBasicMaterial({ map: textTexture([label], { w: 512, h: 104, size: 44, accent: this.info.color }) }));
      sign.position.set(RAMP_X1 - 1.2, 2.4, zc);
      sign.rotation.y = -HALF_PI;
      sign.userData.noBake = true;
      S.add(sign);
      S.add(box(0.06, 2.4, 0.06, steel, RAMP_X1 - 1.25, 1.2, zc));
    }

    // --- Giếng của đường dốc từ tầng dưới lên tới tầng này ---
    for (const r of rampsDownFrom(f)) {
      flatRail(RAMP_X1, RAMP_X2, r.z1);
      flatRail(RAMP_X1, RAMP_X2, r.z2);
      S.add(box(0.04, 1.05, r.z2 - r.z1, glass, RAMP_X1, 0.52, (r.z1 + r.z2) / 2, { cast: false }));
      ctx.collision.addBox(RAMP_X1, RAMP_X2, r.z1 - 0.06, r.z1 + 0.06, 'well');
      ctx.collision.addBox(RAMP_X1, RAMP_X2, r.z2 - 0.06, r.z2 + 0.06, 'well');
      ctx.collision.addBox(RAMP_X1 - 0.1, RAMP_X1 + 0.1, r.z1, r.z2, 'well');
      // Thang cuốn đi lên: ở tầng trên chỉ là lối ra (chặn bước ngược vào)
      if (r.kind === 'escUp') ctx.collision.addBox(RAMP_X2 - 0.3, RAMP_X2 - 0.05, r.z1, r.z2, 'esc');
      const zc = (r.z1 + r.z2) / 2;
      const label = r.kind === 'stairs' ? `THANG BỘ ▼ ${FLOORS[f - 1].key}` : r.kind === 'escDown' ? `THANG CUỐN ▼ ${FLOORS[f - 1].key}` : 'LỐI RA THANG CUỐN';
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.45), new THREE.MeshBasicMaterial({ map: textTexture([label], { w: 512, h: 104, size: 44, accent: this.info.color }) }));
      sign.position.set(RAMP_X2 + 1.4, 2.4, zc);
      sign.rotation.y = HALF_PI;
      sign.userData.noBake = true;
      S.add(sign);
      S.add(box(0.06, 2.4, 0.06, steel, RAMP_X2 + 1.45, 1.2, zc));
    }

    // --- 2 cabin thang máy ---
    const cabWall = mat('#94a3b8', { metal: 0.8, rough: 0.28 });
    const cabFloor = mat('#334155', { rough: 0.6 });
    for (const e of ELEVATORS) {
      const zc = (e.z1 + e.z2) / 2;
      const dw = 1.4;
      // vách 2 bên + mặt trước 2 bên cửa + nóc
      S.add(box(CAB_X2 - CAB_X1, 2.7, 0.08, cabWall, (CAB_X1 + CAB_X2) / 2, 1.35, e.z1));
      S.add(box(CAB_X2 - CAB_X1, 2.7, 0.08, cabWall, (CAB_X1 + CAB_X2) / 2, 1.35, e.z2));
      const side = (e.z2 - e.z1 - dw) / 2;
      S.add(box(0.12, 2.7, side, dark, CAB_X1, 1.35, e.z1 + side / 2));
      S.add(box(0.12, 2.7, side, dark, CAB_X1, 1.35, e.z2 - side / 2));
      S.add(box(0.12, WALL_H - 2.7, e.z2 - e.z1, dark, CAB_X1, (WALL_H + 2.7) / 2, zc));
      S.add(box(CAB_X2 - CAB_X1, 0.08, e.z2 - e.z1, cabWall, (CAB_X1 + CAB_X2) / 2, 2.7, zc));
      S.add(box(CAB_X2 - CAB_X1 - 0.1, 0.03, e.z2 - e.z1 - 0.1, cabFloor, (CAB_X1 + CAB_X2) / 2, 0.015, zc, { cast: false }));
      S.add(box(1.2, 0.04, 0.6, mat('#ffffff', { emissive: '#fffbe8', emissiveIntensity: 2 }), (CAB_X1 + CAB_X2) / 2, 2.65, zc, { cast: false }));
      S.add(box(0.04, 1.0, e.z2 - e.z1 - 0.3, mat('#d6ecff', { rough: 0.05, metal: 0.95 }), CAB_X2 - 0.06, 1.5, zc, { cast: false }));
      // bảng nút bấm trong cabin
      S.add(box(0.28, 0.6, 0.03, dark, CAB_X1 + 0.5, 1.3, e.z1 + 0.06));
      for (let i = 0; i < FLOORS.length; i++) S.add(box(0.05, 0.05, 0.02, mat(FLOORS[i].color, { emissive: FLOORS[i].color, emissiveIntensity: i === f ? 2 : 0.6 }), CAB_X1 + 0.5, 1.1 + i * 0.1, e.z1 + 0.08, { cast: false }));
      ctx.collision.addBox(CAB_X1 - 0.06, CAB_X2, e.z1 - 0.06, e.z1 + 0.06, 'cab');
      ctx.collision.addBox(CAB_X1 - 0.06, CAB_X2, e.z2 - 0.06, e.z2 + 0.06, 'cab');
      ctx.collision.addBox(CAB_X1 - 0.08, CAB_X1 + 0.08, e.z1, e.z1 + side, 'cab');
      ctx.collision.addBox(CAB_X1 - 0.08, CAB_X1 + 0.08, e.z2 - side, e.z2, 'cab');
      // Cửa lùa (khóa được khi cabin đang chạy)
      const door = new Door({ type: 'sliding', x: CAB_X1, z: zc, w: dw, alongX: false, color: '#94a3b8' });
      door.cabin = e.id;
      this.group.add(door.group);
      this.doors.push(door);
      this.cabinDoors[e.id] = door;
      // Màn hình số tầng phía trên cửa (cập nhật khi cabin chạy)
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 96;
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.3), new THREE.MeshBasicMaterial({ map: tex }));
      disp.position.set(CAB_X1 - 0.08, 2.95, zc);
      disp.rotation.y = -HALF_PI;
      this.group.add(disp);
      const draw = (text, color = '#22d3ee') => {
        const g = c.getContext('2d');
        g.fillStyle = '#020617';
        g.fillRect(0, 0, 256, 96);
        g.fillStyle = color;
        g.font = '800 58px monospace';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(text, 128, 50);
        tex.needsUpdate = true;
      };
      draw(FLOORS[f].key);
      this.cabinDisplays[e.id] = draw;
    }
    // Bảng chỉ dẫn các tầng (mép Tây sảnh)
    const lines = FLOORS.map((fl) => `${fl.key}: ${fl.name.split('–')[1]?.trim() || fl.name}`).reverse();
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.4), new THREE.MeshBasicMaterial({ map: directoryTexture(lines, f) }));
    board.position.set(24.62, 1.7, 0);
    board.rotation.y = HALF_PI;
    board.userData.noBake = true;
    S.add(board);
    S.add(box(0.1, 2.6, 2.3, dark, 24.55, 1.3, 0));
    ctx.col(24.55, 0, 0.3, 2.3);
    plant(ctx, 36.2, -3.9);
    plant(ctx, 36.2, 3.9);
  }

  buildSigns(S) {
    for (const s of this.def.signs || []) {
      const g = new THREE.Group();
      g.position.set(s.x, 3.25, s.z);
      g.rotation.y = s.ry;
      const front = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: textTexture([s.text, s.sub].filter(Boolean), { accent: s.color }) }));
      front.position.z = WALL_T / 2 + 0.02;
      front.userData.noBake = true;
      g.add(front);
      if (s.back) {
        const back = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: textTexture([s.back], { accent: s.color }) }));
        back.position.z = -(WALL_T / 2 + 0.02);
        back.rotation.y = Math.PI;
        back.userData.noBake = true;
        g.add(back);
      }
      S.add(g);
    }
  }

  // ---------- Phản chiếu môi trường thật của tầng (kim loại, gương, sàn bóng) ----------
  captureEnv(renderer, pmrem) {
    if (this.envMap || !this.built) return this.envMap;
    const rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
    const cam = new THREE.CubeCamera(0.2, 90, rt);
    const p = this.def.envProbe || [0, 2, 0];
    cam.position.set(p[0], p[1], p[2]);
    this.group.add(cam);
    const fog = this.scene.fog;
    this.scene.fog = null;
    cam.update(renderer, this.scene);
    this.scene.fog = fog;
    this.group.remove(cam);
    this.envMap = pmrem.fromCubemap(rt.texture).texture;
    rt.dispose();
    return this.envMap;
  }

  // ---------- Hiển thị / culling ----------
  setActive(active, offsetY = 0) {
    if (active && !this.built) this.build();
    this.group.visible = active;
    this.group.position.y = offsetY;
    // Tầng lân cận (nhìn qua giếng thang): ẩn nhãn tên NPC để không xuyên sàn
    this.npcs?.list.forEach((n) => (n.char.label.visible = offsetY === 0));
  }

  // maxDist: tầng lân cận (nhìn qua giếng thang) chỉ cần vẽ khu gần
  updateCulling(px, pz, maxDist = 0) {
    this.px = px;
    this.pz = pz;
    const here = this.zoneAt(px, pz).room;
    const cull = maxDist || 58 * viewMul();
    for (const z of this.zones) {
      const r = z.room;
      const dx = Math.max(r.x1 - px, 0, px - r.x2);
      const dz = Math.max(r.z1 - pz, 0, pz - r.z2);
      const dist = Math.hypot(dx, dz);
      const occluded = r.walls && r !== here && dist > 10;
      z.group.visible = dist < cull && !occluded;
    }
    // Chi tiết nhỏ (núm, chốt, thanh mảnh) chỉ vẽ khi ở gần: ở xa không nhìn thấy nhưng vẫn tốn tam giác
    const near = 15 * viewMul();
    for (const m of this.details || []) {
      const s = m.geometry.boundingSphere;
      m.visible = Math.hypot(s.center.x - px, s.center.z - pz) - s.radius < near;
    }
  }

  update(dt, t, positions, ctx) {
    for (const d of this.doors) d.update(dt, positions);
    for (const u of this.updaters) u(dt, t);
    this.npcs?.update(dt, t, ctx, positions[0]);
  }
}

function directoryTexture(lines, current) {
  const c = document.createElement('canvas');
  c.width = 440;
  c.height = 480;
  const g = c.getContext('2d');
  g.fillStyle = '#0f172a';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#22d3ee';
  g.lineWidth = 8;
  g.strokeRect(6, 6, c.width - 12, c.height - 12);
  g.fillStyle = '#22d3ee';
  g.font = '800 40px "Be Vietnam Pro", Arial';
  g.textAlign = 'center';
  g.fillText('SƠ ĐỒ TÒA NHÀ', c.width / 2, 60);
  g.textAlign = 'left';
  lines.forEach((l, i) => {
    const isCur = FLOORS[FLOORS.length - 1 - i].id === current;
    g.fillStyle = isCur ? '#facc15' : '#e2e8f0';
    g.font = `${isCur ? 800 : 600} 28px "Be Vietnam Pro", Arial`;
    g.fillText((isCur ? '➤ ' : '   ') + l, 24, 120 + i * 70, c.width - 40);
  });
  g.font = '600 20px "Be Vietnam Pro", Arial';
  g.fillStyle = '#94a3b8';
  g.fillText('Thang bộ / thang cuốn: đi thẳng lên dốc', 24, 455, c.width - 40);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export { cyl, bar };
