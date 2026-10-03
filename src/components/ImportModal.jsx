import { useState } from 'react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { Field, Icon, Modal, Select, useToast } from './ui';

/**
 * Shared "upload the school's own Excel file" modal. `fields` describes any extra form inputs the
 * endpoint needs (grade, subject, academic year, …); `endpoint` is under /api/import/.
 */
export default function ImportModal({ title, hint, endpoint, fields, onClose, onDone, successMessage }) {
  const { t } = useI18n();
  const toast = useToast();
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((f) => [f.key, f.default ?? ''])));
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (v) => setValues((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));
  const missing = fields.some((f) => f.required && !values[f.key]);

  const go = async () => {
    if (!file) { setErr(t('file')); return; }
    setBusy(true); setErr('');
    const fd = new FormData();
    fd.append('file', file);
    for (const [k, v] of Object.entries(values)) if (v !== '') fd.append(k, v);
    try {
      const r = await api.upload(`/import/${endpoint}`, fd);
      toast(successMessage(r), 'ok');
      onDone?.(r);
      onClose();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal title={title} onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose}>{t('cancel')}</button><button className="btn-primary" disabled={busy || !file || missing} onClick={go}>{busy ? '…' : t('import')}</button></>}>
      <p className="mb-4 text-body-md text-on-surface-variant">{hint}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <Field key={f.key} label={f.label} className={f.full ? 'sm:col-span-2' : ''}>
            {f.type === 'select' ? <Select value={values[f.key]} onChange={set(f.key)} options={f.options} />
              : <input className="input" dir={f.ltr ? 'ltr' : undefined} value={values[f.key]} onChange={set(f.key)} placeholder={f.placeholder} />}
          </Field>
        ))}
        <Field label={t('file')} className="sm:col-span-2">
          <input type="file" accept=".xlsx" className="input !py-1.5" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </Field>
      </div>
      {err && <div className="mt-3 rounded-lg bg-error-container px-3 py-2 text-body-md text-on-error-container"><Icon name="error" /> {err}</div>}
    </Modal>
  );
}
