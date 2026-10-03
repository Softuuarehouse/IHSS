import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { getSocket } from '../lib/socket';
import { Icon, PageHeader, StatCard, Chip } from '../components/ui';

export default function Dashboard() {
  const { user, meta, can } = useAuth();
  const { t, lang, num, dateTime } = useI18n();
  const [d, setD] = useState(null);

  useEffect(() => {
    let alive = true; let timer;
    const load = () => api.get('/dashboard').then((r) => alive && setD(r)).catch(() => {});
    load();
    const s = getSocket();
    const soon = () => { clearTimeout(timer); timer = setTimeout(load, 600); }; // any change anywhere → refresh KPIs
    s.on('entity:change', soon);
    return () => { alive = false; clearTimeout(timer); s.off('entity:change', soon); };
  }, []);

  if (!d) return <div className="py-20 text-center text-outline">{t('loading')}</div>;
  const M = (m) => meta?.modules?.[m]?.[lang];
  return (
    <div>
      <PageHeader title={`${lang === 'ar' ? 'أهلاً' : 'Welcome'}, ${user.name}`} subtitle={t('appName')} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {d.students && <Link to="/students"><StatCard icon="school" label={M('students')} value={num(d.students.active)} sub={Object.entries(d.students.byGrade).map(([g, n]) => `${t(g)}: ${num(n)}`).join(' · ')} /></Link>}
        {d.registration && <Link to="/registration"><StatCard tone="tertiary" icon="how_to_reg" label={M('registration')} value={num(d.registration.total)} sub={`${num(d.registration.withMissingDocs)} ${t('docsMissing')}`} /></Link>}
        {d.hr && <Link to="/hr"><StatCard tone="secondary" icon="badge" label={M('hr')} value={num(d.hr.activeStaff)} /></Link>}
        {d.assessments && <Link to="/assessments"><StatCard tone="neutral" icon="fact_check" label={M('assessments')} value={num(d.assessments.sheets)} sub={`${num(d.assessments.locked)} ${t('locked')}`} /></Link>}
        {d.fees && <Link to="/fees"><StatCard icon="payments" label={t('remainingAfterDiscount')} value={`${num(d.fees.remainingAfterDiscount)} ${t('egp')}`} sub={`${t('totalDiscount')}: ${num(d.fees.totalDiscount)}`} /></Link>}
        {d.fees && <Link to="/fees"><StatCard tone="secondary" icon="account_balance_wallet" label={t('paid')} value={`${num(d.fees.paid)} ${t('egp')}`} sub={`${t('balance')}: ${num(d.fees.balance)}`} /></Link>}
        {d.accounts && <Link to="/accounts"><StatCard tone="secondary" icon="trending_up" label={`${t('revenue')} (${t('month')})`} value={`${num(d.accounts.monthRevenue)} ${t('egp')}`} /></Link>}
        {d.accounts && <Link to="/accounts"><StatCard tone="tertiary" icon="trending_down" label={`${t('expense')} (${t('month')})`} value={`${num(d.accounts.monthExpenses)} ${t('egp')}`} /></Link>}
      </div>

      <div className="card mt-6">
        <div className="border-b border-surface-container-highest px-5 py-3 font-display text-headline-sm">{t('recentActivity')}</div>
        {d.activity.length === 0 ? <div className="p-8 text-center text-outline">{t('empty')}</div> : (
          <ul className="divide-y divide-surface-container-highest">
            {d.activity.map((a) => (
              <li key={a._id} className="flex flex-wrap items-center gap-2 px-5 py-2.5 text-body-md">
                <Chip tone={a.action === 'delete' ? 'bad' : a.action === 'create' ? 'ok' : 'info'}>{t(`${a.action}_a`)}</Chip>
                <b>{a.actor?.name}</b><span className="truncate">{a.label}</span>
                <span className="ms-auto text-body-sm text-outline"><Icon name="schedule" className="!text-[14px]" /> {dateTime(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {!can('students:view') && user.modules.length === 0 && <div className="card mt-6 p-6 text-outline">{t('noAccess')}</div>}
    </div>
  );
}
