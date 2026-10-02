import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n';
import { api } from '../lib/api';
import { usePresence } from '../lib/live';
import { useAuth } from '../lib/auth';

export const Icon = ({ name, className = '' }) => <span className={`icon ${className}`} aria-hidden="true">{name}</span>;

// ── toasts ──────────────────────────────────────────────────────────────────
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [list, setList] = useState([]);
  const push = useCallback((message, tone = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setList((l) => [...l.slice(-4), { id, message, tone }]);
    setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), 4500);
  }, []);
  const tones = { info: 'bg-inverse-surface text-inverse-on-surface', ok: 'bg-secondary text-on-secondary', err: 'bg-error text-on-error', live: 'bg-white text-on-surface border border-outline-variant' };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 end-4 z-[100] flex w-80 max-w-[90vw] flex-col gap-2">
        {list.map((x) => (
          <div key={x.id} className={`pointer-events-auto rounded-lg px-4 py-3 text-body-md shadow-lg ${tones[x.tone]}`}>
            {x.tone === 'live' && <Icon name="bolt" className="me-1 text-tertiary-fixed-dim" />}{x.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ── modal ───────────────────────────────────────────────────────────────────
export function Modal({ title, onClose, children, wide, footer }) {
  useEffect(() => { const h = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-inverse-surface/50 p-4 pt-10" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`card w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} bg-white`}>
        <div className="flex items-center justify-between border-b border-surface-container-highest px-5 py-3">
          <h3 className="font-display text-headline-sm">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-surface-container"><Icon name="close" /></button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-surface-container-highest bg-surface-container-low px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export const Field = ({ label, children, hint, className = '' }) => (
  <label className={`block ${className}`}>
    <span className="mb-1 block text-label-md font-semibold text-on-surface-variant">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-body-sm text-outline">{hint}</span>}
  </label>
);

export const Select = ({ options, value, onChange, className = '', ...rest }) => (
  <select className={`input ${className}`} value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest}>
    {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

export const Chip = ({ tone = 'neutral', children }) => {
  const c = { neutral: 'bg-surface-container text-on-surface-variant', ok: 'bg-secondary-container text-on-secondary-container', warn: 'bg-tertiary-fixed text-on-tertiary-fixed-variant', bad: 'bg-error-container text-on-error-container', info: 'bg-primary-fixed text-on-primary-fixed-variant' }[tone];
  return <span className={`chip ${c}`}>{children}</span>;
};

export function PageHeader({ title, subtitle, actions, presenceRoom }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-headline-lg font-semibold text-on-surface">{title}</h1>
        {subtitle && <p className="text-body-md text-on-surface-variant">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {presenceRoom && <Presence room={presenceRoom} />}
        {actions}
      </div>
    </div>
  );
}

export function Presence({ room }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const users = usePresence(room);
  const others = users.filter((u) => u.id !== user?.id);
  if (!others.length) return null;
  return (
    <div className="flex items-center gap-1 rounded-full bg-secondary-container/60 py-1 ps-3 pe-1" title={t('viewingNow')}>
      <span className="text-label-md text-on-secondary-container">{t('viewingNow')}</span>
      {others.slice(0, 5).map((u) => (
        <span key={u.id} title={u.name} className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-label-md text-on-secondary">{u.name.trim()[0]}</span>
      ))}
      {others.length > 5 && <span className="px-1 text-label-md">+{others.length - 5}</span>}
    </div>
  );
}

export function StatCard({ icon, label, value, sub, tone = 'primary' }) {
  const tones = { primary: 'bg-primary-fixed text-primary', secondary: 'bg-secondary-container text-secondary', tertiary: 'bg-tertiary-fixed text-tertiary', neutral: 'bg-surface-container text-on-surface-variant' };
  return (
    <div className="card flex items-center gap-4 p-4">
      <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${tones[tone]}`}><Icon name={icon} className="!text-[26px]" /></div>
      <div className="min-w-0">
        <div className="text-label-md text-on-surface-variant">{label}</div>
        <div className="truncate font-display text-headline-sm font-semibold">{value}</div>
        {sub && <div className="text-body-sm text-outline">{sub}</div>}
      </div>
    </div>
  );
}

export const Empty = ({ text }) => <div className="py-14 text-center text-body-md text-outline">{text}</div>;
export const Spinner = () => { const { t } = useI18n(); return <div className="py-14 text-center text-outline">{t('loading')}</div>; };

export function useConfirm() {
  const { t } = useI18n();
  return (msg) => window.confirm(msg || t('confirmDelete'));
}

/** "Last edit by X · time" cell + history button — this is the who-changed-what-and-when requirement. */
export function LastEdit({ doc }) {
  const { dateTime } = useI18n();
  if (!doc.updatedByName) return null;
  return <span className="text-body-sm text-outline" title={dateTime(doc.updatedAt)}>{doc.updatedByName} · {dateTime(doc.updatedAt)}</span>;
}

export function HistoryDrawer({ entity, id, title, onClose, path }) {
  const { t, dateTime } = useI18n();
  const [items, setItems] = useState(null);
  useEffect(() => { api.get(path || `/audit/record/${entity}/${id}`).then((r) => setItems(r.items)).catch(() => setItems([])); }, [entity, id, path]);
  const fmt = (v) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v).slice(0, 120) : String(v));
  return (
    <Modal title={`${t('history')} — ${title || ''}`} onClose={onClose} wide>
      {!items ? <Spinner /> : items.length === 0 ? <Empty text={t('empty')} /> : (
        <ul className="max-h-[60vh] divide-y divide-surface-container-highest overflow-y-auto">
          {items.map((a) => (
            <li key={a._id} className="py-3">
              <div className="flex flex-wrap items-center gap-2 text-body-md">
                <Chip tone={a.action === 'delete' ? 'bad' : a.action === 'create' ? 'ok' : 'info'}>{t(`${a.action}_a`) === `${a.action}_a` ? a.action : t(`${a.action}_a`)}</Chip>
                <b>{a.actor?.name}</b><span className="text-outline">· {dateTime(a.at)}</span>
              </div>
              {a.changes?.length > 0 && (
                <ul className="mt-1 space-y-0.5 ps-2 text-body-sm">
                  {a.changes.slice(0, 8).map((c, i) => (
                    <li key={i}><span className="font-semibold">{c.field}</span>: <span className="text-error line-through">{fmt(c.from)}</span> → <span className="text-secondary">{fmt(c.to)}</span></li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/** Wraps a save call: shows API errors, handles 409 conflicts by reloading. */
export function useSaver(onConflict) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn) => {
    setBusy(true);
    try { return await fn(); }
    catch (e) {
      if (e.status === 409 && e.body?.code === 'CONFLICT') { toast(t('conflict'), 'err'); onConflict?.(e.body.current); }
      else toast(e.message, 'err');
      return null;
    } finally { setBusy(false); }
  }, [t, toast, onConflict]);
  return { busy, run };
}

export const money = (num) => (n) => num(n, 2);
