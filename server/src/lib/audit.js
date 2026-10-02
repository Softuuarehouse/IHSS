import { AuditLog } from '../models/AuditLog.js';

const norm = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v ?? null)));

export function diff(before, after, fields) {
  const out = [];
  for (const f of fields) {
    const a = norm(before?.[f]);
    const b = norm(after?.[f]);
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ field: f, from: a, to: b });
  }
  return out;
}

export const actorOf = (user) => user && ({ id: String(user._id), name: user.name, role: user.role });

export async function writeAudit({ module, entity, entityId, label, action, changes = [], user, ip }) {
  try {
    return await AuditLog.create({
      module, entity, entityId: entityId ? String(entityId) : undefined, label, action, changes,
      actor: actorOf(user), ip, at: new Date(),
    });
  } catch (e) {
    console.error('[audit] failed to write', e.message); // never break a business operation because of audit
  }
}
