// Admission file checklist — taken from the school's "حالة ملف التقديم" sheet.
export const DOCUMENTS = [
  { key: 'application_form',   ar: 'طلب الالتحاق',                                  en: 'Application form' },
  { key: 'declarations',       ar: 'الإقرارات',                                     en: 'Declarations' },
  { key: 'birth',              ar: 'شهادة الميلاد',                                 en: 'Birth certificate' },
  { key: 'birth_modern',       ar: 'شهادة ميلاد مميكنة حديثة',                      en: 'Modern computerised birth certificate' },
  { key: 'prep_form',          ar: 'استمارة إتمام المرحلة الإعدادية (أصل + 2 صورة)', en: 'Prep-stage completion form (original + 2 copies)' },
  { key: 'pass_statement',     ar: 'بيان نجاح الإعدادية (أصل + صورة)',              en: 'Prep pass statement (original + copy)' },
  { key: 'photos',             ar: '6 صور شخصية',                                   en: '6 personal photos' },
  { key: 'exam_receipt',       ar: 'إيصال سداد رسوم الاختبار',                      en: 'Entrance-exam fee receipt' },
  { key: 'support_stamps',     ar: '2 طابع دعم مشروعات (10 جنيه)',                  en: '2 project-support stamps (EGP 10)' },
  { key: 'syndicate_stamp',    ar: 'دمغة نقابة المهن التعليمية (5 جنيه)',           en: 'Teaching-professions syndicate stamp (EGP 5)' },
  { key: 'health_card',        ar: 'البطاقة الصحية معتمدة من المدرسة الإعدادية',    en: 'Health card stamped by prep school' },
  { key: 'health_insurance',   ar: 'بطاقة التأمين الصحي',                           en: 'Health-insurance card' },
  { key: 'medical_exam',       ar: 'الكشف الطبي',                                   en: 'Medical examination' },
  { key: 'id_copies',          ar: 'صورة بطاقة الرقم القومي (الطالب)',              en: 'National ID copy (student)' },
  { key: 'id_parents',         ar: 'صورة بطاقة الرقم القومي (الأب / الأم)',         en: 'National ID copies (parents)' },
  { key: 'plastic_folder',     ar: 'حافظة بلاستيك',                                 en: 'Plastic folder' },
  { key: 'placement',          ar: 'تحديد المستوى',                                 en: 'Level placement test', conditional: true },
  { key: 'guardianship',       ar: 'صورة حكم الوصاية التعليمية',                    en: 'Educational guardianship ruling', conditional: true },
  { key: 'death_cert',         ar: 'شهادة الوفاة',                                  en: 'Death certificate', conditional: true },
];
export const DOC_KEYS = DOCUMENTS.map((d) => d.key);
export const defaultDocuments = () =>
  DOCUMENTS.map((d) => ({ key: d.key, status: d.conditional ? 'na' : 'missing', note: '' }));

export const STAGES = ['application', 'exam_passed', 'docs_complete', 'enrolled', 'rejected'];
