import express from 'express';
import { authenticate, requirePerm } from '../middleware/auth.js';
import { HttpError, asyncH } from '../lib/http.js';
import { buildTableWorkbook } from '../lib/excel.js';
import { Student } from '../models/Student.js';
import { FeeRecord } from '../models/FeeRecord.js';
import { Application } from '../models/Application.js';
import { Staff, AttendanceLedger } from '../models/Staff.js';
import { Transaction } from '../models/Transaction.js';
import { DOCUMENTS } from '../lib/documents.js';
import { writeAudit } from '../lib/audit.js';

const r = express.Router();
r.use(authenticate);
const d = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '');
const docLabel = Object.fromEntries(DOCUMENTS.map((x) => [x.key, x.ar]));

const EXPORTS = {
  students: { module: 'students', title: 'الطلاب', load: () => Student.find().sort({ gradeLevel: 1, classroom: 1, fullName: 1 }).lean(),
    columns: [{ header: 'كود الطالب', key: 'studentCode' }, { header: 'اسم الطالب', key: 'fullName', width: 36 }, { header: 'الصف', key: 'gradeLevel' }, { header: 'الفصل', key: 'classroom' }, { header: 'الحالة', key: 'status' }, { header: 'ولي الأمر', key: 'guardianName', width: 26 }, { header: 'هاتف ولي الأمر', key: 'guardianPhone', width: 18 }],
    map: (x) => x },
  fees: { module: 'fees', title: 'المصروفات', load: () => FeeRecord.find().populate('student', 'fullName gradeLevel classroom').sort({ createdAt: 1 }).lean(),
    columns: [{ header: 'الصف', key: 'grade' }, { header: 'اسم الطالب', key: 'name', width: 36 }, { header: 'المصروفات', key: 'tuition', numFmt: '#,##0' }, { header: 'الباص', key: 'bus', numFmt: '#,##0' }, { header: 'الزي', key: 'uniform', numFmt: '#,##0' }, { header: 'الإقامة', key: 'accommodation', numFmt: '#,##0' }, { header: 'خط الباص', key: 'busLine' }, { header: 'الإجمالي', key: 'gross', numFmt: '#,##0' }, { header: 'اجمالي الخصم', key: 'totalDiscount', numFmt: '#,##0' }, { header: 'المتبقي بعد الخصم', key: 'remainingAfterDiscount', numFmt: '#,##0', width: 20 }, { header: 'المدفوع', key: 'paid', numFmt: '#,##0' }, { header: 'الرصيد', key: 'balance', numFmt: '#,##0' }, { header: 'ملاحظات', key: 'notes', width: 30 }],
    map: (x) => ({ ...x, grade: x.student?.gradeLevel, name: x.student?.fullName }) },
  applications: { module: 'registration', title: 'التسجيل', load: () => Application.find().sort({ createdAt: 1 }).lean(),
    columns: [{ header: 'اسم الطالب', key: 'applicantName', width: 36 }, { header: 'المرحلة', key: 'stage' }, { header: 'المستندات المستلمة', key: 'received', width: 60 }, { header: 'المستندات الناقصة', key: 'missing', width: 70 }],
    map: (x) => ({ ...x, received: x.documents.filter((k) => k.status === 'received').map((k) => docLabel[k.key]).join(' + '), missing: x.documents.filter((k) => k.status === 'missing').map((k) => docLabel[k.key]).join(' + ') }) },
  staff: { module: 'hr', title: 'العاملين', load: () => Staff.find().sort({ category: 1, createdAt: 1 }).lean(),
    columns: [{ header: 'الاسم', key: 'fullName', width: 36 }, { header: 'الوظيفة', key: 'jobTitle', width: 24 }, { header: 'التصنيف', key: 'category' }, { header: 'الحالة', key: 'status' }, { header: 'الهاتف', key: 'phone' }],
    map: (x) => x },
  attendance: { module: 'hr', title: 'الحضور', load: async (req) => { const month = String(req.query.month || ''); const [staff, l] = await Promise.all([Staff.find().sort({ category: 1, createdAt: 1 }).lean(), AttendanceLedger.find({ month }).lean()]); const m = new Map(l.map((x) => [String(x.staff), x])); return staff.map((s) => ({ ...s, ...(m.get(String(s._id)) || {}) })); },
    columns: [{ header: 'الاسم', key: 'fullName', width: 36 }, { header: 'الوظيفة', key: 'jobTitle', width: 24 }, { header: 'أيام الشهر', key: 'workingDays' }, { header: 'إجازة', key: 'leave' }, { header: 'غياب', key: 'absence' }, { header: 'حضور', key: 'present' }],
    map: (x) => x },
  transactions: { module: 'accounts', title: 'الحسابات', load: () => Transaction.find().sort({ date: -1 }).lean(),
    columns: [{ header: 'التاريخ', key: 'date' }, { header: 'النوع', key: 'type' }, { header: 'البند', key: 'category', width: 20 }, { header: 'المبلغ', key: 'amount', numFmt: '#,##0.00' }, { header: 'البيان', key: 'description', width: 44 }, { header: 'المرجع', key: 'reference' }],
    map: (x) => ({ ...x, date: d(x.date) }) },
};

r.get('/:entity', asyncH(async (req, res, next) => {
  const cfg = EXPORTS[req.params.entity];
  if (!cfg) throw new HttpError(404, 'Unknown export');
  return requirePerm(`${cfg.module}:export`)(req, res, async (err) => {
    if (err) return next(err);
    try {
      const rows = (await cfg.load(req)).map(cfg.map);
      const wb = await buildTableWorkbook({ title: cfg.title, columns: cfg.columns, rows });
      await writeAudit({ module: cfg.module, entity: req.params.entity, label: `Export ${cfg.title}`, action: 'export', user: req.user, ip: req.ip });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="ihss-${req.params.entity}-${new Date().toISOString().slice(0, 10)}.xlsx"`);
      await wb.xlsx.write(res);
      res.end();
    } catch (e) { next(e); }
  });
}));

export default r;
