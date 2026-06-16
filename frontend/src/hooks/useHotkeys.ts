import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  HOTKEY_ACTIONS,
  UserPreferences,
  getHotkeyBinding,
  getNavCatalog,
  loadUserPreferences,
} from "../config/userPreferences";
import { matchesHotkeyCombo } from "../lib/hotkeys";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest(".prefs-hotkey-capture--recording")) return true;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

interface Handlers {
  onToggleSidebar?: () => void;
  onToggleChatbot?: () => void;
  onShowHotkeysHelp?: () => void;
}

export function useHotkeys(username: string, roles: string[], handlers: Handlers) {
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState<UserPreferences>(() => loadUserPreferences(username));

  useEffect(() => {
    const sync = () => setPrefs(loadUserPreferences(username));
    window.addEventListener("synapse:prefs-changed", sync);
    return () => window.removeEventListener("synapse:prefs-changed", sync);
  }, [username]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      for (const action of HOTKEY_ACTIONS) {
        const combo = getHotkeyBinding(action.id, prefs);
        if (!combo || !matchesHotkeyCombo(e, combo)) continue;

        e.preventDefault();
        e.stopPropagation();

        if (action.id === "ui.hotkeys-help") {
          handlers.onShowHotkeysHelp?.();
          return;
        }
        if (action.id === "ui.toggle-sidebar") {
          handlers.onToggleSidebar?.();
          return;
        }
        if (action.id === "ui.toggle-chatbot") {
          handlers.onToggleChatbot?.();
          return;
        }
        if (action.path) {
          const item = getNavCatalog().find((i) => i.path === action.path);
          if (!item || !item.roles.some((r) => roles.includes(r))) return;
          navigate(action.path);
          return;
        }
      }
    },
    [handlers, navigate, prefs, roles],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [handleKeyDown]);
}

export function formatHotkeyList(prefs: UserPreferences): { label: string; combo: string }[] {
  return HOTKEY_ACTIONS.map((action) => ({
    label: action.label,
    combo: getHotkeyBinding(action.id, prefs) ?? "(disabled)",
  })).filter((row) => row.combo !== "(disabled)");
}
