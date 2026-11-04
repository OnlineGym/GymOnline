import mongoose from 'mongoose';

const questSchema = new mongoose.Schema(
  {
    key: String,
    kind: String,
    goal: Number,
    progress: { type: Number, default: 0 },
    claimed: { type: Boolean, default: false },
    notified: { type: Boolean, default: false },
  },
  { _id: false }
);

// Nhiệm vụ ngày/tuần + điểm danh của 1 người chơi
const dailyProgressSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    day: String,
    daily: [questSchema],
    week: String,
    weekly: [questSchema],
    checkinDay: { type: String, default: '' },
    streak: { type: Number, default: 0 },
    bestStreak: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model('DailyProgress', dailyProgressSchema);
