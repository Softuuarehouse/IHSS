// End-to-end smoke test against a RUNNING server:  BASE=http://localhost:4000 OWNER_EMAIL=… OWNER_PASSWORD=… npm run smoke
// Needs the sample seed (npm run seed:sample). Creates throw-away users/records and cleans them up.
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';

const BASE = process.env.BASE || 'http://localhost:4000';
const OWNER = { email: process.env.OWNER_EMAIL || 'owner@test.local', password: process.env.OWNER_PASSWORD || 'Owner-Pass-2026x' };
let passed = 0;
const ok = (name) => { passed++; console.log(`  ✔ ${name}`); };

class Client {
  constructor() { this.cookie = ''; }
  async req(method, path, body, raw) {
    const res = await fetch(BASE + '/api' + path, { method, headers: { 'content-type': 'application/json', 'x-requested-with': 'ihss', cookie: this.cookie }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.getSetCookie?.() || [];
    if (set.length) this.cookie = set.map((c) => c.split(';')[0]).join('; ');
    if (raw) return res;
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json };
  }
  login(email, password) { return this.req('POST', '/auth/login', { email, password }); }
  connect() { return new Promise((resolve, reject) => { const s = io(BASE, { extraHeaders: { cookie: this.cookie }, transports: ['websocket'] }); s.on('connect', () => resolve(s)); s.on('connect_error', reject); }); }
}
const waitFor = (socket, event, pred = () => true, ms = 4000) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
  const h = (p) => { if (pred(p)) { clearTimeout(t); socket.off(event, h); resolve(p); } };
  socket.on(event, h);
});

const owner = new Client();
const stamp = Date.now();
let r = await owner.login(OWNER.email, OWNER.password);
assert.equal(r.status, 200); assert.equal(r.body.user.role, 'super_admin'); ok('super admin logs in (httpOnly cookie session)');

r = await new Client().req('GET', '/students');
assert.equal(r.status, 401); ok('unauthenticated API calls are rejected');

r = await owner.req('POST', '/students', { fullName: 'x' }, false);
const noHeader = await fetch(BASE + '/api/students', { method: 'POST', headers: { 'content-type': 'application/json', cookie: owner.cookie }, body: '{}' });
assert.equal(noHeader.status, 403); ok('CSRF guard blocks mutating calls without the custom header');

// ── permissions ────────────────────────────────────────────────────────────────
const meta = (await owner.req('GET', '/meta')).body;
const adminEmail = `walid.${stamp}@test.local`;
r = await owner.req('POST', '/admins', { name: 'Test Assessment Officer', email: adminEmail, password: 'Temp-Pass-12345', permissions: meta.presets.assessment_officer.permissions });
assert.equal(r.status, 201); const adminId = r.body.id || r.body._id; ok('super admin creates an admin from the "Assessment officer" preset');

const admin = new Client();
r = await admin.login(adminEmail, 'Temp-Pass-12345');
assert.equal(r.status, 200); assert.deepEqual(r.body.user.modules.sort(), ['assessments', 'students']); ok('admin only sees the modules that were granted');

for (const [path, label] of [['/accounts/summary', 'accounts'], ['/hr/staff', 'hr'], ['/fees', 'fees'], ['/registration', 'registration']]) {
  r = await admin.req('GET', path); assert.equal(r.status, 403, label);
}
ok('admin is blocked (403) from every section not granted');
assert.equal((await admin.req('GET', '/admins')).status, 403);
assert.equal((await admin.req('GET', '/audit')).status, 403);
assert.equal((await admin.req('POST', '/admins', { name: 'Evil', email: 'e@e.com', password: 'Abcdefghij12', role: 'super_admin' })).status, 403);
ok('admin can NOT reach admin-management, audit log, or mint super admins');
assert.equal((await admin.req('POST', '/students', { fullName: 'nope' })).status, 403);
ok('view-only permission (students:view) cannot create students');

// ── real-time ───────────────────────────────────────────────────────────────────
const adminSock = await admin.connect();
const ownerSock = await owner.connect();
ok('both users connect over WebSocket with cookie auth');

const evtP = waitFor(adminSock, 'entity:change', (p) => p.entity === 'students' && p.action === 'created');
r = await owner.req('POST', '/students', { fullName: `Realtime Student ${stamp}`, gradeLevel: '1Sec', classroom: '1Sec-A' });
assert.equal(r.status, 201); const student = r.body;
const evt = await evtP;
assert.equal(evt.doc.fullName, `Realtime Student ${stamp}`); assert.equal(evt.actor.name, 'System Owner');
ok('student created by super admin appears instantly on the admin\'s screen (with who did it)');

const noFees = new Promise((res) => { adminSock.once('entity:change', (p) => p.entity === 'fees' && res('LEAK')); setTimeout(() => res('quiet'), 800); });
await owner.req('POST', '/fees/generate', { academicYear: '2026/2027', term: 'first', gradeLevel: '1Sec', tuition: 40000 });
assert.equal(await noFees, 'quiet'); ok('admin does NOT receive events for modules they cannot view');

// concurrency
const stale = student.rev;
r = await owner.req('PATCH', `/students/${student._id}`, { classroom: '1Sec-B', rev: stale });
assert.equal(r.status, 200); assert.equal(r.body.rev, stale + 1);
r = await owner.req('PATCH', `/students/${student._id}`, { classroom: '1Sec-C', rev: stale });
assert.equal(r.status, 409); assert.equal(r.body.error, 'CONFLICT'); assert.equal(r.body.current.classroom, '1Sec-B');
ok('stale edit is rejected with 409 and the latest record is returned');

// ── assessments ─────────────────────────────────────────────────────────────────
r = await admin.req('GET', '/assessments'); assert.equal(r.status, 200);
const practical = r.body.items.find((s) => s.component === 'practical');
const sheet = (await admin.req('GET', `/assessments/${practical._id}`)).body;
assert.equal(sheet.maxima.finalMax, 26);
const first = sheet.rows[0];
assert.equal(first.computed.total, 26); assert.equal(first.computed.average, 5.2); assert.equal(first.computed.final, 14.38);
ok('imported practical sheet computes exactly like the school spreadsheet (26 → 5.2 → 14.38)');

adminSock.emit('presence:join', { room: `assessment:${practical._id}` });
ownerSock.emit('presence:join', { room: `assessment:${practical._id}` });
const pres = await waitFor(ownerSock, 'presence:update', (p) => p.users.length === 2);
assert.equal(pres.users.length, 2); ok('presence: both users see who else is on the sheet');

const cellP = waitFor(ownerSock, 'assessment:cell', (p) => p.studentId === String(first.student));
r = await admin.req('PATCH', `/assessments/${practical._id}/cell`, { studentId: String(first.student), week: 3, key: 'participation', value: 3 });
assert.equal(r.status, 200);
const cell = await cellP;
assert.equal(cell.from, 1); assert.equal(cell.value, 3); assert.equal(cell.computed.total, 28); assert.equal(cell.actor.name, 'Test Assessment Officer');
ok('a cell edit is pushed live to the other user with old→new value, recalculated totals and the editor\'s name');

r = await admin.req('PATCH', `/assessments/${practical._id}/cell`, { studentId: String(first.student), week: 0, key: 'attendance', value: 5 });
assert.equal(r.status, 400); ok('out-of-range mark (5 > max 2) is rejected');

r = await owner.req('GET', `/audit/record/assessments/${practical._id}`);
const h = r.body.items[0];
assert.equal(h.actor.name, 'Test Assessment Officer'); assert.equal(h.changes[0].from, 1); assert.equal(h.changes[0].to, 3);
ok('audit trail records who / when / from → to for the cell');
// put it back
await admin.req('PATCH', `/assessments/${practical._id}/cell`, { studentId: String(first.student), week: 3, key: 'participation', value: 1 });

r = await admin.req('GET', '/export/fees', null, true);
assert.equal(r.status, 403); ok('export requires its own permission (admin has no fees:export)');
const xl = await owner.req('GET', `/assessments/${practical._id}/export`, null, true);
const buf = Buffer.from(await xl.arrayBuffer());
assert.equal(xl.status, 200); assert.equal(buf.slice(0, 2).toString(), 'PK'); ok(`Excel export in ministry layout downloads (${buf.length} bytes)`);

// ── fees & accounts ─────────────────────────────────────────────────────────────
r = await owner.req('GET', `/fees?student=${student._id}`); const fee = r.body.items[0];
assert.equal(fee.tuition, 40000);
r = await owner.req('PATCH', `/fees/${fee._id}`, { bus: 6000, uniform: 2500, discounts: [{ reason: 'Sibling', type: 'percent', base: 'tuition', value: 10 }, { reason: 'Scholarship', type: 'fixed', value: 1000 }] });
assert.equal(r.body.gross, 48500); assert.equal(r.body.totalDiscount, 5000); assert.equal(r.body.remainingAfterDiscount, 43500);
ok('fees: اجمالي الخصم = 5,000 and المتبقي بعد الخصم = 43,500');
r = await owner.req('POST', `/fees/${fee._id}/payments`, { amount: 43501 }); assert.equal(r.status, 400);
r = await owner.req('POST', `/fees/${fee._id}/payments`, { amount: 20000, receiptNo: 'R-1001' });
assert.equal(r.status, 201); assert.equal(r.body.paid, 20000); assert.equal(r.body.balance, 23500);
const sum = (await owner.req('GET', '/accounts/summary')).body;
assert.ok(sum.revenue >= 20000); assert.ok(sum.receivables >= 23500);
ok('payment books revenue in Accounts automatically; receivables updated');
const tx = (await owner.req('GET', '/accounts?q=' + encodeURIComponent('Realtime Student'))).body.items[0];
assert.equal((await owner.req('DELETE', `/accounts/${tx._id}`)).status, 409); ok('fee-payment ledger entries cannot be edited from Accounts');
r = await owner.req('DELETE', `/fees/${fee._id}/payments/${r.body.payments[0]._id}`); assert.equal(r.body.paid, 0); ok('removing the payment also removes the revenue entry');

// ── registration ────────────────────────────────────────────────────────────────
const apps = (await owner.req('GET', '/registration')).body.items;
assert.equal(apps.length, 24);
const target = apps.find((a) => a.docsMissing > 0);
r = await owner.req('POST', `/registration/${target._id}/enroll`, {}); assert.equal(r.status, 409); assert.equal(r.body.error, 'DOCS_MISSING');
ok('enrolment is blocked while documents are missing');
r = await owner.req('POST', `/registration/${target._id}/enroll`, { force: true }); assert.equal(r.status, 200); assert.ok(r.body.student.studentCode.startsWith('IHSS-'));
ok('forced enrolment creates the student record with an auto student code');

// ── HR ──────────────────────────────────────────────────────────────────────────
const staff = (await owner.req('GET', '/hr/staff')).body.items[0];
r = await owner.req('PUT', `/hr/attendance/${staff._id}/2026-10`, { workingDays: 20, leave: 2, absence: 1 });
assert.equal(r.status, 200); assert.equal(r.body.present, 17);
r = await owner.req('PUT', `/hr/attendance/${staff._id}/2026-10`, { workingDays: 5, leave: 4, absence: 4 }); assert.equal(r.status, 400);
ok('attendance ledger computes present days and rejects impossible values');

// ── admin lifecycle ─────────────────────────────────────────────────────────────
const revoked = waitFor(adminSock, 'auth:revoked');
r = await owner.req('PATCH', `/admins/${adminId}`, { active: false }); assert.equal(r.status, 200);
await revoked; assert.equal((await admin.req('GET', '/students')).status, 401);
ok('deactivating an admin kills their session immediately (socket told to log out)');

const me = (await owner.req('GET', '/auth/me')).body.user;
r = await owner.req('PATCH', `/admins/${me.id}`, { role: 'admin' }); assert.equal(r.status, 400);
r = await owner.req('DELETE', `/admins/${me.id}`); assert.equal(r.status, 400);
ok('the last super admin cannot demote / delete themselves');

r = await owner.req('POST', '/admins', { name: 'Second Owner', email: `owner2.${stamp}@test.local`, password: 'Second-Owner-9876', role: 'super_admin' });
assert.equal(r.status, 201); const s2 = new Client();
assert.equal((await s2.login(`owner2.${stamp}@test.local`, 'Second-Owner-9876')).body.user.permissions[0], '*'); ok('a super admin can create another super admin');
await owner.req('DELETE', `/admins/${r.body._id || r.body.id}`);
await owner.req('DELETE', `/admins/${adminId}`);

r = await owner.req('GET', '/audit?limit=5'); assert.ok(r.body.total > 10); ok(`global audit log available to super admin (${r.body.total} entries)`);
r = await owner.req('GET', '/dashboard'); assert.ok(r.body.students && r.body.fees && r.body.accounts && r.body.registration); ok('dashboard aggregates all sections for super admin');

adminSock.close(); ownerSock.close();
console.log(`\nALL ${passed} CHECKS PASSED`);
process.exit(0);
