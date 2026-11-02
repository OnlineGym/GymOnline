import mongoose from 'mongoose';

const workoutLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    equipmentType: { type: String, required: true },
    durationSec: { type: Number, required: true, min: 0 },
    reps: { type: Number, required: true, min: 0 },
    caloriesBurned: { type: Number, required: true, min: 0 },
    expGained: { type: Number, required: true, min: 0 },
    stat: { type: String, index: true },
    bonuses: [{ type: String }],
    guildId: { type: mongoose.Schema.Types.ObjectId, default: null },
    partyId: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

workoutLogSchema.index({ userId: 1, createdAt: -1 });
workoutLogSchema.index({ createdAt: -1 }); // leaderboard tuần
workoutLogSchema.index({ guildId: 1, createdAt: -1 });
workoutLogSchema.index({ partyId: 1, createdAt: -1 });

export default mongoose.model('WorkoutLog', workoutLogSchema);
