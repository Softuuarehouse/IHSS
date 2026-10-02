import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { getSocket } from './socket';

/**
 * Loads a list and keeps it in sync with the server in real time.
 * Any create / update / delete made by ANY user is applied here within milliseconds.
 * `match(doc)` lets the caller ignore live-created docs that don't fit the current filters.
 */
export function useLiveList(entity, path, { match, enabled = true } = {}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState({});
  const matchRef = useRef(match); matchRef.current = match;

  const load = useCallback(async () => {
    if (!enabled) return;
    try { const r = await api.get(path); setItems(r.items); setError(''); } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [path, enabled]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  useEffect(() => {
    if (!enabled) return undefined;
    const s = getSocket();
    const onChange = (e) => {
      if (e.entity !== entity) return;
      const mark = (id) => { setFlash((f) => ({ ...f, [id]: Date.now() })); setTimeout(() => setFlash((f) => { const n = { ...f }; delete n[id]; return n; }), 2300); };
      if (e.action === 'deleted') return setItems((xs) => xs.filter((x) => x._id !== e.id));
      const doc = e.doc; if (!doc) return;
      setItems((xs) => {
        const i = xs.findIndex((x) => x._id === doc._id);
        if (i >= 0) { const c = xs.slice(); c[i] = doc; return c; }
        if (matchRef.current && !matchRef.current(doc)) return xs;
        return [...xs, doc];
      });
      mark(doc._id);
    };
    // Bulk operations (Excel import) skip per-row events and ask viewers to just reload the list.
    const onReload = (e) => { if (e.entity === entity) load(); };
    s.on('entity:change', onChange);
    s.on('entity:reload', onReload);
    s.on('connect', load); // resync after a dropped connection so nothing is missed
    return () => { s.off('entity:change', onChange); s.off('entity:reload', onReload); s.off('connect', load); };
  }, [entity, load, enabled]);

  return { items, setItems, loading, error, reload: load, flash };
}

export function useConnected() {
  const [ok, setOk] = useState(true);
  useEffect(() => {
    const s = getSocket();
    setOk(s.connected);
    const on = () => setOk(true); const off = () => setOk(false);
    s.on('connect', on); s.on('disconnect', off);
    return () => { s.off('connect', on); s.off('disconnect', off); };
  }, []);
  return ok;
}

/** Who else has this screen / sheet open right now. */
export function usePresence(room) {
  const [users, setUsers] = useState([]);
  useEffect(() => {
    if (!room) return undefined;
    const s = getSocket();
    const onUpdate = (p) => { if (p.room === room) setUsers(p.users); };
    const join = () => s.emit('presence:join', { room });
    s.on('presence:update', onUpdate); s.on('connect', join);
    if (s.connected) join();
    return () => { s.off('presence:update', onUpdate); s.off('connect', join); s.emit('presence:leave', { room }); };
  }, [room]);
  return users;
}
