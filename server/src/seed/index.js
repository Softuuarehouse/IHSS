// Usage:
//   npm run seed           → first Super Admin + curriculum reference data (safe for production)
//   npm run seed:sample    → also loads the sample records taken from the school's own sheets
//                            (8 students + their 2 grade sheets, 31 staff + attendance, 24 applicants).
//                            Contains real names — use on a private/staging database only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { User } from '../models/User.js';
import { Student } from '../models/Student.js';
import { Subject, Assessment } from '../models/Assessment.js';
import { Staff, AttendanceLedger } from '../models/Staff.js';
import { Application } from '../models/Application.js';
import { FeeRecord } from '../models/FeeRecord.js';
import { nextSeq } from '../models/plugins.js';
import { DOC_KEYS } from '../lib/documents.js';
import { TEMPLATES } from '../lib/grades.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (f) => JSON.parse(fs.readFileSync(path.join(here, 'data', f), 'utf8'));
const withSample = process.argv.includes('--sample');
const by = { createdByName: 'seed', updatedByName: 'seed' };

await mongoose.connect(config.mongoUri);

// 1) first Super Admin
if (!(await User.exists({ role: 'super_admin' }))) {
  let password = config.superAdmin.password;
  let generated = false;
  if (!password) { password = crypto.randomBytes(9).toString('base64url') + '9a'; generated = true; }
  await User.create({ name: config.superAdmin.name, email: config.superAdmin.email, role: 'super_admin', passwordHash: await bcrypt.hash(password, 12), mustChangePassword: true });
  console.log(`✔ Super Admin created: ${config.superAdmin.email}${generated ? `  (one-time password: ${password})` : ''}`);
} else console.log('• Super Admin already exists');

// 2) curriculum
if (!(await Subject.countDocuments())) {
  await Subject.insertMany(load('subjects.json').map((s) => ({ ...s, ...by })));
  console.log('✔ Curriculum loaded (15 subjects)');
}

if (withSample) {
  if (!(await Student.countDocuments())) {
    const students = [];
    for (const s of load('students.json')) {
      students.push(await Student.create({ ...s, classroom: '1Sec-A', studentCode: `IHSS-2025-${String(await nextSeq('student')).padStart(4, '0')}`, ...by }));
    }
    for (const s of students) await FeeRecord.create({ student: s._id, academicYear: '2025/2026', term: 'first', tuition: 40000, ...by });
    console.log(`✔ ${students.length} students + first-term fee lines`);

    const idByName = new Map(students.map((s) => [s.fullName, s]));
    for (const sh of load('assessments.json')) {
      const t = TEMPLATES[sh.component];
      await Assessment.create({
        academicYear: sh.academicYear, gradeLevel: sh.gradeLevel, subjectName: sh.subjectName, component: sh.component, periodKey: sh.periodKey,
        periodLabel: sh.periodLabel, monthLabel: sh.monthLabel, teacherName: sh.teacherName, evaluationOfficer: sh.evaluationOfficer, academicManager: sh.academicManager,
        weekDates: sh.weekDates, criteria: t.criteria, avgWeight: t.avgWeight, exam: t.exam, ...by,
        rows: sh.rows.map((r) => ({ student: idByName.get(r.name)._id, name: r.name, classroom: '1Sec-A', weeks: r.weeks, paper: r.paper })),
      });
    }
    console.log('✔ 2 assessment sheets (theory + practical, Formative 1)');
  } else console.log('• Students exist — skipping student sample');

  if (!(await Staff.countDocuments())) {
    const staff = await Staff.insertMany(load('staff.json').map((s) => ({ ...s, ...by })));
    const byName = new Map(staff.map((s) => [s.fullName, s]));
    const ledgers = load('attendance.json').filter((l) => byName.has(l.staff)).map((l) => {
      const present = Math.max(0, l.workingDays - l.leave - l.absence);
      return { staff: byName.get(l.staff)._id, month: l.month, workingDays: l.workingDays, leave: l.leave, absence: l.absence, present, notes: l.notes, ...by };
    });
    await AttendanceLedger.insertMany(ledgers);
    console.log(`✔ ${staff.length} staff + ${ledgers.length} monthly attendance rows`);
  } else console.log('• Staff exist — skipping staff sample');

  if (!(await Application.countDocuments())) {
    const apps = load('applicants.json').map((a) => {
      const docs = DOC_KEYS.map((k) => ({ key: k, status: a.received.includes(k) ? 'received' : a.missing.includes(k) ? 'missing' : 'na', note: '' }));
      return new Application({ applicantName: a.applicantName, gradeLevel: '1Sec', stage: 'application', documents: docs, ...by });
    });
    for (const a of apps) await a.save(); // runs the doc-counting hook
    console.log(`✔ ${apps.length} applications with document checklists`);
  } else console.log('• Applications exist — skipping applicant sample');
}

await mongoose.disconnect();
