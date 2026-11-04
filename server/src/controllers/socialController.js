import mongoose from 'mongoose';
import User from '../models/User.js';
import Character from '../models/Character.js';
import WorkoutLog from '../models/WorkoutLog.js';
import ChatMessage from '../models/ChatMessage.js';
import { Friendship, Party, Guild, Report, Match } from '../models/social.js';
import { HttpError, asyncHandler } from '../middleware/errorHandler.js';
import { notifyUser, notifyRoom, userJoin, userLeave, getManager } from '../realtime/notify.js';
import { getPresence } from '../services/presence.js';
import { award, listFor } from '../services/achievements.js';
import { remember, invalidate } from '../services/cache.js';
import { filterProfanity } from '../utils/profanity.js';
import { ACHIEVEMENTS, PARTY_MAX, PARTY_DAILY_GOAL, GUILD_MAX, GUILD_COST } from '../../../shared/constants.js';

const oid = (v) => {
  if (!mongoose.isValidObjectId(String(v || ''))) throw new HttpError(400, 'ID người chơi không hợp lệ');
  return new mongoose.Types.ObjectId(String(v));
};
const me = (req) => new mongoose.Types.ObjectId(String(req.userId));
const livePlayer = (userId) => getManager()?.findUser(String(userId))?.player || null;

async function charactersOf(ids) {
  const docs = await Character.find({ userId: { $in: ids } }).select('userId displayName level stats totalWorkouts guildId gender skinColor hair outfit accessory').lean();
  return new Map(docs.map((c) => [String(c.userId), c]));
}

async function relation(a, b) {
  return Friendship.findOne({
    $or: [
      { requester: a, recipient: b },
      { requester: b, recipient: a },
    ],
  });
}

// ===================== BẠN BÈ =====================
export const listFriends = asyncHandler(async (req, res) => {
  const uid = me(req);
  const rels = await Friendship.find({ $or: [{ requester: uid }, { recipient: uid }], status: { $in: ['accepted', 'pending'] } }).lean();
  const otherIds = rels.map((r) => (String(r.requester) === String(uid) ? r.recipient : r.requester));
  const [chars, presence] = await Promise.all([charactersOf(otherIds), getPresence(otherIds)]);
  const friends = [];
  const incoming = [];
  const outgoing = [];
  for (const r of rels) {
    const other = String(r.requester) === String(uid) ? String(r.recipient) : String(r.requester);
    const c = chars.get(other);
    const item = { userId: other, name: c?.displayName || '???', level: c?.level || 1, since: r.updatedAt };
    if (r.status === 'accepted') friends.push({ ...item, online: !!presence[other], presence: presence[other] || null });
    else if (String(r.recipient) === String(uid)) incoming.push(item);
    else outgoing.push(item);
  }
  friends.sort((x, y) => Number(y.online) - Number(x.online) || x.name.localeCompare(y.name));
  res.json({ friends, incoming, outgoing });
});

export const requestFriend = asyncHandler(async (req, res) => {
  const uid = me(req);
  let target;
  if (req.body.userId) target = oid(req.body.userId);
  else if (req.body.name) {
    const name = String(req.body.name).trim();
    const c = await Character.findOne({ displayName: name }).select('userId').lean();
    const u = c ? null : await User.findOne({ username: name }).select('_id').lean();
    target = c?.userId || u?._id;
    if (!target) throw new HttpError(404, 'Không tìm thấy người chơi');
  } else throw new HttpError(400, 'Thiếu người nhận');
  if (String(target) === String(uid)) throw new HttpError(400, 'Không thể kết bạn với chính mình');
  if (!(await Character.exists({ userId: target }))) throw new HttpError(404, 'Không tìm thấy người chơi');

  const rel = await relation(uid, target);
  if (rel?.status === 'blocked') throw new HttpError(403, 'Không thể kết bạn với người này');
  if (rel?.status === 'accepted') throw new HttpError(409, 'Hai bạn đã là bạn bè');
  const myChar = await Character.findOne({ userId: uid }).select('displayName').lean();
  if (rel?.status === 'pending') {
    if (String(rel.requester) === String(target)) {
      // Họ đã mời mình trước -> chấp nhận luôn
      rel.status = 'accepted';
      await rel.save();
      await Promise.all([award(uid, 'first_friend'), award(target, 'first_friend')]);
      notifyUser(target, 'notify', { kind: 'friend_accepted', from: { userId: String(uid), name: myChar?.displayName } });
      return res.json({ status: 'accepted' });
    }
    throw new HttpError(409, 'Đã gửi lời mời trước đó');
  }
  await Friendship.create({ requester: uid, recipient: target, status: 'pending' });
  notifyUser(target, 'notify', { kind: 'friend_request', from: { userId: String(uid), name: myChar?.displayName } });
  res.status(201).json({ status: 'pending' });
});

export const acceptFriend = asyncHandler(async (req, res) => {
  const uid = me(req);
  const other = oid(req.params.userId);
  const rel = await Friendship.findOne({ requester: other, recipient: uid, status: 'pending' });
  if (!rel) throw new HttpError(404, 'Không có lời mời kết bạn');
  rel.status = 'accepted';
  await rel.save();
  await Promise.all([award(uid, 'first_friend'), award(other, 'first_friend')]);
  const c = await Character.findOne({ userId: uid }).select('displayName').lean();
  notifyUser(other, 'notify', { kind: 'friend_accepted', from: { userId: String(uid), name: c?.displayName } });
  res.json({ status: 'accepted' });
});

export const removeFriend = asyncHandler(async (req, res) => {
  const uid = me(req);
  const other = oid(req.params.userId);
  await Friendship.deleteOne({
    status: { $in: ['pending', 'accepted'] },
    $or: [
      { requester: uid, recipient: other },
      { requester: other, recipient: uid },
    ],
  });
  res.json({ ok: true });
});

export const blockUser = asyncHandler(async (req, res) => {
  const uid = me(req);
  const other = oid(req.body.userId);
  if (String(other) === String(uid)) throw new HttpError(400, 'Không thể tự chặn mình');
  await Friendship.deleteOne({ requester: other, recipient: uid, status: { $ne: 'blocked' } });
  await Friendship.findOneAndUpdate({ requester: uid, recipient: other }, { status: 'blocked' }, { upsert: true });
  // Cập nhật realtime cho cả 2 phía (nếu đang online trên instance này)
  livePlayer(uid)?.blocked.add(String(other));
  livePlayer(other)?.blockedBy.add(String(uid));
  res.json({ ok: true });
});

export const unblockUser = asyncHandler(async (req, res) => {
  const uid = me(req);
  const other = oid(req.params.userId);
  await Friendship.deleteOne({ requester: uid, recipient: other, status: 'blocked' });
  livePlayer(uid)?.blocked.delete(String(other));
  livePlayer(other)?.blockedBy.delete(String(uid));
  res.json({ ok: true });
});

export const listBlocked = asyncHandler(async (req, res) => {
  const rels = await Friendship.find({ requester: me(req), status: 'blocked' }).lean();
  const chars = await charactersOf(rels.map((r) => r.recipient));
  res.json({ blocked: rels.map((r) => ({ userId: String(r.recipient), name: chars.get(String(r.recipient))?.displayName || '???' })) });
});

// ===================== HỒ SƠ CÔNG KHAI =====================
export const getPlayer = asyncHandler(async (req, res) => {
  const target = oid(req.params.userId);
  const c = await Character.findOne({ userId: target });
  if (!c) throw new HttpError(404, 'Không tìm thấy người chơi');
  const [badges, guild, rel, pres, matches] = await Promise.all([
    listFor(target),
    c.guildId ? Guild.findById(c.guildId).select('name tag color').lean() : null,
    relation(me(req), target),
    getPresence([target]),
    Match.countDocuments({ 'participants.userId': target }),
  ]);
  let friendStatus = 'none';
  if (rel) {
    if (rel.status === 'accepted') friendStatus = 'friends';
    else if (rel.status === 'blocked') friendStatus = String(rel.requester) === String(req.userId) ? 'blocked' : 'none';
    else friendStatus = String(rel.requester) === String(req.userId) ? 'outgoing' : 'incoming';
  }
  const pub = c.toPublic();
  res.json({
    player: {
      userId: String(target),
      appearance: c.appearance(),
      level: pub.level,
      exp: pub.exp,
      stats: pub.stats,
      totalWorkouts: pub.totalWorkouts,
      totalCalories: pub.totalCalories,
      trackLaps: pub.trackLaps,
      wins: pub.wins,
      matches,
      guild: guild ? { id: String(guild._id), name: guild.name, tag: guild.tag, color: guild.color } : null,
      badges,
      online: !!pres[String(target)],
      presence: friendStatus === 'friends' ? pres[String(target)] || null : null,
      friendStatus,
      joinedAt: c.createdAt,
    },
  });
});

export const searchPlayers = asyncHandler(async (req, res) => {
  const qs = String(req.query.q || '').trim().slice(0, 16);
  if (qs.length < 2) return res.json({ players: [] });
  const esc = qs.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const docs = await Character.find({ displayName: { $regex: `^${esc}`, $options: 'i' } }).limit(10).select('userId displayName level').lean();
  res.json({ players: docs.map((d) => ({ userId: String(d.userId), name: d.displayName, level: d.level })) });
});

// ===================== PARTY =====================
export async function partyProgress(partyId) {
  return remember(`party:${partyId}`, 10, async () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const [agg] = await WorkoutLog.aggregate([
      { $match: { partyId: String(partyId), createdAt: { $gte: start } } },
      { $group: { _id: null, calories: { $sum: '$caloriesBurned' }, sessions: { $sum: 1 } } },
    ]);
    return { partyId: String(partyId), calories: Math.round(agg?.calories || 0), sessions: agg?.sessions || 0, goal: PARTY_DAILY_GOAL };
  });
}

async function partyView(party) {
  if (!party) return null;
  const ids = party.members.map(String);
  const [chars, pres, progress] = await Promise.all([charactersOf(party.members), getPresence(ids), partyProgress(party._id)]);
  return {
    id: String(party._id),
    leader: String(party.leader),
    members: ids.map((id) => ({
      userId: id,
      name: chars.get(id)?.displayName || '???',
      level: chars.get(id)?.level || 1,
      online: !!pres[id],
      presence: pres[id] || null,
    })),
    progress,
  };
}

function setLiveParty(userId, partyId) {
  const p = livePlayer(userId);
  if (p) {
    p.party = partyId;
    p.infoVer++;
  }
}

async function broadcastParty(partyId) {
  const party = await Party.findById(partyId).lean();
  notifyRoom(`party:${partyId}`, 'party:update', await partyView(party));
}

export const getParty = asyncHandler(async (req, res) => {
  const party = await Party.findOne({ members: me(req) }).lean();
  res.json({ party: await partyView(party) });
});

export const createParty = asyncHandler(async (req, res) => {
  const uid = me(req);
  if (await Party.exists({ members: uid })) throw new HttpError(409, 'Bạn đã ở trong một party');
  const party = await Party.create({ leader: uid, members: [uid], dailyGoal: PARTY_DAILY_GOAL });
  userJoin(uid, `party:${party._id}`);
  setLiveParty(uid, String(party._id));
  res.status(201).json({ party: await partyView(party.toObject()) });
});

export const inviteParty = asyncHandler(async (req, res) => {
  const uid = me(req);
  const target = oid(req.body.userId);
  let party = await Party.findOne({ members: uid });
  if (!party) {
    party = await Party.create({ leader: uid, members: [uid], dailyGoal: PARTY_DAILY_GOAL });
    userJoin(uid, `party:${party._id}`);
    setLiveParty(uid, String(party._id));
  }
  if (party.members.length >= PARTY_MAX) throw new HttpError(400, `Party tối đa ${PARTY_MAX} người`);
  if (party.members.some((m) => String(m) === String(target))) throw new HttpError(409, 'Người này đã ở trong party');
  if (await Party.exists({ members: target })) throw new HttpError(409, 'Người này đang ở party khác');
  const rel = await relation(uid, target);
  if (rel?.status === 'blocked') throw new HttpError(403, 'Không thể mời người này');
  party.invites = party.invites.filter((i) => String(i.userId) !== String(target) && Date.now() - i.at < 600000);
  party.invites.push({ userId: target, at: new Date() });
  await party.save();
  const c = await Character.findOne({ userId: uid }).select('displayName').lean();
  notifyUser(target, 'notify', { kind: 'party_invite', partyId: String(party._id), from: { userId: String(uid), name: c?.displayName } });
  res.json({ party: await partyView(party.toObject()) });
});

export const joinParty = asyncHandler(async (req, res) => {
  const uid = me(req);
  const partyId = oid(req.body.partyId);
  if (await Party.exists({ members: uid })) throw new HttpError(409, 'Hãy rời party hiện tại trước');
  const party = await Party.findOneAndUpdate(
    {
      _id: partyId,
      'invites.userId': uid,
      [`members.${PARTY_MAX - 1}`]: { $exists: false },
    },
    { $addToSet: { members: uid }, $pull: { invites: { userId: uid } } },
    { new: true }
  );
  if (!party) throw new HttpError(404, 'Lời mời không còn hiệu lực hoặc party đã đủ người');
  userJoin(uid, `party:${party._id}`);
  setLiveParty(uid, String(party._id));
  await broadcastParty(party._id);
  res.json({ party: await partyView(party.toObject()) });
});

export const leaveParty = asyncHandler(async (req, res) => {
  const uid = me(req);
  const party = await Party.findOne({ members: uid });
  if (!party) return res.json({ ok: true });
  party.members = party.members.filter((m) => String(m) !== String(uid));
  userLeave(uid, `party:${party._id}`);
  setLiveParty(uid, null);
  if (!party.members.length) await party.deleteOne();
  else {
    if (String(party.leader) === String(uid)) party.leader = party.members[0];
    await party.save();
    await broadcastParty(party._id);
  }
  res.json({ ok: true });
});

export const kickParty = asyncHandler(async (req, res) => {
  const uid = me(req);
  const target = oid(req.body.userId);
  const party = await Party.findOne({ leader: uid });
  if (!party) throw new HttpError(403, 'Chỉ trưởng nhóm mới được mời ra');
  party.members = party.members.filter((m) => String(m) !== String(target));
  await party.save();
  userLeave(target, `party:${party._id}`);
  setLiveParty(target, null);
  notifyUser(target, 'notify', { kind: 'party_kicked' });
  await broadcastParty(party._id);
  res.json({ ok: true });
});

// ===================== GUILD / CLB =====================
async function guildView(g) {
  const ids = g.members.map(String);
  const [chars, pres] = await Promise.all([charactersOf(g.members), getPresence(ids)]);
  const weekly = await remember(`guildweek:${g._id}`, 30, async () => {
    const since = new Date(Date.now() - 7 * 86400000);
    const [agg] = await WorkoutLog.aggregate([
      { $match: { guildId: g._id, createdAt: { $gte: since } } },
      { $group: { _id: null, exp: { $sum: '$expGained' }, calories: { $sum: '$caloriesBurned' }, sessions: { $sum: 1 } } },
    ]);
    return { exp: agg?.exp || 0, calories: Math.round(agg?.calories || 0), sessions: agg?.sessions || 0 };
  });
  return {
    id: String(g._id),
    name: g.name,
    tag: g.tag,
    description: g.description,
    color: g.color,
    open: g.open,
    leader: String(g.leader),
    memberCount: ids.length,
    max: GUILD_MAX,
    weekly,
    members: ids
      .map((id) => ({ userId: id, name: chars.get(id)?.displayName || '???', level: chars.get(id)?.level || 1, online: !!pres[id] }))
      .sort((a, b) => b.level - a.level),
  };
}

async function setLiveGuild(userId, guild) {
  const p = livePlayer(userId);
  if (p) {
    p.guild = guild ? String(guild._id) : null;
    p.guildTag = guild ? guild.tag : null;
    p.infoVer++;
  }
}

export const listGuilds = asyncHandler(async (req, res) => {
  const qs = String(req.query.q || '').trim().slice(0, 24);
  const filter = qs ? { name: { $regex: qs.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } } : {};
  const docs = await Guild.find(filter).sort({ updatedAt: -1 }).limit(20).lean();
  res.json({
    guilds: docs.map((g) => ({ id: String(g._id), name: g.name, tag: g.tag, color: g.color, open: g.open, memberCount: g.members.length, description: g.description })),
  });
});

export const getGuild = asyncHandler(async (req, res) => {
  const g = await Guild.findById(oid(req.params.id)).lean();
  if (!g) throw new HttpError(404, 'Không tìm thấy CLB');
  res.json({ guild: await guildView(g) });
});

export const myGuild = asyncHandler(async (req, res) => {
  const c = await Character.findOne({ userId: me(req) }).select('guildId').lean();
  const g = c?.guildId ? await Guild.findById(c.guildId).lean() : null;
  res.json({ guild: g ? await guildView(g) : null });
});

export const createGuild = asyncHandler(async (req, res) => {
  const uid = me(req);
  const name = filterProfanity(String(req.body.name || '').trim());
  const tag = String(req.body.tag || '').trim().toUpperCase();
  if (name.includes('*')) throw new HttpError(400, 'Tên CLB chứa từ không phù hợp');
  if (!/^[A-Z0-9]{2,5}$/.test(tag)) throw new HttpError(400, 'Tag CLB 2-5 ký tự chữ/số');
  const c = await Character.findOne({ userId: uid });
  if (c.guildId) throw new HttpError(409, 'Bạn đã ở trong một CLB');
  if (c.coins < GUILD_COST) throw new HttpError(400, `Cần ${GUILD_COST} xu để lập CLB`);
  const guild = await Guild.create({
    name,
    tag,
    description: filterProfanity(String(req.body.description || '').slice(0, 200)),
    color: /^#[0-9a-fA-F]{6}$/.test(req.body.color || '') ? req.body.color : '#22d3ee',
    open: req.body.open !== false,
    leader: uid,
    members: [uid],
  });
  c.coins -= GUILD_COST;
  c.guildId = guild._id;
  await c.save();
  userJoin(uid, `guild:${guild._id}`);
  await setLiveGuild(uid, guild);
  await award(uid, 'guild_member');
  await invalidate('lb:guild');
  res.status(201).json({ guild: await guildView(guild.toObject()), character: c.toPublic() });
});

export const joinGuild = asyncHandler(async (req, res) => {
  const uid = me(req);
  const gid = oid(req.params.id);
  const c = await Character.findOne({ userId: uid });
  if (c.guildId) throw new HttpError(409, 'Hãy rời CLB hiện tại trước');
  const g = await Guild.findById(gid);
  if (!g) throw new HttpError(404, 'Không tìm thấy CLB');
  const invited = g.invites.some((i) => String(i) === String(uid));
  if (!g.open && !invited) throw new HttpError(403, 'CLB này chỉ nhận thành viên được mời');
  const updated = await Guild.findOneAndUpdate(
    { _id: gid, [`members.${GUILD_MAX - 1}`]: { $exists: false } },
    { $addToSet: { members: uid }, $pull: { invites: uid } },
    { new: true }
  );
  if (!updated) throw new HttpError(400, 'CLB đã đủ thành viên');
  c.guildId = gid;
  await c.save();
  userJoin(uid, `guild:${gid}`);
  await setLiveGuild(uid, updated);
  await award(uid, 'guild_member');
  notifyRoom(`guild:${gid}`, 'guild:update', { id: String(gid), joined: c.displayName });
  await invalidate('lb:guild');
  res.json({ guild: await guildView(updated.toObject()) });
});

export const inviteGuild = asyncHandler(async (req, res) => {
  const uid = me(req);
  const target = oid(req.body.userId);
  const c = await Character.findOne({ userId: uid }).select('guildId displayName').lean();
  if (!c?.guildId) throw new HttpError(400, 'Bạn chưa ở trong CLB');
  const g = await Guild.findByIdAndUpdate(c.guildId, { $addToSet: { invites: target } }, { new: true }).lean();
  notifyUser(target, 'notify', { kind: 'guild_invite', guildId: String(g._id), guildName: g.name, from: { userId: String(uid), name: c.displayName } });
  res.json({ ok: true });
});

export const leaveGuild = asyncHandler(async (req, res) => {
  const uid = me(req);
  const c = await Character.findOne({ userId: uid });
  if (!c?.guildId) return res.json({ ok: true });
  const g = await Guild.findById(c.guildId);
  c.guildId = null;
  await c.save();
  userLeave(uid, `guild:${g?._id}`);
  await setLiveGuild(uid, null);
  if (g) {
    g.members = g.members.filter((m) => String(m) !== String(uid));
    if (!g.members.length) await g.deleteOne();
    else {
      if (String(g.leader) === String(uid)) g.leader = g.members[0];
      await g.save();
    }
  }
  await invalidate('lb:guild');
  res.json({ ok: true });
});

export const kickGuild = asyncHandler(async (req, res) => {
  const uid = me(req);
  const target = oid(req.body.userId);
  const g = await Guild.findOne({ leader: uid });
  if (!g) throw new HttpError(403, 'Chỉ chủ CLB mới được mời ra');
  if (String(target) === String(uid)) throw new HttpError(400, 'Không thể tự mời mình ra');
  g.members = g.members.filter((m) => String(m) !== String(target));
  await g.save();
  await Character.updateOne({ userId: target, guildId: g._id }, { guildId: null });
  userLeave(target, `guild:${g._id}`);
  await setLiveGuild(target, null);
  notifyUser(target, 'notify', { kind: 'guild_kicked', guildName: g.name });
  res.json({ ok: true });
});

// Chủ CLB: sửa thông tin, chuyển quyền, giải tán
async function leaderGuild(req) {
  const g = await Guild.findOne({ leader: me(req) });
  if (!g) throw new HttpError(403, 'Chỉ chủ CLB mới làm được việc này');
  return g;
}

export const updateGuild = asyncHandler(async (req, res) => {
  const g = await leaderGuild(req);
  if (typeof req.body.description === 'string') g.description = filterProfanity(req.body.description.slice(0, 200));
  if (/^#[0-9a-fA-F]{6}$/.test(req.body.color || '')) g.color = req.body.color;
  if (typeof req.body.open === 'boolean') g.open = req.body.open;
  await g.save();
  notifyRoom(`guild:${g._id}`, 'guild:update', { id: String(g._id) });
  res.json({ guild: await guildView(g.toObject()) });
});

export const transferGuild = asyncHandler(async (req, res) => {
  const g = await leaderGuild(req);
  const target = oid(req.body.userId);
  if (String(target) === String(req.userId)) throw new HttpError(400, 'Bạn đang là chủ CLB');
  if (!g.members.some((m) => String(m) === String(target))) throw new HttpError(400, 'Người này không ở trong CLB');
  g.leader = target;
  await g.save();
  notifyUser(target, 'toast', { type: 'success', text: `👑 Bạn được chuyển quyền chủ CLB ${g.name}` });
  notifyRoom(`guild:${g._id}`, 'guild:update', { id: String(g._id) });
  res.json({ guild: await guildView(g.toObject()) });
});

export const disbandGuild = asyncHandler(async (req, res) => {
  const g = await leaderGuild(req);
  const members = g.members.map(String);
  await Character.updateMany({ guildId: g._id }, { guildId: null });
  await g.deleteOne();
  for (const uid of members) {
    userLeave(uid, `guild:${g._id}`);
    await setLiveGuild(uid, null);
    if (uid !== String(req.userId)) notifyUser(uid, 'notify', { kind: 'guild_kicked', guildName: g.name, disbanded: true });
  }
  await invalidate('lb:guild');
  res.json({ ok: true });
});

// ===================== BÁO CÁO =====================
export const createReport = asyncHandler(async (req, res) => {
  const target = oid(req.body.userId);
  if (String(target) === String(req.userId)) throw new HttpError(400, 'Không thể tự báo cáo');
  const recent = await ChatMessage.find({ userId: target }).sort({ createdAt: -1 }).limit(10).select('content').lean();
  await Report.create({
    reporter: me(req),
    target,
    reason: req.body.reason,
    details: String(req.body.details || '').slice(0, 300),
    recentChat: recent.map((m) => m.content),
  });
  res.status(201).json({ ok: true, message: 'Đã gửi báo cáo, cảm ơn bạn!' });
});

// ===================== THÀNH TÍCH / LỊCH SỬ THÁCH ĐẤU =====================
export const getAchievements = asyncHandler(async (req, res) => {
  res.json({ unlocked: await listFor(me(req)), all: ACHIEVEMENTS });
});

export const challengeHistory = asyncHandler(async (req, res) => {
  const docs = await Match.find({ 'participants.userId': me(req) }).sort({ createdAt: -1 }).limit(30).lean();
  res.json({
    matches: docs.map((m) => ({
      id: String(m._id),
      kind: m.kind,
      at: m.createdAt,
      win: String(m.winner) === String(req.userId),
      participants: m.participants.map((p) => ({ name: p.displayName, score: p.score, rank: p.rank })),
    })),
  });
});
