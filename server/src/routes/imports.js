import express from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authenticate, requirePerm } from '../middleware/auth.js';
import { HttpError, asyncH } from '../lib/http.js';
import { loadWorkbook, parseAssessmentSheet, parseAttendanceSheet } from '../lib/importers.js';
import { TEMPLATES, emptyWeeks } from '../lib/grades.js';
import { Student } from '../models/Student.js';
import { Assessment } from '../models/Assessment.js';
import { Staff, AttendanceLedger } from '../models/Staff.js';
import { writeAudit, actorOf } from '../lib/audit.js';
import { emitChange, emitReload } from '../lib/realtime.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const r = express.Router();
r.use(authenticate);

// Excel → a new live grade sheet, pre-filled from the file. Students are matched by name
// (case/space-insensitive) within the target grade; unmatched names are created automatically.
// Guess theory/practical from the uploaded file's own name — the school always names these
// files "…نظرى…" or "…عملى…" (or "…theory…" / "…practical…"), so most imports need no manual pick.
// multer/busboy hand us the multipart filename header decoded as latin1 (a long-standing Node
// multipart quirk), which corrupts non-ASCII names like the school's Arabic filenames — undo that first.
function fixFilenameEncoding(name = '') {
  try { return Buffer.from(name, 'latin1').toString('utf8'); } catch { return name; }
}
function guessComponent(rawFilename = '') {
  const filename = fixFilenameEncoding(rawFilename);
  const n = filename.toLowerCase();
  if (/نظر/.test(filename) || n.includes('theory')) return 'theory';
  if (/عمل/.test(filename) || n.includes('practical')) return 'practical';
  return null;
}

r.post('/assessment', requirePerm('assessments:create'), upload.single('file'), asyncH(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'No file uploaded (field name "file")');
  const raw = z.object({
    academicYear: z.string().optional(), gradeLevel: z.enum(['1Sec', '2Sec', '3Sec', 'Institute']).default('1Sec'),
    component: z.enum(['theory', 'practical']).optional(), subjectName: z.string().max(120).optional(),
    classroom: z.string().max(40).optional(), teacherName: z.string().max(120).default(''),
    evaluationOfficer: z.string().max(120).default(''), academicManager: z.string().max(120).default(''),
    periodKey: z.string().max(40).default('formative1'),
  }).parse(req.body);

  const component = raw.component || guessComponent(req.file.originalname);
  if (!component) throw new HttpError(400, 'Could not tell theory from practical — please choose the component, or name the file …نظرى… / …عملى….');
  const d = { ...raw, component };

  let parsed;
  try { parsed = parseAssessmentSheet(await loadWorkbook(req.file.buffer), d.component); }
  catch (e) { throw new HttpError(400, `Could not read the file: ${e.message}`); }

  // The sheet itself carries no year or subject name, so fall back to what the file gives us
  // (week dates → academic year) and a sensible default subject, both still overridable by the admin.
  d.academicYear = d.academicYear || parsed.academicYear;
  if (!d.academicYear) throw new HttpError(400, 'Could not detect the academic year from the file — please enter it.');
  d.subjectName = d.subjectName || 'الدراسات الفنية التخصصية';

  const existing = await Student.find({ gradeLevel: d.gradeLevel, fullName: { $in: parsed.rows.map((x) => x.name) } });
  const byName = new Map(existing.map((s) => [s.fullName.trim(), s]));
  let created = 0;
  const rows = [];
  for (const row of parsed.rows) {
    let student = byName.get(row.name.trim());
    if (!student) {
      student = await Student.create({ fullName: row.name, gradeLevel: d.gradeLevel, classroom: row.classroom || d.classroom || '',
        createdBy: req.user._id, createdByName: req.user.name, updatedBy: req.user._id, updatedByName: req.user.name });
      byName.set(row.name.trim(), student);
      emitChange({ entity: 'students', module: 'students', action: 'created', doc: student.toJSON(), actor: actorOf(req.user) });
      created++;
    }
    rows.push({ student: student._id, name: row.name, classroom: row.classroom || student.classroom, weeks: row.weeks.length ? row.weeks : emptyWeeks(), paper: row.paper });
  }

  const tpl = TEMPLATES[d.component];
  const doc = await Assessment.create({
    academicYear: d.academicYear, gradeLevel: d.gradeLevel, subjectName: d.subjectName, component: d.component, periodKey: d.periodKey,
    periodLabel: parsed.periodLabel || 'تكوينى اول', monthLabel: parsed.monthLabel, teacherName: d.teacherName, evaluationOfficer: d.evaluationOfficer,
    academicManager: d.academicManager, weekDates: parsed.weekDates, criteria: tpl.criteria, avgWeight: tpl.avgWeight, exam: tpl.exam, rows,
    createdBy: req.user._id, createdByName: req.user.name, updatedBy: req.user._id, updatedByName: req.user.name,
  });
  await writeAudit({ module: 'assessments', entity: 'assessments', entityId: doc._id, label: `Import — ${d.subjectName} (${d.component})`, action: 'create', user: req.user, ip: req.ip,
    changes: [{ field: 'imported rows', from: null, to: rows.length }, { field: 'new students created', from: null, to: created }] });
  emitChange({ entity: 'assessments', module: 'assessments', action: 'created', doc: doc.toJSON(), actor: actorOf(req.user) });
  res.status(201).json({ id: doc._id, studentsImported: rows.length, studentsCreated: created, component: d.component, academicYear: d.academicYear, subjectName: d.subjectName });
}));

// Excel → staff list + monthly attendance ledgers. Existing employees (matched by name) are updated
// in place; the sheet's own leave/absence/working-days values are trusted as-is.
r.post('/attendance', requirePerm('hr:create'), upload.single('file'), asyncH(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'No file uploaded (field name "file")');
  const { startYear } = z.object({ startYear: z.string().regex(/^\d{4}$/) }).parse(req.body);

  let parsed;
  try { parsed = parseAttendanceSheet(await loadWorkbook(req.file.buffer), Number(startYear)); }
  catch (e) { throw new HttpError(400, `Could not read the file: ${e.message}`); }

  const existing = await Staff.find({ fullName: { $in: parsed.staff.map((s) => s.fullName) } });
  const byName = new Map(existing.map((s) => [s.fullName.trim(), s]));
  let staffCreated = 0;
  for (const s of parsed.staff) {
    const { summary, ...base } = s;
    const stats = Object.keys(summary || {}).length ? summary : undefined;
    let doc = byName.get(s.fullName.trim());
    if (!doc) {
      doc = await Staff.create({ ...base, importedStats: stats, createdBy: req.user._id, createdByName: req.user.name, updatedBy: req.user._id, updatedByName: req.user.name });
      byName.set(s.fullName.trim(), doc);
      emitChange({ entity: 'staff', module: 'hr', action: 'created', doc: doc.toJSON(), actor: actorOf(req.user) });
      staffCreated++;
    } else if (stats) {
      // Refresh the school's own yearly totals on re-import even for employees that already exist.
      doc.importedStats = stats; doc.updatedBy = req.user._id; doc.updatedByName = req.user.name; doc.rev += 1;
      await doc.save();
      emitChange({ entity: 'staff', module: 'hr', action: 'updated', doc: doc.toJSON(), actor: actorOf(req.user) });
    }
  }

  let ledgersWritten = 0;
  for (const l of parsed.ledgers) {
    const staff = byName.get(l.staffName.trim()); if (!staff) continue;
    const present = Math.max(0, l.workingDays - l.leave - l.absence);
    const doc = await AttendanceLedger.findOneAndUpdate({ staff: staff._id, month: l.month },
      { $set: { workingDays: l.workingDays, leave: l.leave, absence: l.absence, present, notes: l.notes, updatedBy: req.user._id, updatedByName: req.user.name },
        $setOnInsert: { createdBy: req.user._id, createdByName: req.user.name }, $inc: { rev: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true });
    emitChange({ entity: 'attendance', module: 'hr', action: 'updated', doc: { ...doc.toJSON(), staffId: String(staff._id) }, actor: actorOf(req.user) });
    ledgersWritten++;
  }
  await writeAudit({ module: 'hr', entity: 'staff', label: `Import attendance — ${parsed.months[0]}…${parsed.months.at(-1)}`, action: 'create', user: req.user, ip: req.ip,
    changes: [{ field: 'employees', from: null, to: parsed.staff.length }, { field: 'new employees', from: null, to: staffCreated }, { field: 'monthly rows written', from: null, to: ledgersWritten }, { field: 'yearly summary fields captured', from: null, to: parsed.summaryFields }] });
  emitReload({ module: 'hr', entity: 'staff' });
  res.status(201).json({ staffImported: parsed.staff.length, staffCreated, months: parsed.months, ledgersWritten, summaryFields: parsed.summaryFields });
}));

export default r;
