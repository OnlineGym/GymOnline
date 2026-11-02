import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, cyl, bakeStatic } from './helpers.js';
import { mat, textures, textTexture, C } from './materials.js';
import { Collision } from './collision.js';
import { Door } from './doors.js';
import { Instancer } from './instancer.js';
import { generateWalls, outerWalls } from './wallGen.js';
import { tpl, poster, plant, bench } from './decor.js';
import { FLOOR_BOUNDS, FLOORS } from '@shared/constants.js';

export const WALL_H = 4;
export const WALL_T = 0.3;
export const DOOR_H = 2.6;
const CULL_DIST = 46; // khu xa hơn khoảng này bị ẩn (sương mù che từ 30-44m)
const HALF_PI = Math.PI / 2;

const FLOOR_TEX = {
  lobby: () => textures.tile('#e8edf3', '#a7b4c4', 4),
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
const TEX_SCALE = { rubber: 2, mats: 2, wood: 3, sauna: 2.5, wcTile: 2, turf: 5, carpet: 2, carpetBlue: 2, track: 3, concrete: 4, darkTile: 2 };

/**
 * 1 tầng của tòa nhà. Dựng khi người chơi tới lần đầu (lazy) để vào game nhanh.
 *  - nội dung chia theo "khu" (zone = phòng/khu vực); khu xa hoặc bị tường che sẽ bị ẩn (culling)
 *  - geometry tĩnh trong mỗi khu được gộp; vật lặp lại dùng InstancedMesh
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
    this.updaters = [];
    this.zones = [];
    this.cameraBlockers = [];
    this.npcs = null;
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
    const S = new THREE.Group(); // nơi tạm chứa mọi thứ tĩnh trước khi chia khu
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

    // Khu (zone) = các phòng + "hành lang" còn lại
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

    // Chuyển mọi thứ vào khu tương ứng theo vị trí rồi gộp geometry từng khu
    const route = (x, z) => this.zoneAt(x, z).group;
    const box3 = new THREE.Box3();
    const center = new THREE.Vector3();
    for (const child of [...S.children]) {
      box3.setFromObject(child);
      box3.getCenter(center);
      route(center.x, center.z).add(child);
    }
    for (const z of [...this.zones, this.hallZone]) bakeStatic(z.group, mergeGeometries);
    const walls = bakeStatic(this.shell, mergeGeometries);
    this.cameraBlockers = walls;
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

  // ---------- Sàn ----------
  buildFloors(S) {
    const def = this.def;
    const B = FLOOR_BOUNDS;
    // sàn nền cả tầng
    const baseType = def.baseFloor || 'lobby';
    const w = B.maxX - B.minX;
    const d = B.maxZ - B.minZ;
    const base = new THREE.Mesh(new THREE.PlaneGeometry(w, d), this.floorMat(baseType, w, d));
    base.rotation.x = -HALF_PI;
    base.position.set(0, 0, 0);
    base.receiveShadow = true;
    base.userData.noBake = true;
    this.shell.add(base);
    def.rooms.forEach((r, i) => {
      if (!r.floor) return;
      const rw = r.x2 - r.x1;
      const rd = r.z2 - r.z1;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(rw, rd), this.floorMat(r.floor, rw, rd));
      m.rotation.x = -HALF_PI;
      // phòng khai báo trước nằm cao hơn chút (tránh 2 lớp sàn chồng nhau nhấp nháy)
      m.position.set((r.x1 + r.x2) / 2, 0.004 + (def.rooms.length - i) * 0.002, (r.z1 + r.z2) / 2);
      m.receiveShadow = true;
      m.userData.noBake = true;
      S.add(m);
    });
  }

  floorMat(type, w, d) {
    const tex = (FLOOR_TEX[type] || FLOOR_TEX.lobby)();
    const s = TEX_SCALE[type] || 3;
    tex.repeat.set(w / s, d / s);
    return new THREE.MeshStandardMaterial({ map: tex, roughness: type === 'wood' ? 0.45 : 0.85 });
  }

  // ---------- Tường + cửa ----------
  buildWalls(S) {
    const def = this.def;
    const roof = def.id === 4;
    const H = roof ? 1.1 : WALL_H;
    const wallMat = mat(def.wallColor || C.wall, { rough: 0.9 });
    const baseMat = mat('#1f2937', { rough: 0.7 });
    const neon = this.info.color;
    const neonMat = mat(neon, { emissive: neon, emissiveIntensity: 1.2 });
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
        if (!roof) place(mid, 1.25, len, 0.05, WALL_T + 0.03, neonMat, this.shell, { cast: false, receive: false });
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
    // Cửa sổ phát sáng trên tường bao (tầng trong nhà)
    if (!roof && def.windows !== false) {
      const winMat = mat('#bfe9ff', { emissive: '#d9f3ff', emissiveIntensity: 0.9 });
      for (let x = -34; x <= 34; x += 10) {
        if (def.id === 1 && Math.abs(x) < 6) continue;
        this.shell.add(box(4, 1.4, 0.05, winMat, x, 2.4, FLOOR_BOUNDS.minZ + 0.17, { cast: false }));
      }
      for (let z = -24; z <= 24; z += 10) this.shell.add(box(0.05, 1.4, 4, winMat, FLOOR_BOUNDS.minX + 0.17, 2.4, z, { cast: false }));
    }
  }

  buildCeiling(inst) {
    const B = FLOOR_BOUNDS;
    this.shell.add(box(B.maxX - B.minX + 0.6, 0.3, B.maxZ - B.minZ + 0.6, mat('#f4f6fa', { rough: 0.95 }), 0, WALL_H + 0.15, 0, { cast: false, receive: false }));
    const lamp = tpl().lamp;
    for (let x = B.minX + 4; x <= B.maxX - 4; x += 7) {
      for (let z = B.minZ + 4; z <= B.maxZ - 3; z += 6) inst.add(lamp, x, WALL_H - 0.03, z, 0);
    }
  }

  // ---------- Sảnh thang máy (giống nhau mọi tầng) ----------
  buildTransit(ctx) {
    const f = this.def.id;
    const S = ctx.S;
    const steel = mat('#94a3b8', { metal: 0.7, rough: 0.3 });
    const dark = mat('#1e293b', { rough: 0.5 });
    // Thang máy 2 buồng trên tường Đông
    for (const z of [-4, 4]) {
      S.add(box(0.1, 2.6, 2.0, dark, 39.8, 1.3, z));
      S.add(box(0.06, 2.4, 0.9, steel, 39.72, 1.2, z - 0.46));
      S.add(box(0.06, 2.4, 0.9, steel, 39.72, 1.2, z + 0.46));
      const ind = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.3), new THREE.MeshBasicMaterial({ map: textTexture([`▲▼  ${FLOORS[f].key}`], { w: 256, h: 86, size: 46, accent: '#22d3ee' }) }));
      ind.position.set(39.68, 2.85, z);
      ind.rotation.y = -HALF_PI;
      ind.userData.noBake = true;
      S.add(ind);
      if (this.def.id !== 4 || true) ctx.add('elevator', 38.2, z, HALF_PI);
    }
    // Cầu thang lên (bậc thang)
    if (f < 4) {
      const stepMat = mat('#cbd5e1', { rough: 0.6 });
      for (let i = 0; i < 8; i++) S.add(box(3.2, 0.2 * (i + 1), 0.4, stepMat, 27, 0.1 * (i + 1), -6.6 - i * 0.4));
      S.add(box(0.06, 1, 3.4, steel, 25.3, 1.4, -8.2));
      S.add(box(0.06, 1, 3.4, steel, 28.7, 1.4, -8.2));
      ctx.col(27, -8.2, 3.4, 3.4);
      ctx.add('stairs_up', 27, -5.6, Math.PI);
    }
    // Cầu thang xuống (giếng thang tối + lan can)
    if (f > 0) {
      S.add(box(3.2, 0.02, 3.2, mat('#0f172a'), 27, 0.01, 8.2, { cast: false }));
      for (let i = 0; i < 6; i++) S.add(box(3.0, 0.04, 0.35, mat('#334155'), 27, 0.02, 7 + i * 0.4, { cast: false }));
      S.add(box(0.06, 1, 3.4, steel, 25.3, 0.5, 8.2));
      S.add(box(0.06, 1, 3.4, steel, 28.7, 0.5, 8.2));
      S.add(box(3.4, 1, 0.06, steel, 27, 0.5, 9.9));
      ctx.col(27, 8.3, 3.4, 3.2);
      ctx.add('stairs_down', 27, 5.6, 0);
    }
    // Thang cuốn nối tầng 1-2-3
    const escMat = mat('#334155', { rough: 0.4, metal: 0.4 });
    const railMat = mat('#22d3ee', { emissive: '#22d3ee', emissiveIntensity: 0.8 });
    if (f >= 1 && f <= 2) {
      const e = new THREE.Group();
      e.position.set(33, 0, -8);
      const ramp = box(1.4, 0.15, 4.2, escMat, 0, 1.2, 0);
      ramp.rotation.x = 0.55;
      e.add(ramp);
      for (const s of [-1, 1]) {
        const r = box(0.08, 0.1, 4.2, railMat, s * 0.72, 2.1, 0, { cast: false });
        r.rotation.x = 0.55;
        e.add(r);
      }
      S.add(e);
      ctx.col(33, -8.3, 1.6, 3.2);
      ctx.add('escalator_up', 33, -5.6, Math.PI);
    }
    if (f >= 2 && f <= 3) {
      S.add(box(1.4, 0.02, 3.6, mat('#0f172a'), 33, 0.01, 8.2, { cast: false }));
      for (const s of [-1, 1]) S.add(box(0.08, 1, 3.6, railMat, 33 + s * 0.75, 0.5, 8.2, { cast: false }));
      ctx.col(33, 8.3, 1.6, 3.4);
      ctx.add('escalator_down', 33, 5.6, 0);
    }
    // Bảng chỉ dẫn các tầng
    const lines = FLOORS.map((fl) => `${fl.key}: ${fl.name.split('–')[1]?.trim() || fl.name}`).reverse();
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 2.4),
      new THREE.MeshBasicMaterial({ map: directoryTexture(lines, f) })
    );
    board.position.set(36.5, 1.7, 0);
    board.rotation.y = -HALF_PI;
    board.userData.noBake = true;
    S.add(board);
    S.add(box(0.1, 2.6, 2.3, dark, 36.58, 1.3, 0));
    ctx.col(36.6, 0, 0.3, 2.3);
    plant(ctx, 38.8, -8.5);
    plant(ctx, 38.8, 8.5);
    bench(ctx, 31, 9.3, 2.4, true, '#334155');
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

  // ---------- Hiển thị / culling ----------
  setActive(active) {
    if (active && !this.built) this.build();
    this.group.visible = active;
  }

  updateCulling(px, pz) {
    const here = this.zoneAt(px, pz).room;
    for (const z of this.zones) {
      const r = z.room;
      const dx = Math.max(r.x1 - px, 0, px - r.x2);
      const dz = Math.max(r.z1 - pz, 0, pz - r.z2);
      const dist = Math.hypot(dx, dz);
      // Che khuất theo phòng: phòng có tường, mình đứng ngoài và cách > 10m thì không thể nhìn thấy bên trong
      const occluded = r.walls && r !== here && dist > 10;
      z.group.visible = dist < CULL_DIST && !occluded;
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
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export { cyl };
