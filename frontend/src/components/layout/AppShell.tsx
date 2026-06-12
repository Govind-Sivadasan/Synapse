import { ReactNode } from "react";
import Sidebar from "./Sidebar";

interface Props {
  username: string;
  roles: string[];
  onLogout: () => void;
  children: ReactNode;
}

export default function AppShell({ username, roles, onLogout, children }: Props) {
  const initials = username.slice(0, 2).toUpperCase() || "?";

  return (
    <div className="app-layout">
      <Sidebar roles={roles} onLogout={onLogout} />
      <div className="app-main">
        <header className="app-topbar">
          <div />
          <div className="topbar-user">
            <div className="user-avatar">{initials}</div>
            <div className="user-info">
              <strong>{username}</strong>
              <span className="user-roles">{roles.join(" · ")}</span>
            </div>
          </div>
        </header>
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
