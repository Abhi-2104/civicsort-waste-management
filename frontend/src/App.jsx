import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import IncidentsList from './pages/IncidentsList';
import IncidentCapture from './pages/IncidentCapture';
import IncidentDetail from './pages/IncidentDetail';
import Masters from './pages/Masters';
import Categories from './pages/Categories';
import UsersAdmin from './pages/UsersAdmin';
import ResidentUpload from './pages/ResidentUpload';
import Reports from './pages/Reports';
import Audit from './pages/Audit';
import DbExplorer from './pages/DbExplorer';

function Protected({ children, roles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/incidents" element={<Protected><IncidentsList /></Protected>} />
      <Route path="/incidents/new" element={<Protected roles={['Administrator', 'Maker']}><IncidentCapture /></Protected>} />
      <Route path="/incidents/:id" element={<Protected><IncidentDetail /></Protected>} />
      <Route path="/approvals" element={<Protected roles={['Administrator', 'Supervisor']}><IncidentsList fixedStatus="Pending Approval" /></Protected>} />
      <Route path="/masters" element={<Protected roles={['Administrator']}><Masters /></Protected>} />
      <Route path="/categories" element={<Protected roles={['Administrator']}><Categories /></Protected>} />
      <Route path="/users" element={<Protected roles={['Administrator']}><UsersAdmin /></Protected>} />
      <Route path="/upload" element={<Protected roles={['Administrator']}><ResidentUpload /></Protected>} />
      <Route path="/reports" element={<Protected roles={['Administrator', 'Supervisor']}><Reports /></Protected>} />
      <Route path="/audit" element={<Protected roles={['Administrator']}><Audit /></Protected>} />
      <Route path="/db-explorer" element={<Protected roles={['Administrator']}><DbExplorer /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
