import mongoose from 'mongoose';

const workoutLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    equipmentType: { type: String, required: true },
    durationSec: { type: Number, required: true, min: 0 },
    reps: { type: Number, required: true, min: 0 },
    caloriesBurned: { type: Number, required: true, min: 0 },
    expGained: { type: Number, required: true, min: 0 },
    stat: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

workoutLogSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('WorkoutLog', workoutLogSchema);
