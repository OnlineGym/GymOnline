import { PAIR_EMOTES, CHALLENGES, BOXING_RING, activeEvents } from '../../../shared/constants.js';
import Character from '../models/Character.js';
import { Match } from '../models/social.js';
import { applyExp } from '../utils/progression.js';
import { award } from '../services/achievements.js';
import { bump } from '../services/quests.js';
import { broadcastAppearance } from './notify.js';

/**
 * Trọng tài cho mọi tương tác nhiều người trong 1 channel (server quyết định kết quả):
 *   invite → (accept) → countdown → live → ended
 *  - pair       : emote đôi (bắt tay, high-five, ôm, khiêu vũ đôi...)
 *  - armWrestle : vật tay – bấm nhanh kéo thanh lực
 *  - spar       : sparring boxing trong võ đài – đấm/đỡ/né, thanh máu giả lập
 *  - pushup/squat: đếm rep trong thời gian giới hạn
 *  - plank      : giữ lâu nhất
 *  - race, raceRow, raceBike : đua 2-8 người, tốc độ theo nhịp bấm
 * Xử lý: hết hạn lời mời, hủy, rớt mạng giữa chừng (xử thua/hủy hợp lệ).
 */
const INVITE_TTL = 20000;
const COUNTDOWN = 3000;
let seq = 1;

export class InteractionManager {
  constructor(channel) {
    this.ch = channel;
    this.list = new Map();
    this.lastBroadcast = 0;
  }

  emitTo(ix, event, data) {
    for (const nid of ix.members) {
      const p = this.ch.byNid.get(nid);
      p?.socket.emit(event, data);
    }
  }

  // ---------- Mời ----------
  invite(host, { kind, sub, targets }) {
    if (host.ix) return { ok: false, message: 'Bạn đang trong một tương tác khác' };
    const isPair = kind === 'pair';
    const def = isPair ? PAIR_EMOTES[sub] : CHALLENGES[kind];
    if (!def) return { ok: false, message: 'Loại tương tác không hợp lệ' };
    const max = isPair ? 2 : def.max;
    const ids = [...new Set((targets || []).map(String))].slice(0, max - 1);
    if (!ids.length) return { ok: false, message: 'Chưa chọn người chơi' };
    const invited = [];
    for (const uid of ids) {
      const t = this.ch.byUser.get(uid);
      if (!t || t === host) continue;
      if (t.blocked?.has(host.userId) || host.blocked?.has(uid)) continue;
      if (t.ix) continue;
      if (isPair && (t.f !== host.f || Math.hypot(t.x - host.x, t.z - host.z) > 6)) {
        return { ok: false, message: 'Hãy đứng gần người đó (≤ 6m) để dùng emote đôi' };
      }
      invited.push(t);
    }
    if (!invited.length) return { ok: false, message: 'Người chơi không ở cùng channel hoặc đang bận' };
    const ix = {
      id: `ix${seq++}`,
      kind,
      sub: isPair ? sub : kind,
      def,
      host: host.nid,
      members: new Set([host.nid]),
      invited: new Set(invited.map((t) => t.nid)),
      declined: new Set(),
      state: 'invite',
      createdAt: Date.now(),
      data: {},
    };
    this.list.set(ix.id, ix);
    host.ix = ix.id;
    const payload = {
      id: ix.id,
      kind,
      sub: ix.sub,
      label: def.label,
      icon: def.icon,
      from: { userId: host.userId, name: host.appearance.displayName, nid: host.nid },
      expires: ix.createdAt + INVITE_TTL,
      count: invited.length + 1,
    };
    for (const t of invited) t.socket.emit('ix:invite', payload);
    return { ok: true, id: ix.id };
  }

  respond(p, { id, accept }) {
    const ix = this.list.get(id);
    if (!ix || ix.state !== 'invite' || !ix.invited.has(p.nid)) return { ok: false, message: 'Lời mời đã hết hạn' };
    ix.invited.delete(p.nid);
    if (!accept || p.ix) {
      ix.declined.add(p.nid);
      this.ch.byNid.get(ix.host)?.socket.emit('ix:declined', { id, name: p.appearance.displayName });
    } else {
      ix.members.add(p.nid);
      p.ix = ix.id;
    }
    // Emote đôi / vật tay / sparring bắt đầu ngay khi đối phương đồng ý
    if (!ix.invited.size || ix.kind === 'pair' || ix.kind === 'armWrestle' || ix.kind === 'spar') {
      if (ix.members.size >= (ix.def.min || 2)) this.start(ix);
      else if (!ix.invited.size) this.cancel(ix, 'Không ai nhận lời');
    }
    return { ok: true };
  }

  cancel(ix, reason) {
    if (ix.state === 'ended') return;
    ix.state = 'ended';
    for (const nid of ix.invited) this.ch.byNid.get(nid)?.socket.emit('ix:cancel', { id: ix.id, reason });
    this.emitTo(ix, 'ix:cancel', { id: ix.id, reason });
    for (const nid of ix.members) {
      const p = this.ch.byNid.get(nid);
      if (p && p.ix === ix.id) p.ix = null;
    }
    this.list.delete(ix.id);
  }

  userCancel(p, id) {
    const ix = this.list.get(id);
    if (!ix || !ix.members.has(p.nid)) return;
    if (ix.state === 'invite' && ix.host === p.nid) this.cancel(ix, 'Người mời đã hủy');
    else if (ix.state !== 'ended') this.forfeit(ix, p, 'đã bỏ cuộc');
  }

  // ---------- Bắt đầu: xếp vị trí + đếm ngược ----------
  start(ix) {
    const now = Date.now();
    ix.state = ix.kind === 'pair' ? 'live' : 'countdown';
    ix.startAt = ix.kind === 'pair' ? now : now + COUNTDOWN;
    ix.endAt = ix.startAt + (ix.def.sec || 3) * 1000;
    const players = [...ix.members].map((nid) => this.ch.byNid.get(nid)).filter(Boolean);
    const placements = this.placements(ix, players);
    for (const pl of placements) {
      const p = pl.p;
      if (pl.f !== p.f) this.ch.setFloor(p, pl.f, pl.x, pl.z);
      p.x = pl.x;
      p.z = pl.z;
      p.ry = pl.ry;
      p.ver++;
      p.teleportUntil = now + 4000;
      this.ch.move(p);
      ix.data[p.nid] = { score: 0, hp: 100, holding: false, failedAt: 0, lastInput: 0, taps: [], dist: 0, blockUntil: 0, dodgeUntil: 0, cd: 0 };
    }
    const payload = {
      id: ix.id,
      kind: ix.kind,
      sub: ix.sub,
      label: ix.def.label,
      icon: ix.def.icon,
      startAt: ix.startAt,
      endAt: ix.endAt,
      serverNow: now,
      anim: ix.kind === 'pair' ? ix.def.anim : null,
      distance: ix.def.distance || 0,
      participants: placements.map((pl) => ({
        nid: pl.p.nid,
        userId: pl.p.userId,
        name: pl.p.appearance.displayName,
        f: pl.f,
        x: pl.x,
        z: pl.z,
        ry: pl.ry,
      })),
    };
    this.emitTo(ix, 'ix:start', payload);
  }

  placements(ix, players) {
    const [a, b] = players;
    if (ix.kind === 'spar') {
      const R = BOXING_RING;
      return [
        { p: a, f: R.f, x: R.x - 1.4, z: R.z, ry: Math.PI / 2 },
        { p: b, f: R.f, x: R.x + 1.4, z: R.z, ry: -Math.PI / 2 },
      ];
    }
    if (ix.kind === 'pair' || ix.kind === 'armWrestle') {
      // Đứng đối diện nhau quanh điểm giữa
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      let dx = b.x - a.x;
      let dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      const gap = ix.kind === 'armWrestle' ? 0.42 : ix.sub === 'hug' ? 0.32 : 0.45;
      return [
        { p: a, f: a.f, x: mx - dx * gap, z: mz - dz * gap, ry: Math.atan2(dx, dz) },
        { p: b, f: b.f, x: mx + dx * gap, z: mz + dz * gap, ry: Math.atan2(-dx, -dz) },
      ];
    }
    // Thi đấu nhóm: đứng thành hàng ngang cạnh chủ phòng
    const host = this.ch.byNid.get(ix.host) || a;
    const rx = Math.cos(host.ry);
    const rz = -Math.sin(host.ry);
    return players.map((p, i) => {
      const off = (i - (players.length - 1) / 2) * 1.3;
      return { p, f: host.f, x: host.x + rx * off, z: host.z + rz * off, ry: host.ry };
    });
  }

  // ---------- Input từ người chơi ----------
  input(p, { id, a }) {
    const ix = this.list.get(id);
    if (!ix || ix.state !== 'live' || !ix.members.has(p.nid)) return;
    const d = ix.data[p.nid];
    const now = Date.now();
    switch (ix.kind) {
      case 'armWrestle':
        if (a !== 'tap' || now - d.lastInput < 60) return; // tối đa ~16 lần/giây
        d.lastInput = now;
        d.score++;
        break;
      case 'pushup':
      case 'squat':
        if (a !== 'rep' || now - d.lastInput < 450) return;
        d.lastInput = now;
        d.score++;
        this.emitTo(ix, 'ix:update', { id, scores: this.scores(ix) });
        break;
      case 'plank':
        if (a === 'hold' && !d.failedAt && !d.holding) {
          d.holding = true;
          d.holdStart = now;
        } else if (a === 'release' && d.holding) {
          d.holding = false;
          d.failedAt = now;
          d.score = Math.round((now - d.holdStart) / 100) / 10;
          this.emitTo(ix, 'ix:update', { id, scores: this.scores(ix), failed: p.nid });
        }
        break;
      case 'race':
      case 'raceRow':
      case 'raceBike':
        if (a !== 'tap' || now - d.lastInput < 70) return;
        d.lastInput = now;
        d.taps.push(now);
        break;
      case 'spar':
        this.sparAction(ix, p, d, a, now);
        break;
      default:
        break;
    }
  }

  sparAction(ix, p, d, a, now) {
    if (now < d.cd) return;
    const otherNid = [...ix.members].find((n) => n !== p.nid);
    const od = ix.data[otherNid];
    if (!od) return;
    let result = null;
    if (a === 'punch') {
      d.cd = now + 450;
      if (od.dodgeUntil > now) result = 'dodge';
      else if (od.blockUntil > now) {
        od.hp -= 2;
        result = 'block';
      } else {
        const dmg = 7 + Math.floor(Math.random() * 6);
        od.hp -= dmg;
        d.score += dmg;
        result = 'hit';
      }
    } else if (a === 'block') {
      d.blockUntil = now + 700;
      d.cd = now + 250;
      result = 'guard';
    } else if (a === 'dodge') {
      d.dodgeUntil = now + 450;
      d.cd = now + 1100;
      result = 'dodge_move';
    } else return;
    od.hp = Math.max(0, od.hp);
    this.emitTo(ix, 'ix:update', { id: ix.id, actor: p.nid, action: a, result, hp: this.hpMap(ix) });
    if (od.hp <= 0) this.finish(ix);
  }

  hpMap(ix) {
    return Object.fromEntries([...ix.members].map((nid) => [nid, ix.data[nid]?.hp ?? 0]));
  }

  scores(ix) {
    return Object.fromEntries([...ix.members].map((nid) => [nid, ix.data[nid]?.score ?? 0]));
  }

  // ---------- Tick ----------
  tick(now) {
    if (!this.list.size) return;
    const broadcast = now - this.lastBroadcast > 100;
    if (broadcast) this.lastBroadcast = now;
    for (const ix of this.list.values()) {
      if (ix.state === 'invite') {
        if (now - ix.createdAt > INVITE_TTL) {
          if (ix.kind !== 'pair' && ix.members.size >= (ix.def.min || 2)) this.start(ix);
          else this.cancel(ix, 'Lời mời đã hết hạn');
        }
        continue;
      }
      if (ix.state === 'countdown' && now >= ix.startAt) {
        ix.state = 'live';
        this.emitTo(ix, 'ix:live', { id: ix.id });
      }
      if (ix.state !== 'live') continue;
      if (ix.kind === 'pair') {
        if (now >= ix.endAt) this.finish(ix);
        continue;
      }
      if (ix.kind === 'armWrestle') {
        const [a, b] = [...ix.members];
        const pos = (ix.data[a]?.score || 0) - (ix.data[b]?.score || 0);
        if (broadcast) this.emitTo(ix, 'ix:update', { id: ix.id, pos, order: [a, b] });
        if (Math.abs(pos) >= 40) return this.finish(ix);
      }
      if (ix.def.distance) {
        const dt = 0.1;
        if (broadcast) {
          for (const nid of ix.members) {
            const d = ix.data[nid];
            d.taps = d.taps.filter((t) => now - t < 1000);
            const speed = 2.5 + Math.min(d.taps.length, 9) * 0.75; // m/s
            d.dist = Math.min(ix.def.distance, d.dist + speed * dt);
            d.score = Math.round(d.dist);
            if (d.dist >= ix.def.distance && !d.doneAt) d.doneAt = now;
          }
          this.emitTo(ix, 'ix:update', { id: ix.id, dist: this.scores(ix) });
          if ([...ix.members].some((n) => ix.data[n].doneAt)) return this.finish(ix);
        }
      }
      if (ix.kind === 'plank') {
        const active = [...ix.members].filter((n) => !ix.data[n].failedAt);
        if (!active.length) return this.finish(ix);
      }
      if (now >= ix.endAt) this.finish(ix);
    }
  }

  // Người chơi rời đi / bỏ cuộc giữa chừng
  onLeave(p) {
    for (const ix of this.list.values()) {
      if (ix.invited.has(p.nid)) ix.invited.delete(p.nid);
      if (!ix.members.has(p.nid)) continue;
      if (ix.state === 'invite') {
        if (ix.host === p.nid) this.cancel(ix, 'Người mời đã rời đi');
        else ix.members.delete(p.nid);
      } else this.forfeit(ix, p, 'mất kết nối');
    }
  }

  forfeit(ix, p, why) {
    ix.forfeits = ix.forfeits || new Set();
    ix.forfeits.add(p.nid);
    const d = ix.data[p.nid];
    if (d) {
      d.hp = 0;
      d.score = -1;
    }
    if (p.ix === ix.id) p.ix = null;
    this.emitTo(ix, 'ix:update', { id: ix.id, note: `${p.appearance.displayName} ${why}` });
    const remaining = [...ix.members].filter((n) => !ix.forfeits.has(n) && this.ch.byNid.has(n));
    if (ix.kind === 'pair' || remaining.length < 2 || ix.kind === 'armWrestle' || ix.kind === 'spar') this.finish(ix);
  }

  // ---------- Kết thúc + trao thưởng ----------
  async finish(ix) {
    if (ix.state === 'ended') return;
    ix.state = 'ended';
    this.list.delete(ix.id);
    const members = [...ix.members];
    for (const nid of members) {
      const p = this.ch.byNid.get(nid);
      if (p && p.ix === ix.id) p.ix = null;
    }
    if (ix.kind === 'pair') {
      this.emitTo(ix, 'ix:end', { id: ix.id, kind: 'pair', results: [] });
      return;
    }
    const now = Date.now();
    // Điểm cuối: plank người còn giữ được tính tới hiện tại
    for (const nid of members) {
      const d = ix.data[nid];
      if (!d) continue;
      if (ix.kind === 'plank' && d.holding && !d.failedAt) d.score = Math.round((now - d.holdStart) / 100) / 10;
      if (ix.kind === 'spar') d.score = d.hp;
      if (ix.def.distance && d.doneAt) d.score = ix.def.distance + (ix.endAt - d.doneAt) / 1000;
      if (ix.forfeits?.has(nid)) d.score = -1;
    }
    const ranked = members
      .map((nid) => ({ nid, p: this.ch.byNid.get(nid), score: ix.data[nid]?.score ?? -1 }))
      .sort((x, y) => y.score - x.score);
    const tie = ranked.length > 1 && ranked[0].score === ranked[1].score;
    const mult = activeEvents().some((e) => e.challengeMult) ? 2 : 1;
    const results = [];
    for (let i = 0; i < ranked.length; i++) {
      const r = ranked[i];
      const win = i === 0 && !tie && r.score >= 0;
      const coins = (win ? ix.def.coins : 10) * mult;
      const exp = (win ? ix.def.exp : 8) * mult;
      results.push({ nid: r.nid, userId: r.p?.userId, name: r.p?.appearance.displayName || '???', score: r.score, rank: i + 1, win, coins, exp });
    }
    this.emitTo(ix, 'ix:end', { id: ix.id, kind: ix.kind, label: ix.def.label, results, tie });
    // Lưu kết quả + phát thưởng (bỏ qua bot load test)
    const real = results.filter((r) => r.userId && !this.ch.byUser.get(r.userId)?.bot);
    try {
      for (const r of real) {
        const c = await Character.findOne({ userId: r.userId });
        if (!c) continue;
        c.coins += r.coins;
        const up = applyExp(c, r.exp);
        if (r.win) c.wins = (c.wins || 0) + 1;
        await c.save();
        if (up) broadcastAppearance(r.userId, c.appearance());
        this.ch.byUser.get(r.userId)?.socket.emit('character', c.toPublic());
        bump(r.userId, 'challenge', 1);
        if (r.win) {
          bump(r.userId, 'win', 1);
          await award(r.userId, 'challenge_win');
          if (ix.kind === 'spar') await award(r.userId, 'spar_win');
        }
      }
      if (real.length) {
        await Match.create({
          kind: ix.kind,
          channel: this.ch.id,
          participants: results.filter((r) => r.userId).map((r) => ({ userId: r.userId, displayName: r.name, score: r.score, rank: r.rank })),
          winner: results.find((r) => r.win)?.userId || null,
          durationSec: Math.round((now - ix.startAt) / 1000),
        });
      }
    } catch (e) {
      console.error('[ix] Lỗi lưu kết quả', e.message);
    }
  }
}
