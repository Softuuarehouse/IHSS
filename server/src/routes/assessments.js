import express from 'express';
import { z } from 'zod';
import { Assessment, Subject } from '../models/Assessment.js';
import { Student } from '../models/Student.js';
import { crudRouter } from '../lib/crud.js';
import { authenticate, requirePerm } from '../middleware/auth.js';
import { HttpError, asyncH, pick } from '../lib/http.js';
import { diff, writeAudit, actorOf } from '../lib/audit.js';
import { emitChange, emitToRoom } from '../lib/realtime.js';
import { TEMPLATES, computeRow, maxima, validateCell, emptyWeeks } from '../lib/grades.js';
import { buildAssessmentWorkbook } from '../lib/excel.js';

const r = express.Router();
r.use(authenticate);

const withComputed = (sheetDoc) => {
  const s = sheetDoc.toJSON ? sheetDoc.toJSON() : sheetDoc;
  return { ...s, maxima: maxima(s), rows: (s.rows || []).map((row) => ({ ...row, computed: computeRow(s, row) })) };
};
const summary = (s) => ({ ...s.toJSON(), rows: undefined, studentCount: s.rows.length });

// Sheet list (no rows — light payload)
r.get('/', requirePerm('assessments:view'), asyncH(async (req, res) => {
  const q = {};
  for (const f of ['academicYear', 'gradeLevel', 'component', 'periodKey']) if (req.query[f]) q[f] = String(req.query[f]);
  const sheets = await Assessment.find(q).sort({ academicYear: -1, gradeLevel: 1, subjectName: 1, component: 1 });
  res.json({ items: sheets.map(summary), total: sheets.length });
}));

// Create a sheet from the theory / practical template, pre-filled with the grade's active students.
const createBody = z.object({
  academicYear: z.string().min(4), gradeLevel: z.enum(['1Sec', '2Sec', '3Sec', 'Institute']),
  subjectName: z.string().min(2).max(120), component: z.enum(['theory', 'practical']),
  periodKey: z.string().max(40).default('formative1'), periodLabel: z.string().max(80).default('تكوينى اول'),
  monthLabel: z.string().max(80).default(''), teacherName: z.string().max(120).default(''),
  evaluationOfficer: z.string().max(120).default(''), academicManager: z.string().max(120).default(''),
  weekDates: z.array(z.coerce.date()).min(1).max(6).optional(), classroom: z.string().max(40).optional(),
});
r.post('/', requirePerm('assessments:create'), asyncH(async (req, res) => {
  const d = createBody.parse(req.body);
  const t = TEMPLATES[d.component];
  const students = await Student.find({ status: 'active', gradeLevel: d.gradeLevel, ...(d.classroom ? { classroom: d.classroom } : {}) }).sort({ fullName: 1 });
  const weekDates = d.weekDates || [];
  const doc = await Assessment.create({
    ...d, weekDates, criteria: t.criteria, avgWeight: t.avgWeight, exam: t.exam,
    rows: students.map((s) => ({ student: s._id, name: s.fullName, classroom: s.classroom, weeks: emptyWeeks(weekDates.length || 5), paper: null })),
    createdBy: req.user._id, createdByName: req.user.name, updatedBy: req.user._id, updatedByName: req.user.name,
  });
  await writeAudit({ module: 'assessments', entity: 'assessments', entityId: doc._id, label: `${d.subjectName} (${d.component}) – ${d.periodLabel}`, action: 'create', user: req.user, ip: req.ip,
    changes: [{ field: 'students', from: null, to: students.length }] });
  emitChange({ entity: 'assessments', module: 'assessments', action: 'created', doc: summary(doc), actor: actorOf(req.user) });
  res.status(201).json(withComputed(doc));
}));

r.get('/:id', requirePerm('assessments:view'), asyncH(async (req, res) => {
  const doc = await Assessment.findById(req.params.id);
  if (!doc) throw new HttpError(404, 'Sheet not found');
  res.json(withComputed(doc));
}));

// Sheet meta (teacher, signatures, dates, lock). Rows are edited cell-by-cell below.
r.patch('/:id', requirePerm('assessments:edit'), asyncH(async (req, res) => {
  const doc = await Assessment.findById(req.params.id);
  if (!doc) throw new HttpError(404, 'Sheet not found');
  if (req.body.rev !== undefined && Number(req.body.rev) !== doc.rev) throw new HttpError(409, 'Sheet changed by someone else', { code: 'CONFLICT' });
  const fields = ['teacherName', 'evaluationOfficer', 'academicManager', 'monthLabel', 'periodLabel', 'weekDates', 'locked'];
  const patch = pick(req.body, fields);
  const before = doc.toObject();
  doc.set(patch);
  const changes = diff(before, doc.toObject(), Object.keys(patch));
  if (!changes.length) return res.json(withComputed(doc));
  doc.rev += 1; doc.updatedBy = req.user._id; doc.updatedByName = req.user.name;
  await doc.save();
  await writeAudit({ module: 'assessments', entity: 'assessments', entityId: doc._id, label: `${doc.subjectName} (${doc.component})`, action: 'update', changes, user: req.user, ip: req.ip });
  emitChange({ entity: 'assessments', module: 'assessments', action: 'updated', doc: summary(doc), changes, actor: actorOf(req.user) });
  emitToRoom(`assessment:${doc._id}`, 'assessment:meta', { id: String(doc._id), sheet: withComputed(doc), actor: actorOf(req.user) });
  res.json(withComputed(doc));
}));

// ── Cell edit: atomic, validated, audited (who / when / old → new) and pushed live to everyone on the sheet.
const cellBody = z.object({ studentId: z.string().min(1), week: z.number().int().nullable().optional(), key: z.string().min(1), value: z.union([z.number(), z.string(), z.null()]) });
r.patch('/:id/cell', requirePerm('assessments:edit'), asyncH(async (req, res) => {
  const b = cellBody.parse(req.body);
  const sheet = await Assessment.findById(req.params.id).lean();
  if (!sheet) throw new HttpError(404, 'Sheet not found');
  if (sheet.locked) throw new HttpError(423, 'This sheet is locked');
  const row = sheet.rows.find((x) => String(x.student) === b.studentId);
  if (!row) throw new HttpError(404, 'Student is not on this sheet');
  let value;
  try { value = validateCell(sheet, { week: b.week ?? undefined, key: b.key, value: b.value }); } catch (m) { throw new HttpError(400, String(m)); }

  const idx = sheet.rows.findIndex((x) => String(x.student) === b.studentId);
  const path = b.key === 'paper' ? `rows.${idx}.paper` : `rows.${idx}.weeks.${b.week}.${b.key}`;
  const oldValue = b.key === 'paper' ? row.paper ?? null : row.weeks?.[b.week]?.[b.key] ?? null;
  if (oldValue === value) return res.json({ unchanged: true });

  // Atomic: the filter re-checks that this index still holds this student, so a concurrent row add/remove can never
  // make us write into somebody else's row.
  const upd = await Assessment.updateOne({ _id: sheet._id, [`rows.${idx}.student`]: row.student },
    { $set: { [path]: value, updatedBy: req.user._id, updatedByName: req.user.name, updatedAt: new Date() }, $inc: { rev: 1 } });
  if (!upd.matchedCount) throw new HttpError(409, 'The sheet changed while you were editing. Reloading…', { code: 'CONFLICT' });

  const updatedRow = JSON.parse(JSON.stringify(row));
  if (b.key === 'paper') updatedRow.paper = value; else { updatedRow.weeks[b.week] = { ...(updatedRow.weeks[b.week] || {}), [b.key]: value }; }
  const computed = computeRow(sheet, updatedRow);
  const crit = sheet.criteria.find((c) => c.key === b.key);
  const fieldLabel = `${row.name} › ${b.key === 'paper' ? sheet.exam.label : `${crit.label} (W${b.week + 1})`}`;
  await writeAudit({ module: 'assessments', entity: 'assessments', entityId: sheet._id, label: `${sheet.subjectName} (${sheet.component}) – ${sheet.periodLabel}`,
    action: 'update', changes: [{ field: fieldLabel, from: oldValue, to: value }], user: req.user, ip: req.ip });
  const event = { id: String(sheet._id), studentId: b.studentId, week: b.week ?? null, key: b.key, value, from: oldValue, computed, actor: actorOf(req.user), at: new Date().toISOString() };
  emitToRoom(`assessment:${sheet._id}`, 'assessment:cell', event);
  res.json(event);
}));

// Add students (e.g. new enrolment) / remove a student row
r.post('/:id/students', requirePerm('assessments:edit'), asyncH(async (req, res) => {
  const { studentIds } = z.object({ studentIds: z.array(z.string()).min(1).max(200) }).parse(req.body);
  const doc = await Assessment.findById(req.params.id);
  if (!doc) throw new HttpError(404, 'Sheet not found');
  if (doc.locked) throw new HttpError(423, 'This sheet is locked');
  const have = new Set(doc.rows.map((x) => String(x.student)));
  const students = await Student.find({ _id: { $in: studentIds } });
  let added = 0;
  for (const s of students) if (!have.has(String(s._id))) { doc.rows.push({ student: s._id, name: s.fullName, classroom: s.classroom, weeks: emptyWeeks(doc.weekDates.length || 5), paper: null }); added++; }
  doc.rev += 1; doc.updatedBy = req.user._id; doc.updatedByName = req.user.name;
  await doc.save();
  await writeAudit({ module: 'assessments', entity: 'assessments', entityId: doc._id, label: `${doc.subjectName} (${doc.component})`, action: 'update', changes: [{ field: 'students added', from: null, to: added }], user: req.user, ip: req.ip });
  emitToRoom(`assessment:${doc._id}`, 'assessment:meta', { id: String(doc._id), sheet: withComputed(doc), actor: actorOf(req.user) });
  emitChange({ entity: 'assessments', module: 'assessments', action: 'updated', doc: summary(doc), actor: actorOf(req.user) });
  res.json(withComputed(doc));
}));

r.delete('/:id/students/:studentId', requirePerm('assessments:edit'), asyncH(async (req, res) => {
  const doc = await Assessment.findById(req.params.id);
  if (!doc) throw new HttpError(404, 'Sheet not found');
  if (doc.locked) throw new HttpError(423, 'This sheet is locked');
  const row = doc.rows.find((x) => String(x.student) === req.params.studentId);
  if (!row) throw new HttpError(404, 'Student is not on this sheet');
  doc.rows = doc.rows.filter((x) => String(x.student) !== req.params.studentId);
  doc.rev += 1; doc.updatedBy = req.user._id; doc.updatedByName = req.user.name;
  await doc.save();
  await writeAudit({ module: 'assessments', entity: 'assessments', entityId: doc._id, label: `${doc.subjectName} (${doc.component})`, action: 'update', changes: [{ field: 'student removed', from: row.name, to: null }], user: req.user, ip: req.ip });
  emitToRoom(`assessment:${doc._id}`, 'assessment:meta', { id: String(doc._id), sheet: withComputed(doc), actor: actorOf(req.user) });
  res.json(withComputed(doc));
}));

r.delete('/:id', requirePerm('assessments:delete'), asyncH(async (req, res) => {
  const doc = await Assessment.findById(req.params.id);
  if (!doc) throw new HttpError(404, 'Sheet not found');
  await doc.deleteOne();
  await writeAudit({ module: 'assessments', entity: 'assessments', entityId: doc._id, label: `${doc.subjectName} (${doc.component}) – ${doc.periodLabel}`, action: 'delete', user: req.user, ip: req.ip });
  emitChange({ entity: 'assessments', module: 'assessments', action: 'deleted', id: doc._id, actor: actorOf(req.user) });
  res.json({ ok: true });
}));

r.get('/:id/history', requirePerm('assessments:view'), asyncH(async (req, res) => {
  const { AuditLog } = await import('../models/AuditLog.js');
  res.json({ items: await AuditLog.find({ entity: 'assessments', entityId: req.params.id }).sort({ at: -1 }).limit(300).lean() });
}));

// Excel in the ministry layout — with live formulas so it keeps working when opened in Excel.
r.get('/:id/export', requirePerm('assessments:export'), asyncH(async (req, res) => {
  const doc = await Assessment.findById(req.params.id);
  if (!doc) throw new HttpError(404, 'Sheet not found');
  const wb = await buildAssessmentWorkbook(doc.toJSON());
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="assessment-${doc._id}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}));

// ── Curriculum (general plan) ────────────────────────────────────────────────
export const subjectsRouter = crudRouter({
  module: 'assessments', entity: 'subjects', Model: Subject,
  fields: ['nameAr', 'nameEn', 'category', 'hours', 'group'], searchFields: ['nameAr', 'nameEn'], filterFields: ['category'],
  sort: { category: 1, createdAt: 1 }, label: (d) => d.nameEn || d.nameAr,
});

export default r;
