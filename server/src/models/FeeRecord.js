import mongoose from 'mongoose';
import { trackable } from './plugins.js';
import { computeFees } from '../lib/fees.js';

const discount = new mongoose.Schema({
  reason: { type: String, trim: true, default: '' },
  type: { type: String, enum: ['fixed', 'percent'], default: 'fixed' },
  base: { type: String, enum: ['tuition', 'total'], default: 'tuition' }, // what a % is taken from
  value: { type: Number, min: 0, default: 0 },
  amount: { type: Number, default: 0 }, // computed
}, { _id: true });

const payment = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  amount: { type: Number, required: true, min: 0.01 },
  method: { type: String, enum: ['cash', 'bank', 'card', 'other'], default: 'cash' },
  receiptNo: { type: String, trim: true, default: '' },
  note: { type: String, default: '' },
  recordedByName: String,
  transaction: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
}, { _id: true });

const schema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  academicYear: { type: String, required: true, index: true }, // e.g. 2026/2027
  term: { type: String, enum: ['first', 'second'], default: 'first' },
  // Columns of the school's fee sheet: Fees | Bus | Uniform | Accommodation | Bus | Notes
  tuition: { type: Number, min: 0, default: 40000 },
  bus: { type: Number, min: 0, default: 0 },
  busLine: { type: String, trim: true, default: '' },
  uniform: { type: Number, min: 0, default: 0 },
  accommodation: { type: Number, min: 0, default: 0 },
  notes: { type: String, default: '' },
  // NEW columns: اجمالي الخصم / المتبقي بعد الخصم (computed server-side, persisted for sorting/reporting)
  discounts: [discount],
  gross: { type: Number, default: 0 },
  totalDiscount: { type: Number, default: 0 },
  remainingAfterDiscount: { type: Number, default: 0 },
  payments: [payment],
  paid: { type: Number, default: 0 },
  balance: { type: Number, default: 0 },
});
schema.index({ student: 1, academicYear: 1, term: 1 }, { unique: true });
trackable(schema);

schema.pre('validate', function computeTotals(next) {
  const c = computeFees(this);
  this.gross = c.gross;
  this.totalDiscount = c.totalDiscount;
  this.remainingAfterDiscount = c.remainingAfterDiscount;
  this.paid = c.paid;
  this.balance = c.balance;
  this.discounts.forEach((d, i) => { d.amount = c.discounts[i].amount; });
  next();
});

export const FeeRecord = mongoose.model('FeeRecord', schema);
