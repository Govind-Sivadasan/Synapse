import { NavLink } from "react-router-dom";
import { Hexagon, LogOut } from "lucide-react";
import { getVisibleNav } from "../../config/navigation";

interface Props {
  roles: string[];
  onLogout: () => void | Promise<void>;
}

export default function Sidebar({ roles, onLogout }: Props) {
  const sections = getVisibleNav(roles);

  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-inner">
          <div className="sidebar-logo">
            <Hexagon size={22} strokeWidth={2.25} />
          </div>
          <div className="sidebar-brand-text">
            <h1>Synapse</h1>
            <span>DICOM Router</span>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {sections.map((section) => (
          <div key={section.label}>
            <div className="nav-section-label">{section.label}</div>
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) => (isActive ? "active" : "")}
                >
                  <Icon size={18} strokeWidth={2} />
                  {item.label}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div style={{ padding: "0.75rem", borderTop: "1px solid var(--sidebar-border)" }}>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => void onLogout()}
          style={{ width: "100%", justifyContent: "flex-start", color: "var(--sidebar-text)" }}
        >
          <LogOut size={18} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
