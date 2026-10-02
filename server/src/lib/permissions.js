// Single source of truth for RBAC. The client fetches this via GET /api/meta.
export const MODULES = {
  students:     { ar: 'شئون الطلاب',            en: 'Student Affairs' },
  fees:         { ar: 'الإيرادات',    en: 'Revenue' }, // shown to users as "Revenue" — internal key/permissions unchanged (fees:view etc.)
  registration: { ar: 'إدارة التسجيل',          en: 'Registration' },
  assessments:  { ar: 'التقييم والامتحانات',    en: 'Assessment & Exams' },
  hr:           { ar: 'شئون العاملين والمرتبات', en: 'HR & Payroll' },
  accounts:     { ar: 'الحسابات',               en: 'Accounts' },
};

export const ACTIONS = ['view', 'create', 'edit', 'delete', 'export'];
export const ALL_PERMISSIONS = Object.keys(MODULES).flatMap((m) => ACTIONS.map((a) => `${m}:${a}`));

const all = (m) => ACTIONS.map((a) => `${m}:${a}`);

// Quick-start bundles (mirrors the school's section owners). Super admin can tweak any of them.
export const PRESETS = {
  assessment_officer: { ar: 'مسؤول التقييم والامتحانات', en: 'Assessment & Exams officer', permissions: [...all('assessments'), 'students:view'] },
  hr_officer:         { ar: 'مسؤول شئون العاملين',        en: 'HR / Payroll officer',       permissions: [...all('hr')] },
  student_affairs:    { ar: 'مسؤول شئون الطلاب',          en: 'Student Affairs officer',    permissions: [...all('students'), 'fees:view', 'registration:view'] },
  accountant:         { ar: 'محاسب',                      en: 'Accountant',                 permissions: [...all('accounts'), ...all('fees'), 'students:view'] },
  registrar:          { ar: 'مسؤول التسجيل',              en: 'Registrar',                  permissions: [...all('registration'), 'students:view', 'students:create'] },
};

export const isSuper = (u) => u?.role === 'super_admin';
export const hasPerm = (u, perm) => isSuper(u) || (u?.permissions || []).includes(perm);
export const viewableModules = (u) => Object.keys(MODULES).filter((m) => hasPerm(u, `${m}:view`));

// Keep only known permissions; any write permission implies view of that module.
export function sanitizePermissions(list = []) {
  const set = new Set(list.filter((p) => ALL_PERMISSIONS.includes(p)));
  for (const p of [...set]) set.add(`${p.split(':')[0]}:view`);
  return [...set].sort();
}

// Which permission module guards each audited entity (used by per-record history).
export const ENTITY_MODULE = {
  students: 'students', fees: 'fees', applications: 'registration', assessments: 'assessments',
  subjects: 'assessments', staff: 'hr', leaves: 'hr', evaluations: 'hr', attendance: 'hr', transactions: 'accounts',
};
