import { useEffect } from "react";
import { Keyboard } from "lucide-react";
import { HOTKEY_ACTIONS, UserPreferences, getHotkeyBinding } from "../../config/userPreferences";
import { HotkeyComboDisplay } from "./HotkeyCaptureInput";

interface Props {
  open: boolean;
  onClose: () => void;
  prefs: UserPreferences;
}

export default function HotkeysHelpModal({ open, onClose, prefs }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const byCategory = {
    Navigation: HOTKEY_ACTIONS.filter((a) => a.category === "Navigation"),
    Interface: HOTKEY_ACTIONS.filter((a) => a.category === "Interface"),
  };

  return (
    <div className="hotkeys-overlay" role="presentation" onClick={onClose}>
      <div
        className="hotkeys-modal card"
        role="dialog"
        aria-label="Keyboard shortcuts"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hotkeys-modal-header">
          <Keyboard size={20} />
          <h2>Keyboard shortcuts</h2>
          <button type="button" className="btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            Esc
          </button>
        </div>
        <div className="hotkeys-modal-body">
          <p className="hotkeys-modal-desc">
            Customize shortcuts in Account settings. Shortcuts are disabled while typing in a field.
          </p>
          {(Object.keys(byCategory) as Array<keyof typeof byCategory>).map((category) => (
            <section key={category} className="hotkeys-section">
              <h3>{category}</h3>
              <ul className="hotkeys-list">
                {byCategory[category].map((action) => {
                  const combo = getHotkeyBinding(action.id, prefs);
                  return (
                    <li key={action.id}>
                      <span>{action.label}</span>
                      {combo ? <HotkeyComboDisplay combo={combo} /> : <kbd>Disabled</kbd>}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
