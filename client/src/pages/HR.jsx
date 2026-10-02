import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { getSocket } from '../lib/socket';
import { useLiveList } from '../lib/live';
import CrudTable from '../components/CrudTable';
import { Chip, Icon, PageHeader, Spinner, useToast } from '../components/ui';
import ImportModal from '../components/ImportModal';
import AdminForm from '../components/AdminForm';

export default function HR() {
  const { t } = useI18n(); const { can } = useAuth();
  const [tab, setTab] = useState('attendance'); const [importing, setImporting] = useState(false);
  const staff = useLiveList('staff', '/hr/staff');
  const staffOptions = useMemo(() => [{ value: '', label: '—' }, ...staff.items.map((s) => ({ value: s._id, label: s.fullName }))], [staff.items]);
  return (
    <div>
      <PageHeader title={t('hr')} presenceRoom="hr" actions={<>
        {can('hr:create') && tab === 'attendance' && <button className="btn-outline" onClick={() => setImporting(true)}><Icon name="upload_file" />{t('importExcel')}</button>}
        {can('hr:export') && tab === 'staff' && <button className="btn-outline" onClick={() => api.download('/export/staff', 'staff.xlsx')}><Icon name="download" />{t('export')}</button>}
      </>} />
      <div className="mb-4 flex flex-wrap gap-2">
        {['attendance', 'staff', 'leaves', 'evaluations'].map((k) => <button key={k} onClick={() => setTab(k)} className={`chip shrink-0 !px-4 !py-2 ${tab === k ? 'bg-primary text-on-primary' : 'bg-white border border-outline-variant'}`}>{t(k)}</button>)}
      </div>
      {tab === 'attendance' && <Attendance />}
      {tab === 'staff' && <StaffTab />}
      {tab === 'leaves' && <LeavesTab staffOptions={staffOptions} />}
      {tab === 'evaluations' && <EvalTab staffOptions={staffOptions} />}
      {importing && <ImportAttendance onClose={() => setImporting(false)} />}
    </div>
  );
}

const monthNow = () => new Date().toISOString().slice(0, 7);
const startYearOf = (m) => { const [y, mo] = m.split('-').map(Number); return mo >= 9 ? y : y - 1; };

// The "مرتبات" sheet: days in month / leave / absence → present. Rows sync live between users.
function Attendance() {
  const { t, num } = useI18n(); const { can } = useAuth(); const toast = useToast();
  const [month, setMonth] = useState(monthNow()); const [rows, setRows] = useState(null); const [year, setYear] = useState({}); const [flash, setFlash] = useState({});
  const monthRef = useRef(month); monthRef.current = month;

  const load = useCallback(async () => {
    const [a, y] = await Promise.all([api.get(`/hr/attendance?month=${month}`), api.get(`/hr/attendance/yearly?startYear=${startYearOf(month)}`)]);
    setRows(a.rows); setYear(y.totals);
  }, [month]);
  useEffect(() => { setRows(null); load().catch((e) => toast(e.message, 'err')); }, [load, toast]);

  useEffect(() => {
    const s = getSocket();
    const h = (e) => {
      if (e.entity === 'staff') return load();
      if (e.entity !== 'attendance' || !e.doc) return;
      if (e.doc.month === monthRef.current) {
        setRows((rs) => rs && rs.map((r) => (r.staff._id === e.doc.staffId ? { ...r, ledger: e.doc } : r)));
        setFlash((f) => ({ ...f, [e.doc.staffId]: 1 })); setTimeout(() => setFlash((f) => { const n = { ...f }; delete n[e.doc.staffId]; return n; }), 2300);
      }
      api.get(`/hr/attendance/yearly?startYear=${startYearOf(monthRef.current)}`).then((y) => setYear(y.totals)).catch(() => {});
    };
    s.on('entity:change', h); s.on('connect', load);
    return () => { s.off('entity:change', h); s.off('connect', load); };
  }, [load]);

  const save = async (row, patch) => {
    const l = row.ledger || { workingDays: 0, leave: 0, absence: 0 };
    const body = { workingDays: l.workingDays, leave: l.leave, absence: l.absence, ...patch };
    if (body.workingDays === l.workingDays && body.leave === l.leave && body.absence === l.absence && row.ledger) return;
    try {
      const r = await api.put(`/hr/attendance/${row.staff._id}/${month}`, { ...body, rev: row.ledger?.rev });
      setRows((rs) => rs.map((x) => (x.staff._id === row.staff._id ? { ...x, ledger: r } : x)));
    } catch (e) { toast(e.message, 'err'); load(); }
  };
  const editable = can('hr:edit');
  const groups = rows ? ['education', 'contract'].map((c) => [c, rows.filter((r) => r.staff.category === c)]) : [];
  const tot = (k) => (rows || []).reduce((s, r) => s + (r.ledger?.[k] || 0), 0);

  return (
    <div>
      <div className="mb-3 flex items-center gap-3"><input type="month" className="input w-48" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        {can('hr:export') && <button className="btn-outline" onClick={() => api.download(`/export/attendance?month=${month}`, `attendance-${month}.xlsx`)}><Icon name="download" />{t('export')}</button>}</div>
      <div className="card overflow-x-auto">
        {!rows ? <Spinner /> : (
          <table className="w-full min-w-[820px]">
            <thead><tr><th className="th">#</th><th className="th">{t('fullName')}</th><th className="th">{t('jobTitle')}</th><th className="th text-center">{t('workingDays')}</th><th className="th text-center">{t('leave')}</th><th className="th text-center">{t('absence')}</th><th className="th text-center">{t('present')}</th><th className="th text-center">Σ {t('absence')}</th><th className="th text-center" title={t('fromFileHint')}>{t('fromFile')}: {t('absence')}</th></tr></thead>
            <tbody>
              {groups.map(([cat, list]) => list.length > 0 && [
                <tr key={cat} className="bg-surface-container-low"><td colSpan={8} className="px-3 py-1.5 text-label-md font-bold text-primary">{t(cat)}</td></tr>,
                ...list.map((r, i) => (
                  <tr key={r.staff._id} className={`border-t border-surface-container ${flash[r.staff._id] ? 'flash' : ''}`}>
                    <td className="td text-outline">{i + 1}</td><td className="td font-semibold">{r.staff.fullName}</td><td className="td text-on-surface-variant">{r.staff.jobTitle}</td>
                    {['workingDays', 'leave', 'absence'].map((k) => (
                      <td key={`${k}${r.ledger?.rev}${r.ledger?.[k]}`} className="td w-28 p-1 text-center">
                        <input type="number" min="0" max="31" disabled={!editable} defaultValue={r.ledger?.[k] ?? ''} className="input !py-1 text-center font-mono"
                          onBlur={(e) => e.target.value !== '' && save(r, { [k]: Number(e.target.value) })} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
                      </td>
                    ))}
                    <td className="td text-center font-mono font-bold text-secondary">{r.ledger ? num(r.ledger.present) : ''}</td>
                    <td className="td text-center font-mono">{year[r.staff._id] ? <Chip tone={year[r.staff._id].absence > 10 ? 'bad' : 'neutral'}>{num(year[r.staff._id].absence)}</Chip> : ''}</td>
                    <td className="td text-center font-mono text-outline">
                      {r.staff.importedStats?.['اجمالي الغياب'] !== undefined
                        ? (year[r.staff._id] && year[r.staff._id].absence !== r.staff.importedStats['اجمالي الغياب']
                            ? <Chip tone="warn" title={t('fromFileHint')}>{num(r.staff.importedStats['اجمالي الغياب'])}</Chip>
                            : num(r.staff.importedStats['اجمالي الغياب']))
                        : '—'}
                    </td>
                  </tr>
                )),
              ])}
            </tbody>
            <tfoot><tr className="border-t-2 border-outline-variant bg-surface-container-low font-bold"><td className="td" colSpan={3}>{t('totals')}</td>{['workingDays', 'leave', 'absence', 'present'].map((k) => <td key={k} className="td text-center font-mono">{num(tot(k))}</td>)}<td /><td /></tr></tfoot>
          </table>
        )}
      </div>
    </div>
  );
}

function StaffTab() {
  const { t, lang } = useI18n();
  const { isSuper, meta } = useAuth();
  const [promoting, setPromoting] = useState(null);
  const cats = [{ value: 'education', label: t('education') }, { value: 'contract', label: t('contract') }];
  const st = [{ value: 'active', label: t('active') }, { value: 'inactive', label: t('inactive') }];
  const columns = [
    { key: 'fullName', label: t('fullName'), render: (r) => <b>{r.fullName}</b> },
    { key: 'jobTitle', label: t('jobTitle') },
    { key: 'category', label: t('category'), render: (r) => <Chip tone={r.category === 'education' ? 'info' : 'neutral'}>{t(r.category)}</Chip> },
    { key: 'phone', label: t('phone') },
    { key: 'status', label: t('status'), render: (r) => <Chip tone={r.status === 'active' ? 'ok' : 'warn'}>{t(r.status === 'active' ? 'activeS' : 'inactive')}</Chip> },
  ];
  // Super-Admin-only shortcut: turn any employee into an admin account without retyping their details —
  // opens the exact same permissions form as Admins & Access, just pre-filled from this row.
  if (isSuper) columns.push({ key: 'access', label: t('systemAccess'), render: (r) => (
    <button className="btn-outline btn-sm" onClick={() => setPromoting(r)}><Icon name="admin_panel_settings" />{t('giveAccess')}</button>
  ) });
  return <>
    <CrudTable module="hr" entity="staff" path="/hr/staff" addLabel={t('newStaff')}
      defaults={{ fullName: '', jobTitle: '', category: 'contract', status: 'active', phone: '' }}
      columns={columns}
      fields={[{ key: 'fullName', label: t('fullName'), required: true, full: true }, { key: 'jobTitle', label: t('jobTitle') }, { key: 'category', label: t('category'), type: 'select', options: cats }, { key: 'phone', label: t('phone'), ltr: true }, { key: 'status', label: t('status'), type: 'select', options: st }, { key: 'notes', label: t('notes'), type: 'textarea', full: true }]} />
    {promoting && <AdminForm meta={meta} lang={lang} self={false} onClose={() => setPromoting(null)}
      initial={{ name: promoting.fullName, email: promoting.email || '', title: promoting.jobTitle || '', role: 'admin', permissions: [] }} />}
  </>;
}

function LeavesTab({ staffOptions }) {
  const { t, num, dateOnly } = useI18n();
  const types = ['annual', 'sick', 'casual', 'unpaid', 'other'].map((v) => ({ value: v, label: t(v) }));
  const sts = [{ value: 'pending', label: t('pending') }, { value: 'approved', label: t('approved') }, { value: 'rejected', label: t('rejectedS') }];
  const tone = { pending: 'warn', approved: 'ok', rejected: 'bad' };
  return <CrudTable module="hr" entity="leaves" path="/hr/leaves" addLabel={t('newLeave')}
    defaults={{ staff: '', type: 'annual', from: '', to: '', status: 'pending', reason: '' }}
    columns={[{ key: 'staff', label: t('fullName'), render: (r) => <b>{r.staff?.fullName || <span className="italic text-outline">{t('deletedRecordRow')}</span>}</b> }, { key: 'type', label: t('type'), render: (r) => t(r.type) }, { key: 'from', label: t('from'), render: (r) => dateOnly(r.from) }, { key: 'to', label: t('to'), render: (r) => dateOnly(r.to) }, { key: 'days', label: t('days'), render: (r) => num(r.days) }, { key: 'status', label: t('status'), render: (r) => <Chip tone={tone[r.status]}>{t(r.status === 'rejected' ? 'rejectedS' : r.status)}</Chip> }]}
    fields={[{ key: 'staff', label: t('fullName'), type: 'ref', options: staffOptions, required: true, full: true }, { key: 'type', label: t('type'), type: 'select', options: types }, { key: 'status', label: t('status'), type: 'select', options: sts }, { key: 'from', label: t('from'), type: 'date', required: true }, { key: 'to', label: t('to'), type: 'date', required: true }, { key: 'reason', label: t('reason'), type: 'textarea', full: true }]} />;
}

function EvalTab({ staffOptions }) {
  const { t, num } = useI18n();
  return <CrudTable module="hr" entity="evaluations" path="/hr/evaluations" addLabel={t('newEval')}
    defaults={{ staff: '', period: new Date().toISOString().slice(0, 7), score: 80, strengths: '', improvements: '' }}
    columns={[{ key: 'staff', label: t('fullName'), render: (r) => <b>{r.staff?.fullName || <span className="italic text-outline">{t('deletedRecordRow')}</span>}</b> }, { key: 'period', label: t('period') }, { key: 'score', label: t('score'), render: (r) => <Chip tone={r.score >= 85 ? 'ok' : r.score >= 60 ? 'warn' : 'bad'}>{num(r.score)}</Chip> }, { key: 'evaluatorName', label: t('evaluator') }, { key: 'strengths', label: t('strengths') }]}
    fields={[{ key: 'staff', label: t('fullName'), type: 'ref', options: staffOptions, required: true, full: true, onlyNew: true }, { key: 'period', label: t('period'), required: true }, { key: 'score', label: t('score'), type: 'number', min: 0, max: 100, required: true }, { key: 'strengths', label: t('strengths'), type: 'textarea', full: true }, { key: 'improvements', label: t('improvements'), type: 'textarea', full: true }]} />;
}

function ImportAttendance({ onClose }) {
  const { t } = useI18n();
  const startY = new Date().getMonth() >= 8 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  return (
    <ImportModal title={t('importAttendance')} hint={t('importHint')} endpoint="attendance" onClose={onClose}
      successMessage={(r) => (r.summaryFields?.length ? t('importDoneAttendanceFull', { n: r.staffImported, c: r.staffCreated, r: r.ledgersWritten, f: r.summaryFields.join('، ') }) : t('importDoneAttendance', { n: r.staffImported, c: r.staffCreated, r: r.ledgersWritten }))}
      fields={[{ key: 'startYear', label: t('startYear'), default: String(startY), required: true, ltr: true, placeholder: '2026' }]} />
  );
}