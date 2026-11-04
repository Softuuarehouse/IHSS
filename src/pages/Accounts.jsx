import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { getSocket } from '../lib/socket';
import CrudTable from '../components/CrudTable';
import { Chip, Icon, PageHeader, Spinner, StatCard } from '../components/ui';

/* t() returns the key itself when a translation is missing -> use a readable fallback */
const tt = (t, k, fb) => { const v = t(k); return v && v !== k ? v : fb; };

export default function Accounts() {
  const { t, num } = useI18n(); const { can, meta } = useAuth();
  const [tab, setTab] = useState('financialPosition');
  return (
    <div>
      <PageHeader title={t('accounts')} presenceRoom="accounts" actions={can('accounts:export') && <button className="btn-outline" onClick={() => api.download('/export/transactions', 'transactions.xlsx')}><Icon name="download" />{t('export')}</button>} />
      <div className="mb-4 flex gap-2">
        {['financialPosition', 'transactions'].map((k) => <button key={k} onClick={() => setTab(k)} className={`chip shrink-0 !px-4 !py-2 ${tab === k ? 'bg-primary text-on-primary' : 'bg-white border border-outline-variant'}`}>{t(k)}</button>)}
      </div>
      {tab === 'financialPosition' ? <Position /> : <Transactions cats={meta.categories} num={num} />}
    </div>
  );
}

/* ───────────── financial position (unchanged) ───────────── */
function Position() {
  const { t, num } = useI18n();
  const [s, setS] = useState(null);
  useEffect(() => {
    let timer; const load = () => api.get('/accounts/summary').then(setS).catch(() => {});
    load(); const sock = getSocket();
    const h = (e) => { if (['transactions', 'fees'].includes(e.entity)) { clearTimeout(timer); timer = setTimeout(load, 400); } };
    sock.on('entity:change', h); return () => { clearTimeout(timer); sock.off('entity:change', h); };
  }, []);
  if (!s) return <Spinner />;
  const max = Math.max(1, ...s.byMonth.map((m) => Math.max(m.revenue, m.expenses)));
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="secondary" icon="trending_up" label={t('revenue')} value={`${num(s.revenue)} ${t('egp')}`} />
        <StatCard tone="tertiary" icon="trending_down" label={t('expense')} value={`${num(s.expenses)} ${t('egp')}`} />
        <StatCard icon="account_balance" label={t('net')} value={`${num(s.net)} ${t('egp')}`} />
        <StatCard tone="neutral" icon="hourglass_top" label={t('receivables')} value={`${num(s.receivables)} ${t('egp')}`} sub={s.collectionRate !== null ? `${t('collectionRate')}: ${num(s.collectionRate, 1)}%` : ''} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="mb-3 font-display text-headline-sm">{t('byMonth')}</h3>
          {s.byMonth.length === 0 ? <div className="text-outline">{t('empty')}</div> : s.byMonth.map((m) => (
            <div key={m.month} className="mb-3">
              <div className="mb-1 flex justify-between text-body-sm"><span className="font-mono">{m.month}</span><span className={m.net >= 0 ? 'text-secondary' : 'text-error'}>{num(m.net)}</span></div>
              <div className="h-2.5 rounded-full bg-surface-container"><div className="h-2.5 rounded-full bg-secondary" style={{ width: `${(m.revenue / max) * 100}%` }} /></div>
              <div className="mt-1 h-2.5 rounded-full bg-surface-container"><div className="h-2.5 rounded-full bg-primary-container" style={{ width: `${(m.expenses / max) * 100}%` }} /></div>
            </div>
          ))}
        </div>
        <div className="card p-5">
          <h3 className="mb-3 font-display text-headline-sm">{t('byCategory')}</h3>
          {Object.entries(s.byCategory).map(([c, v]) => (
            <div key={c} className="flex items-center justify-between border-b border-surface-container py-2"><span>{t(s.categories.revenue.includes(c) && c !== 'other_revenue' ? `${c}_c` : c)}</span><span className="font-mono">{num(v, 2)}</span></div>
          ))}
          <div className="mt-4 rounded-lg bg-primary-fixed/40 p-3 text-body-md"><Chip tone="info">{t('discountsGiven')}</Chip> <b className="font-mono">{num(s.discountsGiven)}</b> {t('egp')}</div>
        </div>
      </div>
    </div>
  );
}

/* ───────────── transactions + filters ─────────────
   - No filter / search typed  -> the normal CrudTable (add / edit / delete as before).
   - Any filter or search used -> a filtered list built here from GET /accounts, so the filters
     work without touching CrudTable. Clear the filters to go back to the editable table. */
const EMPTY = { q: '', type: '', category: '', method: '', from: '', to: '', min: '', max: '' };

function Transactions({ cats, num }) {
  const { t, dateOnly } = useI18n();
  const [f, setF] = useState(EMPTY);
  const [rows, setRows] = useState(null);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const catLabel = (c) => t(cats.revenue.includes(c) && c !== 'other_revenue' ? `${c}_c` : c);
  const all = [...cats.revenue, ...cats.expense].map((c) => ({ value: c, label: catLabel(c) }));
  const active = Object.values(f).filter(Boolean).length;

  // load all transactions (and keep them fresh)
  useEffect(() => {
    let timer;
    const load = () => api.get('/accounts')
      .then((r) => setRows(Array.isArray(r) ? r : r?.items || r?.data || r?.rows || []))
      .catch(() => setRows([]));
    load(); const sock = getSocket();
    const h = (e) => { if (e.entity === 'transactions') { clearTimeout(timer); timer = setTimeout(load, 400); } };
    sock.on('entity:change', h); return () => { clearTimeout(timer); sock.off('entity:change', h); };
  }, []);

  const shown = useMemo(() => {
    if (!rows) return [];
    const q = f.q.trim().toLowerCase();
    return rows.filter((r) => {
      const d = String(r.date || '').slice(0, 10), a = Number(r.amount);
      if (f.type && r.type !== f.type) return false;
      if (f.category && r.category !== f.category) return false;
      if (f.method && r.method !== f.method) return false;
      if (f.from && d < f.from) return false;
      if (f.to && d > f.to) return false;
      if (f.min !== '' && !(a >= Number(f.min))) return false;
      if (f.max !== '' && !(a <= Number(f.max))) return false;
      if (q && !`${r.description || ''} ${r.reference || ''} ${catLabel(r.category)} ${r.amount}`.toLowerCase().includes(q)) return false;
      return true;
    }).sort((x, y) => String(y.date).localeCompare(String(x.date)));
  }, [rows, f]); // eslint-disable-line react-hooks/exhaustive-deps

  const sumOf = (type) => shown.filter((r) => r.type === type).reduce((a, r) => a + Number(r.amount || 0), 0);
  const sel = 'rounded-lg border border-outline-variant bg-white px-3 py-2 text-body-sm';

  return <>
    {/* search + filters */}
    <div className="mb-3 space-y-2">
      <div className="relative">
        <Icon name="search" />
        <input className={`${sel} w-full`} placeholder={tt(t, 'search', 'Search…')} value={f.q} onChange={set('q')} />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <select className={sel} value={f.type} onChange={set('type')}>
          <option value="">{t('type')}: {tt(t, 'all', 'All')}</option><option value="revenue">{t('revenue')}</option><option value="expense">{t('expense')}</option>
        </select>
        <select className={sel} value={f.category} onChange={set('category')}>
          <option value="">{t('category')}: {tt(t, 'all', 'All')}</option>{all.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className={sel} value={f.method} onChange={set('method')}>
          <option value="">{t('method')}: {tt(t, 'all', 'All')}</option>{['cash', 'bank', 'card', 'other'].map((m) => <option key={m} value={m}>{t(m)}</option>)}
        </select>
        <label className="text-body-sm text-outline">{tt(t, 'from', 'From')}<input type="date" className={`${sel} ms-1`} value={f.from} onChange={set('from')} /></label>
        <label className="text-body-sm text-outline">{tt(t, 'to', 'To')}<input type="date" className={`${sel} ms-1`} value={f.to} onChange={set('to')} /></label>
        <input type="number" min="0" placeholder={`${t('amount')} ≥`} className={`${sel} w-28`} value={f.min} onChange={set('min')} />
        <input type="number" min="0" placeholder={`${t('amount')} ≤`} className={`${sel} w-28`} value={f.max} onChange={set('max')} />
        {active > 0 && <button className="chip !px-3 !py-2 border border-outline-variant" onClick={() => setF(EMPTY)}><Icon name="filter_alt_off" />{tt(t, 'reset', 'Reset')} ({active})</button>}
      </div>
    </div>

    {active === 0 ? (
      <CrudTable module="accounts" entity="transactions" path="/accounts" addLabel={t('newTransaction')}
        rowLocked={(r) => r.source === 'fee_payment'}
        defaults={{ type: 'revenue', category: 'other_revenue', amount: '', date: new Date().toISOString().slice(0, 10), description: '', method: 'cash', reference: '' }}
        columns={[
          { key: 'date', label: t('date'), render: (r) => dateOnly(r.date) },
          { key: 'type', label: t('type'), render: (r) => <Chip tone={r.type === 'revenue' ? 'ok' : 'warn'}>{t(r.type === 'revenue' ? 'revenue' : 'expense')}</Chip> },
          { key: 'category', label: t('category'), render: (r) => catLabel(r.category) },
          { key: 'amount', label: t('amount'), end: true, render: (r) => <span className={r.type === 'revenue' ? 'text-secondary' : 'text-error'}>{r.type === 'revenue' ? '+' : '−'}{num(r.amount, 2)}</span> },
          { key: 'description', label: t('description'), render: (r) => <>{r.description} {r.source === 'fee_payment' && <Chip tone="info">{t('fromFees')}</Chip>}</> },
          { key: 'reference', label: t('reference') },
        ]}
        fields={[
          { key: 'type', label: t('type'), type: 'select', options: [{ value: 'revenue', label: t('revenue') }, { value: 'expense', label: t('expense') }] },
          { key: 'category', label: t('category'), type: 'select', options: all },
          { key: 'amount', label: t('amount'), type: 'number', min: 0, step: '0.01', required: true }, { key: 'date', label: t('date'), type: 'date', required: true },
          { key: 'method', label: t('method'), type: 'select', options: ['cash', 'bank', 'card', 'other'].map((m) => ({ value: m, label: t(m) })) }, { key: 'reference', label: t('reference') },
          { key: 'description', label: t('description'), full: true },
        ]} />
    ) : !rows ? <Spinner /> : (
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-surface-container p-3">
          <Chip tone="info">{shown.length} / {rows.length}</Chip>
          <Chip tone="ok">+{num(sumOf('revenue'), 2)}</Chip>
          <Chip tone="warn">−{num(sumOf('expense'), 2)}</Chip>
          <span className="text-body-sm text-outline">{tt(t, 'filterHint', 'Clear the filters to add or edit transactions.')}</span>
        </div>
        {shown.length === 0 ? <div className="p-5 text-outline">{t('empty')}</div> : (
          <div className="overflow-auto">
            <table className="w-full text-body-sm">
              <thead className="bg-surface-container"><tr>
                <th className="p-2 text-start">{t('date')}</th><th className="p-2 text-start">{t('type')}</th><th className="p-2 text-start">{t('category')}</th>
                <th className="p-2 text-end">{t('amount')}</th><th className="p-2 text-start">{t('description')}</th><th className="p-2 text-start">{t('reference')}</th>
              </tr></thead>
              <tbody>{shown.map((r, i) => (
                <tr key={r._id || r.id || i} className="border-t border-surface-container">
                  <td className="whitespace-nowrap p-2">{dateOnly(r.date)}</td>
                  <td className="p-2"><Chip tone={r.type === 'revenue' ? 'ok' : 'warn'}>{t(r.type === 'revenue' ? 'revenue' : 'expense')}</Chip></td>
                  <td className="p-2">{catLabel(r.category)}</td>
                  <td className={`whitespace-nowrap p-2 text-end font-mono ${r.type === 'revenue' ? 'text-secondary' : 'text-error'}`}>{r.type === 'revenue' ? '+' : '−'}{num(r.amount, 2)}</td>
                  <td className="p-2">{r.description} {r.source === 'fee_payment' && <Chip tone="info">{t('fromFees')}</Chip>}</td>
                  <td className="p-2">{r.reference}</td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
      </div>
    )}
  </>;
}
