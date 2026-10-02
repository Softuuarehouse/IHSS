import mongoose from 'mongoose';
import { trackable } from './plugins.js';

const weekSchema = new mongoose.Schema({
  attendance: Number, conduct: Number, participation: Number, homework: Number,
}, { _id: false });

const rowSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  name: String,        // snapshot so printed sheets never change when a student is renamed
  classroom: String,
  weeks: { type: [weekSchema], default: () => Array.from({ length: 5 }, () => ({})) },
  paper: { type: Number, default: null },
}, { _id: false });

const schema = new mongoose.Schema({
  academicYear: { type: String, required: true, index: true },
  gradeLevel: { type: String, enum: ['1Sec', '2Sec', '3Sec', 'Institute'], required: true },
  subjectName: { type: String, required: true, trim: true },
  component: { type: String, enum: ['theory', 'practical'], required: true },
  periodKey: { type: String, default: 'formative1' },
  periodLabel: { type: String, default: 'تكوينى اول' },
  monthLabel: { type: String, default: '' },
  teacherName: { type: String, default: '' },
  evaluationOfficer: { type: String, default: '' },
  academicManager: { type: String, default: '' },
  weekDates: { type: [Date], default: [] },
  criteria: [{ _id: false, key: String, label: String, labelEn: String, max: Number }],
  avgWeight: { type: Number, required: true },
  exam: { paperMax: Number, weight: Number, label: String, labelEn: String },
  locked: { type: Boolean, default: false },
  rows: [rowSchema],
});
trackable(schema);
export const Assessment = mongoose.model('Assessment', schema);

const subject = new mongoose.Schema({
  nameAr: { type: String, required: true, trim: true },
  nameEn: { type: String, trim: true, default: '' },
  category: { type: String, enum: ['general', 'technical'], required: true },
  hours: { '1Sec': { type: String, default: '' }, '2Sec': { type: String, default: '' }, '3Sec': { type: String, default: '' } },
  group: { type: String, default: '' },
});
trackable(subject);
export const Subject = mongoose.model('Subject', subject);
