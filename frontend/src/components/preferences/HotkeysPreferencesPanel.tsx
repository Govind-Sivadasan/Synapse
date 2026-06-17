import { useEffect, useMemo, useRef } from "react";
import { Keyboard, RotateCcw } from "lucide-react";
import { HOTKEY_ACTIONS, UserPreferences } from "../../config/userPreferences";
import {
  duplicateGroupsMessage,
  findHotkeyDuplicates,
  formatHotkeyDisplay,
  getHotkeyFieldState,
  validateHotkeyCombo,
} from "../../lib/hotkeys";
import { useNotifications } from "../../services/notifications";
import Switch from "../ui/Switch";
import HotkeyCaptureInput from "./HotkeyCaptureInput";

interface Props {
  prefs: UserPreferences;
  onChange: (updater: UserPreferences | ((prev: UserPreferences) => UserPreferences)) => void;
}

export default function HotkeysPreferencesPanel({ prefs, onChange }: Props) {
  const { success, error, warning } = useNotifications();
  const lastDuplicateMsg = useRef("");

  const duplicates = useMemo(() => findHotkeyDuplicates(HOTKEY_ACTIONS, prefs), [prefs]);
  const duplicateBanner = duplicateGroupsMessage(duplicates);

  useEffect(() => {
    if (duplicateBanner && duplicateBanner !== lastDuplicateMsg.current) {
      lastDuplicateMsg.current = duplicateBanner;
      warning(duplicateBanner);
    }
    if (!duplicateBanner) {
      lastDuplicateMsg.current = "";
    }
  }, [duplicateBanner, warning]);

  const setHotkey = (actionId: string, value: string) => {
    const validation = validateHotkeyCombo(value);
    const stored = validation.valid && validation.display ? validation.display : value;

    let conflictMsg: string | null = null;

    onChange((prev) => {
      const next = {
        ...prev,
        hotkeyOverrides: { ...prev.hotkeyOverrides, [actionId]: stored },
      };
      const field = getHotkeyFieldState(HOTKEY_ACTIONS, next, actionId, stored, true);
      conflictMsg = field.error;
      return next;
    });

    if (!validation.valid) {
      error(validation.error ?? "Invalid shortcut.");
      return;
    }
    if (conflictMsg) {
      warning(conflictMsg);
      return;
    }
    success(`Shortcut set to ${formatHotkeyDisplay(stored)}.`);
  };

  const toggleHotkey = (actionId: string, enabled: boolean) => {
    onChange((prev) => {
      const disabled = new Set(prev.hotkeysDisabled);
      if (enabled) disabled.delete(actionId);
      else disabled.add(actionId);
      return { ...prev, hotkeysDisabled: [...disabled] };
    });
    success(enabled ? "Shortcut enabled." : "Shortcut disabled.");
  };

  const resetHotkeys = () => {
    onChange((prev) => ({ ...prev, hotkeyOverrides: {}, hotkeysDisabled: [] }));
    success("Shortcuts reset to defaults.");
  };

  return (
    <div className="prefs-panel">
      <div className="prefs-card-header">
        <Keyboard size={18} />
        <div className="prefs-card-header-text">
          <h3 className="account-section-title">Keyboard shortcuts</h3>
          <p className="account-section-desc">
            Click a shortcut field, then press your combination — e.g. hold Alt+Shift and press R.
            Press <kbd>?</kbd> outside fields to view all shortcuts.
          </p>
        </div>
        <div className="prefs-card-actions">
          <button type="button" className="btn-sm btn-secondary" onClick={resetHotkeys}>
            <RotateCcw size={14} />
            Reset shortcuts
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table prefs-hotkeys-table">
          <thead>
            <tr>
              <th>Action</th>
              <th>Shortcut</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {HOTKEY_ACTIONS.map((action) => {
              const enabled = !prefs.hotkeysDisabled.includes(action.id);
              const raw = prefs.hotkeyOverrides[action.id] ?? action.defaultKey;
              const field = getHotkeyFieldState(HOTKEY_ACTIONS, prefs, action.id, raw, enabled);

              return (
                <tr
                  key={action.id}
                  className={
                    field.error ? "prefs-hotkey-row--error" : field.warning ? "prefs-hotkey-row--warn" : undefined
                  }
                >
                  <td>
                    <span className="prefs-hotkey-label">{action.label}</span>
                    <span className="prefs-hotkey-cat">{action.category}</span>
                  </td>
                  <td>
                    <HotkeyCaptureInput
                      value={raw}
                      disabled={!enabled}
                      placeholder={formatHotkeyDisplay(action.defaultKey)}
                      onChange={(v) => setHotkey(action.id, v)}
                      aria-label={`Shortcut for ${action.label}`}
                    />
                    {field.error && <span className="prefs-hotkey-error">{field.error}</span>}
                    {!field.error && field.warning && (
                      <span className="prefs-hotkey-warning">{field.warning}</span>
                    )}
                  </td>
                  <td className="prefs-hotkey-enabled-cell">
                    <div className="prefs-enable-switch">
                      <Switch
                        checked={enabled}
                        onChange={(v) => toggleHotkey(action.id, v)}
                        label={enabled ? "On" : "Off"}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
