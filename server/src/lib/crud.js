import express from 'express';
import { authenticate, requirePerm } from '../middleware/auth.js';
import { HttpError, asyncH, pick, escapeRegex } from './http.js';
import { diff, writeAudit, actorOf } from './audit.js';
import { emitChange } from './realtime.js';
import { AuditLog } from '../models/AuditLog.js';

/**
 * Generic, permission-guarded, audited, real-time CRUD router.
 * Every write: (1) checks `${module}:${action}`, (2) enforces optimistic concurrency (`rev`),
 * (3) writes an audit record with from→to per field, (4) broadcasts to every connected viewer.
 */
export function crudRouter({
  module, entity, Model, fields, createFields, searchFields = [], filterFields = [],
  populate = '', sort = { createdAt: -1 }, label = (d) => String(d._id),
  hooks = {}, // beforeCreate(data, req), afterCreate(doc, req), beforeUpdate(doc, patch, req), beforeDelete(doc, req), afterDelete(doc, req)
}) {
  const r = express.Router();
  r.use(authenticate);
  const load = async (doc) => (populate ? doc.populate(populate) : doc);
  const json = (d) => (d?.toJSON ? d.toJSON() : d);

  r.get('/', requirePerm(`${module}:view`), asyncH(async (req, res) => {
    const q = {};
    for (const f of filterFields) if (req.query[f] !== undefined && req.query[f] !== '') q[f] = String(req.query[f]);
    if (req.query.q && searchFields.length) {
      const rx = new RegExp(escapeRegex(String(req.query.q).slice(0, 80)), 'i');
      q.$or = searchFields.map((f) => ({ [f]: rx }));
    }
    if (hooks.scope) Object.assign(q, hooks.scope(req));
    const limit = Math.min(parseInt(req.query.limit, 10) || 1000, 3000);
    const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);
    let cursor = Model.find(q).sort(sort).skip(skip).limit(limit);
    if (populate) cursor = cursor.populate(populate);
    const [items, total] = await Promise.all([cursor, Model.countDocuments(q)]);
    res.json({ items: items.map(json), total });
  }));

  r.get('/:id', requirePerm(`${module}:view`), asyncH(async (req, res) => {
    const doc = await Model.findById(req.params.id);
    if (!doc) throw new HttpError(404, 'Not found');
    res.json(json(await load(doc)));
  }));

  r.post('/', requirePerm(`${module}:create`), asyncH(async (req, res) => {
    let data = pick(req.body, createFields || fields);
    if (hooks.beforeCreate) data = (await hooks.beforeCreate(data, req)) || data;
    const doc = new Model({ ...data, createdBy: req.user._id, createdByName: req.user.name, updatedBy: req.user._id, updatedByName: req.user.name });
    await doc.save();
    if (hooks.afterCreate) await hooks.afterCreate(doc, req);
    await load(doc);
    await writeAudit({ module, entity, entityId: doc._id, label: label(doc), action: 'create', user: req.user, ip: req.ip,
      changes: Object.keys(data).map((f) => ({ field: f, from: null, to: JSON.parse(JSON.stringify(data[f] ?? null)) })) });
    emitChange({ module, entity, action: 'created', doc: json(doc), actor: actorOf(req.user) });
    res.status(201).json(json(doc));
  }));

  r.patch('/:id', requirePerm(`${module}:edit`), asyncH(async (req, res) => {
    const doc = await Model.findById(req.params.id);
    if (!doc) throw new HttpError(404, 'Not found');
    if (req.body.rev !== undefined && Number(req.body.rev) !== doc.rev) {
      throw new HttpError(409, 'This record was changed by someone else. Review the latest version and try again.', { code: 'CONFLICT', current: json(await load(doc)) });
    }
    const patch = pick(req.body, fields);
    const before = doc.toObject();
    if (hooks.beforeUpdate) await hooks.beforeUpdate(doc, patch, req);
    doc.set(patch);
    await doc.validate(); // runs pre-validate hooks (computed fields) before we diff
    const changes = diff(before, doc.toObject(), Object.keys(patch));
    if (changes.length === 0) return res.json(json(await load(doc)));
    doc.rev = (doc.rev || 0) + 1;
    doc.updatedBy = req.user._id;
    doc.updatedByName = req.user.name;
    await doc.save();
    await load(doc);
    await writeAudit({ module, entity, entityId: doc._id, label: label(doc), action: 'update', changes, user: req.user, ip: req.ip });
    emitChange({ module, entity, action: 'updated', doc: json(doc), changes, actor: actorOf(req.user) });
    res.json(json(doc));
  }));

  r.delete('/:id', requirePerm(`${module}:delete`), asyncH(async (req, res) => {
    const doc = await Model.findById(req.params.id);
    if (!doc) throw new HttpError(404, 'Not found');
    if (hooks.beforeDelete) await hooks.beforeDelete(doc, req);
    const snapshot = json(await load(doc));
    await doc.deleteOne();
    if (hooks.afterDelete) await hooks.afterDelete(doc, req);
    await writeAudit({ module, entity, entityId: doc._id, label: label(doc), action: 'delete', user: req.user, ip: req.ip,
      changes: [{ field: 'record', from: snapshot, to: null }] });
    emitChange({ module, entity, action: 'deleted', id: doc._id, doc: null, actor: actorOf(req.user) });
    res.json({ ok: true });
  }));

  // Per-record history: who changed what, and when. Visible to anyone who may view the module.
  r.get('/:id/history', requirePerm(`${module}:view`), asyncH(async (req, res) => {
    const items = await AuditLog.find({ entity, entityId: req.params.id }).sort({ at: -1 }).limit(200).lean();
    res.json({ items });
  }));

  return r;
}
