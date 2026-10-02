import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { useLiveList } from '../lib/live';
import { Chip, Empty, Field, HistoryDrawer, Icon, LastEdit, Modal, PageHeader, Select, Spinner, useConfirm, useSaver, useToast } from '../components/ui';

const STAGES = ['application', 'exam_passed', 'docs_complete', 'enrolled', 'rejected'];
const stageTone = { application: 'neutral', exam_passed: 'info', docs_complete: 'warn', enrolled: 'ok', rejected: 'bad' };

export default function Registration() {
  const { can, meta } = useAuth(); const { t, lang } = useI18n(); const confirm = useConfirm(); const toast = useToast();
  const [stage, setStage] = useState(''); const [q, setQ] = useState(''); const [editing, setEditing] = useState(null); const [history, setHistory] = useState(null);
  const { items, loading, flash } = useLiveList('applications', '/registration');
  const docName = useMemo(() => Object.fromEntries((meta?.documents || []).map((d) => [d.key, d[lang]])), [meta, lang]);
  const counts = useMemo(() => STAGES.reduce((a, s) => ({ ...a, [s]: items.filter((x) => x.stage === s).length }), {}), [items]);
  const rows = items.filter((a) => (!stage || a.stage === stage) && (!q || a.applicantName.includes(q)));

  const remove = async (a) => { if (confirm()) try { await api.del(`/registration/${a._id}`); } catch (e) { toast(e.message, 'err'); } };

  return (
    <div>
      <PageHeader title={t('registration')} presenceRoom="registration"
        actions={<>
          {can('registration:export') && <button className="btn-outline" onClick={() => api.download('/export/applications', 'applications.xlsx')}><Icon name="download" />{t('export')}</button>}
          {can('registration:create') && <button className="btn-primary" onClick={() => setEditing({ applicantName: '', gradeLevel: '1Sec', guardianName: '', guardianPhone: '', notes: '', stage: 'application' })}><Icon name="add" />{t('newApplication')}</button>}
        </>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <button onClick={() => setStage('')} className={`chip shrink-0 !px-4 !py-2 ${!stage ? 'bg-primary text-on-primary' : 'bg-white border border-outline-variant'}`}>{t('all')} · {items.length}</button>
        {STAGES.map((s) => <button key={s} onClick={() => setStage(s)} className={`chip shrink-0 !px-4 !py-2 ${stage === s ? 'bg-primary text-on-primary' : 'bg-white border border-outline-variant'}`}>{t(s)} · {counts[s] || 0}</button>)}
        <div className="relative ms-auto min-w-[220px]"><Icon name="search" className="absolute start-3 top-1/2 -translate-y-1/2 text-outline" /><input className="input ps-10" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      <div className="card overflow-x-auto">
        {loading ? <Spinner /> : rows.length === 0 ? <Empty text={t('empty')} /> : (
          <table className="w-full min-w-[900px]">
            <thead><tr><th className="th">#</th><th className="th">{t('applicant')}</th><th className="th">{t('stage')}</th><th className="th">{t('documents')}</th><th className="th">{t('docsMissing')}</th><th className="th">{t('lastEdit')}</th><th className="th">{t('actions')}</th></tr></thead>
            <tbody>
              {rows.map((a, i) => {
                const total = a.docsReceived + a.docsMissing; const pct = total ? Math.round((a.docsReceived / total) * 100) : 0;
                const missing = a.documents.filter((d) => d.status === 'missing').map((d) => docName[d.key]);
                return (
                  <tr key={a._id} className={`border-t border-surface-container ${flash[a._id] ? 'flash' : ''}`}>
                    <td className="td text-outline">{i + 1}</td>
                    <td className="td font-semibold">{a.applicantName}</td>
                    <td className="td"><Chip tone={stageTone[a.stage]}>{t(a.stage)}</Chip></td>
                    <td className="td w-40"><div className="h-2 rounded-full bg-surface-container"><div className="h-2 rounded-full bg-secondary" style={{ width: `${pct}%` }} /></div><div className="mt-1 text-body-sm text-outline">{a.docsReceived}/{total}</div></td>
                    <td className="td max-w-[320px] text-body-sm text-on-surface-variant" title={missing.join(' + ')}>{missing.length ? <span className="line-clamp-2">{missing.join(' + ')}</span> : <Chip tone="ok">✓</Chip>}</td>
                    <td className="td"><LastEdit doc={a} /></td>
                    <td className="td whitespace-nowrap">
                      <button className="btn-secondary btn-sm" onClick={() => setHistory(a)}><Icon name="history" /></button>{' '}
                      {can('registration:edit') && <button className="btn-secondary btn-sm" onClick={() => setEditing(a)}><Icon name="checklist" /></button>}{' '}
                      {can('registration:delete') && <button className="btn-secondary btn-sm !text-error" onClick={() => remove(a)}><Icon name="delete" /></button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {editing && <AppForm initial={editing} docName={docName} onClose={() => setEditing(null)} />}
      {history && <HistoryDrawer entity="applications" id={history._id} title={history.applicantName} onClose={() => setHistory(null)} />}
    </div>
  );
}

function AppForm({ initial, docName, onClose }) {
  const { t, lang } = useI18n(); const { can, meta } = useAuth(); const toast = useToast(); const confirm = useConfirm();
  const [f, setF] = useState(() => JSON.parse(JSON.stringify(initial)));
  const { busy, run } = useSaver((current) => setF(current));
  const isNew = !f._id; const locked = f.stage === 'enrolled';
  const docs = f.documents || (meta.documents.map((d) => ({ key: d.key, status: d.conditional ? 'na' : 'missing' })));
  const setDoc = (key, status) => setF({ ...f, documents: docs.map((d) => (d.key === key ? { ...d, status } : d)) });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    const body = { applicantName: f.applicantName, gradeLevel: f.gradeLevel, stage: f.stage, guardianName: f.guardianName, guardianPhone: f.guardianPhone, examReceiptNo: f.examReceiptNo, notes: f.notes, documents: docs.map(({ key, status, note }) => ({ key, status, note })) };
    const r = await run(() => (isNew ? api.post('/registration', body) : api.patch(`/registration/${f._id}`, { ...body, rev: f.rev })));
    if (r) onClose();
  };
  const enroll = async () => {
    let force = false;
    if (f.docsMissing > 0) { if (!confirm(t('enrollForce'))) return; force = true; }
    const r = await run(() => api.post(`/registration/${f._id}/enroll`, { force }));
    if (r) { toast(t('enrolledOk'), 'ok'); onClose(); }
  };
  const stages = STAGES.filter((s) => s !== 'enrolled' || locked);

  return (
    <Modal wide title={isNew ? t('newApplication') : f.applicantName} onClose={onClose}
      footer={<>
        {!isNew && !locked && can('students:create') && <button className="btn-secondary me-auto !text-secondary" disabled={busy} onClick={enroll}><Icon name="school" />{t('enroll')}</button>}
        <button className="btn-secondary" onClick={onClose}>{t('cancel')}</button>
        <button className="btn-primary" disabled={busy || !f.applicantName || locked} onClick={save}>{t('save')}</button>
      </>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('applicant')}><input className="input" value={f.applicantName} onChange={set('applicantName')} disabled={locked} /></Field>
        <Field label={t('grade')}><Select value={f.gradeLevel} onChange={(v) => setF({ ...f, gradeLevel: v })} options={['1Sec', '2Sec', '3Sec', 'Institute'].map((g) => ({ value: g, label: t(g) }))} disabled={locked} /></Field>
        <Field label={t('stage')}><Select value={f.stage} onChange={(v) => setF({ ...f, stage: v })} options={stages.map((s) => ({ value: s, label: t(s) }))} disabled={locked || isNew} /></Field>
        <Field label={t('guardian')}><input className="input" value={f.guardianName || ''} onChange={set('guardianName')} disabled={locked} /></Field>
        <Field label={t('guardianPhone')}><input className="input" dir="ltr" value={f.guardianPhone || ''} onChange={set('guardianPhone')} disabled={locked} /></Field>
        <Field label={t('receipt')}><input className="input" value={f.examReceiptNo || ''} onChange={set('examReceiptNo')} disabled={locked} /></Field>
      </div>
      <h4 className="mb-2 mt-5 font-display text-title-md">{t('documents')}</h4>
      <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {docs.map((d) => (
          <div key={d.key} className="flex items-center justify-between gap-2 border-b border-surface-container py-1.5">
            <span className={`text-body-md ${d.status === 'na' ? 'text-outline' : ''}`}>{docName[d.key] || d.key}</span>
            <div className="flex shrink-0 overflow-hidden rounded-lg border border-outline-variant text-label-md">
              {[['received', 'bg-secondary text-on-secondary'], ['missing', 'bg-error text-on-error'], ['na', 'bg-surface-container-highest']].map(([s, on]) => (
                <button key={s} disabled={locked} onClick={() => setDoc(d.key, s)} className={`px-2.5 py-1 ${d.status === s ? on : 'bg-white text-on-surface-variant hover:bg-surface-container-low'}`}>{s === 'na' ? '—' : s === 'received' ? '✓' : '✗'}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-body-sm text-outline">✓ {t('received')} · ✗ {t('missing')} · — {t('na')}</p>
    </Modal>
  );
}
