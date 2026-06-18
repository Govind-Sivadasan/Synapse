import { CSSProperties, ReactNode, useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import UserMenu from "./UserMenu";
import GlobalStatsBar from "./GlobalStatsBar";
import StatusFooter from "./StatusFooter";
import ChatbotWidget from "../chat/ChatbotWidget";
import HotkeysHelpModal from "../preferences/HotkeysHelpModal";
import IntroTour from "../onboarding/IntroTour";
import { useSidebarLayout } from "../../hooks/useSidebarLayout";
import { useHotkeys } from "../../hooks/useHotkeys";
import { useChatbotEnabled } from "../../hooks/useChatbotEnabled";
import { loadUserPreferences } from "../../config/userPreferences";
import { NotificationProvider } from "../../services/notifications";

interface Props {
  username: string;
  roles: string[];
  onLogout: () => void;
  children: ReactNode;
}

function AppShellInner({ username, roles, onLogout, children }: Props) {
  const sidebar = useSidebarLayout();
  const { enabled: chatbotEnabled } = useChatbotEnabled(roles);
  const [hotkeysOpen, setHotkeysOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [prefs, setPrefs] = useState(() => loadUserPreferences(username));

  const layoutStyle = {
    "--sidebar-width": `${sidebar.sidebarWidth}px`,
  } as CSSProperties;

  const onToggleChatbot = () => {
    if (!chatbotEnabled) return;
    window.dispatchEvent(new CustomEvent("synapse:toggle-chatbot"));
  };

  useHotkeys(username, roles, {
    onToggleSidebar: sidebar.toggleCollapsed,
    onToggleChatbot: chatbotEnabled ? onToggleChatbot : undefined,
    onShowHotkeysHelp: () => setHotkeysOpen(true),
  });

  useEffect(() => {
    const sync = () => {
      setPrefs(loadUserPreferences(username));
    };
    sync();
    window.addEventListener("synapse:prefs-changed", sync);
    return () => window.removeEventListener("synapse:prefs-changed", sync);
  }, [username]);

  useEffect(() => {
    const startTour = () => setTourOpen(true);
    window.addEventListener("synapse:start-tour", startTour);
    return () => window.removeEventListener("synapse:start-tour", startTour);
  }, []);

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
        chatbotEnabled={chatbotEnabled}
        onLogout={onLogout}
        collapsed={sidebar.collapsed}
        onToggle={sidebar.toggleCollapsed}
        onResizeStart={sidebar.startResize}
        onStartTour={() => setTourOpen(true)}
      />
      <div className="app-main">
        <header className="app-topbar">
          <GlobalStatsBar />
          <UserMenu username={username} roles={roles} onLogout={onLogout} />
        </header>
        <main className="app-content" data-tour="app-content">
          {children}
        </main>
        <StatusFooter />
      </div>
      {chatbotEnabled && <ChatbotWidget roles={roles} />}
      <HotkeysHelpModal open={hotkeysOpen} onClose={() => setHotkeysOpen(false)} prefs={prefs} />
      <IntroTour username={username} run={tourOpen} onClose={() => setTourOpen(false)} />
    </div>
  );
}

export default function AppShell(props: Props) {
  return (
    <NotificationProvider username={props.username}>
      <AppShellInner {...props} />
    </NotificationProvider>
  );
}
