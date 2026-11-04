import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

// ===== Bạn bè / chặn =====
// status: pending (requester gửi lời mời) | accepted | blocked (requester chặn recipient)
const friendshipSchema = new mongoose.Schema(
  {
    requester: { type: ObjectId, ref: 'User', required: true },
    recipient: { type: ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'accepted', 'blocked'], required: true },
  },
  { timestamps: true }
);
friendshipSchema.index({ requester: 1, recipient: 1 }, { unique: true });
friendshipSchema.index({ recipient: 1, status: 1 });
export const Friendship = mongoose.model('Friendship', friendshipSchema);

// ===== Party / nhóm tập (tối đa 5) =====
const partySchema = new mongoose.Schema(
  {
    leader: { type: ObjectId, ref: 'User', required: true },
    members: [{ type: ObjectId, ref: 'User' }],
    invites: [{ _id: false, userId: ObjectId, at: Date }],
    dailyGoal: { type: Number, default: 1500 },
  },
  { timestamps: true }
);
partySchema.index({ members: 1 });
export const Party = mongoose.model('Party', partySchema);

// ===== Guild / Câu lạc bộ =====
const guildSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 24 },
    tag: { type: String, required: true, unique: true, uppercase: true, trim: true, minlength: 2, maxlength: 5 },
    description: { type: String, maxlength: 200, default: '' },
    leader: { type: ObjectId, ref: 'User', required: true },
    members: [{ type: ObjectId, ref: 'User' }],
    invites: [{ type: ObjectId, ref: 'User' }],
    open: { type: Boolean, default: true },
    color: { type: String, default: '#22d3ee' },
  },
  { timestamps: true }
);
guildSchema.index({ members: 1 });
export const Guild = mongoose.model('Guild', guildSchema);

// ===== Trận đấu / thách đấu =====
const matchSchema = new mongoose.Schema(
  {
    kind: { type: String, required: true },
    channel: String,
    participants: [{ _id: false, userId: ObjectId, displayName: String, score: Number, rank: Number }],
    winner: { type: ObjectId, default: null },
    status: { type: String, enum: ['finished', 'cancelled'], default: 'finished' },
    durationSec: Number,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
matchSchema.index({ 'participants.userId': 1, createdAt: -1 });
export const Match = mongoose.model('Match', matchSchema);

// ===== Quà tặng / giao dịch (có xác nhận 2 bên, giữ đồ của người gửi tới khi nhận/từ chối) =====
const transactionSchema = new mongoose.Schema(
  {
    from: { type: ObjectId, ref: 'User', required: true },
    to: { type: ObjectId, ref: 'User', required: true },
    fromName: String,
    coins: { type: Number, default: 0, min: 0 },
    item: { type: String, default: null },
    qty: { type: Number, default: 0, min: 0 },
    message: { type: String, maxlength: 100, default: '' },
    // Trao đổi: người nhận phải đưa lại những thứ này thì mới nhận được quà
    wantCoins: { type: Number, default: 0 },
    wantItem: { type: String, default: null },
    wantQty: { type: Number, default: 0 },
    status: { type: String, enum: ['pending', 'accepted', 'declined', 'expired'], default: 'pending' },
  },
  { timestamps: true }
);
transactionSchema.index({ to: 1, status: 1 });
transactionSchema.index({ from: 1, createdAt: -1 });
export const Transaction = mongoose.model('Transaction', transactionSchema);

// ===== Báo cáo vi phạm =====
const reportSchema = new mongoose.Schema(
  {
    reporter: { type: ObjectId, ref: 'User', required: true },
    target: { type: ObjectId, ref: 'User', required: true },
    reason: { type: String, enum: ['spam', 'abuse', 'cheat', 'name', 'other'], required: true },
    details: { type: String, maxlength: 300, default: '' },
    recentChat: [{ type: String }],
    status: { type: String, enum: ['open', 'reviewed', 'dismissed'], default: 'open' },
    note: { type: String, maxlength: 300, default: '' },
    handledBy: { type: ObjectId, ref: 'User' },
  },
  { timestamps: true }
);
reportSchema.index({ target: 1, createdAt: -1 });
reportSchema.index({ status: 1, createdAt: 1 });
export const Report = mongoose.model('Report', reportSchema);

// ===== Nhật ký thao tác quản trị =====
const adminActionSchema = new mongoose.Schema(
  {
    admin: { type: ObjectId, ref: 'User', required: true },
    action: { type: String, required: true },
    target: { type: ObjectId, ref: 'User' },
    detail: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
adminActionSchema.index({ createdAt: -1 });
export const AdminAction = mongoose.model('AdminAction', adminActionSchema);

// ===== Thành tích =====
const achievementSchema = new mongoose.Schema(
  {
    userId: { type: ObjectId, ref: 'User', required: true },
    key: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
achievementSchema.index({ userId: 1, key: 1 }, { unique: true });
export const Achievement = mongoose.model('Achievement', achievementSchema);

// ===== Thống kê channel (mẫu mỗi phút) =====
const channelStatSchema = new mongoose.Schema(
  {
    channelId: { type: String, required: true },
    instanceId: String,
    players: Number,
    peak: Number,
    at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);
channelStatSchema.index({ channelId: 1, at: -1 });
channelStatSchema.index({ at: 1 }, { expireAfterSeconds: 7 * 24 * 3600 }); // tự xóa sau 7 ngày
export const ChannelStat = mongoose.model('ChannelStat', channelStatSchema);
