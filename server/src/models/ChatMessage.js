import mongoose from 'mongoose';

// channel: 'global' | 'nearby' | 'dm:<userIdA>:<userIdB>' (2 id được sắp xếp tăng dần)
const chatMessageSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    displayName: { type: String, required: true },
    channel: { type: String, required: true, index: true },
    content: { type: String, required: true, maxlength: 200 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

chatMessageSchema.index({ channel: 1, createdAt: -1 });

chatMessageSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    userId: this.userId.toString(),
    displayName: this.displayName,
    channel: this.channel,
    content: this.content,
    createdAt: this.createdAt,
  };
};

export const dmChannel = (a, b) => `dm:${[String(a), String(b)].sort().join(':')}`;

export default mongoose.model('ChatMessage', chatMessageSchema);
