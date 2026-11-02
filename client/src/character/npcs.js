import { Character } from './Character.js';

/**
 * NPC của 1 tầng: lễ tân, huấn luyện viên lớp nhóm, cứu hộ, sư phụ thiền...
 * Hành vi đơn giản: chào + nói khi người chơi lại gần (mỗi 40 giây / người chơi).
 */
export class NPCs {
  constructor(parent, defs) {
    this.list = defs.map((d) => {
      const c = new Character({ ...d.app, level: 99 });
      c.root.position.set(...d.pos);
      c.root.rotation.y = d.ry;
      c.play(d.anim);
      c.nameEl.classList.add('npc');
      c.setName(`🤖 ${d.name}`, 99);
      parent.add(c.root);
      return { def: d, char: c, lastGreet: -100 };
    });
  }

  update(dt, t, ctx, playerPos) {
    for (const n of this.list) {
      const d = n.def;
      if (playerPos) {
        const dist = Math.hypot(playerPos.x - d.pos[0], playerPos.z - d.pos[2]);
        if (dist < d.greet.radius && t - n.lastGreet > 40) {
          n.lastGreet = t;
          if (d.anim === 'idle' || d.anim === 'sit') n.char.playEmote(d.greet.emote);
          n.char.say(d.greet.text);
        }
        n.char.setLabelVisibility(dist < 16, dist < 22);
      }
      n.char.update(dt, ctx);
    }
  }

  positions() {
    return this.list.map((n) => n.char.root.position);
  }
}
