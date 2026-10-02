import express from 'express';
import { Transaction, REVENUE_CATEGORIES, EXPENSE_CATEGORIES } from '../models/Transaction.js';
import { FeeRecord } from '../models/FeeRecord.js';
import { crudRouter } from '../lib/crud.js';
import { authenticate, requirePerm } from '../middleware/auth.js';
import { HttpError, asyncH, round2 } from '../lib/http.js';

const custom = express.Router();
custom.use(authenticate);

// المركز المالي — revenue, expenses, net position and outstanding receivables.
custom.get('/summary', requirePerm('accounts:view'), asyncH(async (req, res) => {
  const q = {};
  if (req.query.from || req.query.to) {
    q.date = {};
    if (req.query.from) q.date.$gte = new Date(String(req.query.from));
    if (req.query.to) q.date.$lte = new Date(String(req.query.to));
  }
  const txs = await Transaction.find(q).lean();
  const byCategory = {}; const byMonth = {};
  let revenue = 0; let expenses = 0;
  for (const t of txs) {
    const sign = t.type === 'revenue' ? 1 : -1;
    if (t.type === 'revenue') revenue += t.amount; else expenses += t.amount;
    byCategory[t.category] = round2((byCategory[t.category] || 0) + t.amount);
    const m = new Date(t.date).toISOString().slice(0, 7);
    byMonth[m] = byMonth[m] || { month: m, revenue: 0, expenses: 0, net: 0 };
    if (t.type === 'revenue') byMonth[m].revenue = round2(byMonth[m].revenue + t.amount); else byMonth[m].expenses = round2(byMonth[m].expenses + t.amount);
    byMonth[m].net = round2(byMonth[m].net + sign * t.amount);
  }
  const fees = await FeeRecord.find({}, 'gross totalDiscount remainingAfterDiscount paid balance').lean();
  const receivables = round2(fees.reduce((s, f) => s + Math.max(0, f.balance || 0), 0));
  const discountsGiven = round2(fees.reduce((s, f) => s + (f.totalDiscount || 0), 0));
  const billed = round2(fees.reduce((s, f) => s + (f.remainingAfterDiscount || 0), 0));
  res.json({
    revenue: round2(revenue), expenses: round2(expenses), net: round2(revenue - expenses),
    receivables, discountsGiven, billed, collectionRate: billed ? round2((1 - receivables / billed) * 100) : null,
    byCategory, byMonth: Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month)),
    categories: { revenue: REVENUE_CATEGORIES, expense: EXPENSE_CATEGORIES },
  });
}));

const generic = crudRouter({
  module: 'accounts', entity: 'transactions', Model: Transaction,
  fields: ['type', 'category', 'amount', 'date', 'description', 'method', 'reference', 'counterparty'],
  searchFields: ['description', 'reference', 'counterparty'],
  filterFields: ['type', 'category', 'method'],
  sort: { date: -1, createdAt: -1 },
  label: (d) => `${d.type} ${d.amount} – ${d.description || d.category}`,
  hooks: {
    // Payments recorded from the Fees screen are managed there so the two ledgers can never disagree.
    beforeUpdate: (doc) => { if (doc.source === 'fee_payment') throw new HttpError(409, 'This entry comes from a student fee payment — edit it in Fees.'); },
    beforeDelete: (doc) => { if (doc.source === 'fee_payment') throw new HttpError(409, 'This entry comes from a student fee payment — remove the payment in Fees.'); },
  },
});

const router = express.Router();
router.use(custom, generic);
export default router;
