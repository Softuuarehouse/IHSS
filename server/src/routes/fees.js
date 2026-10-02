import express from 'express';
import { z } from 'zod';
import { FeeRecord } from '../models/FeeRecord.js';
import { Student } from '../models/Student.js';
import { Transaction } from '../models/Transaction.js';
import { crudRouter } from '../lib/crud.js';
import { authenticate, requirePerm } from '../middleware/auth.js';
import { HttpError, asyncH } from '../lib/http.js';
import { writeAudit, actorOf } from '../lib/audit.js';
import { emitChange } from '../lib/realtime.js';

const POPULATE = { path: 'student', select: 'fullName studentCode gradeLevel classroom status' };
const feeFields = ['tuition', 'bus', 'busLine', 'uniform', 'accommodation', 'notes', 'discounts', 'term', 'academicYear'];

// ── custom routes first (before the generic /:id) ─────────────────────────────
const custom = express.Router();
custom.use(authenticate);

// Create a fee line for every active student of a grade for a year/term that doesn't have one yet.
custom.post('/generate', requirePerm('fees:create'), asyncH(async (req, res) => {
  const d = z.object({
    academicYear: z.string().min(4), term: z.enum(['first', 'second']).default('first'),
    gradeLevel: z.enum(['1Sec', '2Sec', '3Sec', 'Institute']).optional(), tuition: z.number().min(0).default(40000),
  }).parse(req.body);
  const students = await Student.find({ status: 'active', ...(d.gradeLevel ? { gradeLevel: d.gradeLevel } : {}) }).select('_id');
  const existing = new Set((await FeeRecord.find({ academicYear: d.academicYear, term: d.term }).select('student')).map((f) => String(f.student)));
  const created = [];
  for (const s of students) {
    if (existing.has(String(s._id))) continue;
    const doc = await FeeRecord.create({ student: s._id, academicYear: d.academicYear, term: d.term, tuition: d.tuition,
      createdBy: req.user._id, createdByName: req.user.name, updatedBy: req.user._id, updatedByName: req.user.name });
    await doc.populate(POPULATE);
    created.push(doc);
    emitChange({ entity: 'fees', module: 'fees', action: 'created', doc: doc.toJSON(), actor: actorOf(req.user) });
  }
  await writeAudit({ module: 'fees', entity: 'fees', label: `Generate ${d.academicYear}/${d.term}`, action: 'create', user: req.user, ip: req.ip,
    changes: [{ field: 'generated', from: null, to: created.length }] });
  res.status(201).json({ created: created.length });
}));

const paymentBody = z.object({
  amount: z.number().positive(), date: z.coerce.date().optional(),
  method: z.enum(['cash', 'bank', 'card', 'other']).default('cash'),
  receiptNo: z.string().max(60).optional(), note: z.string().max(300).optional(),
});

// Recording a payment also books it as revenue in Accounts (single source of truth).
custom.post('/:id/payments', requirePerm('fees:edit'), asyncH(async (req, res) => {
  const p = paymentBody.parse(req.body);
  const fee = await FeeRecord.findById(req.params.id).populate(POPULATE);
  if (!fee) throw new HttpError(404, 'Not found');
  if (p.amount > fee.balance + 0.005) throw new HttpError(400, `Amount exceeds the remaining balance (${fee.balance})`);
  const tx = await Transaction.create({
    type: 'revenue', category: 'tuition', amount: p.amount, date: p.date || new Date(), method: p.method, reference: p.receiptNo || '',
    description: `Fees – ${fee.student.fullName} (${fee.academicYear} ${fee.term})`, source: 'fee_payment',
    student: fee.student._id, feeRecord: fee._id, createdBy: req.user._id, createdByName: req.user.name, updatedBy: req.user._id, updatedByName: req.user.name,
  });
  const beforePaid = fee.paid;
  fee.payments.push({ ...p, date: p.date || new Date(), recordedByName: req.user.name, transaction: tx._id });
  fee.rev += 1; fee.updatedBy = req.user._id; fee.updatedByName = req.user.name;
  await fee.save();
  await writeAudit({ module: 'fees', entity: 'fees', entityId: fee._id, label: fee.student.fullName, action: 'update', user: req.user, ip: req.ip,
    changes: [{ field: 'paid', from: beforePaid, to: fee.paid }, { field: 'payment', from: null, to: { amount: p.amount, receiptNo: p.receiptNo || '' } }] });
  emitChange({ entity: 'fees', module: 'fees', action: 'updated', doc: fee.toJSON(), actor: actorOf(req.user) });
  emitChange({ entity: 'transactions', module: 'accounts', action: 'created', doc: tx.toJSON(), actor: actorOf(req.user) });
  res.status(201).json(fee.toJSON());
}));

custom.delete('/:id/payments/:pid', requirePerm('fees:edit'), asyncH(async (req, res) => {
  const fee = await FeeRecord.findById(req.params.id).populate(POPULATE);
  if (!fee) throw new HttpError(404, 'Not found');
  const pay = fee.payments.id(req.params.pid);
  if (!pay) throw new HttpError(404, 'Payment not found');
  const beforePaid = fee.paid;
  if (pay.transaction) {
    await Transaction.deleteOne({ _id: pay.transaction });
    emitChange({ entity: 'transactions', module: 'accounts', action: 'deleted', id: pay.transaction, actor: actorOf(req.user) });
  }
  pay.deleteOne();
  fee.rev += 1; fee.updatedBy = req.user._id; fee.updatedByName = req.user.name;
  await fee.save();
  await writeAudit({ module: 'fees', entity: 'fees', entityId: fee._id, label: fee.student.fullName, action: 'update', user: req.user, ip: req.ip,
    changes: [{ field: 'paid', from: beforePaid, to: fee.paid }, { field: 'payment', from: { amount: pay.amount }, to: null }] });
  emitChange({ entity: 'fees', module: 'fees', action: 'updated', doc: fee.toJSON(), actor: actorOf(req.user) });
  res.json(fee.toJSON());
}));

const generic = crudRouter({
  module: 'fees', entity: 'fees', Model: FeeRecord, populate: POPULATE,
  fields: feeFields, createFields: ['student', ...feeFields],
  filterFields: ['academicYear', 'term', 'student'],
  sort: { createdAt: 1 },
  label: (d) => `${d.student?.fullName || d.student} · ${d.academicYear}`,
});

const router = express.Router();
router.use(custom, generic);
export default router;
