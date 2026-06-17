import { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { CircleHelp, LogOut } from "lucide-react";
import { BRAND } from "../../config/brand";
import { resolveNavSections, loadUserPreferences } from "../../config/userPreferences";
import { usePreferencesSync } from "../../hooks/useUserPreferences";
import SidebarToggleIcon from "./SidebarToggleIcon";

interface Props {
  username: string;
  roles: string[];
  chatbotEnabled?: boolean;
  onLogout: () => void | Promise<void>;
  collapsed: boolean;
  onToggle: () => void;
  onResizeStart: (clientX: number) => void;
  onStartTour: () => void;
}

export default function Sidebar({
  username,
  roles,
  chatbotEnabled = true,
  onLogout,
  collapsed,
  onToggle,
  onResizeStart,
  onStartTour,
}: Props) {
  const [prefsTick, setPrefsTick] = useState(0);

  usePreferencesSync(username, () => setPrefsTick((t) => t + 1));

  const visibleSections = useMemo(() => {
    const sections = resolveNavSections(roles, loadUserPreferences(username));
    return sections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => chatbotEnabled || item.path !== "/chatbot"),
      }))
      .filter((section) => section.items.length > 0);
  }, [roles, username, chatbotEnabled, prefsTick]);

  return (
    <aside className={`app-sidebar${collapsed ? " app-sidebar--collapsed" : ""}`}>
      <div className="sidebar-brand">
        <div className="sidebar-brand-inner">
          <img
            src={BRAND.icon}
            alt="Synapse"
            className="sidebar-mark"
            width={32}
            height={32}
            draggable={false}
          />
          {!collapsed && (
            <div className="sidebar-brand-text">
              <h1>Synapse</h1>
              <span>DICOM Router</span>
            </div>
          )}
        </div>
        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <SidebarToggleIcon mode={collapsed ? "expand" : "collapse"} />
        </button>
      </div>

      <nav className="sidebar-nav" data-tour="sidebar-nav">
        {visibleSections.map((section) => (
          <div key={section.label} className="sidebar-nav-section">
            {!collapsed && <div className="nav-section-label">{section.label}</div>}
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) => (isActive ? "active" : "")}
                  title={item.label}
                  aria-label={collapsed ? item.label : undefined}
                >
                  {Icon ? <Icon size={18} strokeWidth={2} /> : null}
                  {!collapsed && <span className="sidebar-nav-label">{item.label}</span>}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button
          type="button"
          className="btn-ghost sidebar-help"
          data-tour="sidebar-help"
          onClick={onStartTour}
          title="Product tour"
          aria-label={collapsed ? "Help tour" : undefined}
        >
          <CircleHelp size={18} />
          {!collapsed && <span className="sidebar-nav-label">Help</span>}
        </button>
        <button
          type="button"
          className="btn-ghost sidebar-signout"
          onClick={() => void onLogout()}
          title="Sign out"
          aria-label={collapsed ? "Sign out" : undefined}
        >
          <LogOut size={18} />
          {!collapsed && <span className="sidebar-nav-label">Sign out</span>}
        </button>
      </div>

      {!collapsed && (
        <div
          className="sidebar-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          onPointerDown={(e) => {
            e.preventDefault();
            onResizeStart(e.clientX);
          }}
        />
      )}
    </aside>
  );
}
