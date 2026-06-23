import { BrowserRouter, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";
import AppShell from "./components/layout/AppShell";
import Dashboard from "./pages/Dashboard";
import Nodes from "./pages/Nodes";
import RoutingRules from "./pages/RoutingRules";
import TagMorphing from "./pages/TagMorphing";
import MigrationJobs from "./pages/MigrationJobs";
import StudyBrowser from "./pages/StudyBrowser";
import RoutingMonitor from "./pages/RoutingMonitor";
import AuditLogs from "./pages/AuditLogs";
import Chatbot from "./pages/Chatbot";
import Settings from "./pages/Settings";
import SystemHealth from "./pages/SystemHealth";
import Reports from "./pages/Reports";
import Account from "./pages/Account";

export default function App() {
  const { username, roles, logout } = useAuth();

  return (
    <BrowserRouter>
      <AppShell username={username} roles={roles} onLogout={logout}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/nodes" element={<Nodes />} />
          <Route path="/routing-rules" element={<RoutingRules />} />
          <Route path="/tag-morphing" element={<TagMorphing />} />
          <Route path="/migration-jobs" element={<MigrationJobs />} />
          <Route path="/study-browser" element={<StudyBrowser />} />
          <Route path="/routing-monitor" element={<RoutingMonitor />} />
          <Route path="/audit-logs" element={<AuditLogs />} />
          <Route path="/chatbot" element={<Chatbot />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/health" element={<SystemHealth />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/account" element={<Account />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
