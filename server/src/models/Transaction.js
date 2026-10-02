import mongoose from 'mongoose';
import { trackable } from './plugins.js';

export const REVENUE_CATEGORIES = ['tuition', 'bus', 'uniform', 'accommodation', 'admission_fees', 'other_revenue'];
export const EXPENSE_CATEGORIES = ['salaries', 'rent', 'utilities', 'supplies', 'maintenance', 'transport', 'marketing', 'other_expense'];

const schema = new mongoose.Schema({
  type: { type: String, enum: ['revenue', 'expense'], required: true, index: true },
  category: { type: String, enum: [...REVENUE_CATEGORIES, ...EXPENSE_CATEGORIES], required: true },
  amount: { type: Number, required: true, min: 0.01 },
  date: { type: Date, required: true, default: Date.now, index: true },
  description: { type: String, trim: true, default: '' },
  method: { type: String, enum: ['cash', 'bank', 'card', 'other'], default: 'cash' },
  reference: { type: String, trim: true, default: '' },
  counterparty: { type: String, trim: true, default: '' },
  source: { type: String, enum: ['manual', 'fee_payment'], default: 'manual' },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  feeRecord: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeRecord' },
});
trackable(schema);
export const Transaction = mongoose.model('Transaction', schema);
