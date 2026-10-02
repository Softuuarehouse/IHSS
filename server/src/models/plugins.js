import mongoose from 'mongoose';

// Adds who-created / who-last-changed tracking + an optimistic-concurrency revision counter.
export function trackable(schema) {
  schema.add({
    rev: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdByName: String,
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedByName: String,
  });
  schema.set('timestamps', true);
  schema.set('toJSON', {
    virtuals: false,
    transform: (_doc, ret) => { delete ret.__v; return ret; },
  });
}

export const Counter = mongoose.model('Counter', new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } }));
export async function nextSeq(name) {
  const c = await Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return c.seq;
}
