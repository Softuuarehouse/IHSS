import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { useLiveList } from '../lib/live';
import { Chip, Empty, Field, HistoryDrawer, Icon, Modal, PageHeader, Spinner, useConfirm, useSaver, useToast } from '../components/ui';
import AdminForm from '../components/AdminForm';

// Super-Admin-only: create admins / super admins and decide exactly which section + action each admin may use.
export default function Admins() {
  const { t, dateTime, lang } = useI18n(); const { user, meta } = useAuth(); const confirm = useConfirm(); const toast = useToast();
  const { items, loading, flash } = useLiveList('users', '/admins');
  const [editing, setEditing] = useState(null); const [reset, setReset] = useState(null); const [history, setHistory] = useState(null);

  const toggle = async (u) => { try { await api.patch(`/admins/${u._id}`, { active: !u.active }); } catch (e) { toast(e.message, 'err'); } };
  const remove = async (u) => { if (confirm()) try { await api.del(`/admins/${u._id}`); } catch (e) { toast(e.message, 'err'); } };
  const count = (u) => (u.role === 'super_admin' ? '∞' : u.permissions.filter((p) => !p.endsWith(':view')).length + ' + ' + u.permissions.filter((p) => p.endsWith(':view')).length);

  return (
    <div>
      <PageHeader title={t('admins')} presenceRoom="admins" actions={<button className="btn-primary" onClick={() => setEditing({ name: '', email: '', title: '', role: 'admin', permissions: [], password: '' })}><Icon name="person_add" />{t('newAdmin')}</button>} />
      <div className="card overflow-x-auto">
        {loading ? <Spinner /> : items.length === 0 ? <Empty text={t('empty')} /> : (
          <table className="w-full min-w-[820px]">
            <thead><tr><th className="th">{t('fullName')}</th><th className="th">{t('email')}</th><th className="th">{t('role')}</th><th className="th">{t('permissions')}</th><th className="th">{t('status')}</th><th className="th">{t('when')}</th><th className="th">{t('actions')}</th></tr></thead>
            <tbody>
              {items.map((u) => (
                <tr key={u._id} className={`border-t border-surface-container ${flash[u._id] ? 'flash' : ''} ${u.active ? '' : 'opacity-60'}`}>
                  <td className="td"><b>{u.name}</b><div className="text-body-sm text-outline">{u.title}</div></td>
                  <td className="td" dir="ltr">{u.email}</td>
                  <td className="td"><Chip tone={u.role === 'super_admin' ? 'warn' : 'info'}>{u.role === 'super_admin' ? t('superAdmin') : t('adminRole')}</Chip></td>
                  <td className="td font-mono text-body-sm">{count(u)}</td>
                  <td className="td"><Chip tone={u.active ? 'ok' : 'bad'}>{u.active ? t('activeS') : t('inactive')}</Chip></td>
                  <td className="td text-body-sm text-outline">{u.lastLoginAt ? dateTime(u.lastLoginAt) : '—'}</td>
                  <td className="td whitespace-nowrap">
                    <button className="btn-secondary btn-sm" onClick={() => setHistory(u)}><Icon name="history" /></button>{' '}
                    <button className="btn-secondary btn-sm" onClick={() => setEditing(u)}><Icon name="edit" /></button>{' '}
                    <button className="btn-secondary btn-sm" title={t('resetPassword')} onClick={() => setReset(u)}><Icon name="key" /></button>{' '}
                    {u._id !== user.id && <>
                      <button className="btn-secondary btn-sm" title={u.active ? t('deactivate') : t('activate')} onClick={() => toggle(u)}><Icon name={u.active ? 'block' : 'check_circle'} /></button>{' '}
                      <button className="btn-secondary btn-sm !text-error" onClick={() => remove(u)}><Icon name="delete" /></button></>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {editing && <AdminForm initial={editing} meta={meta} lang={lang} self={editing._id === user.id} onClose={() => setEditing(null)} />}
      {reset && <ResetPw u={reset} onClose={() => setReset(null)} />}
      {history && <HistoryDrawer path={`/audit?entity=users&entityId=${history._id}&limit=100`} title={history.name} onClose={() => setHistory(null)} />}
    </div>
  );
}

function ResetPw({ u, onClose }) {
  const { t } = useI18n(); const toast = useToast(); const [pw, setPw] = useState(''); const { busy, run } = useSaver();
  const go = async () => { const r = await run(() => api.post(`/admins/${u._id}/reset-password`, { password: pw })); if (r) { toast('✓', 'ok'); onClose(); } };
  return (
    <Modal title={`${t('resetPassword')} — ${u.name}`} onClose={onClose} footer={<><button className="btn-secondary" onClick={onClose}>{t('cancel')}</button><button className="btn-primary" disabled={busy || pw.length < 10} onClick={go}>{t('save')}</button></>}>
      <Field label={t('newPassword')} hint={`${t('passwordHint')} · ${t('mustChange')}`}><input className="input" dir="ltr" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
    </Modal>
  );
}
