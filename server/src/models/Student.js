import mongoose from 'mongoose';
import { trackable } from './plugins.js';

const schema = new mongoose.Schema({
  studentCode: { type: String, unique: true, sparse: true, trim: true },
  fullName: { type: String, required: true, trim: true, maxlength: 200 },
  gradeLevel: { type: String, enum: ['1Sec', '2Sec', '3Sec', 'Institute'], default: '1Sec', index: true },
  classroom: { type: String, trim: true, default: '' },
  program: { type: String, default: 'Computing & ICT' },
  status: { type: String, enum: ['active', 'suspended', 'withdrawn', 'graduated'], default: 'active', index: true },
  gender: { type: String, enum: ['male', 'female', ''], default: '' },
  birthDate: Date,
  guardianName: { type: String, trim: true, default: '' },
  guardianPhone: { type: String, trim: true, default: '' },
  address: { type: String, trim: true, default: '' },
  notes: { type: String, default: '' },
  application: { type: mongoose.Schema.Types.ObjectId, ref: 'Application' },
});
trackable(schema);
export const Student = mongoose.model('Student', schema);
