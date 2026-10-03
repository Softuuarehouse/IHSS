import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { useLiveList } from '../lib/live';
import { Empty, Field, HistoryDrawer, Icon, LastEdit, Modal, Select, Spinner, useConfirm, useSaver, useToast } from './ui';

const dateVal = (v) => (v ? String(v).slice(0, 10) : '');

/**
 * Config-driven live table + create/edit modal + history + delete for simple entities
 * (staff, leaves, evaluations, transactions). Same guarantees as the bespoke pages:
 * live sync, permission-aware buttons, optimistic-concurrency (rev) and per-record history.
 */
export default function CrudTable({ module, entity, path, apiPath, columns, fields, defaults, addLabel, historyEntity, rowLocked, query = '', match }) {
  const { can } = useAuth(); const { t } = useI18n(); const confirm = useConfirm(); const toast = useToast();
  const { items, loading, flash } = useLiveList(entity, `${path}${query}`, { match });
  const [editing, setEditing] = useState(null); const [history, setHistory] = useState(null);
  const [q, setQ] = useState('');
  const shown = q ? items.filter((r) => JSON.stringify(Object.values(r)).toLowerCase().includes(q.toLowerCase())) : items;
  const base = apiPath || path;

  const remove = async (r) => { if (confirm()) try { await api.del(`${base}/${r._id}`); } catch (e) { toast(e.message, 'err'); } };
  const locked = (r) => rowLocked?.(r);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1"><Icon name="search" className="absolute start-3 top-1/2 -translate-y-1/2 text-outline" /><input className="input ps-10" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {can(`${module}:create`) && <button className="btn-primary" onClick={() => setEditing({ ...defaults })}><Icon name="add" />{addLabel}</button>}
      </div>
      <div className="card overflow-x-auto">
        {loading ? <Spinner /> : shown.length === 0 ? <Empty text={t('empty')} /> : (
          <table className="w-full min-w-[720px]">
            <thead><tr>{columns.map((c) => <th key={c.key} className={`th ${c.end ? 'text-end' : ''}`}>{c.label}</th>)}<th className="th">{t('lastEdit')}</th><th className="th">{t('actions')}</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r._id} className={`border-t border-surface-container ${flash[r._id] ? 'flash' : ''}`}>
                  {columns.map((c) => <td key={c.key} className={`td ${c.end ? 'text-end font-mono' : ''}`}>{c.render ? c.render(r) : r[c.key]}</td>)}
                  <td className="td"><LastEdit doc={r} /></td>
                  <td className="td whitespace-nowrap">
                    <button className="btn-secondary btn-sm" onClick={() => setHistory(r)}><Icon name="history" /></button>{' '}
                    {can(`${module}:edit`) && !locked(r) && <button className="btn-secondary btn-sm" onClick={() => setEditing(r)}><Icon name="edit" /></button>}{' '}
                    {can(`${module}:delete`) && !locked(r) && <button className="btn-secondary btn-sm !text-error" onClick={() => remove(r)}><Icon name="delete" /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {editing && <Form initial={editing} fields={fields} base={base} onClose={() => setEditing(null)} />}
      {history && <HistoryDrawer entity={historyEntity || entity} id={history._id} title={columns[0].render ? columns[0].render(history) : history[columns[0].key]} onClose={() => setHistory(null)} />}
    </div>
  );
}

function Form({ initial, fields, base, onClose }) {
  const { t } = useI18n();
  const [f, setF] = useState(() => {
    const c = { ...initial };
    for (const fl of fields) if (fl.type === 'ref' && c[fl.key] && typeof c[fl.key] === 'object') c[fl.key] = c[fl.key]._id;
    return c;
  });
  const { busy, run } = useSaver((current) => setF(current));
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));
  const save = async () => {
    const body = {};
    for (const fl of fields) if (!fl.readOnly && f[fl.key] !== undefined) body[fl.key] = fl.type === 'number' ? Number(f[fl.key]) : f[fl.key];
    const r = await run(() => (f._id ? api.patch(`${base}/${f._id}`, { ...body, rev: f.rev }) : api.post(base, body)));
    if (r) onClose();
  };
  const disabled = fields.some((fl) => fl.required && (f[fl.key] === undefined || f[fl.key] === ''));
  return (
    <Modal title={f._id ? t('edit') : t('add')} onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose}>{t('cancel')}</button><button className="btn-primary" disabled={busy || disabled} onClick={save}>{t('save')}</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.filter((fl) => !(fl.onlyNew && f._id)).map((fl) => (
          <Field key={fl.key} label={fl.label} className={fl.full ? 'sm:col-span-2' : ''}>
            {fl.type === 'select' || fl.type === 'ref' ? <Select value={f[fl.key]} onChange={set(fl.key)} options={fl.options} />
              : fl.type === 'textarea' ? <textarea rows={2} className="input" value={f[fl.key] || ''} onChange={set(fl.key)} />
              : fl.type === 'date' ? <input type="date" className="input" value={dateVal(f[fl.key])} onChange={set(fl.key)} />
              : <input type={fl.type === 'number' ? 'number' : 'text'} step={fl.step} min={fl.min} max={fl.max} className="input" dir={fl.ltr ? 'ltr' : undefined} value={f[fl.key] ?? ''} onChange={set(fl.key)} />}
          </Field>
        ))}
      </div>
    </Modal>
  );
}
