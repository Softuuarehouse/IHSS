import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  module: { type: String, index: true },     // permission module: students, fees, hr …
  entity: { type: String, index: true },     // students, fees, staff, attendance …
  entityId: { type: String, index: true },
  label: String,                             // human readable ("Ahmed Tamer" / "Sheet: Theory – Formative 1")
  action: { type: String, index: true },     // create | update | delete | login | logout | permissions …
  changes: [{ _id: false, field: String, from: mongoose.Schema.Types.Mixed, to: mongoose.Schema.Types.Mixed }],
  actor: { id: String, name: String, role: String },
  ip: String,
  at: { type: Date, default: Date.now, index: true },
}, { versionKey: false });

export const AuditLog = mongoose.model('AuditLog', schema);
