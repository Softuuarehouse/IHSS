import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';
import { connectSocket, disconnectSocket, reconnectSocket } from './socket';

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = still checking
  const [meta, setMeta] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const { user: u } = await api.get('/auth/me');
      setUser(u);
      if (!meta) setMeta(await api.get('/meta'));
      return u;
    } catch { setUser(null); disconnectSocket(); return null; }
  }, [meta]);

  useEffect(() => { refresh(); }, []); // eslint-disable-line
  useEffect(() => {
    const expired = () => { setUser(null); disconnectSocket(); };
    window.addEventListener('auth:expired', expired);
    return () => window.removeEventListener('auth:expired', expired);
  }, []);

  // Live session control: a Super Admin changing my permissions / deactivating me applies instantly.
  useEffect(() => {
    if (!user) return undefined;
    const s = connectSocket();
    const onRefresh = async () => { await refresh(); reconnectSocket(); };
    const onRevoked = () => { setUser(null); disconnectSocket(); };
    s.on('auth:refresh', onRefresh); s.on('auth:revoked', onRevoked);
    return () => { s.off('auth:refresh', onRefresh); s.off('auth:revoked', onRevoked); };
  }, [user?.id]); // eslint-disable-line

  const login = async (email, password) => {
    const { user: u } = await api.post('/auth/login', { email, password });
    setUser(u); setMeta(await api.get('/meta'));
  };
  const logout = async () => { await api.post('/auth/logout').catch(() => {}); setUser(null); disconnectSocket(); };
  const can = (perm) => !!user && (user.permissions.includes('*') || user.permissions.includes(perm));
  return <Ctx.Provider value={{ user, meta, login, logout, can, refresh, isSuper: user?.role === 'super_admin' }}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);
