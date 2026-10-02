import mongoose from 'mongoose';
import { trackable } from './plugins.js';

const staffSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true, maxlength: 200 },
  jobTitle: { type: String, trim: true, default: '' },
  category: { type: String, enum: ['education', 'contract'], default: 'contract' }, // العاملين بالتربية والتعليم / المتعاقدين
  phone: { type: String, trim: true, default: '' },
  email: { type: String, trim: true, lowercase: true, default: '' },
  hireDate: Date,
  status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
  notes: { type: String, default: '' },
  // Yearly totals as printed in the school's own sheet (e.g. "اجمالي الغياب"), kept verbatim for
  // cross-checking against the system's own computed totals — not used in any calculation itself.
  importedStats: { type: mongoose.Schema.Types.Mixed, default: undefined },
});
trackable(staffSchema);
export const Staff = mongoose.model('Staff', staffSchema);

// Monthly attendance ledger — mirrors the "مرتبات" sheet: days in month / leave / absence / present.
const ledgerSchema = new mongoose.Schema({
  staff: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
  month: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
  workingDays: { type: Number, min: 0, default: 0 },
  leave: { type: Number, min: 0, default: 0 },
  absence: { type: Number, min: 0, default: 0 },
  present: { type: Number, default: 0 },
  notes: { type: String, default: '' },
});
ledgerSchema.index({ staff: 1, month: 1 }, { unique: true });
trackable(ledgerSchema);
ledgerSchema.pre('validate', function calc(next) {
  this.present = Math.max(0, this.workingDays - this.leave - this.absence);
  next();
});
export const AttendanceLedger = mongoose.model('AttendanceLedger', ledgerSchema);

const leaveSchema = new mongoose.Schema({
  staff: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true, index: true },
  type: { type: String, enum: ['annual', 'sick', 'casual', 'unpaid', 'other'], default: 'annual' },
  from: { type: Date, required: true },
  to: { type: Date, required: true },
  days: { type: Number, default: 1 },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  reason: { type: String, default: '' },
  decidedByName: String,
});
trackable(leaveSchema);
leaveSchema.pre('validate', function calc(next) {
  if (this.from && this.to) this.days = Math.max(1, Math.round((this.to - this.from) / 86400000) + 1);
  next();
});
export const LeaveRequest = mongoose.model('LeaveRequest', leaveSchema);

const evalSchema = new mongoose.Schema({
  staff: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true, index: true },
  period: { type: String, required: true, trim: true }, // e.g. 2026-09 or 2026-T1
  score: { type: Number, min: 0, max: 100, required: true },
  strengths: { type: String, default: '' },
  improvements: { type: String, default: '' },
  evaluatorName: String,
});
trackable(evalSchema);
export const StaffEvaluation = mongoose.model('StaffEvaluation', evalSchema);
