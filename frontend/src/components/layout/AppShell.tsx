import { CSSProperties, ReactNode } from "react";
import Sidebar from "./Sidebar";
import UserMenu from "./UserMenu";
import ChatbotWidget from "../chat/ChatbotWidget";
import { useSidebarLayout } from "../../hooks/useSidebarLayout";

interface Props {
  username: string;
  roles: string[];
  onLogout: () => void;
  children: ReactNode;
}

export default function AppShell({ username, roles, onLogout, children }: Props) {
  const sidebar = useSidebarLayout();

  const layoutStyle = {
    "--sidebar-width": `${sidebar.sidebarWidth}px`,
  } as CSSProperties;

  return (
    <div
      className={`app-layout${sidebar.collapsed ? " app-layout--sidebar-collapsed" : ""}${
        sidebar.resizing ? " app-layout--sidebar-resizing" : ""
      }`}
      style={layoutStyle}
    >
      <Sidebar
        roles={roles}
        onLogout={onLogout}
        collapsed={sidebar.collapsed}
        onToggle={sidebar.toggleCollapsed}
        onResizeStart={sidebar.startResize}
      />
      <div className="app-main">
        <header className="app-topbar">
          <UserMenu username={username} roles={roles} onLogout={onLogout} />
        </header>
        <main className="app-content">{children}</main>
      </div>
      <ChatbotWidget roles={roles} />
    </div>
  );
}
