import { CSSProperties, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Moon, Sun, User } from "lucide-react";
import {
  ACCENT_OPTIONS,
  AccentColor,
  useTheme,
} from "../../hooks/useTheme";

interface Props {
  username: string;
  roles: string[];
  onLogout: () => void;
}

function displayRoles(roles: string[]): string {
  return roles.filter((r) => !r.startsWith("default-roles")).join(", ");
}

export default function UserMenu({ username, roles, onLogout }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { theme, setAccent, toggleMode } = useTheme();
  const initials = username.slice(0, 2).toUpperCase() || "?";

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const swatchModeBg = theme.mode === "dark" ? "#1e293b" : "#ffffff";

  return (
    <div className="user-menu-wrap" ref={ref}>
      <button
        type="button"
        className="user-menu-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Account & theme"
      >
        <div className="user-avatar">{initials}</div>
      </button>

      {open && (
        <div
          className="user-menu-dropdown"
          role="menu"
          data-mode={theme.mode}
        >
          <div className="user-menu-header">
            <div className="user-avatar user-avatar--lg">{initials}</div>
            <div className="user-menu-header-text">
              <strong>{username}</strong>
              <span className="user-menu-role">{displayRoles(roles)}</span>
            </div>
          </div>

          <section className="user-menu-section">
            <h4 className="user-menu-section-title">Accent color</h4>
            <div className="user-menu-swatches">
              {ACCENT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`user-menu-swatch${theme.accent === opt.id ? " user-menu-swatch--active" : ""}`}
                  style={
                    {
                      "--swatch-accent": opt.swatch,
                      "--swatch-mode-bg": swatchModeBg,
                    } as CSSProperties
                  }
                  onClick={() => setAccent(opt.id as AccentColor)}
                  title={`${opt.label} · ${theme.mode} theme`}
                  aria-label={`${opt.label} accent`}
                  aria-pressed={theme.accent === opt.id}
                />
              ))}
            </div>
          </section>

          <section className="user-menu-section user-menu-section--actions">
            <button type="button" className="user-menu-item" onClick={toggleMode} role="menuitem">
              {theme.mode === "light" ? <Moon size={16} strokeWidth={2} /> : <Sun size={16} strokeWidth={2} />}
              <span>{theme.mode === "light" ? "Dark mode" : "Light mode"}</span>
            </button>
            <button
              type="button"
              className="user-menu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                navigate("/account");
              }}
            >
              <User size={16} strokeWidth={2} />
              <span>Account settings</span>
            </button>
          </section>

          <footer className="user-menu-footer">
            <button
              type="button"
              className="user-menu-signout"
              onClick={() => {
                setOpen(false);
                void onLogout();
              }}
              role="menuitem"
            >
              <LogOut size={16} strokeWidth={2} />
              <span>Sign out</span>
            </button>
          </footer>
        </div>
      )}
    </div>
  );
}
