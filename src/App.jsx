import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { useI18n } from './lib/i18n';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import Fees from './pages/Fees';
import Registration from './pages/Registration';
import Assessments from './pages/Assessments';
import AssessmentSheet from './pages/AssessmentSheet';
import HR from './pages/HR';
import Accounts from './pages/Accounts';
import Admins from './pages/Admins';
import Audit from './pages/Audit';

// Route guard: the UI hides what you can't use, and the server enforces it regardless.
const Guard = ({ module, superOnly, children }) => {
  const { user, isSuper } = useAuth(); const { t } = useI18n();
  const allowed = superOnly ? isSuper : user.modules.includes(module);
  return allowed ? children : <div className="card p-10 text-center text-on-surface-variant">{t('noAccess')}</div>;
};

export default function App() {
  const { user, meta } = useAuth();
  // Wait for /meta too, not just the user — the sidebar's section labels (e.g. "Revenue") come from
  // it, and rendering the sidebar before it arrives would flash blank labels for an instant.
  if (user === undefined || (user && !meta)) return <div className="flex min-h-screen items-center justify-center text-outline">…</div>;
  if (!user) return <Login />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="students" element={<Guard module="students"><Students /></Guard>} />
        <Route path="registration" element={<Guard module="registration"><Registration /></Guard>} />
        <Route path="fees" element={<Guard module="fees"><Fees /></Guard>} />
        <Route path="assessments" element={<Guard module="assessments"><Assessments /></Guard>} />
        <Route path="assessments/:id" element={<Guard module="assessments"><AssessmentSheet /></Guard>} />
        <Route path="hr" element={<Guard module="hr"><HR /></Guard>} />
        <Route path="accounts" element={<Guard module="accounts"><Accounts /></Guard>} />
        <Route path="admins" element={<Guard superOnly><Admins /></Guard>} />
        <Route path="audit" element={<Guard superOnly><Audit /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
