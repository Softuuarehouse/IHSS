import mongoose from 'mongoose';
import { trackable } from './plugins.js';
import { defaultDocuments, DOC_KEYS, STAGES } from '../lib/documents.js';

const doc = new mongoose.Schema({
  key: { type: String, enum: DOC_KEYS, required: true },
  status: { type: String, enum: ['received', 'missing', 'na'], default: 'missing' },
  note: { type: String, default: '' },
}, { _id: false });

const schema = new mongoose.Schema({
  applicantName: { type: String, required: true, trim: true, maxlength: 200 },
  gradeLevel: { type: String, enum: ['1Sec', '2Sec', '3Sec', 'Institute'], default: '1Sec' },
  stage: { type: String, enum: STAGES, default: 'application', index: true },
  guardianName: { type: String, trim: true, default: '' },
  guardianPhone: { type: String, trim: true, default: '' },
  examReceiptNo: { type: String, trim: true, default: '' },
  notes: { type: String, default: '' },
  documents: { type: [doc], default: defaultDocuments },
  docsReceived: { type: Number, default: 0 },
  docsMissing: { type: Number, default: 0 },
  enrolledStudent: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
});
trackable(schema);

schema.pre('validate', function countDocs(next) {
  this.docsReceived = this.documents.filter((d) => d.status === 'received').length;
  this.docsMissing = this.documents.filter((d) => d.status === 'missing').length;
  next();
});

export const Application = mongoose.model('Application', schema);
