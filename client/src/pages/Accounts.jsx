import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { getSocket } from '../lib/socket';
import CrudTable from '../components/CrudTable';
import { Chip, Icon, PageHeader, Spinner, StatCard } from '../components/ui';

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

function Transactions({ cats }) {
  const { t, num, dateOnly } = useI18n();
  const catLabel = (c) => t(cats.revenue.includes(c) && c !== 'other_revenue' ? `${c}_c` : c);
  const all = [...cats.revenue, ...cats.expense].map((c) => ({ value: c, label: catLabel(c) }));
  return <CrudTable module="accounts" entity="transactions" path="/accounts" addLabel={t('newTransaction')}
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
    ]} />;
}
