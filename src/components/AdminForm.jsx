import { useState } from 'react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { Field, Icon, Modal, Select, useSaver } from './ui';

// Shared by Admins & Access (create/edit any admin) and the "Give system access" button on the
// Staff list (pre-fills name/email/title from an employee record) — same form, same guarantees.
export default function AdminForm({ initial, meta, lang, self, onClose }) {
  const { t } = useI18n();
  const [f, setF] = useState(() => ({ ...initial, permissions: [...(initial.permissions || [])] }));
  const { busy, run } = useSaver();
  const isNew = !f._id; const isSuper = f.role === 'super_admin';
  const has = (p) => f.permissions.includes(p);
  const togglePerm = (m, a) => setF((x) => {
    const set = new Set(x.permissions); const p = `${m}:${a}`;
    if (set.has(p)) { set.delete(p); if (a === 'view') meta.actions.forEach((ac) => set.delete(`${m}:${ac}`)); }
    else { set.add(p); set.add(`${m}:view`); }
    return { ...x, permissions: [...set] };
  });
  const toggleModule = (m) => setF((x) => {
    const set = new Set(x.permissions); const all = meta.actions.every((a) => set.has(`${m}:${a}`));
    meta.actions.forEach((a) => (all ? set.delete(`${m}:${a}`) : set.add(`${m}:${a}`)));
    return { ...x, permissions: [...set] };
  });
  const save = async () => {
    const body = { name: f.name, email: f.email, title: f.title || undefined, role: f.role, permissions: isSuper ? [] : f.permissions };
    const r = await run(() => (isNew ? api.post('/admins', { ...body, password: f.password }) : api.patch(`/admins/${f._id}`, body)));
    if (r) onClose();
  };
  const actionLabel = { view: t('view'), create: t('create'), edit: t('editP'), delete: t('deleteP'), export: t('exportP') };
  return (
    <Modal wide title={isNew ? t('newAdmin') : f.name} onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose}>{t('cancel')}</button><button className="btn-primary" disabled={busy || !f.name || !f.email || (isNew && !f.password)} onClick={save}>{t('save')}</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('fullName')}><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label={t('email')}><input className="input" dir="ltr" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label={t('titleField')}><input className="input" value={f.title || ''} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        {isNew && <Field label={t('tempPassword')} hint={`${t('passwordHint')} · ${t('mustChange')}`}><input className="input" dir="ltr" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>}
        <div className="sm:col-span-2">
          <span className="mb-1 block text-label-md font-semibold text-on-surface-variant">{t('role')}</span>
          <div className="flex gap-2">
            {[['admin', t('adminRole')], ['super_admin', t('superAdmin')]].map(([v, l]) => (
              <button key={v} disabled={self && v === 'admin'} onClick={() => setF({ ...f, role: v })} className={`chip !px-4 !py-2 ${f.role === v ? 'bg-primary text-on-primary' : 'border border-outline-variant bg-white'} disabled:opacity-40`}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {isSuper ? <div className="mt-4 rounded-xl bg-tertiary-fixed p-4 text-body-md text-on-tertiary-fixed-variant"><Icon name="shield_person" /> {t('superNote')}</div> : (
        <div className="mt-5">
          <div className="mb-2 flex flex-wrap items-center gap-2"><h4 className="font-display text-title-md">{t('permissions')}</h4><span className="text-body-sm text-outline">· {t('presets')}:</span>
            {Object.entries(meta.presets).map(([k, p]) => <button key={k} className="btn-outline btn-sm" onClick={() => setF({ ...f, permissions: [...p.permissions] })}>{p[lang]}</button>)}
            <button className="btn-outline btn-sm !text-error" onClick={() => setF({ ...f, permissions: [] })}>{t('cancel')} ✗</button></div>
          <div className="overflow-x-auto rounded-xl border border-surface-container-highest">
            <table className="w-full min-w-[560px]">
              <thead><tr><th className="th">{t('section')}</th>{meta.actions.map((a) => <th key={a} className="th text-center">{actionLabel[a]}</th>)}<th className="th text-center">{t('selectAll')}</th></tr></thead>
              <tbody>
                {Object.entries(meta.modules).map(([m, names]) => (
                  <tr key={m} className="border-t border-surface-container">
                    <td className="td font-semibold">{names[lang]}</td>
                    {meta.actions.map((a) => <td key={a} className="td text-center"><input type="checkbox" className="h-4 w-4 accent-[#a6192e]" checked={has(`${m}:${a}`)} onChange={() => togglePerm(m, a)} /></td>)}
                    <td className="td text-center"><button className="btn-secondary btn-sm" onClick={() => toggleModule(m)}><Icon name="done_all" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}
