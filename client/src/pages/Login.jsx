import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { Icon } from '../components/ui';

export default function Login() {
  const { login } = useAuth();
  const { t, lang, setLang } = useI18n();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [show, setShow] = useState(false); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await login(email, password); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8fafc] p-4">
      <button className="btn-outline btn-sm fixed end-4 top-4" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}><Icon name="translate" />{lang === 'ar' ? 'EN' : 'عربي'}</button>
      <form onSubmit={submit} className="w-full max-w-[460px] rounded-3xl border border-slate-200 bg-white p-10 shadow-[0_20px_50px_-20px_rgba(15,23,42,.15)]">
        <div className="flex flex-col items-center">
          <img src="/logo.png" alt="IHSS" className="h-20" />
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-[#111c2d]" style={{ fontFamily: 'Plus Jakarta Sans, Cairo, sans-serif' }}>IHSS</h1>
          <div className="text-label-md font-bold uppercase tracking-wider text-secondary">{t('appSub')}</div>
        </div>
        <div className="mt-8 space-y-5">
          <label className="block"><span className="mb-1.5 block text-label-lg font-semibold">{t('email')}</span>
            <input className="input !py-3" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@ihss.edu.eg" dir="ltr" /></label>
          <label className="block"><span className="mb-1.5 block text-label-lg font-semibold">{t('password')}</span>
            <div className="relative">
              <input className="input !py-3 pe-11" type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" />
              <button type="button" onClick={() => setShow(!show)} className="absolute end-3 top-1/2 -translate-y-1/2 text-outline"><Icon name={show ? 'visibility' : 'visibility_off'} /></button>
            </div></label>
          {err && <div className="rounded-lg bg-error-container px-3 py-2 text-body-md text-on-error-container">{err}</div>}
          <button disabled={busy} className="w-full rounded-xl bg-[#c41e3a] py-3.5 text-label-lg font-bold text-white transition hover:bg-[#a6192e] disabled:opacity-60">{t('signIn')}</button>
        </div>
      </form>
    </div>
  );
}
