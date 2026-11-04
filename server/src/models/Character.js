import mongoose from 'mongoose';
import { STATS, ITEMS } from '../../../shared/constants.js';

export const HAIR_STYLES = ['bald', 'short', 'spiky', 'bun', 'long', 'ponytail', 'twintails'];
export const OUTFIT_STYLES = ['tshirt', 'tank', 'hoodie', 'robe'];
export const GENDERS = ['male', 'female'];
export const ACCESSORIES = Object.keys(ITEMS).filter((k) => ITEMS[k].type === 'accessory');

const hexColor = { type: String, match: /^#[0-9a-fA-F]{6}$/ };
const statsDef = Object.fromEntries(STATS.map((s) => [s, { type: Number, default: 0 }]));

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
    accessory: { type: String, default: null },
    level: { type: Number, default: 1, min: 1 },
    exp: { type: Number, default: 0, min: 0 },
    stats: statsDef,
    coins: { type: Number, default: 100, min: 0 },
    totalCalories: { type: Number, default: 0 },
    totalWorkouts: { type: Number, default: 0 },
    trackLaps: { type: Number, default: 0 },
    inventory: [{ _id: false, item: String, qty: { type: Number, default: 0, min: 0 } }],
    buffs: [{ _id: false, kind: String, mult: Number, until: Date }],
    guildId: { type: mongoose.Schema.Types.ObjectId, ref: 'Guild', default: null, index: true },
    groupsTrained: [{ type: String }],
    wins: { type: Number, default: 0 },
    lastPos: { f: Number, x: Number, z: Number },
    tutorialDone: { type: Boolean, default: false },
  },
  { timestamps: true }
);

characterSchema.index({ level: -1, exp: -1 });
characterSchema.index({ totalCalories: -1 });
for (const s of STATS) characterSchema.index({ [`stats.${s}`]: -1 });

// Dữ liệu ngoại hình gửi cho người chơi khác (không lộ thông tin riêng tư)
characterSchema.methods.appearance = function appearance() {
  return {
    displayName: this.displayName,
    gender: this.gender,
    skinColor: this.skinColor,
    hair: { style: this.hair.style, color: this.hair.color },
    outfit: { style: this.outfit.style, top: this.outfit.top, bottom: this.outfit.bottom, shoes: this.outfit.shoes },
    accessory: this.accessory || null,
    level: this.level,
  };
};

characterSchema.methods.statsObject = function statsObject() {
  return Object.fromEntries(STATS.map((s) => [s, this.stats?.[s] || 0]));
};

characterSchema.methods.activeBuffs = function activeBuffs() {
  const now = Date.now();
  return (this.buffs || []).filter((b) => b.until && b.until.getTime() > now).map((b) => ({ kind: b.kind, mult: b.mult, until: b.until }));
};

characterSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    userId: this.userId.toString(),
    ...this.appearance(),
    exp: this.exp,
    stats: this.statsObject(),
    coins: this.coins,
    totalCalories: Math.round(this.totalCalories),
    totalWorkouts: this.totalWorkouts,
    trackLaps: this.trackLaps || 0,
    inventory: (this.inventory || []).filter((i) => i.qty > 0).map((i) => ({ item: i.item, qty: i.qty })),
    buffs: this.activeBuffs(),
    guildId: this.guildId ? this.guildId.toString() : null,
    wins: this.wins || 0,
    tutorialDone: !!this.tutorialDone,
  };
};

characterSchema.methods.addItem = function addItem(item, qty) {
  const it = this.inventory.find((i) => i.item === item);
  if (it) it.qty += qty;
  else this.inventory.push({ item, qty });
};

characterSchema.methods.removeItem = function removeItem(item, qty) {
  const it = this.inventory.find((i) => i.item === item);
  if (!it || it.qty < qty) return false;
  it.qty -= qty;
  return true;
};

characterSchema.methods.hasItem = function hasItem(item) {
  return (this.inventory || []).some((i) => i.item === item && i.qty > 0);
};

export default mongoose.model('Character', characterSchema);
