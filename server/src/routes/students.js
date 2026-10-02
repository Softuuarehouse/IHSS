import { Student } from '../models/Student.js';
import { FeeRecord } from '../models/FeeRecord.js';
import { nextSeq } from '../models/plugins.js';
import { crudRouter } from '../lib/crud.js';
import { writeAudit } from '../lib/audit.js';
import { emitChange } from '../lib/realtime.js';

export default crudRouter({
  module: 'students', entity: 'students', Model: Student,
  fields: ['fullName', 'gradeLevel', 'classroom', 'program', 'status', 'gender', 'birthDate', 'guardianName', 'guardianPhone', 'address', 'notes', 'studentCode'],
  searchFields: ['fullName', 'studentCode', 'guardianName', 'guardianPhone'],
  filterFields: ['gradeLevel', 'classroom', 'status'],
  sort: { gradeLevel: 1, classroom: 1, fullName: 1 },
  label: (d) => d.fullName,
  hooks: {
    beforeCreate: async (data) => {
      if (!data.studentCode) data.studentCode = `IHSS-${new Date().getFullYear()}-${String(await nextSeq('student')).padStart(4, '0')}`;
      return data;
    },
    // Deleting a student used to leave their fee record behind with a dangling reference — it would
    // still show up in Revenue with a blank name/grade ("undefined" in the editor) since the student
    // it pointed to no longer existed. Remove those records together so nothing is ever orphaned.
    afterDelete: async (doc, req) => {
      const fees = await FeeRecord.find({ student: doc._id });
      if (!fees.length) return;
      await FeeRecord.deleteMany({ student: doc._id });
      for (const f of fees) emitChange({ entity: 'fees', module: 'fees', action: 'deleted', id: f._id, actor: { id: String(req.user._id), name: req.user.name, role: req.user.role } });
      await writeAudit({ module: 'fees', entity: 'fees', label: `Removed with student: ${doc.fullName}`, action: 'delete', user: req.user, ip: req.ip,
        changes: [{ field: 'feeRecordsRemoved', from: fees.length, to: 0 }] });
    },
  },
});