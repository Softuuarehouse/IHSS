import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { getSocket } from '../lib/socket';
import CrudTable from '../components/CrudTable';
import { Chip, Icon, PageHeader, Spinner, StatCard } from '../components/ui';

/* ───────────── settings you may need to adjust ───────────── */
// Endpoint used to create ONE transaction (called once per Excel row).
const CREATE_URL = '/accounts/transactions';
// Where categories that don't exist yet are remembered (frontend only).
const CUSTOM_CATS_KEY = 'accounts.customCategories';
/* ──────────────────────────────────────────────────────────── */

const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');
const low = (s) => norm(s).toLowerCase();
const loadCustom = () => { try { return JSON.parse(localStorage.getItem(CUSTOM_CATS_KEY)) || []; } catch { return []; } };
const saveCustom = (list) => { try { localStorage.setItem(CUSTOM_CATS_KEY, JSON.stringify(list)); } catch { /* ignore */ } };

/* Excel date -> 'YYYY-MM-DD'. Handles serial numbers, Date objects and text dates. */
function toISO(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10);
  if (v instanceof Date && !isNaN(v)) return new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const s = norm(v); let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; // d/m/yyyy
  return null;
}

/* Read the workbook: find the header row (Categories / Item / Amount / Date) and turn each line into an EXPENSE. */
async function parseExcel(file) {
  const XLSX = await import('xlsx'); // npm i xlsx
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const rows = []; let skipped = 0;
  for (const name of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
    const h = grid.findIndex((r) => r.some((c) => /^amount$/i.test(norm(c))) && r.some((c) => /^date$/i.test(norm(c))));
    if (h < 0) continue;
    const head = grid[h].map((c) => low(c));
    const iCat = head.findIndex((c) => /^cat/.test(c)), iItem = head.indexOf('item'), iAmt = head.indexOf('amount'), iDate = head.indexOf('date');
    for (let i = h + 1; i < grid.length; i++) {
      const r = grid[i];
      if (r.every((c) => c == null || c === '')) continue;
      const item = norm(r[iItem]), amount = Number(r[iAmt]), date = toISO(r[iDate]);
      if (!item || !(amount > 0) || !date) { skipped++; continue; } // salary header lines, zero rows, etc.
      const note = r[iAmt + 1] != null && iAmt + 1 < iDate ? norm(r[iAmt + 1]) : '';   // e.g. "down payment", "3 months"
      const who = typeof r[iDate + 1] === 'string' ? norm(r[iDate + 1]) : '';          // e.g. "ramy", "ahmed"
      rows.push({ line: i + 1, sheet: name, rawCat: norm(r[iCat]), amount, date, description: note ? `${item} — ${note}` : item, reference: who });
    }
  }
  return { rows, skipped };
}

export default function Accounts() {
  const { t, num } = useI18n(); const { can, meta } = useAuth();
  const [tab, setTab] = useState('financialPosition');
  const [reload, setReload] = useState(0);
  const [imp, setImp] = useState(null);           // parsed file waiting for confirmation / being imported
  const [custom, setCustom] = useState(loadCustom);
  const fileRef = useRef(null);

  const onPick = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try { setImp({ file: f.name, ...(await parseExcel(f)), state: 'preview' }); }
    catch (err) { alert(`${t('importFailed') !== 'importFailed' ? t('importFailed') : 'Could not read the file'}: ${err.message}`); }
  };

  return (
    <div>
      <PageHeader title={t('accounts')} presenceRoom="accounts" actions={<div className="flex gap-2">
        {can('accounts:create') !== false && <>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={onPick} />
          <button className="btn-outline" onClick={() => fileRef.current?.click()}><Icon name="upload" />{tt(t, 'import', 'Import')}</button>
        </>}
        {can('accounts:export') && <button className="btn-outline" onClick={() => api.download('/export/transactions', 'transactions.xlsx')}><Icon name="download" />{t('export')}</button>}
      </div>} />
      <div className="mb-4 flex gap-2">
        {['financialPosition', 'transactions'].map((k) => <button key={k} onClick={() => setTab(k)} className={`chip shrink-0 !px-4 !py-2 ${tab === k ? 'bg-primary text-on-primary' : 'bg-white border border-outline-variant'}`}>{t(k)}</button>)}
      </div>
      {tab === 'financialPosition' ? <Position key={reload} /> : <Transactions key={reload} cats={meta.categories} custom={custom} num={num} />}
      {imp && <ImportDialog imp={imp} setImp={setImp} cats={meta.categories} custom={custom}
        onNewCategories={(names) => { const next = [...custom, ...names]; setCustom(next); saveCustom(next); }}
        onDone={() => { setReload((n) => n + 1); setTab('transactions'); }} />}
    </div>
  );
}

/* t() returns the key itself when a translation is missing -> use a readable fallback */
const tt = (t, k, fb) => { const v = t(k); return v && v !== k ? v : fb; };

/* ───────────── import dialog ───────────── */
function ImportDialog({ imp, setImp, cats, custom, onNewCategories, onDone }) {
  const { t, num } = useI18n();
  const stop = useRef(false);
  const [prog, setProg] = useState({ done: 0, ok: 0, fail: [] });

  // Map every Excel category to an existing one (by key or by translated label) or mark it as NEW.
  const plan = useMemo(() => {
    const lookup = new Map();
    [...cats.expense, ...custom].forEach((c) => { lookup.set(low(c), c); lookup.set(low(c.replace(/_/g, ' ')), c); lookup.set(low(t(c)), c); });
    const fallback = cats.expense.includes('other_expense') ? 'other_expense' : cats.expense[cats.expense.length - 1];
    const created = new Map(); const summary = new Map();
    const items = imp.rows.map((r) => {
      let category;
      if (!r.rawCat) category = fallback;
      else if (lookup.has(low(r.rawCat))) category = lookup.get(low(r.rawCat));
      else { category = created.get(low(r.rawCat)) || r.rawCat; created.set(low(r.rawCat), category); lookup.set(low(r.rawCat), category); }
      const s = summary.get(category) || { category, count: 0, sum: 0, isNew: created.has(low(category)) };
      s.count++; s.sum += r.amount; summary.set(category, s);
      return { ...r, category };
    });
    return { items, summary: [...summary.values()].sort((a, b) => b.sum - a.sum), newNames: [...created.values()] };
  }, [imp.rows, cats, custom, t]);

  const total = plan.items.reduce((a, r) => a + r.amount, 0);
  const running = imp.state === 'running';

  const start = async () => {
    stop.current = false; setImp((p) => ({ ...p, state: 'running' }));
    if (plan.newNames.length) onNewCategories(plan.newNames);          // 1) create missing categories (frontend)
    let ok = 0; const fail = [];
    for (let i = 0; i < plan.items.length; i++) {                     // 2) send ROW BY ROW
      if (stop.current) break;
      const r = plan.items[i];
      try {
        await api.post(CREATE_URL, { type: 'expense', category: r.category, amount: r.amount, date: r.date, description: r.description, method: 'cash', reference: r.reference });
        ok++;
      } catch (err) { fail.push({ line: r.line, item: r.description, msg: err?.message || 'error' }); }
      setProg({ done: i + 1, ok, fail: [...fail] });
    }
    setImp((p) => ({ ...p, state: 'done' }));
  };
  const close = () => { if (running) { stop.current = true; return; } if (imp.state === 'done') onDone(); setImp(null); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card flex max-h-[90vh] w-full max-w-2xl flex-col p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-headline-sm">{tt(t, 'import', 'Import')} · <span className="font-mono text-body-sm">{imp.file}</span></h3>
          <button onClick={close} aria-label="close"><Icon name="close" /></button>
        </div>

        {plan.items.length === 0 ? <div className="text-outline">{tt(t, 'nothingToImport', 'No valid rows found (need Categories / Item / Amount / Date columns).')}</div> : <>
          <div className="mb-3 flex flex-wrap gap-2">
            <Chip tone="warn">{tt(t, 'expense', 'Expense')}</Chip>
            <Chip tone="info">{plan.items.length} {tt(t, 'rows', 'rows')}</Chip>
            <Chip tone="ok">{num(total, 2)} {t('egp')}</Chip>
            {plan.newNames.length > 0 && <Chip tone="info">{plan.newNames.length} {tt(t, 'newCategories', 'new categories')}</Chip>}
            {imp.skipped > 0 && <Chip tone="neutral">{imp.skipped} {tt(t, 'skippedRows', 'skipped (empty / zero)')}</Chip>}
          </div>

          <div className="mb-3 min-h-0 flex-1 overflow-auto rounded-lg border border-outline-variant">
            <table className="w-full text-body-sm">
              <thead className="sticky top-0 bg-surface-container"><tr><th className="p-2 text-start">{t('category')}</th><th className="p-2">#</th><th className="p-2 text-end">{t('amount')}</th></tr></thead>
              <tbody>{plan.summary.map((s) => (
                <tr key={s.category} className="border-t border-surface-container">
                  <td className="p-2">{tt(t, s.category, s.category)} {s.isNew && <Chip tone="info">{tt(t, 'new', 'new')}</Chip>}</td>
                  <td className="p-2 text-center font-mono">{s.count}</td>
                  <td className="p-2 text-end font-mono">{num(s.sum, 2)}</td>
                </tr>))}</tbody>
            </table>
          </div>

          {imp.state !== 'preview' && <div className="mb-3">
            <div className="mb-1 flex justify-between text-body-sm"><span>{prog.done} / {plan.items.length}</span><span className="text-secondary">{prog.ok} ✓</span>{prog.fail.length > 0 && <span className="text-error">{prog.fail.length} ✗</span>}</div>
            <div className="h-2.5 rounded-full bg-surface-container"><div className="h-2.5 rounded-full bg-secondary transition-all" style={{ width: `${(prog.done / plan.items.length) * 100}%` }} /></div>
            {prog.fail.length > 0 && <ul className="mt-2 max-h-28 overflow-auto text-body-sm text-error">{prog.fail.slice(-20).map((f) => <li key={f.line}>#{f.line} {f.item}: {f.msg}</li>)}</ul>}
          </div>}
        </>}

        <div className="flex justify-end gap-2">
          <button className="btn-outline" onClick={close}>{running ? tt(t, 'stop', 'Stop') : imp.state === 'done' ? tt(t, 'close', 'Close') : tt(t, 'cancel', 'Cancel')}</button>
          {imp.state === 'preview' && plan.items.length > 0 && <button className="chip !px-4 !py-2 bg-primary text-on-primary" onClick={start}><Icon name="upload" />{tt(t, 'startImport', 'Start import')}</button>}
        </div>
      </div>
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
            <div key={c} className="flex items-center justify-between border-b border-surface-container py-2"><span>{tt(t, s.categories.revenue.includes(c) && c !== 'other_revenue' ? `${c}_c` : c, c)}</span><span className="font-mono">{num(v, 2)}</span></div>
          ))}
          <div className="mt-4 rounded-lg bg-primary-fixed/40 p-3 text-body-md"><Chip tone="info">{t('discountsGiven')}</Chip> <b className="font-mono">{num(s.discountsGiven)}</b> {t('egp')}</div>
        </div>
      </div>
    </div>
  );
}

/* ───────────── transactions + filters ───────────── */
const EMPTY = { type: '', category: '', method: '', from: '', to: '', min: '', max: '' };

function Transactions({ cats, custom, num }) {
  const { t, dateOnly } = useI18n();
  const [f, setF] = useState(EMPTY);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const catLabel = (c) => tt(t, cats.revenue.includes(c) && c !== 'other_revenue' ? `${c}_c` : c, c);
  const all = [...cats.revenue, ...cats.expense, ...custom.filter((c) => ![...cats.revenue, ...cats.expense].includes(c))].map((c) => ({ value: c, label: catLabel(c) }));
  const active = Object.values(f).filter(Boolean).length;

  // applied by CrudTable on its rows (see the one-line change in CrudTable below)
  const filter = (r) => {
    const d = String(r.date || '').slice(0, 10), a = Number(r.amount);
    return (!f.type || r.type === f.type) && (!f.category || r.category === f.category) && (!f.method || r.method === f.method)
      && (!f.from || d >= f.from) && (!f.to || d <= f.to) && (f.min === '' || a >= Number(f.min)) && (f.max === '' || a <= Number(f.max));
  };
  const sel = 'rounded-lg border border-outline-variant bg-white px-3 py-2 text-body-sm';

  return <>
    <div className="mb-3 flex flex-wrap items-end gap-2">
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
    <CrudTable module="accounts" entity="transactions" path="/accounts" addLabel={t('newTransaction')} filter={filter}
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
  </>;
}
