import test from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, computeRow, maxima, validateCell } from '../src/lib/grades.js';
import { computeFees } from '../src/lib/fees.js';
import { sanitizePermissions, hasPerm } from '../src/lib/permissions.js';
import { sanitizeDeep } from '../src/lib/http.js';

const sheet = (kind) => ({ ...TEMPLATES[kind], weekDates: [1, 2, 3, 4, 5] });

test('practical sheet reproduces the school spreadsheet (student 1: 26 → 5.2, exam 9.18 → 14.38)', () => {
  const s = sheet('practical');
  const row = { weeks: [
    { attendance: 2, conduct: 1, participation: 2 }, { attendance: 2, conduct: 2, participation: 1 }, { attendance: 2, conduct: 2, participation: 1 },
    { attendance: 2, conduct: 1, participation: 1 }, { attendance: 2, conduct: 3, participation: 2 }], paper: 9.18 };
  const c = computeRow(s, row);
  assert.deepEqual(c.weekTotals, [5, 5, 5, 4, 7]);
  assert.equal(c.total, 26); assert.equal(c.average, 5.2); assert.equal(c.examScore, 9.18); assert.equal(c.final, 14.38);
  assert.deepEqual(maxima(s), { weekMax: 8, weeks: 5, totalMax: 40, avgMax: 8, examMax: 18, finalMax: 26 });
});

test('theory sheet reproduces the school spreadsheet (52 → 5.2, paper 15 → 3, final 8.2)', () => {
  const s = sheet('theory');
  const w = (a, c, p, h) => ({ attendance: a, conduct: c, participation: p, homework: h });
  const row = { weeks: [w(4, 2, 2, 1), w(4, 2, 3, 1), w(4, 2, 3, 1), w(4, 1, 2, 4), w(4, 3, 3, 2)], paper: 15 };
  const c = computeRow(s, row);
  assert.equal(c.total, 52); assert.equal(c.average, 5.2); assert.equal(c.examScore, 3); assert.equal(c.final, 8.2);
  assert.deepEqual(maxima(s), { weekMax: 16, weeks: 5, totalMax: 80, avgMax: 8, examMax: 18, finalMax: 26 });
});

test('cell validation enforces maxima', () => {
  const s = sheet('practical');
  assert.equal(validateCell(s, { week: 0, key: 'attendance', value: 2 }), 2);
  assert.throws(() => validateCell(s, { week: 0, key: 'attendance', value: 3 }), /Max is 2/);
  assert.throws(() => validateCell(s, { week: 9, key: 'attendance', value: 1 }), /Invalid week/);
  assert.throws(() => validateCell(s, { week: 0, key: 'homework', value: 1 }), /Unknown criterion/);
  assert.equal(validateCell(s, { key: 'paper', value: '' }), null);
});

test('fees: total discount + remaining after discount (the two new columns)', () => {
  const r = computeFees({ tuition: 40000, bus: 6000, uniform: 2500, accommodation: 0,
    discounts: [{ type: 'percent', base: 'tuition', value: 10 }, { type: 'fixed', value: 1000 }], payments: [{ amount: 10000 }] });
  assert.equal(r.gross, 48500);
  assert.equal(r.totalDiscount, 5000);            // 10% of 40,000 + 1,000
  assert.equal(r.remainingAfterDiscount, 43500);  // اجمالي − الخصم
  assert.equal(r.paid, 10000); assert.equal(r.balance, 33500);
});

test('fees: discount can never exceed what is owed', () => {
  const r = computeFees({ tuition: 1000, discounts: [{ type: 'fixed', value: 5000 }] });
  assert.equal(r.totalDiscount, 1000); assert.equal(r.remainingAfterDiscount, 0);
});

test('permissions: write implies view, unknown perms dropped, super admin bypasses', () => {
  assert.deepEqual(sanitizePermissions(['fees:edit', 'bogus:view']), ['fees:edit', 'fees:view']);
  assert.equal(hasPerm({ role: 'super_admin' }, 'anything'), true);
  assert.equal(hasPerm({ role: 'admin', permissions: ['hr:view'] }, 'hr:edit'), false);
});

test('request sanitiser strips Mongo operators', () => {
  assert.deepEqual(sanitizeDeep({ a: 1, $where: 'x', b: { 'c.d': 1, ok: [{ $ne: 1, k: 2 }] } }), { a: 1, b: { ok: [{ k: 2 }] } });
});
