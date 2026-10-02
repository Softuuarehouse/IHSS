import { createContext, useContext, useEffect, useMemo, useState } from 'react';

// key: [English, Arabic]
const T = {
  appName: ['IHSS Management System', 'نظام إدارة IHSS'],
  appSub: ['Sistema Manageriale', 'النظام الإداري'],
  signIn: ['Sign in to portal', 'تسجيل الدخول'], email: ['Email', 'البريد الإلكتروني'], password: ['Password', 'كلمة المرور'],
  signOut: ['Sign out', 'تسجيل الخروج'], dashboard: ['Dashboard', 'لوحة التحكم'], admins: ['Admins & Access', 'المديرون والصلاحيات'], audit: ['Audit log', 'سجل التعديلات'],
  save: ['Save', 'حفظ'], cancel: ['Cancel', 'إلغاء'], delete: ['Delete', 'حذف'], edit: ['Edit', 'تعديل'], add: ['Add', 'إضافة'], close: ['Close', 'إغلاق'],
  search: ['Search…', 'بحث…'], export: ['Export Excel', 'تصدير Excel'], all: ['All', 'الكل'], loading: ['Loading…', 'جارٍ التحميل…'], empty: ['Nothing here yet', 'لا توجد بيانات بعد'],
  confirmDelete: ['Delete this record? This cannot be undone.', 'حذف هذا السجل؟ لا يمكن التراجع.'], actions: ['Actions', 'إجراءات'], history: ['History', 'السجل'],
  live: ['Live', 'مباشر'], offline: ['Reconnecting…', 'جارٍ إعادة الاتصال…'], viewingNow: ['Viewing now', 'يشاهد الآن'],
  lastEdit: ['Last edit', 'آخر تعديل'], by: ['by', 'بواسطة'], updatedLive: ['{who} updated {what}', '{who} عدّل {what}'], createdLive: ['{who} added {what}', '{who} أضاف {what}'], deletedLive: ['{who} removed {what}', '{who} حذف {what}'],
  conflict: ['Someone else changed this record. The latest version was loaded — please review and save again.', 'قام شخص آخر بتعديل هذا السجل. تم تحميل أحدث نسخة، راجعها ثم احفظ مرة أخرى.'],
  noAccess: ['You do not have access to this section.', 'ليس لديك صلاحية للوصول إلى هذا القسم.'],
  // students
  students: ['Student Affairs', 'شئون الطلاب'], studentName: ['Student name', 'اسم الطالب'], code: ['Code', 'الكود'], grade: ['Grade', 'الصف'], classroom: ['Class', 'الفصل'], status: ['Status', 'الحالة'],
  guardian: ['Guardian', 'ولي الأمر'], guardianPhone: ['Guardian phone', 'هاتف ولي الأمر'], newStudent: ['New student', 'طالب جديد'], notes: ['Notes', 'ملاحظات'],
  active: ['Active', 'مقيد'], suspended: ['Suspended', 'موقوف'], withdrawn: ['Withdrawn', 'منسحب'], graduated: ['Graduated', 'متخرج'],
  '1Sec': ['1st Secondary', 'الأول الثانوي'], '2Sec': ['2nd Secondary', 'الثاني الثانوي'], '3Sec': ['3rd Secondary', 'الثالث الثانوي'], Institute: ['Institute', 'المعهد'],
  // fees
  fees: ['Revenue', 'الإيرادات'], // section name only — tuition/bus/uniform column headers below are unaffected
  year: ['Academic year', 'العام الدراسي'], term: ['Term', 'الفصل الدراسي'], first: ['First term', 'الفصل الأول'], second: ['Second term', 'الفصل الثاني'],
  tuition: ['Fees', 'المصروفات'], bus: ['Bus', 'الباص'], busLine: ['Bus line', 'خط الباص'], uniform: ['Uniform', 'الزي'], accommodation: ['Accommodation', 'الإقامة'], gross: ['Total due', 'الإجمالي'],
  totalDiscount: ['Total discount', 'إجمالي الخصم'], remainingAfterDiscount: ['Remaining after discount', 'المتبقي بعد الخصم'], paid: ['Paid', 'المدفوع'], balance: ['Balance', 'الرصيد'],
  paymentStatus: ['Status', 'الحالة'],
  deletedRecordRow: ['(deleted)', '(محذوف)'],
  missingAmount: ['{amount} missing', 'متبقي {amount}'],
  fullyPaid: ['Fully paid', 'مدفوع بالكامل'],
  missingCount: ['{n} student(s) with an outstanding balance', '{n} طالب لديه مبلغ متبقي'],
  discounts: ['Discounts', 'الخصومات'], reason: ['Reason', 'السبب'], fixed: ['Fixed amount', 'مبلغ ثابت'], percent: ['Percent', 'نسبة %'], percentOf: ['% of', 'نسبة من'], ofTuition: ['Tuition', 'المصروفات'], ofTotal: ['Total', 'الإجمالي'],
  addDiscount: ['Add discount', 'إضافة خصم'], payments: ['Payments', 'المدفوعات'], addPayment: ['Record payment', 'تسجيل دفعة'], amount: ['Amount', 'المبلغ'], method: ['Method', 'الطريقة'], receipt: ['Receipt no.', 'رقم الإيصال'], date: ['Date', 'التاريخ'],
  cash: ['Cash', 'نقدي'], bank: ['Bank', 'تحويل بنكي'], card: ['Card', 'بطاقة'], other: ['Other', 'أخرى'], generate: ['Generate fee lines', 'إنشاء بنود المصروفات'], generated: ['{n} fee lines created', 'تم إنشاء {n} بند'],
  totals: ['Totals', 'الإجماليات'], egp: ['EGP', 'ج.م'],
  // registration
  registration: ['Registration', 'إدارة التسجيل'], applicant: ['Applicant', 'المتقدم'], stage: ['Stage', 'المرحلة'], newApplication: ['New application', 'طلب تقديم جديد'],
  application: ['Application', 'تقديم'], exam_passed: ['Passed exam', 'ناجح'], docs_complete: ['Documents complete', 'مستندات مكتملة'], enrolled: ['Enrolled', 'مقيد'], rejected: ['Rejected', 'مرفوض'],
  docsReceived: ['Received', 'المستلمة'], docsMissing: ['Missing', 'الناقصة'], documents: ['Documents', 'المستندات'], received: ['Received', 'مستلم'], missing: ['Missing', 'ناقص'], na: ['Not required', 'غير مطلوب'],
  enroll: ['Enroll as student', 'قيد كطالب'], enrollForce: ['Documents are missing. Enroll anyway?', 'توجد مستندات ناقصة. هل تريد القيد رغم ذلك؟'], enrolledOk: ['Student record created', 'تم إنشاء ملف الطالب'],
  // assessments
  assessments: ['Assessment & Exams', 'التقييم والامتحانات'], sheets: ['Grade sheets', 'شيتات الدرجات'], newSheet: ['New sheet', 'شيت جديد'], subject: ['Subject', 'المادة'], component: ['Component', 'النوع'],
  theory: ['Theory', 'نظري'], practical: ['Practical', 'عملي'], period: ['Period', 'الفترة'], month: ['Month', 'الشهر'], teacher: ['Subject teacher', 'مدرس المادة'], evalOfficer: ['Assessment officer', 'مسئول التقييم'], academicManager: ['Academic manager', 'المدير الأكاديمي'],
  week: ['Week', 'الأسبوع'], weekTotal: ['Total', 'المجموع'], total: ['Total', 'المجموع'], average: ['Average', 'المتوسط'], finalMark: ['Final', 'المجموع النهائي'], examMark: ['Exam', 'درجة الامتحان'],
  locked: ['Locked', 'مغلق'], lock: ['Lock sheet', 'إغلاق الشيت'], unlock: ['Unlock', 'فتح الشيت'], students_count: ['Students', 'الطلاب'], curriculum: ['Curriculum', 'الخطة الدراسية'],
  firstDate: ['First week starts', 'بداية الأسبوع الأول'], general: ['General', 'مواد عامة'], technical: ['Technical', 'مواد فنية'], hoursPerWeek: ['Hours / week', 'الحصص / أسبوع'],
  // hr
  hr: ['HR & Payroll', 'شئون العاملين والمرتبات'], staff: ['Staff', 'العاملون'], attendance: ['Attendance', 'الحضور والغياب'], leaves: ['Leaves', 'الإجازات'], evaluations: ['Evaluations', 'التقييمات'],
  fullName: ['Full name', 'الاسم'], jobTitle: ['Job title', 'الوظيفة'], category: ['Category', 'التصنيف'], education: ['Ministry staff', 'العاملون بالتربية والتعليم'], contract: ['Contract staff', 'العاملون المتعاقدون'],
  workingDays: ['Days in month', 'أيام الشهر'], leave: ['Leave', 'إجازة'], absence: ['Absence', 'غياب'], present: ['Present', 'حضور'], newStaff: ['New employee', 'موظف جديد'], phone: ['Phone', 'الهاتف'],
  from: ['From', 'من'], to: ['To', 'إلى'], days: ['Days', 'الأيام'], pending: ['Pending', 'قيد الانتظار'], approved: ['Approved', 'موافق عليها'], rejectedS: ['Rejected', 'مرفوضة'], newLeave: ['New leave', 'إجازة جديدة'],
  annual: ['Annual', 'اعتيادية'], sick: ['Sick', 'مرضية'], casual: ['Casual', 'عارضة'], unpaid: ['Unpaid', 'بدون مرتب'], type: ['Type', 'النوع'],
  score: ['Score /100', 'الدرجة /100'], strengths: ['Strengths', 'نقاط القوة'], improvements: ['To improve', 'نقاط التحسين'], newEval: ['New evaluation', 'تقييم جديد'], evaluator: ['Evaluator', 'المُقيِّم'],
  // accounts
  accounts: ['Accounts', 'الحسابات'], revenue: ['Revenue', 'الإيرادات'], expense: ['Expenses', 'المصروفات'], net: ['Net position', 'صافي المركز المالي'], receivables: ['Receivables', 'مستحقات لدى الطلاب'],
  financialPosition: ['Financial position', 'المركز المالي'], transactions: ['Transactions', 'الحركات المالية'], newTransaction: ['New entry', 'قيد جديد'], description: ['Description', 'البيان'], reference: ['Reference', 'المرجع'],
  discountsGiven: ['Discounts given', 'الخصومات الممنوحة'], collectionRate: ['Collection rate', 'نسبة التحصيل'], byMonth: ['By month', 'حسب الشهر'], byCategory: ['By category', 'حسب البند'],
  tuition_c: ['Tuition', 'مصروفات دراسية'], bus_c: ['Bus', 'باص'], uniform_c: ['Uniform', 'زي'], accommodation_c: ['Accommodation', 'إقامة'], admission_fees: ['Admission fees', 'رسوم تقديم'], other_revenue: ['Other revenue', 'إيرادات أخرى'],
  salaries: ['Salaries', 'مرتبات'], rent: ['Rent', 'إيجار'], utilities: ['Utilities', 'مرافق'], supplies: ['Supplies', 'مستلزمات'], maintenance: ['Maintenance', 'صيانة'], transport: ['Transport', 'انتقالات'], marketing: ['Marketing', 'تسويق'], other_expense: ['Other expense', 'مصروفات أخرى'],
  fromFees: ['From fees', 'من المصروفات'],
  // admins
  newAdmin: ['New admin', 'مدير جديد'], role: ['Role', 'الدور'], superAdmin: ['Super Admin', 'مدير عام'], adminRole: ['Admin', 'مدير'], permissions: ['Permissions', 'الصلاحيات'], presets: ['Quick presets', 'قوالب جاهزة'],
  view: ['View', 'عرض'], create: ['Create', 'إضافة'], editP: ['Edit', 'تعديل'], deleteP: ['Delete', 'حذف'], exportP: ['Export', 'تصدير'], titleField: ['Job title', 'المسمى'], activeS: ['Active', 'نشط'], inactive: ['Deactivated', 'معطّل'],
  resetPassword: ['Reset password', 'إعادة تعيين كلمة المرور'],
  systemAccess: ['System access', 'صلاحية الدخول للنظام'], giveAccess: ['Give system access', 'منح صلاحية دخول'], newPassword: ['New password', 'كلمة مرور جديدة'], superNote: ['Super Admins have full access to everything, including this section.', 'المدير العام لديه صلاحية كاملة على كل الأقسام بما فيها هذا القسم.'],
  tempPassword: ['Temporary password', 'كلمة مرور مؤقتة'], mustChange: ['Must change password at next login', 'يجب تغيير كلمة المرور عند أول دخول'], deactivate: ['Deactivate', 'تعطيل'], activate: ['Activate', 'تفعيل'],
  changePassword: ['Change password', 'تغيير كلمة المرور'], currentPassword: ['Current password', 'كلمة المرور الحالية'], passwordHint: ['At least 10 characters, with letters and numbers', '10 أحرف على الأقل مع حروف وأرقام'],
  selectAll: ['All', 'الكل'],
  lightMode: ['Light mode', 'الوضع الفاتح'], darkMode: ['Dark mode', 'الوضع الداكن'],
  importExcel: ['Import Excel', 'استيراد Excel'], importAssessment: ['Import grade sheet', 'استيراد شيت درجات'], importAttendance: ['Import attendance sheet', 'استيراد شيت الحضور'],
  file: ['File (.xlsx)', 'الملف (.xlsx)'], import: ['Import', 'استيراد'], startYear: ['Academic year starts', 'العام الدراسي يبدأ من'],
  importDoneAssessment: ['Imported {n} students ({c} new) into a new {comp} sheet — {y}', 'تم استيراد {n} طالب ({c} جديد) في شيت {comp} جديد — {y}'],
  importDoneAttendance: ['Imported {n} employees ({c} new), {r} monthly rows written', 'تم استيراد {n} موظف ({c} جديد) و{r} صف شهري'],
  importHint: ['Upload the exact sheet the school already uses — the layout is read automatically.', 'ارفع نفس الشيت الذي تستخدمه المدرسة بالضبط — يتم قراءة التنسيق تلقائياً.'],
  fromFile: ['From file', 'من الملف'], fromFileHint: ['The yearly totals as printed in the imported sheet, for comparison with the figures above.', 'الإجماليات السنوية كما وردت في الملف المستورد، للمقارنة مع الأرقام أعلاه.'],
  importDoneAttendanceFull: ['Imported {n} employees ({c} new), {r} monthly rows, and the sheet\u2019s own yearly totals ({f})', 'تم استيراد {n} موظف ({c} جديد) و{r} صف شهري وإجماليات الملف السنوية ({f})'],
  autoDetected: ['leave blank to detect from the file', 'اتركه فارغاً ليُكتشف من الملف تلقائياً'],
  maximum: ['Maximum', 'الدرجة العظمى'], sheetHint: ['Type a mark and press Enter — it saves instantly and everyone viewing this sheet sees it live. Totals follow the ministry formulas.', 'اكتب الدرجة واضغط Enter — تُحفظ فوراً ويراها كل من يفتح الشيت مباشرة. المجاميع تُحسب بمعادلات الوزارة.'],
  // audit
  who: ['Who', 'بواسطة'], when: ['When', 'الوقت'], what: ['What', 'ماذا'], action: ['Action', 'الإجراء'], changes: ['Changes', 'التغييرات'], section: ['Section', 'القسم'],
  recentActivity: ['Recent activity', 'آخر النشاطات'],
  create_a: ['created', 'إضافة'], update_a: ['updated', 'تعديل'], delete_a: ['deleted', 'حذف'], login_a: ['signed in', 'دخول'], export_a: ['exported', 'تصدير'], deactivate_a: ['deactivated', 'تعطيل'], password_reset_a: ['password reset', 'إعادة كلمة مرور'], password_change_a: ['password changed', 'تغيير كلمة مرور'],
};

const Ctx = createContext(null);
export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'ar');
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    localStorage.setItem('lang', lang);
  }, [lang]);
  const value = useMemo(() => ({
    lang, setLang, dir: lang === 'ar' ? 'rtl' : 'ltr',
    t: (key, vars) => {
      const entry = T[key];
      let s = entry ? entry[lang === 'ar' ? 1 : 0] : key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
      return s;
    },
    num: (n, d = 0) => (n === null || n === undefined || n === '' ? '' : Number(n).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US', { maximumFractionDigits: d })),
    dateTime: (d) => (d ? new Date(d).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : ''),
    dateOnly: (d) => (d ? new Date(d).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium' }) : ''),
  }), [lang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useI18n = () => useContext(Ctx);
export const TRANSLATION_KEYS = Object.keys(T);