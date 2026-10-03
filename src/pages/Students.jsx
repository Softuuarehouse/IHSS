import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { useLiveList } from '../lib/live';
import { Chip, Empty, Field, HistoryDrawer, Icon, LastEdit, Modal, PageHeader, Select, Spinner, useConfirm, useSaver, useToast } from '../components/ui';

const GRADES = ['1Sec', '2Sec', '3Sec', 'Institute'];
const STATUS = ['active', 'suspended', 'withdrawn', 'graduated'];
const blank = { fullName: '', gradeLevel: '1Sec', classroom: '', status: 'active', guardianName: '', guardianPhone: '', notes: '' };

export default function Students() {
  const { can } = useAuth(); const { t } = useI18n(); const confirm = useConfirm(); const toast = useToast();
  const [q, setQ] = useState(''); const [grade, setGrade] = useState(''); const [status, setStatus] = useState('');
  const [editing, setEditing] = useState(null); const [history, setHistory] = useState(null);
  const { items, loading, flash } = useLiveList('students', '/students');

  const rows = useMemo(() => items.filter((s) => (!grade || s.gradeLevel === grade) && (!status || s.status === status)
    && (!q || `${s.fullName} ${s.studentCode} ${s.guardianName} ${s.guardianPhone}`.toLowerCase().includes(q.toLowerCase()))), [items, q, grade, status]);

  const remove = async (s) => { if (confirm()) try { await api.del(`/students/${s._id}`); } catch (e) { toast(e.message, 'err'); } };

  return (
    <div>
      <PageHeader title={t('students')} presenceRoom="students" subtitle={`${rows.length} / ${items.length}`}
        actions={<>
          {can('students:export') && <button className="btn-outline" onClick={() => api.download('/export/students', 'students.xlsx')}><Icon name="download" />{t('export')}</button>}
          {can('students:create') && <button className="btn-primary" onClick={() => setEditing({ ...blank })}><Icon name="person_add" />{t('newStudent')}</button>}
        </>} />
      <div className="card mb-4 flex flex-wrap gap-3 p-3">
        <div className="relative min-w-[220px] flex-1"><Icon name="search" className="absolute start-3 top-1/2 -translate-y-1/2 text-outline" /><input className="input ps-10" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select className="w-44" value={grade} onChange={setGrade} options={[{ value: '', label: `${t('grade')}: ${t('all')}` }, ...GRADES.map((g) => ({ value: g, label: t(g) }))]} />
        <Select className="w-44" value={status} onChange={setStatus} options={[{ value: '', label: `${t('status')}: ${t('all')}` }, ...STATUS.map((g) => ({ value: g, label: t(g) }))]} />
      </div>
      <div className="card overflow-x-auto">
        {loading ? <Spinner /> : rows.length === 0 ? <Empty text={t('empty')} /> : (
          <table className="w-full min-w-[900px]">
            <thead><tr>{['#', 'code', 'studentName', 'grade', 'classroom', 'status', 'guardian', 'lastEdit', 'actions'].map((h) => <th key={h} className="th">{h === '#' ? '#' : t(h)}</th>)}</tr></thead>
            <tbody>
              {rows.map((s, i) => (
                <tr key={s._id} className={`border-t border-surface-container ${flash[s._id] ? 'flash' : ''}`}>
                  <td className="td text-outline">{i + 1}</td>
                  <td className="td font-mono text-data-mono">{s.studentCode}</td>
                  <td className="td font-semibold">{s.fullName}</td>
                  <td className="td">{t(s.gradeLevel)}</td>
                  <td className="td">{s.classroom || '—'}</td>
                  <td className="td"><Chip tone={s.status === 'active' ? 'ok' : s.status === 'graduated' ? 'info' : 'warn'}>{t(s.status)}</Chip></td>
                  <td className="td"><div>{s.guardianName}</div><div className="text-body-sm text-outline" dir="ltr">{s.guardianPhone}</div></td>
                  <td className="td"><LastEdit doc={s} /></td>
                  <td className="td whitespace-nowrap">
                    <button className="btn-secondary btn-sm" title={t('history')} onClick={() => setHistory(s)}><Icon name="history" /></button>{' '}
                    {can('students:edit') && <button className="btn-secondary btn-sm" onClick={() => setEditing(s)}><Icon name="edit" /></button>}{' '}
                    {can('students:delete') && <button className="btn-secondary btn-sm !text-error" onClick={() => remove(s)}><Icon name="delete" /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {editing && <StudentForm initial={editing} onClose={() => setEditing(null)} />}
      {history && <HistoryDrawer entity="students" id={history._id} title={history.fullName} onClose={() => setHistory(null)} />}
    </div>
  );
}

function StudentForm({ initial, onClose }) {
  const { t } = useI18n();
  const [f, setF] = useState(initial);
  const { busy, run } = useSaver((current) => setF(current));
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));
  const save = async () => {
    const body = { fullName: f.fullName, gradeLevel: f.gradeLevel, classroom: f.classroom, status: f.status, guardianName: f.guardianName, guardianPhone: f.guardianPhone, notes: f.notes };
    const r = await run(() => (f._id ? api.patch(`/students/${f._id}`, { ...body, rev: f.rev }) : api.post('/students', body)));
    if (r) onClose();
  };
  return (
    <Modal title={f._id ? t('edit') : t('newStudent')} onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose}>{t('cancel')}</button><button className="btn-primary" disabled={busy || !f.fullName} onClick={save}>{t('save')}</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('studentName')} className="sm:col-span-2"><input className="input" value={f.fullName} onChange={set('fullName')} /></Field>
        <Field label={t('grade')}><Select value={f.gradeLevel} onChange={set('gradeLevel')} options={GRADES.map((g) => ({ value: g, label: t(g) }))} /></Field>
        <Field label={t('classroom')}><input className="input" value={f.classroom} onChange={set('classroom')} placeholder="1Sec-A" dir="ltr" /></Field>
        <Field label={t('status')}><Select value={f.status} onChange={set('status')} options={STATUS.map((g) => ({ value: g, label: t(g) }))} /></Field>
        <span />
        <Field label={t('guardian')}><input className="input" value={f.guardianName} onChange={set('guardianName')} /></Field>
        <Field label={t('guardianPhone')}><input className="input" dir="ltr" value={f.guardianPhone} onChange={set('guardianPhone')} /></Field>
        <Field label={t('notes')} className="sm:col-span-2"><textarea className="input" rows={2} value={f.notes} onChange={set('notes')} /></Field>
      </div>
    </Modal>
  );
}
