import { CSSProperties, ReactNode, useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import UserMenu from "./UserMenu";
import ChatbotWidget from "../chat/ChatbotWidget";
import HotkeysHelpModal from "../preferences/HotkeysHelpModal";
import { useSidebarLayout } from "../../hooks/useSidebarLayout";
import { useHotkeys } from "../../hooks/useHotkeys";
import { loadUserPreferences } from "../../config/userPreferences";

interface Props {
  username: string;
  roles: string[];
  onLogout: () => void;
  children: ReactNode;
}

export default function AppShell({ username, roles, onLogout, children }: Props) {
  const sidebar = useSidebarLayout();
  const [hotkeysOpen, setHotkeysOpen] = useState(false);
  const [prefs, setPrefs] = useState(() => loadUserPreferences(username));

  const layoutStyle = {
    "--sidebar-width": `${sidebar.sidebarWidth}px`,
  } as CSSProperties;

  const onToggleChatbot = () => {
    window.dispatchEvent(new CustomEvent("synapse:toggle-chatbot"));
  };

  useHotkeys(username, roles, {
    onToggleSidebar: sidebar.toggleCollapsed,
    onToggleChatbot,
    onShowHotkeysHelp: () => setHotkeysOpen(true),
  });

  useEffect(() => {
    const sync = () => setPrefs(loadUserPreferences(username));
    window.addEventListener("synapse:prefs-changed", sync);
    return () => window.removeEventListener("synapse:prefs-changed", sync);
  }, [username]);

  return (
    <div
      className={`app-layout${sidebar.collapsed ? " app-layout--sidebar-collapsed" : ""}${
        sidebar.resizing ? " app-layout--sidebar-resizing" : ""
      }`}
      style={layoutStyle}
    >
      <Sidebar
        username={username}
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
      <HotkeysHelpModal open={hotkeysOpen} onClose={() => setHotkeysOpen(false)} prefs={prefs} />
    </div>
  );
}
