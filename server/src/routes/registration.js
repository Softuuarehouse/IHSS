import express from 'express';
import { z } from 'zod';
import { Application } from '../models/Application.js';
import { Student } from '../models/Student.js';
import { nextSeq } from '../models/plugins.js';
import { crudRouter } from '../lib/crud.js';
import { authenticate, requirePerm } from '../middleware/auth.js';
import { HttpError, asyncH } from '../lib/http.js';
import { writeAudit, actorOf } from '../lib/audit.js';
import { emitChange } from '../lib/realtime.js';
import { defaultDocuments } from '../lib/documents.js';

const custom = express.Router();
custom.use(authenticate);

// Move an application to "enrolled": creates the Student record (student affairs sees it instantly).
custom.post('/:id/enroll', requirePerm('registration:edit'), asyncH(async (req, res) => {
  if (req.user.role !== 'super_admin' && !(req.user.permissions || []).includes('students:create')) {
    throw new HttpError(403, 'Enrolling creates a student record — requires students:create');
  }
  const { force } = z.object({ force: z.boolean().optional() }).parse(req.body || {});
  const app = await Application.findById(req.params.id);
  if (!app) throw new HttpError(404, 'Not found');
  if (app.stage === 'enrolled') throw new HttpError(400, 'Already enrolled');
  if (app.docsMissing > 0 && !force) throw new HttpError(409, `${app.docsMissing} document(s) still missing`, { code: 'DOCS_MISSING', missing: app.docsMissing });

  const student = await Student.create({
    fullName: app.applicantName, gradeLevel: app.gradeLevel, guardianName: app.guardianName, guardianPhone: app.guardianPhone,
    studentCode: `IHSS-${new Date().getFullYear()}-${String(await nextSeq('student')).padStart(4, '0')}`,
    application: app._id, createdBy: req.user._id, createdByName: req.user.name, updatedBy: req.user._id, updatedByName: req.user.name,
  });
  const before = app.stage;
  app.stage = 'enrolled'; app.enrolledStudent = student._id; app.rev += 1; app.updatedBy = req.user._id; app.updatedByName = req.user.name;
  await app.save();
  await writeAudit({ module: 'registration', entity: 'applications', entityId: app._id, label: app.applicantName, action: 'update', user: req.user, ip: req.ip,
    changes: [{ field: 'stage', from: before, to: 'enrolled' }, { field: 'enrolledStudent', from: null, to: String(student._id) }] });
  await writeAudit({ module: 'students', entity: 'students', entityId: student._id, label: student.fullName, action: 'create', user: req.user, ip: req.ip,
    changes: [{ field: 'source', from: null, to: 'registration' }] });
  emitChange({ entity: 'applications', module: 'registration', action: 'updated', doc: app.toJSON(), actor: actorOf(req.user) });
  emitChange({ entity: 'students', module: 'students', action: 'created', doc: student.toJSON(), actor: actorOf(req.user) });
  res.json({ application: app.toJSON(), student: student.toJSON() });
}));

const generic = crudRouter({
  module: 'registration', entity: 'applications', Model: Application,
  fields: ['applicantName', 'gradeLevel', 'stage', 'guardianName', 'guardianPhone', 'examReceiptNo', 'notes', 'documents'],
  searchFields: ['applicantName', 'guardianName', 'guardianPhone'],
  filterFields: ['stage', 'gradeLevel'],
  sort: { createdAt: 1 },
  label: (d) => d.applicantName,
  hooks: {
    beforeCreate: (data) => ({ ...data, documents: data.documents?.length ? data.documents : defaultDocuments(), stage: 'application' }),
    beforeUpdate: (doc, patch) => { if (patch.stage === 'enrolled' && doc.stage !== 'enrolled') throw new HttpError(400, 'Use the Enroll action to create the student record'); },
  },
});

const router = express.Router();
router.use(custom, generic);
export default router;
