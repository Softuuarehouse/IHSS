import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { useLiveList } from '../lib/live';
import { Chip, Empty, Field, HistoryDrawer, Icon, LastEdit, Modal, PageHeader, Select, Spinner, useConfirm, useSaver, useToast } from '../components/ui';

const yearNow = () => { const d = new Date(); const y = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1; return `${y}/${y + 1}`; };

export default function Fees() {
  const { can } = useAuth(); const { t, num } = useI18n(); const toast = useToast(); const confirm = useConfirm();
  const [year, setYear] = useState(yearNow()); const [term, setTerm] = useState('first'); const [q, setQ] = useState('');
  const [open, setOpen] = useState(null); const [gen, setGen] = useState(false); const [history, setHistory] = useState(null);
  const path = `/fees?academicYear=${encodeURIComponent(year)}&term=${term}`;
  const { items, loading, flash, reload } = useLiveList('fees', path, { match: (d) => d.academicYear === year && d.term === term });

  const rows = useMemo(() => items.filter((f) => !q || `${f.student?.fullName} ${f.student?.studentCode}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => `${a.student?.gradeLevel}${a.student?.fullName}`.localeCompare(`${b.student?.gradeLevel}${b.student?.fullName}`, 'ar')), [items, q]);
  const sum = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
  const cols = ['tuition', 'bus', 'uniform', 'accommodation', 'gross', 'totalDiscount', 'remainingAfterDiscount', 'paid', 'balance'];
  const removeRecord = async (f) => { if (confirm()) try { await api.del(`/fees/${f._id}`); } catch (e) { toast(e.message, 'err'); } };

  return (
    <div>
      <PageHeader title={t('fees')} presenceRoom="fees" subtitle={`${year} · ${t(term)}`}
        actions={<>
          {can('fees:export') && <button className="btn-outline" onClick={() => api.download('/export/fees', 'fees.xlsx')}><Icon name="download" />{t('export')}</button>}
          {can('fees:create') && <button className="btn-primary" onClick={() => setGen(true)}><Icon name="playlist_add" />{t('generate')}</button>}
        </>} />
      <div className="card mb-4 flex flex-wrap gap-3 p-3">
        <input className="input w-36" dir="ltr" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026/2027" />
        <Select className="w-40" value={term} onChange={setTerm} options={[{ value: 'first', label: t('first') }, { value: 'second', label: t('second') }]} />
        <div className="relative min-w-[220px] flex-1"><Icon name="search" className="absolute start-3 top-1/2 -translate-y-1/2 text-outline" /><input className="input ps-10" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>

      <div className="card overflow-x-auto">
        {loading ? <Spinner /> : rows.length === 0 ? <Empty text={t('empty')} /> : (
          <table className="w-full min-w-[1150px]">
            <thead>
              <tr>
                <th className="th">{t('grade')}</th><th className="th">{t('studentName')}</th>
                {cols.map((c) => <th key={c} className={`th text-end ${['totalDiscount', 'remainingAfterDiscount'].includes(c) ? '!bg-primary-fixed !text-primary' : ''}`}>{t(c)}</th>)}
                <th className="th">{t('paymentStatus')}</th>
                <th className="th">{t('notes')}</th><th className="th">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f._id} className={`border-t border-surface-container ${flash[f._id] ? 'flash' : ''}`}>
                  <td className="td">{f.student ? t(f.student.gradeLevel) : <Chip tone="bad">?</Chip>}</td>
                  <td className="td font-semibold">{f.student?.fullName || <span className="italic text-outline">{t('deletedRecordRow')}</span>}</td>
                  {cols.map((c) => (
                    <td key={c} className={`td text-end font-mono text-data-mono ${c === 'totalDiscount' && f[c] ? 'text-primary' : ''} ${c === 'remainingAfterDiscount' ? 'bg-primary-fixed/30 font-bold' : ''} ${c === 'balance' && f[c] > 0 ? 'text-error' : ''}`}>{num(f[c], 2)}</td>
                  ))}
                  <td className="td">{f.balance > 0.005 ? <Chip tone="bad">{t('missingAmount', { amount: num(f.balance, 2) })}</Chip> : <Chip tone="ok">{t('fullyPaid')}</Chip>}</td>
                  <td className="td max-w-[200px] truncate text-body-sm text-outline" title={f.notes}>{f.notes} {f.busLine && <Chip>{f.busLine}</Chip>}</td>
                  <td className="td whitespace-nowrap">
                    <button className="btn-secondary btn-sm" onClick={() => setHistory(f)}><Icon name="history" /></button>{' '}
                    {can('fees:edit') && <button className="btn-secondary btn-sm" onClick={() => setOpen(f._id)}><Icon name="edit" /></button>}{' '}
                    {can('fees:delete') && <button className="btn-secondary btn-sm !text-error" onClick={() => removeRecord(f)}><Icon name="delete" /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-outline-variant bg-surface-container-low font-bold">
                <td className="td" colSpan={2}>{t('totals')}</td>
                {cols.map((c) => <td key={c} className="td text-end font-mono text-data-mono">{num(sum(c), 2)}</td>)}
                <td className="td text-body-sm text-outline">{t('missingCount', { n: rows.filter((r) => r.balance > 0.005).length })}</td>
                <td className="td" colSpan={2} />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
      {open && <FeeEditor id={open} record={items.find((x) => x._id === open)} onClose={() => setOpen(null)} />}
      {gen && <Generate year={year} term={term} onClose={() => { setGen(false); reload(); }} toast={toast} />}
      {history && <HistoryDrawer entity="fees" id={history._id} title={history.student?.fullName} onClose={() => setHistory(null)} />}
    </div>
  );
}

function Generate({ year, term, onClose, toast }) {
  const { t } = useI18n();
  const [f, setF] = useState({ academicYear: year, term, gradeLevel: '', tuition: 40000 });
  const { busy, run } = useSaver();
  const go = async () => {
    const r = await run(() => api.post('/fees/generate', { ...f, gradeLevel: f.gradeLevel || undefined, tuition: Number(f.tuition) }));
    if (r) { toast(t('generated', { n: r.created }), 'ok'); onClose(); }
  };
  return (
    <Modal title={t('generate')} onClose={onClose} footer={<><button className="btn-secondary" onClick={onClose}>{t('cancel')}</button><button className="btn-primary" disabled={busy} onClick={go}>{t('generate')}</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('year')}><input className="input" dir="ltr" value={f.academicYear} onChange={(e) => setF({ ...f, academicYear: e.target.value })} /></Field>
        <Field label={t('term')}><Select value={f.term} onChange={(v) => setF({ ...f, term: v })} options={[{ value: 'first', label: t('first') }, { value: 'second', label: t('second') }]} /></Field>
        <Field label={t('grade')}><Select value={f.gradeLevel} onChange={(v) => setF({ ...f, gradeLevel: v })} options={[{ value: '', label: t('all') }, ...['1Sec', '2Sec', '3Sec', 'Institute'].map((g) => ({ value: g, label: t(g) }))]} /></Field>
        <Field label={t('tuition')}><input type="number" className="input" value={f.tuition} onChange={(e) => setF({ ...f, tuition: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

// Live totals preview mirrors the server formula (server is still the source of truth).
function preview(f) {
  const n = (v) => Number(v) || 0;
  const gross = n(f.tuition) + n(f.bus) + n(f.uniform) + n(f.accommodation);
  let disc = 0;
  for (const d of f.discounts) disc += d.type === 'percent' ? ((d.base === 'tuition' ? n(f.tuition) : gross) * n(d.value)) / 100 : n(d.value);
  disc = Math.min(disc, gross);
  return { gross, disc, remaining: gross - disc };
}

function FeeEditor({ id, record, onClose }) {
  const { t, num, dateOnly } = useI18n(); const toast = useToast();
  const { can } = useAuth();
  const [f, setF] = useState(() => JSON.parse(JSON.stringify(record)));
  const { busy, run } = useSaver((current) => setF(current));
  const [pay, setPay] = useState({ amount: '', method: 'cash', receiptNo: '' });
  const p = preview(f);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setD = (i, k, v) => setF({ ...f, discounts: f.discounts.map((d, j) => (j === i ? { ...d, [k]: v } : d)) });

  const save = async () => {
    const body = { tuition: +f.tuition, bus: +f.bus, busLine: f.busLine, uniform: +f.uniform, accommodation: +f.accommodation, notes: f.notes,
      discounts: f.discounts.map((d) => ({ _id: d._id, reason: d.reason, type: d.type, base: d.base, value: +d.value })), rev: f.rev };
    const r = await run(() => api.patch(`/fees/${id}`, body));
    if (r) { setF(r); toast('✓', 'ok'); }
  };
  const addPay = async () => {
    const r = await run(() => api.post(`/fees/${id}/payments`, { amount: +pay.amount, method: pay.method, receiptNo: pay.receiptNo }));
    if (r) { setF(r); setPay({ amount: '', method: 'cash', receiptNo: '' }); }
  };
  const delPay = async (pid) => { const r = await run(() => api.del(`/fees/${id}/payments/${pid}`)); if (r) setF(r); };
  const canEdit = can('fees:edit');

  return (
    <Modal wide title={`${f.student?.fullName || t('deletedRecordRow')} — ${f.academicYear} · ${t(f.term)}`} onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose}>{t('close')}</button>{canEdit && <button className="btn-primary" disabled={busy} onClick={save}>{t('save')}</button>}</>}>
      <div className="grid gap-3 sm:grid-cols-4">
        {['tuition', 'bus', 'uniform', 'accommodation'].map((k) => <Field key={k} label={t(k)}><input type="number" min="0" className="input" value={f[k]} onChange={set(k)} disabled={!canEdit} /></Field>)}
        <Field label={t('busLine')}><input className="input" value={f.busLine || ''} onChange={set('busLine')} disabled={!canEdit} /></Field>
        <Field label={t('notes')} className="sm:col-span-3"><input className="input" value={f.notes || ''} onChange={set('notes')} disabled={!canEdit} /></Field>
      </div>

      <div className="mt-5 rounded-xl border border-primary-fixed-dim bg-primary-fixed/30 p-4">
        <div className="mb-2 flex items-center justify-between"><h4 className="font-display text-title-md">{t('discounts')}</h4>
          {canEdit && <button className="btn-outline btn-sm" onClick={() => setF({ ...f, discounts: [...f.discounts, { reason: '', type: 'fixed', base: 'tuition', value: 0 }] })}><Icon name="add" />{t('addDiscount')}</button>}</div>
        {f.discounts.map((d, i) => (
          <div key={d._id || i} className="mb-2 grid grid-cols-12 items-end gap-2">
            <input className="input col-span-4" placeholder={t('reason')} value={d.reason} onChange={(e) => setD(i, 'reason', e.target.value)} disabled={!canEdit} />
            <Select className="col-span-3" value={d.type} onChange={(v) => setD(i, 'type', v)} options={[{ value: 'fixed', label: t('fixed') }, { value: 'percent', label: t('percent') }]} disabled={!canEdit} />
            <input type="number" min="0" className="input col-span-2" value={d.value} onChange={(e) => setD(i, 'value', e.target.value)} disabled={!canEdit} />
            {d.type === 'percent' ? <Select className="col-span-2" value={d.base} onChange={(v) => setD(i, 'base', v)} options={[{ value: 'tuition', label: t('ofTuition') }, { value: 'total', label: t('ofTotal') }]} disabled={!canEdit} /> : <span className="col-span-2" />}
            {canEdit && <button className="col-span-1 btn-secondary btn-sm !text-error" onClick={() => setF({ ...f, discounts: f.discounts.filter((_, j) => j !== i) })}><Icon name="delete" /></button>}
          </div>
        ))}
        <div className="mt-3 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-white p-3"><div className="text-label-md text-on-surface-variant">{t('gross')}</div><div className="font-mono text-title-md">{num(p.gross, 2)}</div></div>
          <div className="rounded-lg bg-white p-3"><div className="text-label-md text-primary">{t('totalDiscount')}</div><div className="font-mono text-title-md text-primary">{num(p.disc, 2)}</div></div>
          <div className="rounded-lg bg-primary p-3 text-on-primary"><div className="text-label-md">{t('remainingAfterDiscount')}</div><div className="font-mono text-title-md">{num(p.remaining, 2)}</div></div>
        </div>
      </div>

      <div className="mt-5">
        <h4 className="mb-2 font-display text-title-md">{t('payments')} <Chip tone={f.balance > 0 ? 'warn' : 'ok'}>{t('balance')}: {num(f.balance, 2)}</Chip></h4>
        <table className="w-full"><tbody>
          {f.payments.map((x) => (
            <tr key={x._id} className="border-t border-surface-container">
              <td className="td">{dateOnly(x.date)}</td><td className="td font-mono">{num(x.amount, 2)}</td><td className="td">{t(x.method)}</td><td className="td text-outline">{x.receiptNo}</td><td className="td text-body-sm text-outline">{x.recordedByName}</td>
              <td className="td text-end">{canEdit && <button className="btn-secondary btn-sm !text-error" onClick={() => delPay(x._id)}><Icon name="delete" /></button>}</td>
            </tr>
          ))}
        </tbody></table>
        {canEdit && f.balance > 0 && (
          <div className="mt-3 grid grid-cols-12 items-end gap-2">
            <input type="number" min="0" className="input col-span-3" placeholder={t('amount')} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
            <Select className="col-span-3" value={pay.method} onChange={(v) => setPay({ ...pay, method: v })} options={['cash', 'bank', 'card', 'other'].map((m) => ({ value: m, label: t(m) }))} />
            <input className="input col-span-4" placeholder={t('receipt')} value={pay.receiptNo} onChange={(e) => setPay({ ...pay, receiptNo: e.target.value })} />
            <button className="btn-primary col-span-2" disabled={busy || !+pay.amount} onClick={addPay}><Icon name="add" />{t('addPayment')}</button>
          </div>
        )}
      </div>
    </Modal>
  );
}