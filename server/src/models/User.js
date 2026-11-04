import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 20,
      // Chỉ chữ không dấu, số và dấu _ (không dấu tiếng Việt, không dấu cách)
      match: /^[a-zA-Z0-9_]+$/,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 100,
    },
    // Không bao giờ trả passwordHash ra ngoài (select: false)
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    emailVerified: { type: Boolean, default: false },
    pendingEmail: { type: String, lowercase: true, trim: true },
    // Tăng số này = mọi token cũ hết hiệu lực (đổi mật khẩu, đăng xuất mọi thiết bị)
    tokenVersion: { type: Number, default: 0 },
    verifyTokenHash: { type: String, select: false },
    verifyTokenExp: Date,
    resetTokenHash: { type: String, select: false },
    resetTokenExp: Date,
    bannedUntil: Date,
    banReason: String,
    chatMutedUntil: Date,
    acceptedTermsAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    username: this.username,
    email: this.email,
    emailVerified: !!this.emailVerified,
    pendingEmail: this.pendingEmail || null,
    role: this.role || 'user',
    createdAt: this.createdAt,
  };
};

export default mongoose.model('User', userSchema);
