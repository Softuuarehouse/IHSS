import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { User } from '../models/User.js';
import { HttpError, asyncH } from '../lib/http.js';
import { hasPerm, isSuper } from '../lib/permissions.js';

export const signToken = (user) =>
  jwt.sign({ sub: String(user._id), tv: user.tokenVersion || 0 }, config.jwtSecret, { expiresIn: `${config.sessionHours}h` });

export const setAuthCookie = (res, token) =>
  res.cookie(config.cookieName, token, {
    httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: config.sessionHours * 3600 * 1000, path: '/',
  });

// Shared by HTTP + Socket.IO. Permissions are read from the DB on every request, so a Super Admin's
// change (or deactivation) takes effect immediately — nothing is baked into the token.
export async function userFromToken(token) {
  if (!token) return null;
  let payload;
  try { payload = jwt.verify(token, config.jwtSecret); } catch { return null; }
  const user = await User.findById(payload.sub);
  if (!user || !user.active || (user.tokenVersion || 0) !== payload.tv) return null;
  return user;
}

export const authenticate = asyncH(async (req, _res, next) => {
  const header = req.get('authorization');
  const token = req.cookies?.[config.cookieName] || (header?.startsWith('Bearer ') ? header.slice(7) : null);
  const user = await userFromToken(token);
  if (!user) throw new HttpError(401, 'Not authenticated');
  req.user = user;
  next();
});

export const requirePerm = (perm) => (req, _res, next) =>
  hasPerm(req.user, perm) ? next() : next(new HttpError(403, `Missing permission: ${perm}`));

export const requireSuper = (req, _res, next) =>
  isSuper(req.user) ? next() : next(new HttpError(403, 'Super Admin only'));
