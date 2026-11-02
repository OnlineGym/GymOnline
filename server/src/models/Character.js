import mongoose from 'mongoose';

export const HAIR_STYLES = ['bald', 'short', 'spiky', 'bun', 'long', 'ponytail', 'twintails'];
export const OUTFIT_STYLES = ['tshirt', 'tank', 'hoodie', 'robe'];
export const GENDERS = ['male', 'female'];

const hexColor = { type: String, match: /^#[0-9a-fA-F]{6}$/ };

const characterSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    displayName: { type: String, required: true, trim: true, minlength: 2, maxlength: 16 },
    gender: { type: String, enum: GENDERS, default: 'male' },
    skinColor: { ...hexColor, default: '#f5c9a0' },
    hair: {
      style: { type: String, enum: HAIR_STYLES, default: 'short' },
      color: { ...hexColor, default: '#3b2a20' },
    },
    outfit: {
      style: { type: String, enum: OUTFIT_STYLES, default: 'tshirt' },
      top: { ...hexColor, default: '#22d3ee' },
      bottom: { ...hexColor, default: '#334155' },
      shoes: { ...hexColor, default: '#f8fafc' },
    },
    level: { type: Number, default: 1, min: 1 },
    exp: { type: Number, default: 0, min: 0 },
    stats: {
      chest: { type: Number, default: 0 },
      back: { type: Number, default: 0 },
      legs: { type: Number, default: 0 },
      arms: { type: Number, default: 0 },
      stamina: { type: Number, default: 0 },
    },
    coins: { type: Number, default: 100 },
    totalCalories: { type: Number, default: 0 },
    totalWorkouts: { type: Number, default: 0 },
  },
  { timestamps: true }
);

characterSchema.index({ level: -1, exp: -1 });
characterSchema.index({ totalCalories: -1 });

// Dữ liệu ngoại hình gửi cho người chơi khác (không lộ thông tin riêng tư)
characterSchema.methods.appearance = function appearance() {
  return {
    displayName: this.displayName,
    gender: this.gender,
    skinColor: this.skinColor,
    hair: { style: this.hair.style, color: this.hair.color },
    outfit: {
      style: this.outfit.style,
      top: this.outfit.top,
      bottom: this.outfit.bottom,
      shoes: this.outfit.shoes,
    },
    level: this.level,
  };
};

characterSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    userId: this.userId.toString(),
    ...this.appearance(),
    exp: this.exp,
    stats: {
      chest: this.stats.chest,
      back: this.stats.back,
      legs: this.stats.legs,
      arms: this.stats.arms,
      stamina: this.stats.stamina,
    },
    coins: this.coins,
    totalCalories: Math.round(this.totalCalories),
    totalWorkouts: this.totalWorkouts,
  };
};

export default mongoose.model('Character', characterSchema);
