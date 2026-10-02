import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { getSocket } from '../lib/socket';
import { useConnected } from '../lib/live';
import { api } from '../lib/api';
import { Icon, Modal, Field, useToast } from './ui';

const NAV = [
  { to: '/', icon: 'space_dashboard', key: 'dashboard', end: true },
  { to: '/students', icon: 'school', module: 'students' },
  { to: '/registration', icon: 'how_to_reg', module: 'registration' },
  { to: '/fees', icon: 'payments', module: 'fees' },
  { to: '/assessments', icon: 'fact_check', module: 'assessments' },
  { to: '/hr', icon: 'badge', module: 'hr' },
  { to: '/accounts', icon: 'account_balance', module: 'accounts' },
  { to: '/admins', icon: 'admin_panel_settings', key: 'admins', superOnly: true },
  { to: '/audit', icon: 'history_edu', key: 'audit', superOnly: true },
];

const labelOf = (d) => d?.fullName || d?.applicantName || d?.subjectName || d?.description || d?.name || d?.period || '';

export default function Layout() {
  const { user, meta, logout, isSuper } = useAuth();
  const { t, lang, setLang } = useI18n();
  const toast = useToast();
  const connected = useConnected();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark');
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); localStorage.setItem('theme', dark ? 'dark' : 'light'); }, [dark]);

  // Global live feed: tell me when somebody else changes data I'm allowed to see.
  useEffect(() => {
    const s = getSocket();
    const h = (e) => {
      if (!e.actor || e.actor.id === user.id) return;
      const key = { created: 'createdLive', updated: 'updatedLive', deleted: 'deletedLive' }[e.action];
      toast(t(key, { who: e.actor.name, what: labelOf(e.doc) || e.entity }), 'live');
    };
    s.on('entity:change', h);
    return () => s.off('entity:change', h);
  }, [user.id, t, toast]);

  const items = NAV.filter((n) => (n.superOnly ? isSuper : n.module ? user.modules.includes(n.module) : true));
  const nameOf = (n) => (n.module ? meta?.modules?.[n.module]?.[lang] : t(n.key));

  return (
    <div className="flex min-h-screen bg-background text-on-surface">
      {open && <div className="fixed inset-0 z-30 bg-inverse-surface/40 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={`app-sidebar fixed inset-y-0 start-0 z-40 flex w-64 flex-col bg-inverse-surface text-inverse-on-surface transition-transform lg:static lg:translate-x-0 ${open ? 'translate-x-0' : 'ltr:-translate-x-full rtl:translate-x-full'}`}>
        <div className="flex items-center gap-3 px-5 py-5">
          <img src="/logo.png" alt="IHSS" className="h-12 w-auto" />
          <div><div className="font-display text-title-md font-bold leading-tight">IHSS</div><div className="text-label-sm uppercase tracking-wider text-secondary-fixed-dim">{t('appSub')}</div></div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)}
              className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-label-lg transition ${isActive ? 'bg-primary-container text-on-primary shadow' : 'text-inverse-on-surface/80 hover:bg-white/10'}`}>
              <Icon name={n.icon} />{nameOf(n)}
              {n.superOnly && <span className="ms-auto rounded bg-tertiary-fixed-dim/20 px-1.5 text-label-sm text-tertiary-fixed-dim">SA</span>}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4 text-body-sm">
          <div className="font-semibold">{user.name}</div>
          <div className="text-inverse-on-surface/60">{user.role === 'super_admin' ? t('superAdmin') : user.title || t('adminRole')}</div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-surface-container-highest bg-white/90 px-4 py-2.5 backdrop-blur">
          <button className="rounded-lg p-2 hover:bg-surface-container lg:hidden" onClick={() => setOpen(true)}><Icon name="menu" /></button>
          <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-label-md font-semibold ${connected ? 'bg-secondary-container text-on-secondary-container' : 'bg-error-container text-on-error-container'}`}>
            <span className={`h-2 w-2 rounded-full ${connected ? 'animate-pulse bg-secondary' : 'bg-error'}`} />{connected ? t('live') : t('offline')}
          </span>
          <div className="ms-auto flex items-center gap-2">
            <button className="btn-outline btn-sm" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}><Icon name="translate" />{lang === 'ar' ? 'EN' : 'عربي'}</button>
            <button className="btn-outline btn-sm" onClick={() => setDark((d) => !d)} title={dark ? t('lightMode') : t('darkMode')}><Icon name={dark ? 'light_mode' : 'dark_mode'} /></button>
            <button className="btn-outline btn-sm" onClick={() => setPw(true)} title={t('changePassword')}><Icon name="key" /></button>
            <button className="btn-secondary btn-sm" onClick={logout}><Icon name="logout" />{t('signOut')}</button>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6"><Outlet /></main>
      </div>
      {(pw || user.mustChangePassword) && <ChangePassword forced={user.mustChangePassword && !pw} onClose={() => setPw(false)} />}
    </div>
  );
}

function ChangePassword({ onClose, forced }) {
  const { t } = useI18n(); const toast = useToast(); const { refresh } = useAuth();
  const [f, setF] = useState({ current: '', next: '' }); const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try { await api.post('/auth/change-password', f); toast('✓', 'ok'); await refresh(); onClose(); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <Modal title={t('changePassword')} onClose={forced ? () => {} : onClose}
      footer={<>{!forced && <button className="btn-secondary" onClick={onClose}>{t('cancel')}</button>}<button className="btn-primary" disabled={busy} onClick={submit}>{t('save')}</button></>}>
      <div className="space-y-3">
        <Field label={t('currentPassword')}><input type="password" className="input" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} /></Field>
        <Field label={t('newPassword')} hint={t('passwordHint')}><input type="password" className="input" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
