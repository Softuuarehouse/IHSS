export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}
export const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Strip Mongo operator injection ($where, a.b) from request bodies.
export function sanitizeDeep(v) {
  if (Array.isArray(v)) return v.map(sanitizeDeep);
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (k.startsWith('$') || k.includes('.')) continue;
      out[k] = sanitizeDeep(val);
    }
    return out;
  }
  return v;
}
export const sanitizeBody = (req, _res, next) => { if (req.body) req.body = sanitizeDeep(req.body); next(); };

// Cheap CSRF defence on top of SameSite cookies: mutating calls must carry a custom header.
export function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-requested-with') !== 'ihss') return res.status(403).json({ error: 'csrf', message: 'Missing X-Requested-With header' });
  next();
}

export const pick = (obj = {}, keys = []) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));
export const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
