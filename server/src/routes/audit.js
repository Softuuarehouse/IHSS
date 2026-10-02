import express from 'express';
import { AuditLog } from '../models/AuditLog.js';
import { authenticate, requireSuper, requirePerm } from '../middleware/auth.js';
import { HttpError, asyncH } from '../lib/http.js';
import { ENTITY_MODULE, hasPerm } from '../lib/permissions.js';

const r = express.Router();
r.use(authenticate);

// Global audit trail — Super Admin only.
r.get('/', requireSuper, asyncH(async (req, res) => {
  const q = {};
  for (const f of ['module', 'entity', 'entityId', 'action']) if (req.query[f]) q[f] = String(req.query[f]);
  if (req.query.actor) q['actor.id'] = String(req.query.actor);
  if (req.query.from || req.query.to) { q.at = {}; if (req.query.from) q.at.$gte = new Date(String(req.query.from)); if (req.query.to) q.at.$lte = new Date(String(req.query.to)); }
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
  const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);
  const [items, total] = await Promise.all([AuditLog.find(q).sort({ at: -1 }).skip(skip).limit(limit).lean(), AuditLog.countDocuments(q)]);
  res.json({ items, total });
}));

// History of one record — anyone allowed to view that module.
r.get('/record/:entity/:id', asyncH(async (req, res) => {
  const mod = ENTITY_MODULE[req.params.entity];
  if (!mod) throw new HttpError(404, 'Unknown entity');
  if (!hasPerm(req.user, `${mod}:view`)) throw new HttpError(403, `Missing permission: ${mod}:view`);
  res.json({ items: await AuditLog.find({ entity: req.params.entity, entityId: req.params.id }).sort({ at: -1 }).limit(200).lean() });
}));

export default r;
