import { Fragment, useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { getSocket } from '../lib/socket';
import { Chip, Empty, Icon, PageHeader, Select, Spinner } from '../components/ui';

const PAGE = 50;
export default function Audit() {
  const { t, lang, dateTime } = useI18n(); const { meta } = useAuth();
  const [module, setModule] = useState(''); const [action, setAction] = useState(''); const [skip, setSkip] = useState(0);
  const [data, setData] = useState(null); const [open, setOpen] = useState(null);
  const load = useCallback(() => {
    const q = new URLSearchParams({ limit: PAGE, skip }); if (module) q.set('module', module); if (action) q.set('action', action);
    api.get(`/audit?${q}`).then(setData).catch(() => setData({ items: [], total: 0 }));
  }, [module, action, skip]);
  useEffect(() => { setData(null); load(); }, [load]);
  useEffect(() => { // new entries appear live on the first page
    let timer; const s = getSocket(); const h = () => { if (skip === 0) { clearTimeout(timer); timer = setTimeout(load, 700); } };
    s.on('entity:change', h); return () => { clearTimeout(timer); s.off('entity:change', h); };
  }, [load, skip]);
  const fmt = (v) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v).slice(0, 200) : String(v));
  const tone = (a) => (a === 'delete' || a === 'deactivate' ? 'bad' : a === 'create' ? 'ok' : a === 'login' ? 'neutral' : 'info');

  return (
    <div>
      <PageHeader title={t('audit')} subtitle={data ? `${data.total}` : ''} />
      <div className="card mb-4 flex flex-wrap gap-3 p-3">
        <Select className="w-56" value={module} onChange={(v) => { setSkip(0); setModule(v); }} options={[{ value: '', label: `${t('section')}: ${t('all')}` }, ...Object.entries(meta.modules).map(([k, v]) => ({ value: k, label: v[lang] })), { value: 'admins', label: t('admins') }]} />
        <Select className="w-48" value={action} onChange={(v) => { setSkip(0); setAction(v); }} options={[{ value: '', label: `${t('action')}: ${t('all')}` }, ...['create', 'update', 'delete', 'login', 'export', 'deactivate'].map((a) => ({ value: a, label: t(`${a}_a`) }))]} />
      </div>
      <div className="card overflow-x-auto">
        {!data ? <Spinner /> : data.items.length === 0 ? <Empty text={t('empty')} /> : (
          <table className="w-full min-w-[820px]">
            <thead><tr><th className="th">{t('when')}</th><th className="th">{t('who')}</th><th className="th">{t('action')}</th><th className="th">{t('section')}</th><th className="th">{t('what')}</th><th className="th" /></tr></thead>
            <tbody>
              {data.items.map((a) => (
                <Fragment key={a._id}>
                  <tr className="border-t border-surface-container">
                    <td className="td whitespace-nowrap text-body-sm">{dateTime(a.at)}</td>
                    <td className="td font-semibold">{a.actor?.name}</td>
                    <td className="td"><Chip tone={tone(a.action)}>{t(`${a.action}_a`) === `${a.action}_a` ? a.action : t(`${a.action}_a`)}</Chip></td>
                    <td className="td text-body-sm">{meta.modules[a.module]?.[lang] || a.module}</td>
                    <td className="td max-w-[360px] truncate" title={a.label}>{a.label}</td>
                    <td className="td">{a.changes?.length > 0 && <button className="btn-secondary btn-sm" onClick={() => setOpen(open === a._id ? null : a._id)}><Icon name={open === a._id ? 'expand_less' : 'expand_more'} />{a.changes.length}</button>}</td>
                  </tr>
                  {open === a._id && <tr className="bg-surface-container-low"><td colSpan={6} className="px-6 py-3"><ul className="space-y-1 text-body-md">{a.changes.map((c, i) => <li key={i}><b>{c.field}</b>: <span className="text-error line-through">{fmt(c.from)}</span> → <span className="text-secondary">{fmt(c.to)}</span></li>)}</ul></td></tr>}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {data && data.total > PAGE && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <button className="btn-outline btn-sm" disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - PAGE))}><Icon name="chevron_left" className="rtl:rotate-180" /></button>
          <span className="text-body-md">{skip + 1}–{Math.min(skip + PAGE, data.total)} / {data.total}</span>
          <button className="btn-outline btn-sm" disabled={skip + PAGE >= data.total} onClick={() => setSkip(skip + PAGE)}><Icon name="chevron_right" className="rtl:rotate-180" /></button>
        </div>
      )}
    </div>
  );
}
