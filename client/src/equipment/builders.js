import * as THREE from 'three';
import { box, cyl, sphere, bar, torus } from '../world/helpers.js';
import { mat, C, STAT_COLORS, textures } from '../world/materials.js';

/**
 * Dựng từng loại máy tập bằng khối cơ bản.
 * Quy ước toạ độ cục bộ: người tập nhìn về +Z, máy đặt tại gốc.
 * Mỗi builder trả về:
 *  - group: toàn bộ mesh (phần tĩnh sẽ được gộp geometry)
 *  - seat: vị trí đặt gốc nhân vật khi tập {x, y, z}
 *  - footprint: {w, d, ox, oz} vùng va chạm, null nếu đi xuyên được
 *  - exit: vị trí đứng dậy sau khi tập
 *  - update(p, active, dt, t, phase): chuyển động bộ phận máy theo độ gắng sức p (0..1)
 */

const metal = () => mat(C.metal, { rough: 0.35, metal: 0.65 });
const chrome = () => mat(C.chrome, { rough: 0.2, metal: 0.9 });
const pad = () => mat(C.pad, { rough: 0.55 });
const accent = (stat) => mat(STAT_COLORS[stat], { rough: 0.4, emissive: STAT_COLORS[stat], emissiveIntensity: 0.25 });
const plateMat = () => mat('#111827', { rough: 0.5, metal: 0.4 });

// Gốc nhân vật khi ngồi: đỉnh ghế - 0.26 (vì hông cao 0.34 và mông thấp hơn hông 0.08)
const seatY = (top) => top - 0.26;

// Tiện ích: xoay / đặt vị trí rồi trả về chính mesh (vì Object3D.add trả về parent)
const rot = (m, axis, v) => ((m.rotation[axis] = v), m);
const at = (m, x, y, z) => (m.position.set(x, y, z), m);

function dynamicGroup() {
  const g = new THREE.Group();
  g.userData.dynamic = true;
  return g;
}

function baseFrame(g, w, d, oz = 0) {
  g.add(box(w, 0.06, d, metal(), 0, 0.03, oz));
}

function seatUnit(g, stat, { z = 0, top = 0.46, back = true, backAngle = 0, backH = 0.65 } = {}) {
  g.add(cyl(0.04, 0.05, top - 0.08, metal(), 0, (top - 0.08) / 2, z, 10));
  g.add(box(0.5, 0.09, 0.46, pad(), 0, top - 0.045, z));
  g.add(box(0.52, 0.03, 0.48, accent(stat), 0, top - 0.1, z));
  if (back) {
    const b = new THREE.Group();
    b.position.set(0, top, z - 0.27);
    b.rotation.x = backAngle;
    b.add(box(0.46, backH, 0.09, pad(), 0, backH / 2 + 0.02, 0));
    b.add(box(0.48, backH * 0.9, 0.03, accent(stat), 0, backH / 2 + 0.02, -0.06));
    b.add(box(0.06, backH, 0.06, metal(), 0, backH / 2, -0.1));
    g.add(b);
  }
}

// Cột tạ: trả về nhóm đĩa tạ di chuyển
function weightStack(g, x, z, height = 1.5) {
  g.add(box(0.06, height, 0.06, metal(), x - 0.2, height / 2, z));
  g.add(box(0.06, height, 0.06, metal(), x + 0.2, height / 2, z));
  g.add(box(0.48, 0.06, 0.2, metal(), x, height, z));
  g.add(box(0.5, 0.05, 0.25, metal(), x, 0.03, z));
  for (let i = 0; i < 6; i++) g.add(box(0.34, 0.07, 0.16, plateMat(), x, 0.12 + i * 0.08, z));
  const moving = dynamicGroup();
  for (let i = 0; i < 3; i++) moving.add(box(0.34, 0.07, 0.16, i === 2 ? mat('#ef4444', { rough: 0.5 }) : plateMat(), x, 0.6 + i * 0.08, z));
  moving.add(cyl(0.012, 0.012, height - 0.5, chrome(), x, 0.7 + (height - 0.6) / 2, z, 6));
  g.add(moving);
  return moving;
}

const builders = {
  chest_press(stat = 'chest') {
    const g = new THREE.Group();
    baseFrame(g, 1.2, 1.5, -0.3);
    seatUnit(g, stat, { z: 0.05, backH: 0.75 });
    g.add(box(0.08, 1.6, 0.08, metal(), -0.45, 0.8, -0.45));
    g.add(box(0.08, 1.6, 0.08, metal(), 0.45, 0.8, -0.45));
    g.add(box(0.98, 0.08, 0.08, metal(), 0, 1.6, -0.45));
    const stack = weightStack(g, 0, -0.85);
    const handles = dynamicGroup();
    for (const s of [-1, 1]) {
      handles.add(rot(cyl(0.025, 0.025, 0.7, chrome(), s * 0.42, 0.9, -0.25, 8), 'x', Math.PI / 2));
      handles.add(cyl(0.03, 0.03, 0.2, accent(stat), s * 0.33, 0.9, 0.1, 8));
      handles.add(bar([s * 0.42, 0.9, 0.1], [s * 0.33, 0.9, 0.1], 0.022, chrome()));
    }
    g.add(handles);
    return {
      group: g,
      seat: { x: 0, y: seatY(0.46), z: 0.05 },
      footprint: { w: 1.2, d: 1.55, ox: 0, oz: -0.3 },
      exit: { x: 0.95, z: 0.3 },
      update(p) {
        handles.position.z = 0.1 + p * 0.22;
        stack.position.y = p * 0.25;
      },
    };
  },

  pec_deck(stat = 'chest') {
    const g = new THREE.Group();
    baseFrame(g, 1.4, 1.3, -0.3);
    seatUnit(g, stat, { z: 0.05, backH: 0.8 });
    g.add(box(0.1, 1.8, 0.1, metal(), 0, 0.9, -0.5));
    g.add(box(0.9, 0.08, 0.1, metal(), 0, 1.75, -0.5));
    g.add(bar([0, 1.75, -0.5], [0, 1.75, -0.1], 0.04, metal()));
    const stack = weightStack(g, 0.65, -0.6, 1.4);
    const arms = [];
    for (const s of [-1, 1]) {
      const pivot = dynamicGroup();
      pivot.position.set(s * 0.25, 1.15, -0.1);
      pivot.add(bar([0, 0, 0], [s * 0.45, 0, 0], 0.025, chrome()));
      pivot.add(bar([s * 0.45, 0, 0], [s * 0.45, -0.3, 0], 0.025, chrome()));
      pivot.add(box(0.08, 0.36, 0.1, accent(stat), s * 0.45, -0.22, 0.04));
      pivot.userData.side = s;
      g.add(pivot);
      arms.push(pivot);
    }
    return {
      group: g,
      seat: { x: 0, y: seatY(0.46), z: 0.05 },
      footprint: { w: 1.4, d: 1.3, ox: 0, oz: -0.25 },
      exit: { x: -1.0, z: 0.4 },
      update(p) {
        for (const a of arms) a.rotation.y = a.userData.side * -(p * 1.25);
        stack.position.y = p * 0.25;
      },
    };
  },

  lat_pulldown(stat = 'back') {
    const g = new THREE.Group();
    baseFrame(g, 1.0, 1.6, 0.25);
    seatUnit(g, stat, { z: 0, back: false });
    // đệm giữ đùi
    g.add(box(0.5, 0.1, 0.12, pad(), 0, 0.72, 0.22));
    g.add(box(0.06, 0.3, 0.06, metal(), 0, 0.58, 0.28));
    // cột trước + tay đòn trên
    g.add(box(0.14, 2.3, 0.14, metal(), 0, 1.15, 0.75));
    g.add(bar([0, 2.25, 0.75], [0, 2.25, 0.08], 0.05, metal()));
    g.add(rot(cyl(0.07, 0.07, 0.05, chrome(), 0, 2.18, 0.08, 12), 'z', Math.PI / 2));
    const stack = weightStack(g, 0, 1.05, 1.7);
    const moving = dynamicGroup();
    const handle = new THREE.Group();
    handle.add(rot(cyl(0.022, 0.022, 1.0, chrome(), 0, 0, 0, 8), 'z', Math.PI / 2));
    handle.add(rot(cyl(0.03, 0.03, 0.18, accent(stat), -0.42, 0, 0, 8), 'z', Math.PI / 2));
    handle.add(rot(cyl(0.03, 0.03, 0.18, accent(stat), 0.42, 0, 0, 8), 'z', Math.PI / 2));
    moving.add(handle);
    const cable = cyl(0.008, 0.008, 1, mat('#0f172a'), 0, 0, 0, 5);
    moving.add(cable);
    g.add(moving);
    const setBar = (y) => {
      handle.position.set(0, y, 0.08);
      cable.scale.y = 2.15 - y;
      cable.position.set(0, (2.15 + y) / 2, 0.08);
    };
    setBar(1.3);
    return {
      group: g,
      seat: { x: 0, y: seatY(0.46), z: 0 },
      footprint: { w: 1.0, d: 1.4, ox: 0, oz: 0.35 },
      exit: { x: 0.85, z: -0.2 },
      update(p) {
        setBar(1.3 - p * 0.42);
        stack.position.y = p * 0.3;
      },
    };
  },

  seated_row(stat = 'back') {
    const g = new THREE.Group();
    baseFrame(g, 0.9, 1.9, 0.4);
    seatUnit(g, stat, { z: -0.05, back: false });
    // đệm ngực + chỗ đặt chân
    g.add(box(0.36, 0.4, 0.08, pad(), 0, 0.82, 0.32));
    g.add(box(0.06, 0.4, 0.06, metal(), 0, 0.5, 0.36));
    g.add(rot(box(0.6, 0.05, 0.2, metal(), 0, 0.25, 0.42), 'x', -0.6));
    g.add(box(0.12, 1.5, 0.12, metal(), 0, 0.75, 1.15));
    g.add(rot(cyl(0.06, 0.06, 0.05, chrome(), 0, 0.95, 1.05, 12), 'z', Math.PI / 2));
    const stack = weightStack(g, 0, 1.35, 1.5);
    const moving = dynamicGroup();
    const handle = new THREE.Group();
    handle.add(rot(cyl(0.02, 0.02, 0.5, chrome(), 0, 0, 0, 8), 'z', Math.PI / 2));
    handle.add(cyl(0.03, 0.03, 0.16, accent(stat), -0.25, 0, 0, 8));
    handle.add(cyl(0.03, 0.03, 0.16, accent(stat), 0.25, 0, 0, 8));
    moving.add(handle);
    const cable = cyl(0.008, 0.008, 1, mat('#0f172a'), 0, 0, 0, 5);
    cable.rotation.x = Math.PI / 2;
    moving.add(cable);
    g.add(moving);
    const setZ = (z) => {
      handle.position.set(0, 0.95, z);
      cable.scale.y = 1.05 - z;
      cable.position.set(0, 0.95, (1.05 + z) / 2);
    };
    setZ(0.42);
    return {
      group: g,
      seat: { x: 0, y: seatY(0.46), z: -0.05 },
      footprint: { w: 0.9, d: 1.9, ox: 0, oz: 0.45 },
      exit: { x: 0.85, z: -0.2 },
      update(p) {
        setZ(0.44 - p * 0.18);
        stack.position.y = p * 0.28;
      },
    };
  },

  leg_press(stat = 'legs') {
    const g = new THREE.Group();
    baseFrame(g, 1.0, 1.8, 0.2);
    seatUnit(g, stat, { z: -0.05, backAngle: -0.35, backH: 0.85 });
    // ray trượt + bàn đạp
    g.add(box(0.06, 0.06, 0.9, chrome(), -0.3, 0.42, 0.65));
    g.add(box(0.06, 0.06, 0.9, chrome(), 0.3, 0.42, 0.65));
    g.add(box(0.7, 0.9, 0.08, metal(), 0, 0.45, 1.12));
    g.add(box(0.12, 0.42, 0.12, metal(), -0.3, 0.21, 1.0));
    g.add(box(0.12, 0.42, 0.12, metal(), 0.3, 0.21, 1.0));
    const stack = weightStack(g, -0.75, -0.2, 1.4);
    const plate = dynamicGroup();
    plate.add(box(0.62, 0.5, 0.06, accent(stat), 0, 0.5, 0));
    plate.add(box(0.66, 0.54, 0.03, metal(), 0, 0.5, 0.04));
    g.add(plate);
    return {
      group: g,
      seat: { x: 0, y: seatY(0.46), z: -0.05 },
      footprint: { w: 1.0, d: 1.7, ox: -0.1, oz: 0.3 },
      exit: { x: 0.85, z: -0.3 },
      update(p) {
        plate.position.z = 0.36 + p * 0.14;
        stack.position.y = p * 0.3;
      },
    };
  },

  leg_extension(stat = 'legs') {
    const g = new THREE.Group();
    baseFrame(g, 1.0, 1.1, -0.1);
    seatUnit(g, stat, { z: 0, top: 0.5, backH: 0.7 });
    g.add(box(0.08, 0.5, 0.08, metal(), -0.32, 0.28, 0.2));
    g.add(box(0.08, 0.5, 0.08, metal(), 0.32, 0.28, 0.2));
    const stack = weightStack(g, 0.7, -0.35, 1.3);
    const pivot = dynamicGroup();
    pivot.position.set(0, 0.55, 0.22);
    pivot.add(box(0.05, 0.3, 0.05, chrome(), 0.3, -0.15, 0));
    pivot.add(rot(cyl(0.06, 0.06, 0.5, accent(stat), 0, -0.3, 0.05, 12), 'z', Math.PI / 2));
    pivot.add(rot(cyl(0.035, 0.035, 0.62, chrome(), 0, 0, 0, 8), 'z', Math.PI / 2));
    g.add(pivot);
    return {
      group: g,
      seat: { x: 0, y: seatY(0.5), z: 0 },
      footprint: { w: 1.0, d: 1.0, ox: 0.1, oz: -0.1 },
      exit: { x: -0.85, z: 0.3 },
      update(p) {
        pivot.rotation.x = -p * 1.35;
        stack.position.y = p * 0.25;
      },
    };
  },

  bicep_machine(stat = 'arms') {
    const g = new THREE.Group();
    baseFrame(g, 0.9, 1.1, 0.1);
    seatUnit(g, stat, { z: -0.05, back: false });
    // đệm tì tay (preacher)
    const padG = new THREE.Group();
    padG.position.set(0, 0.74, 0.3);
    padG.rotation.x = -0.7;
    padG.add(box(0.62, 0.06, 0.32, pad(), 0, 0, 0));
    padG.add(box(0.64, 0.02, 0.34, accent(stat), 0, -0.04, 0));
    g.add(padG);
    g.add(box(0.1, 0.72, 0.1, metal(), 0, 0.36, 0.42));
    const stack = weightStack(g, 0, 0.75, 1.3);
    const lever = dynamicGroup();
    lever.position.set(0, 0.68, 0.45);
    lever.add(rot(cyl(0.022, 0.022, 0.6, chrome(), 0, 0, 0.0, 8), 'z', Math.PI / 2));
    lever.add(bar([-0.26, 0, 0], [-0.26, 0.05, -0.2], 0.02, chrome()));
    lever.add(bar([0.26, 0, 0], [0.26, 0.05, -0.2], 0.02, chrome()));
    lever.add(rot(cyl(0.03, 0.03, 0.56, accent(stat), 0, 0.05, -0.2, 8), 'z', Math.PI / 2));
    g.add(lever);
    return {
      group: g,
      seat: { x: 0, y: seatY(0.46), z: -0.05 },
      footprint: { w: 0.9, d: 1.2, ox: 0, oz: 0.25 },
      exit: { x: 0.85, z: -0.3 },
      update(p) {
        lever.rotation.x = 0.4 - p * 1.6;
        stack.position.y = p * 0.25;
      },
    };
  },

  tricep_machine(stat = 'arms') {
    const g = new THREE.Group();
    baseFrame(g, 1.1, 1.2, -0.25);
    seatUnit(g, stat, { z: 0, backH: 0.75 });
    g.add(box(0.08, 1.4, 0.08, metal(), -0.48, 0.7, -0.15));
    g.add(box(0.08, 1.4, 0.08, metal(), 0.48, 0.7, -0.15));
    g.add(box(1.0, 0.08, 0.08, metal(), 0, 1.4, -0.15));
    const stack = weightStack(g, 0, -0.75, 1.4);
    const handles = dynamicGroup();
    for (const s of [-1, 1]) {
      handles.add(cyl(0.03, 0.03, 0.2, accent(stat), s * 0.36, 0, 0.05, 8));
      handles.add(bar([s * 0.36, 0.1, 0.05], [s * 0.48, 0.1, -0.15], 0.02, chrome()));
    }
    g.add(handles);
    return {
      group: g,
      seat: { x: 0, y: seatY(0.46), z: 0 },
      footprint: { w: 1.1, d: 1.2, ox: 0, oz: -0.3 },
      exit: { x: 0, z: 0.8 },
      update(p) {
        handles.position.y = 0.88 - p * 0.32;
        stack.position.y = p * 0.25;
      },
    };
  },

  treadmill(stat = 'stamina') {
    const g = new THREE.Group();
    g.add(box(0.86, 0.14, 1.9, metal(), 0, 0.09, 0));
    g.add(box(0.1, 0.06, 1.9, accent(stat), -0.43, 0.17, 0));
    g.add(box(0.1, 0.06, 1.9, accent(stat), 0.43, 0.17, 0));
    // băng chuyền: texture riêng để trượt offset độc lập
    const beltTex = textures.belt();
    beltTex.repeat.set(1, 6);
    const belt = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 1.8), new THREE.MeshStandardMaterial({ map: beltTex, roughness: 0.9 }));
    belt.rotation.x = -Math.PI / 2;
    belt.position.y = 0.17;
    belt.receiveShadow = true;
    belt.userData.dynamic = true;
    g.add(belt);
    // trụ + bảng điều khiển + tay vịn
    g.add(box(0.07, 1.15, 0.07, metal(), -0.38, 0.72, 0.85));
    g.add(box(0.07, 1.15, 0.07, metal(), 0.38, 0.72, 0.85));
    g.add(rot(box(0.85, 0.32, 0.12, metal(), 0, 1.3, 0.88), 'x', 0.35));
    const screen = box(0.5, 0.18, 0.02, mat('#0ea5e9', { emissive: '#22d3ee', emissiveIntensity: 0.9 }), 0, 1.31, 0.81, { cast: false });
    screen.rotation.x = 0.35;
    g.add(screen);
    g.add(bar([-0.4, 1.0, 0.85], [-0.4, 1.0, 0.35], 0.025, chrome()));
    g.add(bar([0.4, 1.0, 0.85], [0.4, 1.0, 0.35], 0.025, chrome()));
    return {
      group: g,
      seat: { x: 0, y: 0.17, z: -0.1 },
      footprint: { w: 0.9, d: 1.95, ox: 0, oz: 0 },
      exit: { x: 0.9, z: -0.5 },
      update(_p, active, dt) {
        if (active) beltTex.offset.y += dt * 3.2;
      },
    };
  },

  dumbbell_bench(stat = 'arms') {
    const g = new THREE.Group();
    g.add(box(0.36, 0.1, 1.25, pad(), 0, 0.37, -0.15));
    g.add(box(0.38, 0.03, 1.27, accent(stat), 0, 0.31, -0.15));
    g.add(box(0.06, 0.3, 0.3, metal(), 0, 0.15, 0.3));
    g.add(box(0.06, 0.3, 0.3, metal(), 0, 0.15, -0.6));
    g.add(box(0.5, 0.05, 0.08, metal(), 0, 0.03, 0.3));
    g.add(box(0.5, 0.05, 0.08, metal(), 0, 0.03, -0.6));
    return {
      group: g,
      seat: { x: 0, y: seatY(0.42), z: 0.15 },
      footprint: { w: 0.45, d: 1.25, ox: 0, oz: -0.2 },
      exit: { x: 0.75, z: 0.2 },
      update() {},
    };
  },

  pullup_bar(stat = 'back') {
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      g.add(box(0.1, 2.4, 0.1, metal(), s * 0.6, 1.2, 0));
      g.add(box(0.12, 0.06, 0.8, metal(), s * 0.6, 0.03, 0));
      g.add(box(0.12, 0.06, 0.12, accent(stat), s * 0.6, 2.0, 0));
    }
    g.add(rot(cyl(0.025, 0.025, 1.2, chrome(), 0, 1.68, 0.02, 10), 'z', Math.PI / 2));
    g.add(box(1.3, 0.08, 0.1, metal(), 0, 2.4, 0));
    // bục bước lên
    g.add(box(0.5, 0.18, 0.4, accent(stat), 0, 0.09, 0.55));
    return {
      group: g,
      seat: { x: 0, y: 0.6, z: 0.02 },
      footprint: null,
      extraColliders: [
        { w: 0.14, d: 0.8, ox: -0.6, oz: 0 },
        { w: 0.14, d: 0.8, ox: 0.6, oz: 0 },
      ],
      exit: { x: 0, z: 0.7 },
      update() {},
    };
  },

  battle_rope(stat = 'stamina') {
    const g = new THREE.Group();
    g.add(box(0.3, 0.9, 0.3, metal(), 0, 0.45, 3.0));
    g.add(at(torus(0.08, 0.02, chrome(), Math.PI * 2, 12), 0, 0.3, 2.84));
    g.add(cyl(0.6, 0.6, 0.02, accent(stat), 0, 0.01, 0, 24));
    const ropeMat = mat('#1e293b', { rough: 0.9 });
    const N = 22;
    const ropes = [-1, 1].map((s) => {
      const beads = [];
      const rg = dynamicGroup();
      for (let i = 0; i < N; i++) {
        const b = sphere(0.04, ropeMat, 0, 0, 0, 6);
        b.castShadow = false;
        rg.add(b);
        beads.push(b);
      }
      g.add(rg);
      return { s, beads };
    });
    const layout = (t, amp) => {
      for (const { s, beads } of ropes) {
        for (let i = 0; i < N; i++) {
          const k = i / (N - 1);
          const x = s * 0.22 * (1 - k) + s * 0.05 * k;
          const z = 0.32 + k * 2.5;
          const baseY = 0.62 * (1 - k) + 0.3 * k - Math.sin(k * Math.PI) * 0.25;
          const wave = Math.sin(t * 10 - k * 9 + (s > 0 ? Math.PI : 0)) * amp * (1 - k) * Math.min(1, k * 4 + 0.2);
          beads[i].position.set(x, Math.max(0.04, baseY + wave), z);
        }
      }
    };
    layout(0, 0);
    return {
      group: g,
      seat: { x: 0, y: 0, z: 0 },
      footprint: null,
      extraColliders: [{ w: 0.4, d: 0.4, ox: 0, oz: 3 }],
      exit: { x: 0.9, z: 0 },
      update(_p, active, _dt, t) {
        layout(t, active ? 0.2 : 0);
      },
    };
  },

  yoga_mat(stat = 'stamina', opts = {}) {
    const g = new THREE.Group();
    g.add(box(0.75, 0.02, 1.7, mat(opts.color || '#c084fc', { rough: 0.9 }), 0, 0.01, 0, { cast: false }));
    g.add(rot(cyl(0.06, 0.06, 0.75, mat(opts.color || '#c084fc', { rough: 0.9 }), 0, 0.06, -0.9, 12), 'z', Math.PI / 2));
    return { group: g, seat: { x: 0, y: 0.02, z: 0 }, footprint: null, exit: { x: 0.8, z: 0 }, update() {} };
  },

  medicine_ball(stat = 'chest') {
    const g = new THREE.Group();
    g.add(cyl(0.45, 0.45, 0.015, accent(stat), 0, 0.008, 0, 24));
    return { group: g, seat: { x: 0, y: 0, z: 0 }, footprint: null, exit: { x: 0.8, z: 0 }, update() {} };
  },

  aerobic_spot() {
    const g = new THREE.Group();
    const ring = torus(0.42, 0.025, mat('#f472b6', { emissive: '#f472b6', emissiveIntensity: 1.4 }), Math.PI * 2, 32);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.012;
    ring.castShadow = false;
    g.add(ring);
    return { group: g, seat: { x: 0, y: 0, z: 0 }, footprint: null, exit: { x: 0, z: 0.8 }, update() {} };
  },

  sauna_seat(_stat, opts = {}) {
    const g = new THREE.Group();
    const top = opts.top || 0.45;
    return { group: g, seat: { x: 0, y: seatY(top), z: 0 }, footprint: null, exit: { x: 0, z: opts.exitZ || 0.8 }, update() {} };
  },

  locker(_stat, opts = {}) {
    const g = new THREE.Group();
    const color = opts.color || '#14b8a6';
    const unit = new THREE.Group();
    unit.position.z = 0.6;
    buildLockerColumn(unit, color, true);
    g.add(unit);
    // cửa trên mở được
    const door = dynamicGroup();
    door.position.set(-0.27, 1.37, 0.6 - 0.24);
    door.add(box(0.54, 0.84, 0.03, mat(color, { rough: 0.45, metal: 0.3 }), 0.27, 0, 0));
    door.add(box(0.04, 0.12, 0.04, mat('#e2e8f0', { metal: 0.8 }), 0.48, 0, -0.03));
    for (let i = 0; i < 3; i++) door.add(box(0.3, 0.02, 0.01, mat('#0f172a'), 0.27, 0.3 - i * 0.05, -0.02));
    g.add(door);
    let open = 0;
    return {
      group: g,
      seat: { x: 0, y: 0, z: 0 },
      footprint: { w: 0.6, d: 0.5, ox: 0, oz: 0.6 },
      exit: { x: 0, z: -0.4 },
      update(_p, active, dt) {
        open += ((active ? 1 : 0) - open) * (1 - Math.exp(-dt * 5));
        door.rotation.y = open * 1.7;
      },
    };
  },

  toilet() {
    const g = new THREE.Group();
    const white = mat('#ffffff', { rough: 0.25 });
    g.add(cyl(0.16, 0.12, 0.32, white, 0, 0.16, 0.02, 16));
    const seatRing = torus(0.16, 0.04, white, Math.PI * 2, 20);
    seatRing.rotation.x = -Math.PI / 2;
    seatRing.position.set(0, 0.36, 0.02);
    g.add(seatRing);
    g.add(box(0.42, 0.42, 0.18, white, 0, 0.55, -0.25));
    g.add(box(0.44, 0.04, 0.2, mat('#e2e8f0'), 0, 0.78, -0.25));
    g.add(box(0.08, 0.03, 0.04, mat('#cbd5e1', { metal: 0.8 }), 0.12, 0.81, -0.25));
    return {
      group: g,
      seat: { x: 0, y: seatY(0.4), z: 0.02 },
      footprint: { w: 0.45, d: 0.4, ox: 0, oz: -0.25 },
      exit: { x: 0, z: 0.75 },
      update() {},
    };
  },

  sink() {
    const g = new THREE.Group();
    const white = mat('#ffffff', { rough: 0.25 });
    g.add(box(0.7, 0.08, 0.45, mat('#cbd5e1', { rough: 0.3 }), 0, 0.82, 0.45));
    g.add(box(0.12, 0.8, 0.12, mat('#94a3b8'), 0, 0.4, 0.55));
    const basin = cyl(0.2, 0.14, 0.12, white, 0, 0.84, 0.42, 16);
    g.add(basin);
    g.add(bar([0, 0.86, 0.62], [0, 1.02, 0.62], 0.02, chrome()));
    g.add(bar([0, 1.02, 0.62], [0, 1.0, 0.5], 0.018, chrome()));
    // gương
    g.add(box(0.7, 0.75, 0.03, mat('#cfe8ff', { rough: 0.05, metal: 0.9 }), 0, 1.55, 0.66, { cast: false }));
    g.add(box(0.76, 0.81, 0.02, mat('#475569'), 0, 1.55, 0.675, { cast: false }));
    const water = cyl(0.012, 0.012, 0.14, mat('#7dd3fc', { transparent: true, opacity: 0.7, emissive: '#7dd3fc', emissiveIntensity: 0.3 }), 0, 0.93, 0.5, 6, { cast: false });
    water.userData.dynamic = true;
    water.visible = false;
    g.add(water);
    return {
      group: g,
      seat: { x: 0, y: 0, z: 0 },
      footprint: { w: 0.7, d: 0.45, ox: 0, oz: 0.48 },
      exit: { x: 0, z: -0.5 },
      update(_p, active) {
        water.visible = active;
      },
    };
  },
};

// Tủ locker 2 ngăn (dùng cho cả tủ trang trí)
export function buildLockerColumn(g, color = '#14b8a6', skipUpperDoor = false) {
  const body = mat('#334155', { rough: 0.6, metal: 0.3 });
  const doorMat = mat(color, { rough: 0.45, metal: 0.3 });
  const handle = mat('#e2e8f0', { metal: 0.8, rough: 0.3 });
  g.add(box(0.6, 1.9, 0.5, body, 0, 0.95, 0));
  g.add(box(0.54, 0.84, 0.03, doorMat, 0, 0.5, -0.255));
  g.add(box(0.04, 0.12, 0.04, handle, 0.21, 0.5, -0.28));
  if (!skipUpperDoor) {
    g.add(box(0.54, 0.84, 0.03, doorMat, 0, 1.37, -0.255));
    g.add(box(0.04, 0.12, 0.04, handle, 0.21, 1.37, -0.28));
  } else {
    // lòng tủ tối màu phía sau cửa mở
    g.add(box(0.5, 0.8, 0.01, mat('#0f172a'), 0, 1.37, -0.252));
    g.add(box(0.3, 0.06, 0.01, mat('#f97316'), 0, 1.2, -0.258));
  }
  return g;
}

export function buildEquipmentMesh(type, stat, opts) {
  const fn = builders[type];
  if (!fn) throw new Error(`Không có builder cho thiết bị: ${type}`);
  return fn(stat, opts);
}
