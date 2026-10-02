import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { getSocket } from '../lib/socket';
import { Chip, Empty, HistoryDrawer, Icon, Modal, PageHeader, Spinner, useSaver, useToast } from '../components/ui';

/**
 * The live grade sheet (شيت درجات أعمال السنة). Every keystroke-commit is saved atomically and pushed to
 * everyone who has the sheet open; totals are recomputed on the server with the ministry formulas.
 */
export default function AssessmentSheet() {
  const { id } = useParams();
  const { can, user } = useAuth(); const { t, num, dateOnly } = useI18n(); const toast = useToast();
  const [sheet, setSheet] = useState(null); const [err, setErr] = useState('');
  const [flash, setFlash] = useState({}); // "studentId|week|key" -> actor name
  const [history, setHistory] = useState(false); const [adding, setAdding] = useState(false);
  const [viewers, setViewers] = useState([]);
  const canEdit = can('assessments:edit') && sheet && !sheet.locked;
  const sheetRef = useRef(null); sheetRef.current = sheet;

  const load = useCallback(() => api.get(`/assessments/${id}`).then(setSheet).catch((e) => setErr(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const s = getSocket(); const room = `assessment:${id}`;
    const join = () => s.emit('presence:join', { room });
    const onCell = (e) => {
      if (e.id !== id) return;
      setSheet((sh) => {
        if (!sh) return sh;
        return { ...sh, rows: sh.rows.map((r) => {
          if (String(r.student) !== e.studentId) return r;
          const nr = { ...r, computed: e.computed };
          if (e.key === 'paper') nr.paper = e.value;
          else nr.weeks = r.weeks.map((w, i) => (i === e.week ? { ...w, [e.key]: e.value } : w));
          return nr;
        }) };
      });
      const k = `${e.studentId}|${e.week ?? 'p'}|${e.key}`;
      setFlash((f) => ({ ...f, [k]: e.actor?.name })); setTimeout(() => setFlash((f) => { const n = { ...f }; delete n[k]; return n; }), 2300);
    };
    const onMeta = (e) => { if (e.id === id) setSheet(e.sheet); };
    const onPresence = (p) => { if (p.room === room) setViewers(p.users); };
    s.on('assessment:cell', onCell); s.on('assessment:meta', onMeta); s.on('presence:update', onPresence); s.on('connect', join); s.on('connect', load);
    if (s.connected) join();
    return () => { s.off('assessment:cell', onCell); s.off('assessment:meta', onMeta); s.off('presence:update', onPresence); s.off('connect', join); s.off('connect', load); s.emit('presence:leave', { room }); };
  }, [id, load]);

  const commit = async (row, week, key, raw, prev) => {
    const value = raw === '' ? null : Number(raw);
    if (value === prev || (value === null && (prev === null || prev === undefined))) return;
    try { await api.patch(`/assessments/${id}/cell`, { studentId: String(row.student), week, key, value }); }
    catch (e) { toast(e.message, 'err'); load(); } // server rejected (range / lock / conflict) → show truth again
  };

  const patchMeta = async (patch) => {
    try { setSheet(await api.patch(`/assessments/${id}`, { ...patch, rev: sheet.rev })); } catch (e) { toast(e.message, 'err'); load(); }
  };

  const nav = (e, r, c) => {
    if (e.key !== 'Enter' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const nr = e.key === 'ArrowUp' ? r - 1 : r + 1;
    document.querySelector(`[data-r="${nr}"][data-c="${c}"]`)?.focus();
  };

  if (err) return <div className="card p-8 text-center text-error">{err}</div>;
  if (!sheet) return <Spinner />;
  const { criteria, maxima: mx } = sheet;
  const weeks = sheet.weekDates.length || 5;
  const separateExam = sheet.exam.weight !== 1;
  const other = viewers.filter((v) => v.id !== user.id);

  // NOTE: a plain render helper, NOT a component — a component defined here would remount every input on each live
  // update and steal focus while someone is typing.
  const cell = ({ row, r, c, week, k, max, value, key }) => {
    const fk = `${row.student}|${week ?? 'p'}|${k}`;
    return (
      <td key={key} className={`border border-surface-container-highest p-0 ${flash[fk] ? 'flash' : ''}`} title={flash[fk] ? `${flash[fk]}` : `max ${max}`}>
        <input key={`${value}`} type="number" min="0" max={max} step="any" disabled={!canEdit} data-r={r} data-c={c}
          defaultValue={value ?? ''} onKeyDown={(e) => nav(e, r, c)} onBlur={(e) => commit(row, week, k, e.target.value, value)}
          className={`w-full bg-transparent px-1 py-1.5 text-center font-mono text-data-mono outline-none focus:bg-tertiary-fixed/40 ${value === null || value === undefined ? '' : ''} ${value !== null && value !== undefined && value < max * 0.5 ? 'text-error' : ''}`} />
      </td>
    );
  };

  return (
    <div>
      <div className="mb-2"><Link to="/assessments" className="text-label-md text-primary"><Icon name="arrow_back" className="rtl:rotate-180" /> {t('assessments')}</Link></div>
      <PageHeader title={`${sheet.subjectName} — ${t(sheet.component)}`} subtitle={`${t(sheet.gradeLevel)} · ${sheet.academicYear} · ${sheet.periodLabel} ${sheet.monthLabel}`}
        actions={<>
          {other.length > 0 && <div className="flex items-center gap-1 rounded-full bg-secondary-container/60 py-1 ps-3 pe-1"><span className="text-label-md text-on-secondary-container">{t('viewingNow')}</span>{other.map((u) => <span key={u.id} title={u.name} className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-label-md text-on-secondary">{u.name.trim()[0]}</span>)}</div>}
          {sheet.locked && <Chip tone="bad"><Icon name="lock" className="!text-[14px]" /> {t('locked')}</Chip>}
          <button className="btn-outline" onClick={() => setHistory(true)}><Icon name="history" />{t('history')}</button>
          {can('assessments:export') && <button className="btn-outline" onClick={() => api.download(`/assessments/${id}/export`, `assessment-${sheet.subjectName}-${sheet.component}.xlsx`).catch((e) => toast(e.message, 'err'))}><Icon name="download" />{t('export')}</button>}
          {can('assessments:edit') && <button className="btn-secondary" onClick={() => patchMeta({ locked: !sheet.locked })}><Icon name={sheet.locked ? 'lock_open' : 'lock'} />{sheet.locked ? t('unlock') : t('lock')}</button>}
          {canEdit && <button className="btn-primary" onClick={() => setAdding(true)}><Icon name="person_add" /></button>}
        </>} />

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-3">
        {[['teacherName', 'teacher'], ['evaluationOfficer', 'evalOfficer'], ['academicManager', 'academicManager']].map(([k, label]) => (
          <label key={k} className="block"><span className="text-label-md text-on-surface-variant">{t(label)}</span>
            <input className="input mt-1" defaultValue={sheet[k]} disabled={!canEdit} onBlur={(e) => e.target.value !== sheet[k] && patchMeta({ [k]: e.target.value })} /></label>
        ))}
      </div>

      <div className="card overflow-x-auto">
        {sheet.rows.length === 0 ? <Empty text={t('empty')} /> : (
          <table className="w-full border-collapse text-center">
            <thead>
              <tr>
                <th className="th sticky start-0 z-10" rowSpan={3}>#</th><th className="th sticky start-8 z-10 min-w-[220px]" rowSpan={3}>{t('studentName')}</th>
                {Array.from({ length: weeks }, (_, w) => <th key={w} className="th text-center" colSpan={criteria.length + 1}>{t('week')} {num(w + 1)}</th>)}
                <th className="th text-center" rowSpan={3}>{t('total')}</th><th className="th text-center" rowSpan={3}>{t('average')}</th>
                <th className="th text-center" rowSpan={3}>{lang(sheet.exam)}</th>
                {separateExam && <th className="th text-center" rowSpan={3}>{t('examMark')}</th>}
                <th className="th !bg-primary !text-on-primary text-center" rowSpan={3}>{t('finalMark')}</th>
              </tr>
              <tr>{Array.from({ length: weeks }, (_, w) => <th key={w} className="th text-center font-normal" colSpan={criteria.length + 1}>{sheet.weekDates[w] ? dateOnly(sheet.weekDates[w]) : '—'}</th>)}</tr>
              <tr>{Array.from({ length: weeks }, (_, w) => [...criteria.map((c) => <th key={`${w}${c.key}`} className="th min-w-[54px] text-center">{lang(c)}<div className="text-label-sm text-outline">/{c.max}</div></th>), <th key={`${w}t`} className="th text-center">Σ<div className="text-label-sm text-outline">/{mx.weekMax}</div></th>])}</tr>
              <tr className="bg-surface-container-low text-label-md font-bold text-primary">
                <td colSpan={2} className="px-3 py-1 text-start">{t('maximum')}</td>
                {Array.from({ length: weeks }, () => [...criteria.map((c, i) => <td key={i}>{c.max}</td>), <td key="s">{mx.weekMax}</td>])}
                <td>{mx.totalMax}</td><td>{mx.avgMax}</td><td>{sheet.exam.paperMax}</td>{separateExam && <td>{mx.examMax}</td>}<td>{mx.finalMax}</td>
              </tr>
            </thead>
            <tbody>
              {sheet.rows.map((row, r) => (
                <tr key={row.student} className="group border-t border-surface-container hover:bg-surface-container-low/60">
                  <td className="td sticky start-0 bg-white text-outline">{r + 1}</td>
                  <td className="td sticky start-8 bg-white text-start font-semibold">
                    {row.name}
                    {canEdit && <button title="−" className="ms-2 text-outline opacity-0 hover:text-error group-hover:opacity-100" onClick={async () => { if (window.confirm(t('confirmDelete'))) try { setSheet(await api.del(`/assessments/${id}/students/${row.student}`)); } catch (e) { toast(e.message, 'err'); } }}><Icon name="person_remove" className="!text-[16px]" /></button>}
                  </td>
                  {Array.from({ length: weeks }, (_, w) => [
                    ...criteria.map((c, ci) => cell({ key: `${w}${c.key}`, row, r, c: w * (criteria.length + 1) + ci, week: w, k: c.key, max: c.max, value: row.weeks?.[w]?.[c.key] })),
                    <td key={`${w}s`} className="border border-surface-container-highest bg-surface-container-low font-mono text-data-mono font-semibold">{num(row.computed.weekTotals[w])}</td>,
                  ])}
                  <td className="border border-surface-container-highest font-mono font-bold">{num(row.computed.total)}</td>
                  <td className="border border-surface-container-highest font-mono">{num(row.computed.average, 2)}</td>
                  {cell({ key: 'paper', row, r, c: 999, week: null, k: 'paper', max: sheet.exam.paperMax, value: row.paper })}
                  {separateExam && <td className="border border-surface-container-highest font-mono">{row.computed.examScore === null ? '' : num(row.computed.examScore, 2)}</td>}
                  <td className="border border-surface-container-highest bg-primary-fixed/40 font-mono text-data-mono font-bold text-primary">{num(row.computed.final, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="mt-2 text-body-sm text-outline">{t('sheetHint')}</p>
      {history && <HistoryDrawer path={`/assessments/${id}/history`} title={sheet.subjectName} onClose={() => setHistory(false)} />}
      {adding && <AddStudents sheet={sheet} onClose={() => setAdding(false)} onDone={setSheet} />}
    </div>
  );
}

// label in the current UI language for template objects that carry {label, labelEn}
function lang(o) { return document.documentElement.lang === 'ar' ? o.label : o.labelEn || o.label; }

function AddStudents({ sheet, onClose, onDone }) {
  const { t } = useI18n(); const [list, setList] = useState(null); const [sel, setSel] = useState(new Set());
  const { busy, run } = useSaver();
  useEffect(() => { api.get(`/students?gradeLevel=${sheet.gradeLevel}&status=active`).then((r) => { const have = new Set(sheet.rows.map((x) => String(x.student))); setList(r.items.filter((s) => !have.has(s._id))); }).catch(() => setList([])); }, [sheet]);
  const go = async () => { const r = await run(() => api.post(`/assessments/${sheet._id}/students`, { studentIds: [...sel] })); if (r) { onDone(r); onClose(); } };
  return (
    <Modal title={t('students_count')} onClose={onClose} footer={<><button className="btn-secondary" onClick={onClose}>{t('cancel')}</button><button className="btn-primary" disabled={busy || !sel.size} onClick={go}>{t('add')} ({sel.size})</button></>}>
      {!list ? <Spinner /> : list.length === 0 ? <Empty text={t('empty')} /> : (
        <ul className="max-h-[50vh] overflow-y-auto">{list.map((s) => (
          <li key={s._id}><label className="flex cursor-pointer items-center gap-3 border-b border-surface-container px-1 py-2"><input type="checkbox" checked={sel.has(s._id)} onChange={() => setSel((p) => { const n = new Set(p); n.has(s._id) ? n.delete(s._id) : n.add(s._id); return n; })} />{s.fullName}</label></li>
        ))}</ul>
      )}
    </Modal>
  );
}
