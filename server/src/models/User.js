import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['super_admin', 'admin'], default: 'admin' },
  permissions: [String],
  title: { type: String, trim: true, maxlength: 120 },
  active: { type: Boolean, default: true },
  tokenVersion: { type: Number, default: 0 },
  mustChangePassword: { type: Boolean, default: false },
  lastLoginAt: Date,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

userSchema.set('toJSON', {
  transform: (_d, r) => { delete r.passwordHash; delete r.tokenVersion; delete r.__v; return r; },
});

export const User = mongoose.model('User', userSchema);
