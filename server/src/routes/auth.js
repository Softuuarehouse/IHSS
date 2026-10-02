import express from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { User } from '../models/User.js';
import { config } from '../config.js';
import { authenticate, signToken, setAuthCookie } from '../middleware/auth.js';
import { HttpError, asyncH } from '../lib/http.js';
import { writeAudit } from '../lib/audit.js';
import { hasPerm, MODULES } from '../lib/permissions.js';

const r = express.Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: true, legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many login attempts. Try again in 15 minutes.' } });

export const publicUser = (u) => ({
  id: String(u._id), name: u.name, email: u.email, role: u.role, title: u.title,
  permissions: u.role === 'super_admin' ? ['*'] : u.permissions,
  mustChangePassword: u.mustChangePassword,
  modules: Object.keys(MODULES).filter((m) => hasPerm(u, `${m}:view`)),
});

const passwordRule = z.string().min(10, 'Password must be at least 10 characters').max(128)
  .refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), 'Password must contain letters and numbers');
export { passwordRule };

r.post('/login', loginLimiter, asyncH(async (req, res) => {
  const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  const ok = user && user.active && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) throw new HttpError(401, 'Invalid email or password');
  user.lastLoginAt = new Date();
  await user.save();
  setAuthCookie(res, signToken(user));
  await writeAudit({ module: 'admins', entity: 'users', entityId: user._id, label: user.email, action: 'login', user, ip: req.ip });
  res.json({ user: publicUser(user) });
}));

r.post('/logout', (req, res) => { res.clearCookie(config.cookieName, { path: '/' }); res.json({ ok: true }); });

r.get('/me', authenticate, (req, res) => res.json({ user: publicUser(req.user) }));

r.post('/change-password', authenticate, asyncH(async (req, res) => {
  const { current, next } = z.object({ current: z.string().min(1), next: passwordRule }).parse(req.body);
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await bcrypt.compare(current, user.passwordHash))) throw new HttpError(400, 'Current password is incorrect');
  user.passwordHash = await bcrypt.hash(next, 12);
  user.mustChangePassword = false;
  user.tokenVersion += 1; // invalidates every other session
  await user.save();
  setAuthCookie(res, signToken(user));
  await writeAudit({ module: 'admins', entity: 'users', entityId: user._id, label: user.email, action: 'password_change', user, ip: req.ip });
  res.json({ ok: true });
}));

export default r;
