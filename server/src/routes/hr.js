import express from 'express';
import { z } from 'zod';
import { Staff, AttendanceLedger, LeaveRequest, StaffEvaluation } from '../models/Staff.js';
import { crudRouter } from '../lib/crud.js';
import { authenticate, requirePerm } from '../middleware/auth.js';
import { HttpError, asyncH } from '../lib/http.js';
import { diff, writeAudit, actorOf } from '../lib/audit.js';
import { emitChange, emitReload } from '../lib/realtime.js';

const STAFF_POP = { path: 'staff', select: 'fullName jobTitle category' };

// ── attendance ledger (the "مرتبات" sheet) ───────────────────────────────────
const attendance = express.Router();
attendance.use(authenticate);

attendance.get('/', requirePerm('hr:view'), asyncH(async (req, res) => {
  const month = z.string().regex(/^\d{4}-\d{2}$/).parse(req.query.month);
  const [staff, ledgers] = await Promise.all([
    Staff.find({ status: 'active' }).sort({ category: 1, createdAt: 1 }).lean(),
    AttendanceLedger.find({ month }).lean(),
  ]);
  const byStaff = new Map(ledgers.map((l) => [String(l.staff), l]));
  res.json({ month, rows: staff.map((s) => ({ staff: { _id: s._id, fullName: s.fullName, jobTitle: s.jobTitle, category: s.category, importedStats: s.importedStats }, ledger: byStaff.get(String(s._id)) || null })) });
}));

// Per-employee totals across an academic year (Sep → Aug) = the sheet's "إجمالي الغياب".
attendance.get('/yearly', requirePerm('hr:view'), asyncH(async (req, res) => {
  const y = z.string().regex(/^\d{4}$/).parse(req.query.startYear); // 2025 → 2025-09 … 2026-08
  const months = Array.from({ length: 12 }, (_, i) => { const m = ((8 + i) % 12) + 1; const yr = Number(y) + (m < 9 ? 1 : 0); return `${yr}-${String(m).padStart(2, '0')}`; });
  const ledgers = await AttendanceLedger.find({ month: { $in: months } }).lean();
  const totals = {};
  for (const l of ledgers) {
    const t = (totals[l.staff] ||= { leave: 0, absence: 0, present: 0, workingDays: 0 });
    t.leave += l.leave; t.absence += l.absence; t.present += l.present; t.workingDays += l.workingDays;
  }
  res.json({ months, totals });
}));

const ledgerBody = z.object({
  workingDays: z.number().int().min(0).max(31), leave: z.number().int().min(0).max(31), absence: z.number().int().min(0).max(31), notes: z.string().max(300).optional(),
}).refine((d) => d.leave + d.absence <= d.workingDays, { message: 'Leave + absence cannot exceed working days' });

attendance.put('/:staffId/:month', requirePerm('hr:edit'), asyncH(async (req, res) => {
  const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).parse(req.params.month);
  const data = ledgerBody.parse(req.body);
  const staff = await Staff.findById(req.params.staffId);
  if (!staff) throw new HttpError(404, 'Employee not found');
  let doc = await AttendanceLedger.findOne({ staff: staff._id, month });
  const existed = !!doc;
  if (existed && req.body.rev !== undefined && Number(req.body.rev) !== doc.rev) {
    throw new HttpError(409, 'Someone else just changed this row. Latest values loaded.', { code: 'CONFLICT', current: doc.toJSON() });
  }
  const before = existed ? doc.toObject() : {};
  if (!doc) doc = new AttendanceLedger({ staff: staff._id, month, createdBy: req.user._id, createdByName: req.user.name });
  doc.set(data);
  await doc.validate();
  const changes = diff(before, doc.toObject(), ['workingDays', 'leave', 'absence', 'notes']);
  if (existed && !changes.length) return res.json(doc.toJSON());
  doc.rev = (doc.rev || 0) + (existed ? 1 : 0); doc.updatedBy = req.user._id; doc.updatedByName = req.user.name;
  await doc.save();
  await writeAudit({ module: 'hr', entity: 'attendance', entityId: doc._id, label: `${staff.fullName} · ${month}`, action: existed ? 'update' : 'create', changes, user: req.user, ip: req.ip });
  emitChange({ entity: 'attendance', module: 'hr', action: existed ? 'updated' : 'created', doc: { ...doc.toJSON(), staffId: String(staff._id) }, changes, actor: actorOf(req.user) });
  res.json(doc.toJSON());
}));

const staffRouter = crudRouter({
  module: 'hr', entity: 'staff', Model: Staff,
  fields: ['fullName', 'jobTitle', 'category', 'phone', 'email', 'hireDate', 'status', 'notes'],
  searchFields: ['fullName', 'jobTitle'], filterFields: ['category', 'status'],
  sort: { category: 1, createdAt: 1 }, label: (d) => d.fullName,
  hooks: {
    // Same fix as deleting a student: an employee's attendance rows, leave requests and evaluations
    // used to be left behind pointing at nothing, showing up as blank rows in HR & Payroll.
    afterDelete: async (doc, req) => {
      const [ledgers, leaves, evals] = await Promise.all([
        AttendanceLedger.find({ staff: doc._id }), LeaveRequest.find({ staff: doc._id }), StaffEvaluation.find({ staff: doc._id }),
      ]);
      const removed = ledgers.length + leaves.length + evals.length;
      if (!removed) return;
      await Promise.all([
        AttendanceLedger.deleteMany({ staff: doc._id }), LeaveRequest.deleteMany({ staff: doc._id }), StaffEvaluation.deleteMany({ staff: doc._id }),
      ]);
      const actor = { id: String(req.user._id), name: req.user.name, role: req.user.role };
      for (const l of leaves) emitChange({ entity: 'leaves', module: 'hr', action: 'deleted', id: l._id, actor });
      for (const e of evals) emitChange({ entity: 'evaluations', module: 'hr', action: 'deleted', id: e._id, actor });
      emitReload({ module: 'hr', entity: 'attendance' });
      await writeAudit({ module: 'hr', entity: 'staff', label: `Removed with employee: ${doc.fullName}`, action: 'delete', user: req.user, ip: req.ip,
        changes: [{ field: 'attendanceRowsRemoved', from: ledgers.length, to: 0 }, { field: 'leavesRemoved', from: leaves.length, to: 0 }, { field: 'evaluationsRemoved', from: evals.length, to: 0 }] });
    },
  },
});

const leavesRouter = crudRouter({
  module: 'hr', entity: 'leaves', Model: LeaveRequest, populate: STAFF_POP,
  fields: ['staff', 'type', 'from', 'to', 'status', 'reason'], filterFields: ['staff', 'status', 'type'],
  sort: { from: -1 }, label: (d) => `Leave · ${d.staff?.fullName || d.staff}`,
  hooks: {
    beforeUpdate: (doc, patch, req) => { if (patch.status && patch.status !== doc.status) doc.decidedByName = req.user.name; },
  },
});

const evalRouter = crudRouter({
  module: 'hr', entity: 'evaluations', Model: StaffEvaluation, populate: STAFF_POP,
  fields: ['staff', 'period', 'score', 'strengths', 'improvements'], filterFields: ['staff', 'period'],
  sort: { createdAt: -1 }, label: (d) => `Evaluation · ${d.staff?.fullName || d.staff} · ${d.period}`,
  hooks: { beforeCreate: (data, req) => ({ ...data, evaluatorName: req.user.name }) },
});

const router = express.Router();
router.use('/attendance', attendance);
router.use('/staff', staffRouter);
router.use('/leaves', leavesRouter);
router.use('/evaluations', evalRouter);
export default router;