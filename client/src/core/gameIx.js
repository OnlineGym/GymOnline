import { toast } from '../ui/dom.js';
import { notify } from '../ui/notifications.js';
import { PAIR_EMOTES, CHALLENGES, BOXING_RING } from '@shared/constants.js';
import { audio } from './audio.js';

/**
 * Phía client của tương tác nhiều người. Server làm trọng tài; client:
 *  - gửi lời mời / trả lời / input
 *  - xếp nhân vật vào vị trí server chỉ định, chạy animation tương ứng
 *  - hiển thị lớp phủ thách đấu (ChallengeUI)
 */
export class IxController {
  constructor(game) {
    this.g = game;
    this.active = null; // payload ix:start đang diễn ra
    this.pulse = 0; // xung animation khi bấm rep
    this.lean = 0;
    this.actionAnim = null;
    this.actionTimer = 0;
    const n = game.net;
    n.on('ix:invite', (d) => this.onInvite(d));
    n.on('ix:start', (d) => this.onStart(d));
    n.on('ix:live', () => {});
    n.on('ix:update', (d) => this.onUpdate(d));
    n.on('ix:end', (d) => this.onEnd(d));
    n.on('ix:cancel', (d) => this.onCancel(d));
    n.on('ix:declined', (d) => toast(`${d.name} đã từ chối lời mời`, 'error'));
  }

  // ---------- Gửi lời mời ----------
  async invite(kind, sub, targets, label) {
    if (this.g.mode !== 'free') return toast('Hãy dừng hoạt động hiện tại trước', 'error');
    const res = await this.g.net.request('ix:invite', { kind, sub, targets });
    if (!res?.ok) return toast(res?.message || 'Không gửi được lời mời', 'error');
    if (kind === 'pair') toast(`Đã mời ${label}. Chờ đối phương đồng ý...`, 'info');
    else this.g.challengeUI.waiting(res.id, CHALLENGES[kind]?.label || label);
    this.pendingId = res.id;
  }

  onInvite(d) {
    if (this.g.blocked.has(d.from.userId)) return this.g.net.request('ix:respond', { id: d.id, accept: false });
    const isPair = d.kind === 'pair';
    notify({
      icon: d.icon,
      title: isPair ? `${d.from.name} muốn ${d.label.toLowerCase()} với bạn` : `${d.from.name} thách đấu: ${d.label}`,
      text: isPair ? 'Hai bạn sẽ đứng đối diện nhau' : d.count > 2 ? `${d.count} người tham gia` : 'Server làm trọng tài, thắng nhận xu + EXP',
      timeout: Math.max(3000, d.expires - this.g.net.serverNow()),
      actions: [
        {
          label: 'Đồng ý',
          primary: true,
          fn: async () => {
            if (this.g.mode !== 'free') this.g.stopActivity();
            const r = await this.g.net.request('ix:respond', { id: d.id, accept: true });
            if (!r?.ok) toast(r?.message || 'Lời mời đã hết hạn', 'error');
          },
        },
        { label: 'Từ chối', fn: () => this.g.net.request('ix:respond', { id: d.id, accept: false }) },
      ],
    });
  }

  // ---------- Bắt đầu ----------
  async onStart(d) {
    const g = this.g;
    const me = d.participants.find((p) => p.nid === g.net.nid);
    if (!me) return;
    if (g.mode !== 'free' && g.mode !== 'ix') await g.stopActivity();
    this.active = d;
    this.pendingId = null;
    if (me.f !== g.floorId) await g.enterFloor(me.f, { x: me.x, z: me.z }, `Tới ${d.label}...`);
    g.mode = 'ix';
    g.pos.x = me.x;
    g.pos.z = me.z;
    g.ry = me.ry;
    g.vel.x = g.vel.z = 0;
    g.jumpY = 0;
    const inRing = d.kind === 'spar' && Math.abs(me.x - BOXING_RING.x) < 4 && Math.abs(me.z - BOXING_RING.z) < 4;
    g.me.root.position.y = inRing ? 0.62 : 0;
    g.me.root.rotation.y = me.ry;
    const anim = { pair: d.anim, armWrestle: 'armWrestle', spar: 'sparIdle', pushup: 'pushup', squat: 'squat', plank: 'plank', race: 'run', raceRow: 'rowing', raceBike: 'bike' }[d.kind] || 'idle';
    this.baseAnim = anim;
    g.me.stopEmote();
    g.me.play(anim);
    if (d.kind === 'pair') {
      const em = PAIR_EMOTES[d.sub];
      g.me.flashIcon(em.icon);
      for (const p of d.participants) if (p.nid !== g.net.nid) g.remotes.get(p.nid)?.char.flashIcon(em.icon);
      audio.sfx('emote');
    }
    this.lean = 0;
    this.pulse = 0;
    this.holding = false;
    g.challengeUI.start(d, g.net.nid);
  }

  // ---------- Input người chơi ----------
  input(a) {
    const d = this.active;
    if (!d || d.kind === 'pair') return;
    if (d.kind === 'spar') {
      this.g.net.volatile('ix:input', { id: d.id, a });
      this.playAction(a === 'punch' ? 'sparPunch' : a === 'block' ? 'sparBlock' : 'sparDodge', a === 'block' ? 0.6 : 0.35);
      return;
    }
    if (a === 'hold' || a === 'release') {
      if (d.kind !== 'plank') return;
      this.holding = a === 'hold';
      this.g.net.emit('ix:input', { id: d.id, a });
      return;
    }
    const act = d.kind === 'pushup' || d.kind === 'squat' ? 'rep' : 'tap';
    this.g.net.volatile('ix:input', { id: d.id, a: act });
    this.pulse = 1;
  }

  onSpace(down) {
    const d = this.active;
    if (!d) return;
    if (d.kind === 'plank') this.input(down ? 'hold' : 'release');
    else if (down) this.input(d.kind === 'spar' ? 'punch' : 'tap');
  }

  playAction(anim, sec) {
    this.actionAnim = anim;
    this.actionTimer = sec;
    this.g.me.play(anim);
  }

  onUpdate(d) {
    if (!this.active || d.id !== this.active.id) return;
    this.g.challengeUI.update(d);
    const g = this.g;
    if (d.pos !== undefined && d.order) this.lean = Math.max(-1, Math.min(1, (d.order[0] === g.net.nid ? d.pos : -d.pos) / 40));
    if (d.action && d.result === 'hit') {
      const target = this.active.participants.find((p) => p.nid !== d.actor);
      if (target?.nid === g.net.nid) this.playAction('sparHit', 0.4);
      else g.remotes.get(target?.nid)?.char.flashIcon('💥');
    }
    if (d.hp && d.hp[g.net.nid] === 0) this.playAction('sparKO', 10);
  }

  onEnd(d) {
    const g = this.g;
    g.challengeUI.end(d);
    if (this.active?.id === d.id) this.finish();
    const mine = d.results?.find((r) => r.nid === g.net.nid);
    if (mine?.win) {
      g.me.playEmote('cheer');
      g.burst.spawn(g.pos, '#facc15');
    }
  }

  onCancel(d) {
    if (this.pendingId === d.id || this.active?.id === d.id) {
      this.g.challengeUI.cancel(d.reason);
      this.pendingId = null;
      if (this.active?.id === d.id) this.finish();
    }
  }

  cancel(id) {
    this.g.net.emit('ix:cancel', { id });
    if (this.pendingId === id) {
      this.pendingId = null;
      this.g.challengeUI.hide();
    }
  }

  finish() {
    const g = this.g;
    this.active = null;
    this.actionAnim = null;
    if (g.mode === 'ix') g.mode = 'free';
    g.me.root.position.y = 0;
    g.me.play('idle');
  }

  // Gọi mỗi frame: ctx animation cho nhân vật local
  update(dt) {
    if (!this.active) return {};
    this.pulse = Math.max(0, this.pulse - dt * 3);
    if (this.actionAnim) {
      this.actionTimer -= dt;
      if (this.actionTimer <= 0 && this.actionAnim !== 'sparKO') {
        this.actionAnim = null;
        this.g.me.play(this.baseAnim);
      }
    }
    const d = this.active;
    if (d.kind === 'pair' && this.g.net.serverNow() > d.endAt + 500) this.finish();
    return { p: this.pulse, lean: this.lean };
  }
}
