import { useCallback, useEffect, useState } from "react";
import {
  UserPreferences,
  loadUserPreferences,
  saveUserPreferences,
  resetUserPreferences,
} from "../config/userPreferences";

export function useUserPreferences(username: string) {
  const [prefs, setPrefsState] = useState<UserPreferences>(() => loadUserPreferences(username));

  useEffect(() => {
    setPrefsState(loadUserPreferences(username));
  }, [username]);

  const setPrefs = useCallback(
    (updater: UserPreferences | ((prev: UserPreferences) => UserPreferences)) => {
      setPrefsState((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        saveUserPreferences(username, next);
        window.dispatchEvent(new CustomEvent("synapse:prefs-changed"));
        return next;
      });
    },
    [username],
  );

  const resetPrefs = useCallback(() => {
    resetUserPreferences(username);
    const fresh = loadUserPreferences(username);
    setPrefsState(fresh);
    window.dispatchEvent(new CustomEvent("synapse:prefs-changed"));
  }, [username]);

  return { prefs, setPrefs, resetPrefs };
}

/** Re-read preferences when another tab or component updates them. */
export function usePreferencesSync(username: string, onChange: (prefs: UserPreferences) => void) {
  useEffect(() => {
    const handler = () => onChange(loadUserPreferences(username));
    window.addEventListener("synapse:prefs-changed", handler);
    return () => window.removeEventListener("synapse:prefs-changed", handler);
  }, [username, onChange]);
}
