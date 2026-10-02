import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { asyncH, round2 } from '../lib/http.js';
import { hasPerm, viewableModules } from '../lib/permissions.js';
import { Student } from '../models/Student.js';
import { Application } from '../models/Application.js';
import { Staff } from '../models/Staff.js';
import { Assessment } from '../models/Assessment.js';
import { FeeRecord } from '../models/FeeRecord.js';
import { Transaction } from '../models/Transaction.js';
import { AuditLog } from '../models/AuditLog.js';

const r = express.Router();
r.use(authenticate);

// Only the widgets a user is allowed to see are computed and returned.
r.get('/', asyncH(async (req, res) => {
  const u = req.user; const out = {};
  if (hasPerm(u, 'students:view')) {
    const [active, byGrade] = await Promise.all([Student.countDocuments({ status: 'active' }), Student.aggregate([{ $match: { status: 'active' } }, { $group: { _id: '$gradeLevel', n: { $sum: 1 } } }])]);
    out.students = { active, byGrade: Object.fromEntries(byGrade.map((g) => [g._id, g.n])) };
  }
  if (hasPerm(u, 'registration:view')) {
    const apps = await Application.find({}, 'stage docsMissing').lean();
    const byStage = {}; apps.forEach((a) => { byStage[a.stage] = (byStage[a.stage] || 0) + 1; });
    out.registration = { total: apps.length, byStage, withMissingDocs: apps.filter((a) => a.docsMissing > 0 && a.stage !== 'enrolled' && a.stage !== 'rejected').length };
  }
  if (hasPerm(u, 'hr:view')) out.hr = { activeStaff: await Staff.countDocuments({ status: 'active' }) };
  if (hasPerm(u, 'assessments:view')) out.assessments = { sheets: await Assessment.countDocuments({}), locked: await Assessment.countDocuments({ locked: true }) };
  if (hasPerm(u, 'fees:view')) {
    const f = await FeeRecord.find({}, 'gross totalDiscount remainingAfterDiscount paid balance').lean();
    const sum = (k) => round2(f.reduce((s, x) => s + (x[k] || 0), 0));
    out.fees = { records: f.length, gross: sum('gross'), totalDiscount: sum('totalDiscount'), remainingAfterDiscount: sum('remainingAfterDiscount'), paid: sum('paid'), balance: sum('balance') };
  }
  if (hasPerm(u, 'accounts:view')) {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const tx = await Transaction.find({ date: { $gte: monthStart } }, 'type amount').lean();
    const rev = tx.filter((t) => t.type === 'revenue').reduce((s, t) => s + t.amount, 0);
    const exp = tx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    out.accounts = { monthRevenue: round2(rev), monthExpenses: round2(exp), monthNet: round2(rev - exp) };
  }
  const mods = viewableModules(u);
  out.activity = await AuditLog.find(u.role === 'super_admin' ? {} : { module: { $in: mods }, action: { $in: ['create', 'update', 'delete'] } }).sort({ at: -1 }).limit(15).lean();
  res.json(out);
}));

export default r;
