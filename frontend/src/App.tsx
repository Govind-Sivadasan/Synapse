import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";
import Dashboard from "./pages/Dashboard";
import Nodes from "./pages/Nodes";
import RoutingRules from "./pages/RoutingRules";
import TagMorphing from "./pages/TagMorphing";
import MigrationJobs from "./pages/MigrationJobs";
import RoutingMonitor from "./pages/RoutingMonitor";
import AuditLogs from "./pages/AuditLogs";
import Chatbot from "./pages/Chatbot";
import Settings from "./pages/Settings";
import SystemHealth from "./pages/SystemHealth";

const navItems = [
  { path: "/dashboard", label: "Dashboard", roles: ["viewer", "service_user", "operator", "admin"] },
  { path: "/nodes", label: "Nodes", roles: ["admin"] },
  { path: "/routing-rules", label: "Routing Rules", roles: ["admin"] },
  { path: "/tag-morphing", label: "Tag Morphing", roles: ["admin"] },
  { path: "/migration-jobs", label: "Migration Jobs", roles: ["operator", "admin"] },
  { path: "/routing-monitor", label: "Routing Monitor", roles: ["service_user", "operator", "admin"] },
  { path: "/audit-logs", label: "Audit Logs", roles: ["service_user", "operator", "admin"] },
  { path: "/chatbot", label: "Chatbot", roles: ["service_user", "operator", "admin"] },
  { path: "/settings", label: "Settings", roles: ["admin"] },
  { path: "/health", label: "System Health", roles: ["operator", "admin"] },
];

export default function App() {
  const { username, roles, logout } = useAuth();

  const visibleNav = navItems.filter((item) => item.roles.some((r) => roles.includes(r)));

  return (
    <BrowserRouter>
      <div className="layout">
        <aside className="sidebar">
          <h1>Synapse Router</h1>
          <nav>
            {visibleNav.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => (isActive ? "active" : "")}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="content">
          <div className="header-bar">
            <div>
              <strong>{username}</strong>
              <span style={{ marginLeft: "0.5rem", color: "#64748b", fontSize: "0.875rem" }}>
                ({roles.join(", ")})
              </span>
            </div>
            <button onClick={logout}>Logout</button>
          </div>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/nodes" element={<Nodes />} />
            <Route path="/routing-rules" element={<RoutingRules />} />
            <Route path="/tag-morphing" element={<TagMorphing />} />
            <Route path="/migration-jobs" element={<MigrationJobs />} />
            <Route path="/routing-monitor" element={<RoutingMonitor />} />
            <Route path="/audit-logs" element={<AuditLogs />} />
            <Route path="/chatbot" element={<Chatbot />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/health" element={<SystemHealth />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
