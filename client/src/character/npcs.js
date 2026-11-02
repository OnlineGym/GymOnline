import { Character } from './Character.js';

/**
 * NPC trang trí: lễ tân, huấn luyện viên aerobic, sư phụ thiền (chú tiểu tròn tròn).
 * Có hành vi đơn giản: chào khi người chơi lại gần.
 */
const NPC_DEFS = [
  {
    name: 'Lễ tân Mai',
    pos: [-6.1, 0, 14],
    ry: Math.PI / 2,
    anim: 'idle',
    greet: { emote: 'wave', text: 'Chào mừng đến Gym Online! Lại gần máy và bấm E để tập nhé 💪', radius: 4 },
    app: {
      displayName: 'Lễ tân Mai',
      gender: 'female',
      skinColor: '#f8d3b0',
      hair: { style: 'ponytail', color: '#3b2a20' },
      outfit: { style: 'tshirt', top: '#22d3ee', bottom: '#0f172a', shoes: '#ffffff' },
      level: 99,
    },
  },
  {
    name: 'HLV Aerobic',
    pos: [-15, 0.25, -22.6],
    ry: 0,
    anim: 'aerobic',
    greet: { emote: 'cheer', text: 'Vào nhảy cùng mình nào! Đứng lên vòng sáng hồng và bấm E 💃', radius: 5 },
    app: {
      displayName: 'HLV Aerobic',
      gender: 'female',
      skinColor: '#e8b48a',
      hair: { style: 'twintails', color: '#e85d75' },
      outfit: { style: 'tank', top: '#f472b6', bottom: '#8b5cf6', shoes: '#f8fafc' },
      level: 99,
    },
  },
  {
    name: 'Sư phụ Gym',
    pos: [6.8, -0.2, -12.4],
    ry: Math.PI,
    anim: 'meditate',
    greet: { emote: 'bow', text: 'Tâm tĩnh thì cơ mới to 🙏', radius: 3.5 },
    app: {
      displayName: 'Sư phụ Gym',
      gender: 'male',
      skinColor: '#f5c9a0',
      hair: { style: 'bald', color: '#3b2a20' },
      outfit: { style: 'robe', top: '#7c8fa6', bottom: '#7c8fa6', shoes: '#5b6b80' },
      level: 99,
    },
  },
];

export class NPCs {
  constructor(scene) {
    this.list = NPC_DEFS.map((d) => {
      const c = new Character(d.app);
      c.root.position.set(...d.pos);
      c.root.rotation.y = d.ry;
      c.play(d.anim);
      c.nameEl.classList.add('npc');
      c.setName(`🤖 ${d.name}`, 99);
      scene.add(c.root);
      return { def: d, char: c, lastGreet: -100 };
    });
  }

  update(dt, t, ctx, playerPos) {
    for (const n of this.list) {
      const d = n.def;
      const dist = Math.hypot(playerPos.x - d.pos[0], playerPos.z - d.pos[2]);
      if (dist < d.greet.radius && t - n.lastGreet > 40) {
        n.lastGreet = t;
        if (d.anim === 'idle') n.char.playEmote(d.greet.emote);
        n.char.say(d.greet.text);
      }
      n.char.update(dt, ctx);
    }
  }

  positions() {
    return this.list.map((n) => n.char.root.position);
  }
}
