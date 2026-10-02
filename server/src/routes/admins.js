import express from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User } from '../models/User.js';
import { authenticate, requireSuper } from '../middleware/auth.js';
import { HttpError, asyncH } from '../lib/http.js';
import { diff, writeAudit, actorOf } from '../lib/audit.js';
import { sanitizePermissions } from '../lib/permissions.js';
import { emitChange, emitToUser } from '../lib/realtime.js';
import { passwordRule } from './auth.js';

// Only Super Admins can reach anything in here — this is the "add admins & grant access" section.
const r = express.Router();
r.use(authenticate, requireSuper);

const body = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  title: z.string().trim().max(120).optional(),
  role: z.enum(['super_admin', 'admin']).default('admin'),
  permissions: z.array(z.string()).default([]),
});

const shape = (u) => u.toJSON();
const activeSuperCount = () => User.countDocuments({ role: 'super_admin', active: true });

r.get('/', asyncH(async (_req, res) => {
  const items = await User.find().sort({ role: 1, createdAt: 1 });
  res.json({ items: items.map(shape) });
}));

r.post('/', asyncH(async (req, res) => {
  const data = body.extend({ password: passwordRule }).parse(req.body);
  if (await User.exists({ email: data.email.toLowerCase() })) throw new HttpError(409, 'An account with this email already exists');
  const user = await User.create({
    name: data.name, email: data.email, title: data.title, role: data.role,
    permissions: data.role === 'super_admin' ? [] : sanitizePermissions(data.permissions),
    passwordHash: await bcrypt.hash(data.password, 12), mustChangePassword: true, createdBy: req.user._id,
  });
  await writeAudit({ module: 'admins', entity: 'users', entityId: user._id, label: `${user.name} <${user.email}>`, action: 'create', user: req.user, ip: req.ip,
    changes: [{ field: 'role', from: null, to: user.role }, { field: 'permissions', from: null, to: user.permissions }] });
  emitChange({ module: 'admins', entity: 'users', action: 'created', doc: shape(user), actor: actorOf(req.user) });
  res.status(201).json(shape(user));
}));

r.patch('/:id', asyncH(async (req, res) => {
  const patch = body.partial().extend({ active: z.boolean().optional() }).parse(req.body);
  const user = await User.findById(req.params.id);
  if (!user) throw new HttpError(404, 'Not found');
  const self = String(user._id) === String(req.user._id);
  if (self && (patch.active === false || (patch.role && patch.role !== 'super_admin'))) {
    throw new HttpError(400, 'You cannot deactivate or demote your own account');
  }
  const losingSuper = user.role === 'super_admin' && user.active && ((patch.role && patch.role !== 'super_admin') || patch.active === false);
  if (losingSuper && (await activeSuperCount()) <= 1) throw new HttpError(400, 'At least one active Super Admin must remain');
  if (patch.email && patch.email.toLowerCase() !== user.email && (await User.exists({ email: patch.email.toLowerCase() }))) throw new HttpError(409, 'Email already in use');

  const before = user.toObject();
  if (patch.permissions) patch.permissions = sanitizePermissions(patch.permissions);
  user.set(patch);
  if (user.role === 'super_admin') user.permissions = [];
  const deactivated = patch.active === false && before.active;
  if (deactivated) user.tokenVersion += 1; // kills existing sessions
  const changes = diff(before, user.toObject(), Object.keys(patch));
  await user.save();
  await writeAudit({ module: 'admins', entity: 'users', entityId: user._id, label: `${user.name} <${user.email}>`, action: deactivated ? 'deactivate' : 'update', changes, user: req.user, ip: req.ip });
  emitChange({ module: 'admins', entity: 'users', action: 'updated', doc: shape(user), changes, actor: actorOf(req.user) });
  emitToUser(user._id, deactivated ? 'auth:revoked' : 'auth:refresh'); // client reloads permissions / logs out immediately
  res.json(shape(user));
}));

r.post('/:id/reset-password', asyncH(async (req, res) => {
  const { password } = z.object({ password: passwordRule }).parse(req.body);
  const user = await User.findById(req.params.id);
  if (!user) throw new HttpError(404, 'Not found');
  user.passwordHash = await bcrypt.hash(password, 12);
  user.mustChangePassword = true;
  user.tokenVersion += 1;
  await user.save();
  await writeAudit({ module: 'admins', entity: 'users', entityId: user._id, label: user.email, action: 'password_reset', user: req.user, ip: req.ip });
  emitToUser(user._id, 'auth:revoked');
  res.json({ ok: true });
}));

r.delete('/:id', asyncH(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new HttpError(404, 'Not found');
  if (String(user._id) === String(req.user._id)) throw new HttpError(400, 'You cannot delete your own account');
  if (user.role === 'super_admin' && user.active && (await activeSuperCount()) <= 1) throw new HttpError(400, 'At least one active Super Admin must remain');
  await user.deleteOne();
  await writeAudit({ module: 'admins', entity: 'users', entityId: user._id, label: `${user.name} <${user.email}>`, action: 'delete', user: req.user, ip: req.ip });
  emitChange({ module: 'admins', entity: 'users', action: 'deleted', id: user._id, actor: actorOf(req.user) });
  emitToUser(user._id, 'auth:revoked');
  res.json({ ok: true });
}));

export default r;
