import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { useLiveList } from '../lib/live';
import { Chip, Empty, Field, Icon, Modal, PageHeader, Select, Spinner, useConfirm, useSaver, useToast } from '../components/ui';
import ImportModal from '../components/ImportModal';

export default function Assessments() {
  const { can } = useAuth(); const { t, lang, dateOnly } = useI18n(); const nav = useNavigate(); const confirm = useConfirm(); const toast = useToast();
  const [tab, setTab] = useState('sheets'); const [creating, setCreating] = useState(false); const [importing, setImporting] = useState(false);
  const sheets = useLiveList('assessments', '/assessments');
  const subjects = useLiveList('subjects', '/subjects');

  const remove = async (s) => { if (confirm()) try { await api.del(`/assessments/${s._id}`); } catch (e) { toast(e.message, 'err'); } };

  return (
    <div>
      <PageHeader title={t('assessments')} presenceRoom="assessments"
        actions={tab === 'sheets' && can('assessments:create') && <>
          <button className="btn-outline" onClick={() => setImporting(true)}><Icon name="upload_file" />{t('importExcel')}</button>
          <button className="btn-primary" onClick={() => setCreating(true)}><Icon name="add" />{t('newSheet')}</button>
        </>} />
      <div className="mb-4 flex gap-2">
        {['sheets', 'curriculum'].map((k) => <button key={k} onClick={() => setTab(k)} className={`chip shrink-0 !px-4 !py-2 ${tab === k ? 'bg-primary text-on-primary' : 'bg-white border border-outline-variant'}`}>{t(k)}</button>)}
      </div>

      {tab === 'sheets' && (sheets.loading ? <Spinner /> : sheets.items.length === 0 ? <div className="card"><Empty text={t('empty')} /></div> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sheets.items.map((s) => (
            <div key={s._id} className={`card cursor-pointer p-5 transition hover:shadow-md ${sheets.flash[s._id] ? 'flash' : ''}`} onClick={() => nav(`/assessments/${s._id}`)}>
              <div className="flex items-start justify-between gap-2">
                <div><div className="font-display text-headline-sm">{s.subjectName}</div><div className="text-body-md text-on-surface-variant">{t(s.gradeLevel)} · {s.academicYear}</div></div>
                <Chip tone={s.component === 'theory' ? 'info' : 'ok'}>{t(s.component)}</Chip>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-body-sm"><Chip>{s.periodLabel}</Chip><Chip>{s.monthLabel}</Chip>{s.locked && <Chip tone="bad"><Icon name="lock" className="!text-[14px]" /> {t('locked')}</Chip>}</div>
              <div className="mt-4 flex items-center justify-between text-body-sm text-outline">
                <span><Icon name="groups" className="!text-[16px]" /> {s.studentCount} {t('students_count')}</span>
                <span>{s.updatedByName} · {dateOnly(s.updatedAt)}</span>
              </div>
              {can('assessments:delete') && <button className="btn-secondary btn-sm mt-3 !text-error" onClick={(e) => { e.stopPropagation(); remove(s); }}><Icon name="delete" /></button>}
            </div>
          ))}
        </div>
      ))}

      {tab === 'curriculum' && (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead><tr><th className="th">{t('subject')}</th><th className="th">{t('category')}</th><th className="th">{t('1Sec')}</th><th className="th">{t('2Sec')}</th><th className="th">{t('3Sec')}</th></tr></thead>
            <tbody>
              {subjects.items.map((s) => (
                <tr key={s._id} className="border-t border-surface-container">
                  <td className="td font-semibold">{lang === 'ar' ? s.nameAr : s.nameEn || s.nameAr}<div className="text-body-sm font-normal text-outline">{s.group}</div></td>
                  <td className="td"><Chip tone={s.category === 'technical' ? 'info' : 'neutral'}>{t(s.category)}</Chip></td>
                  {['1Sec', '2Sec', '3Sec'].map((g) => <td key={g} className="td text-center font-mono">{s.hours?.[g] || '–'}</td>)}
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="border-t-2 border-outline-variant bg-surface-container-low font-bold"><td className="td" colSpan={2}>{t('hoursPerWeek')} (39)</td><td className="td text-center">14 + 25</td><td className="td text-center">14 + 25</td><td className="td text-center">14 + 25</td></tr></tfoot>
          </table>
        </div>
      )}
      {creating && <NewSheet subjects={subjects.items} onClose={() => setCreating(false)} onCreated={(id) => nav(`/assessments/${id}`)} />}
      {importing && <ImportAssessment onClose={() => setImporting(false)} onCreated={(id) => nav(`/assessments/${id}`)} />}
    </div>
  );
}

function NewSheet({ subjects, onClose, onCreated }) {
  const { t, lang } = useI18n();
  const [f, setF] = useState({ academicYear: '2026/2027', gradeLevel: '1Sec', subjectName: '', component: 'theory', periodLabel: 'تكوينى اول', monthLabel: '', teacherName: '', evaluationOfficer: '', academicManager: '', start: '' });
  const { busy, run } = useSaver();
  const set = (k) => (e) => setF({ ...f, [k]: e.target ? e.target.value : e });
  const technical = subjects.filter((s) => s.category === 'technical');
  const save = async () => {
    const weekDates = f.start ? Array.from({ length: 5 }, (_, i) => new Date(new Date(f.start).getTime() + i * 7 * 86400000).toISOString()) : undefined;
    const { start, ...body } = f;
    const r = await run(() => api.post('/assessments', { ...body, weekDates }));
    if (r) onCreated(r._id);
  };
  return (
    <Modal title={t('newSheet')} onClose={onClose} footer={<><button className="btn-secondary" onClick={onClose}>{t('cancel')}</button><button className="btn-primary" disabled={busy || !f.subjectName} onClick={save}>{t('save')}</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('subject')} className="sm:col-span-2">
          <input className="input" list="subj" value={f.subjectName} onChange={set('subjectName')} />
          <datalist id="subj">{technical.map((s) => <option key={s._id} value={s.nameAr}>{s.nameEn}</option>)}</datalist>
        </Field>
        <Field label={t('year')}><input className="input" dir="ltr" value={f.academicYear} onChange={set('academicYear')} /></Field>
        <Field label={t('grade')}><Select value={f.gradeLevel} onChange={set('gradeLevel')} options={['1Sec', '2Sec', '3Sec', 'Institute'].map((g) => ({ value: g, label: t(g) }))} /></Field>
        <Field label={t('component')}><Select value={f.component} onChange={set('component')} options={[{ value: 'theory', label: t('theory') }, { value: 'practical', label: t('practical') }]} /></Field>
        <Field label={t('period')}><input className="input" value={f.periodLabel} onChange={set('periodLabel')} /></Field>
        <Field label={t('month')}><input className="input" value={f.monthLabel} onChange={set('monthLabel')} placeholder={lang === 'ar' ? 'شهر سبتمبر - اكتوبر 2026' : ''} /></Field>
        <Field label={t('firstDate')}><input type="date" className="input" value={f.start} onChange={set('start')} /></Field>
        <Field label={t('teacher')}><input className="input" value={f.teacherName} onChange={set('teacherName')} /></Field>
        <Field label={t('evalOfficer')}><input className="input" value={f.evaluationOfficer} onChange={set('evaluationOfficer')} /></Field>
      </div>
    </Modal>
  );
}

function ImportAssessment({ onClose, onCreated }) {
  const { t } = useI18n();
  return (
    <ImportModal title={t('importAssessment')} hint={t('importHint')} endpoint="assessment" onClose={onClose}
      onDone={(r) => onCreated(r.id)}
      successMessage={(r) => t('importDoneAssessment', { n: r.studentsImported, c: r.studentsCreated, comp: t(r.component), y: r.academicYear })}
      fields={[
        { key: 'gradeLevel', label: t('grade'), type: 'select', default: '1Sec', required: true, options: ['1Sec', '2Sec', '3Sec', 'Institute'].map((g) => ({ value: g, label: t(g) })) },
        { key: 'component', label: `${t('component')} (${t('autoDetected')})`, type: 'select', default: '', options: [{ value: '', label: '—' }, { value: 'theory', label: t('theory') }, { value: 'practical', label: t('practical') }] },
        { key: 'academicYear', label: `${t('year')} (${t('autoDetected')})`, ltr: true, placeholder: '2025/2026' },
        { key: 'subjectName', label: t('subject'), full: true, placeholder: 'الدراسات الفنية التخصصية' },
        { key: 'teacherName', label: t('teacher') }, { key: 'evaluationOfficer', label: t('evalOfficer') },
      ]} />
  );
}
