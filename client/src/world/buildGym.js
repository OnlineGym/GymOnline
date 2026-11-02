import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROOMS, WALLS, SIGNS, WALL_H, WALL_T, DOOR_H } from './layout.js';
import { mat, textures, textTexture, C } from './materials.js';
import { box, cyl, sphere, bakeStatic } from './helpers.js';
import { Collision } from './collision.js';
import { Door } from './doors.js';
import { setupLighting } from './lighting.js';
import { buildRooms } from './rooms.js';

/**
 * Dựng toàn bộ phòng gym: sàn, tường, trần, cửa, bảng chỉ dẫn, khu bên ngoài,
 * rồi gọi buildRooms() để bày nội thất + máy tập từng khu.
 */
export function buildGym(scene, equipment) {
  const collision = new Collision();
  const staticRoot = new THREE.Group();
  staticRoot.name = 'static';
  const wallsRoot = new THREE.Group();
  wallsRoot.name = 'walls';
  scene.add(staticRoot, wallsRoot);
  const doors = [];

  buildFloors(staticRoot);
  buildWalls(wallsRoot, staticRoot, collision, doors);
  buildCeiling(staticRoot);
  buildExterior(staticRoot, collision);
  buildSigns(scene);

  const lighting = setupLighting(scene);
  equipment.setCollision(collision);
  scene.add(equipment.root);
  const rooms = buildRooms({ scene, staticRoot, collision, equipment });

  // Gộp geometry tĩnh để giảm draw call (phần chuyển động được đánh dấu dynamic sẽ giữ nguyên)
  bakeStatic(staticRoot, mergeGeometries);
  bakeStatic(equipment.root, mergeGeometries);
  const wallMeshes = bakeStatic(wallsRoot, mergeGeometries);

  // Camera tránh cả tường lẫn cánh cửa (cửa đóng lại giữa camera và nhân vật)
  const doorMeshes = [];
  for (const d of doors) d.group.traverse((o) => o.isMesh && doorMeshes.push(o));

  return {
    collision,
    doors,
    lighting,
    rooms,
    cameraBlockers: [...wallMeshes, ...doorMeshes],
    update(dt, t, positions) {
      for (const d of doors) d.update(dt, positions);
      rooms.update(dt, t);
      lighting.update(dt, t);
    },
  };
}

function floorMaterial(type, w, d) {
  const make = {
    lobby: () => textures.tile('#e8edf3', '#a7b4c4', 4),
    rubber: () => textures.rubber(),
    wood: () => textures.wood('#d9a86c', '#a8723f'),
    mats: () => textures.mats(),
    lockerTile: () => textures.tile('#d5f5ef', '#6fd8c6', 4),
    sauna: () => textures.wood('#a36e40', '#6b4426'),
    wcTile: () => textures.tile('#f8fafc', '#9cc3f5', 6),
  }[type];
  const tex = make();
  const scale = { rubber: 2, mats: 2, wood: 3, sauna: 2.5, wcTile: 2 }[type] || 3;
  tex.repeat.set(w / scale, d / scale);
  return new THREE.MeshStandardMaterial({ map: tex, roughness: type === 'wood' ? 0.45 : 0.8, metalness: 0 });
}

function buildFloors(root) {
  for (const r of ROOMS) {
    const w = r.x2 - r.x1;
    const d = r.z2 - r.z1;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMaterial(r.floor, w, d));
    m.rotation.x = -Math.PI / 2;
    m.position.set((r.x1 + r.x2) / 2, 0.001, (r.z1 + r.z2) / 2);
    m.receiveShadow = true;
    m.userData.noBake = true; // mỗi sàn có texture riêng
    root.add(m);
  }
}

function buildWalls(wallsRoot, staticRoot, collision, doors) {
  const wallMat = mat(C.wall, { rough: 0.9 });
  const baseMat = mat('#1f2937', { rough: 0.7 });
  const neonMat = mat(C.cyan, { emissive: C.cyan, emissiveIntensity: 1.2 });

  for (const w of WALLS) {
    const alongX = w.z1 === w.z2;
    const a = alongX ? Math.min(w.x1, w.x2) : Math.min(w.z1, w.z2);
    const b = alongX ? Math.max(w.x1, w.x2) : Math.max(w.z1, w.z2);
    const fixed = alongX ? w.z1 : w.x1;
    const gaps = (w.doors || []).slice().sort((p, q) => p.c - q.c);

    // Các đoạn tường đặc giữa những khoảng cửa
    const pieces = [];
    let cur = a - WALL_T / 2;
    for (const g of gaps) {
      pieces.push([cur, g.c - g.w / 2]);
      cur = g.c + g.w / 2;
    }
    pieces.push([cur, b + WALL_T / 2]);

    const place = (along, y, len, h, thick, material, root, opts) => {
      const cx = alongX ? along : fixed;
      const cz = alongX ? fixed : along;
      const m = box(alongX ? len : thick, h, alongX ? thick : len, material, cx, y, cz, opts);
      root.add(m);
      return m;
    };

    for (const [p0, p1] of pieces) {
      const len = p1 - p0;
      if (len <= 0.01) continue;
      const mid = (p0 + p1) / 2;
      place(mid, WALL_H / 2, len, WALL_H, WALL_T, wallMat, wallsRoot, { cast: false, receive: true });
      place(mid, 0.07, len, 0.14, WALL_T + 0.04, baseMat, staticRoot, { cast: false });
      place(mid, 1.25, len, 0.05, WALL_T + 0.03, neonMat, staticRoot, { cast: false, receive: false });
      if (alongX) collision.addBox(p0, p1, fixed - WALL_T / 2, fixed + WALL_T / 2, 'wall');
      else collision.addBox(fixed - WALL_T / 2, fixed + WALL_T / 2, p0, p1, 'wall');
    }

    for (const g of gaps) {
      // Dầm phía trên cửa
      place(g.c, (DOOR_H + WALL_H) / 2, g.w, WALL_H - DOOR_H, WALL_T, wallMat, wallsRoot, { cast: false });
      if (g.type !== 'open') {
        const door = new Door({
          type: g.type,
          x: alongX ? g.c : fixed,
          z: alongX ? fixed : g.c,
          w: g.w,
          alongX,
          color: g.color,
        });
        staticRoot.parent.add(door.group);
        doors.push(door);
      } else {
        // Viền neon quanh lối đi mở
        place(g.c, DOOR_H + 0.05, g.w, 0.1, WALL_T + 0.06, neonMat, staticRoot, { cast: false, receive: false });
      }
    }
  }
}

function buildCeiling(root) {
  // Trần dạng tấm dày (nhìn được từ cả trong lẫn ngoài), không đổ bóng để ánh sáng chiếu vào trong
  const slab = box(48.6, 0.3, 44.6, mat('#f4f6fa', { rough: 0.95 }), 0, WALL_H + 0.15, -2, { cast: false, receive: false });
  root.add(slab);
  // Đèn panel trần phát sáng
  const lampMat = mat('#ffffff', { emissive: '#fffbe8', emissiveIntensity: 1.6 });
  for (let x = -21; x <= 21; x += 6) {
    for (let z = -21; z <= 17; z += 5) {
      root.add(box(1.6, 0.06, 0.5, lampMat, x, WALL_H - 0.03, z, { cast: false, receive: false }));
    }
  }
}

function buildExterior(root, collision) {
  const grassTex = textures.grass();
  grassTex.repeat.set(40, 40);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  ground.userData.noBake = true;
  root.add(ground);

  // Sân trước lát gạch
  const plazaTex = textures.tile('#d6d3d1', '#a8a29e', 2);
  plazaTex.repeat.set(12, 5);
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(26, 10), new THREE.MeshStandardMaterial({ map: plazaTex, roughness: 0.9 }));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(0, 0.0, 25);
  plaza.receiveShadow = true;
  plaza.userData.noBake = true;
  root.add(plaza);

  // Bậc thềm trước cửa
  root.add(box(6, 0.04, 2, mat('#94a3b8'), 0, 0.02, 21.1, { cast: false }));

  // Hàng rào cây bụi bao quanh sân (va chạm)
  const bushMat = mat('#4ade80', { rough: 0.9, flat: true });
  const bushMat2 = mat('#22c55e', { rough: 0.9, flat: true });
  for (let x = -12.5; x <= 12.5; x += 1.25) {
    root.add(sphere(0.65, x % 2.5 === 0 ? bushMat : bushMat2, x, 0.45, 30, 8));
  }
  for (let z = 20.8; z <= 30; z += 1.25) {
    root.add(sphere(0.65, bushMat, -13, 0.45, z, 8));
    root.add(sphere(0.65, bushMat2, 13, 0.45, z, 8));
  }
  collision.addBox(-14, 14, 29.6, 31, 'fence');
  collision.addBox(-14, -12.4, 20, 31, 'fence');
  collision.addBox(12.4, 14, 20, 31, 'fence');

  // Cây xanh low-poly
  const trunk = mat('#8b5a2b', { rough: 1 });
  const leaf = mat('#16a34a', { rough: 0.9, flat: true });
  const leaf2 = mat('#4ade80', { rough: 0.9, flat: true });
  const trees = [[-9, 23.5], [9, 23.5], [-9, 28], [9, 28], [-30, 10], [30, -5], [-32, -15], [32, 15], [0, 40], [20, 36], [-22, 36]];
  for (const [x, z] of trees) {
    root.add(cyl(0.15, 0.22, 1.4, trunk, x, 0.7, z, 7));
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2, 7), Math.abs(x) > 15 ? leaf2 : leaf);
    cone.position.set(x, 2.2, z);
    cone.castShadow = true;
    root.add(cone);
    const cone2 = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.5, 7), leaf2);
    cone2.position.set(x, 3.1, z);
    cone2.castShadow = true;
    root.add(cone2);
    if (Math.abs(x) < 12 && z < 30) collision.addRect(x, z, 0.6, 0.6, 0, 'tree');
  }

  // Ghế đá ngoài sân
  const benchMat = mat('#a8a29e');
  for (const x of [-5, 5]) {
    root.add(box(1.8, 0.1, 0.5, benchMat, x, 0.45, 27.5));
    root.add(box(0.2, 0.4, 0.4, benchMat, x - 0.7, 0.2, 27.5));
    root.add(box(0.2, 0.4, 0.4, benchMat, x + 0.7, 0.2, 27.5));
    collision.addRect(x, 27.5, 1.8, 0.5, 0, 'bench');
  }

  // Bảng hiệu lớn trên cửa chính
  const logo = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 1.1),
    new THREE.MeshBasicMaterial({ map: textTexture(['GYM ONLINE', 'Tập luyện cùng bạn bè'], { w: 1024, h: 190, size: 96, accent: '#22d3ee' }) })
  );
  logo.position.set(0, 3.25, 20.17);
  root.add(logo);
  logo.userData.noBake = true;
}

function buildSigns(scene) {
  for (const s of SIGNS) {
    const g = new THREE.Group();
    g.position.set(s.x, 3.25, s.z);
    g.rotation.y = s.ry;
    const front = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 0.6),
      new THREE.MeshBasicMaterial({ map: textTexture([s.text, s.sub].filter(Boolean), { accent: s.color }) })
    );
    front.position.z = WALL_T / 2 + 0.02;
    g.add(front);
    if (s.both) {
      const back = new THREE.Mesh(
        new THREE.PlaneGeometry(2.4, 0.6),
        new THREE.MeshBasicMaterial({ map: textTexture([s.back || s.text], { accent: s.color }) })
      );
      back.position.z = -(WALL_T / 2 + 0.02);
      back.rotation.y = Math.PI;
      g.add(back);
    }
    scene.add(g);
  }
}
