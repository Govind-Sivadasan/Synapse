import { useCallback, useEffect, useState } from "react";

export type AccentColor = "teal" | "blue" | "violet" | "rose" | "amber" | "emerald";
export type AppearanceMode = "light" | "dark";

export interface ThemeChoice {
  accent: AccentColor;
  mode: AppearanceMode;
}

const STORAGE_KEY = "synapse.theme";

const DEFAULTS: ThemeChoice = { accent: "teal", mode: "light" };

export const ACCENT_OPTIONS: { id: AccentColor; label: string; swatch: string }[] = [
  { id: "teal", label: "Teal", swatch: "#0d9488" },
  { id: "blue", label: "Blue", swatch: "#2563eb" },
  { id: "violet", label: "Violet", swatch: "#7c3aed" },
  { id: "rose", label: "Rose", swatch: "#e11d48" },
  { id: "amber", label: "Amber", swatch: "#d97706" },
  { id: "emerald", label: "Emerald", swatch: "#059669" },
];

function readStored(): ThemeChoice {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    if (
      ACCENT_OPTIONS.some((a) => a.id === parsed.accent) &&
      (parsed.mode === "light" || parsed.mode === "dark")
    ) {
      return parsed as ThemeChoice;
    }
  } catch {
    /* ignore */
  }
  return DEFAULTS;
}

function applyToDocument(theme: ThemeChoice) {
  const root = document.documentElement;
  root.setAttribute("data-accent", theme.accent);
  root.setAttribute("data-mode", theme.mode);
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeChoice>(readStored);

  useEffect(() => {
    applyToDocument(theme);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
    } catch {
      /* ignore */
    }
  }, [theme]);

  const setAccent = useCallback((accent: AccentColor) => {
    setThemeState((prev) => ({ ...prev, accent }));
  }, []);

  const setMode = useCallback((mode: AppearanceMode) => {
    setThemeState((prev) => ({ ...prev, mode }));
  }, []);

  const toggleMode = useCallback(() => {
    setThemeState((prev) => ({ ...prev, mode: prev.mode === "light" ? "dark" : "light" }));
  }, []);

  return { theme, setAccent, setMode, toggleMode };
}
