/** Hotkey parsing, validation, duplicate detection, and event matching. */

const MODIFIERS = ["Ctrl", "Alt", "Shift"] as const;
type Modifier = (typeof MODIFIERS)[number];

/** Single keys allowed without Ctrl/Alt (still may use Shift, e.g. ?). */
const ALLOWED_SINGLE_KEYS = new Set([
  "?",
  "Escape",
  "Enter",
  "Space",
  "Tab",
  "Backspace",
  "Delete",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

const FUNCTION_KEY = /^F([1-9]|1[0-2])$/i;

const MODIFIER_EVENT_KEYS = new Set(["Control", "Alt", "Shift", "Meta"]);

export interface HotkeyValidation {
  valid: boolean;
  normalized: string | null;
  display: string | null;
  error: string | null;
  warning: string | null;
}

export interface ResolvedHotkey {
  actionId: string;
  label: string;
  normalized: string;
  display: string;
}

export interface HotkeyDuplicateGroup {
  normalized: string;
  display: string;
  actions: { id: string; label: string }[];
}

function normalizeKeyToken(key: string): string | null {
  const trimmed = key.trim();
  if (!trimmed) return null;

  if (trimmed === "?" || trimmed === "/") return "?";

  if (FUNCTION_KEY.test(trimmed)) return trimmed.toUpperCase();

  if (ALLOWED_SINGLE_KEYS.has(trimmed)) return trimmed;

  if (trimmed.length === 1) return trimmed.toUpperCase();

  const aliases: Record<string, string> = {
    Esc: "Escape",
    Spacebar: "Space",
    Del: "Delete",
    Up: "ArrowUp",
    Down: "ArrowDown",
    Left: "ArrowLeft",
    Right: "ArrowRight",
  };
  if (aliases[trimmed]) return aliases[trimmed];

  if (/^[A-Z0-9]$/.test(trimmed)) return trimmed;

  return trimmed;
}

function buildCanonical(modifiers: Modifier[], key: string): string | null {
  const token = normalizeKeyToken(key);
  if (!token) return null;
  const mods = [...modifiers].sort((a, b) => MODIFIERS.indexOf(a) - MODIFIERS.indexOf(b));
  return mods.length > 0 ? `${mods.join("+")}+${token}` : token;
}

function buildDisplay(modifiers: Modifier[], key: string): string | null {
  const token = normalizeKeyToken(key);
  if (!token) return null;
  const mods = [...modifiers].sort((a, b) => MODIFIERS.indexOf(a) - MODIFIERS.indexOf(b));
  return mods.length > 0 ? `${mods.join("+")}+${token}` : token;
}

export function validateHotkeyCombo(raw: string): HotkeyValidation {
  const input = raw.trim();
  if (!input) {
    return { valid: false, normalized: null, display: null, error: "Shortcut cannot be empty.", warning: null };
  }

  if (input === "?") {
    return { valid: true, normalized: "?", display: "?", error: null, warning: null };
  }

  const parts = input.split("+").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) {
    return { valid: false, normalized: null, display: null, error: "Invalid shortcut format.", warning: null };
  }

  const modifiers: Modifier[] = [];
  let keyPart: string | null = null;

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === "ctrl" || lower === "control" || lower === "cmd" || lower === "meta") {
      if (modifiers.includes("Ctrl")) {
        return { valid: false, normalized: null, display: null, error: "Duplicate Ctrl modifier.", warning: null };
      }
      modifiers.push("Ctrl");
      continue;
    }
    if (lower === "alt" || lower === "option") {
      if (modifiers.includes("Alt")) {
        return { valid: false, normalized: null, display: null, error: "Duplicate Alt modifier.", warning: null };
      }
      modifiers.push("Alt");
      continue;
    }
    if (lower === "shift") {
      if (modifiers.includes("Shift")) {
        return { valid: false, normalized: null, display: null, error: "Duplicate Shift modifier.", warning: null };
      }
      modifiers.push("Shift");
      continue;
    }
    if (keyPart !== null) {
      return {
        valid: false,
        normalized: null,
        display: null,
        error: "Use one key with modifiers, e.g. Alt+Shift+R.",
        warning: null,
      };
    }
    keyPart = part;
  }

  if (!keyPart) {
    return {
      valid: false,
      normalized: null,
      display: null,
      error: "Include a letter or function key (e.g. R, F5).",
      warning: null,
    };
  }

  if (keyPart === "/" && modifiers.includes("Shift") && modifiers.length === 1) {
    return { valid: true, normalized: "?", display: "?", error: null, warning: null };
  }

  const normalized = buildCanonical(modifiers, keyPart);
  const display = buildDisplay(modifiers, keyPart);
  if (!normalized || !display) {
    return { valid: false, normalized: null, display: null, error: "Unrecognized key.", warning: null };
  }

  const token = normalizeKeyToken(keyPart)!;
  let warning: string | null = null;

  const isAllowedSingle =
    normalized === "?" || ALLOWED_SINGLE_KEYS.has(token) || FUNCTION_KEY.test(token);

  if (modifiers.length === 0 && !isAllowedSingle) {
    return {
      valid: false,
      normalized: null,
      display: null,
      error: "Add Alt, Ctrl, or Shift so the shortcut does not conflict with typing.",
      warning: null,
    };
  }

  if (modifiers.length === 0 && isAllowedSingle && token !== "?" && !FUNCTION_KEY.test(token)) {
    warning = "Single-key shortcuts may conflict with normal typing.";
  }

  return { valid: true, normalized, display, error: null, warning };
}

export function eventToHotkeyCombo(e: KeyboardEvent): string | null {
  if (MODIFIER_EVENT_KEYS.has(e.key)) return null;

  const modifiers: Modifier[] = [];
  if (e.ctrlKey || e.metaKey) modifiers.push("Ctrl");
  if (e.altKey) modifiers.push("Alt");

  if (e.key === "?") {
    return "?";
  }

  if (e.shiftKey) modifiers.push("Shift");

  const display = buildDisplay(modifiers, e.key);
  if (!display) return null;

  const validated = validateHotkeyCombo(display);
  return validated.valid ? validated.display! : display;
}

export function matchesHotkeyCombo(e: KeyboardEvent, combo: string): boolean {
  const fromEvent = eventToHotkeyCombo(e);
  if (!fromEvent) return false;

  const target = validateHotkeyCombo(combo);
  if (!target.valid || !target.normalized) return false;

  const pressed = validateHotkeyCombo(fromEvent);
  if (!pressed.valid || !pressed.normalized) return false;

  return pressed.normalized.toLowerCase() === target.normalized.toLowerCase();
}

export function formatHotkeyDisplay(combo: string): string {
  const v = validateHotkeyCombo(combo);
  if (v.valid && v.display) return v.display;
  return combo.trim();
}

export function resolveActiveHotkeys(
  actions: { id: string; label: string; defaultKey: string }[],
  prefs: { hotkeyOverrides: Record<string, string>; hotkeysDisabled: string[] },
): ResolvedHotkey[] {
  const resolved: ResolvedHotkey[] = [];

  for (const action of actions) {
    if (prefs.hotkeysDisabled.includes(action.id)) continue;
    const raw = prefs.hotkeyOverrides[action.id] ?? action.defaultKey;
    const validation = validateHotkeyCombo(raw);
    if (!validation.valid || !validation.normalized || !validation.display) continue;
    resolved.push({
      actionId: action.id,
      label: action.label,
      normalized: validation.normalized.toLowerCase(),
      display: validation.display,
    });
  }

  return resolved;
}

export function findHotkeyDuplicates(
  actions: { id: string; label: string; defaultKey: string }[],
  prefs: { hotkeyOverrides: Record<string, string>; hotkeysDisabled: string[] },
): HotkeyDuplicateGroup[] {
  const active = resolveActiveHotkeys(actions, prefs);
  const byCombo = new Map<string, HotkeyDuplicateGroup>();

  for (const item of active) {
    const existing = byCombo.get(item.normalized);
    if (existing) {
      existing.actions.push({ id: item.actionId, label: item.label });
    } else {
      byCombo.set(item.normalized, {
        normalized: item.normalized,
        display: item.display,
        actions: [{ id: item.actionId, label: item.label }],
      });
    }
  }

  return [...byCombo.values()].filter((g) => g.actions.length > 1);
}

export function getHotkeyConflicts(
  actions: { id: string; label: string; defaultKey: string }[],
  prefs: { hotkeyOverrides: Record<string, string>; hotkeysDisabled: string[] },
  actionId: string,
  rawCombo: string,
): string[] {
  const validation = validateHotkeyCombo(rawCombo);
  if (!validation.valid || !validation.normalized) return [];

  const id = validation.normalized.toLowerCase();
  return resolveActiveHotkeys(actions, prefs)
    .filter((h) => h.normalized === id && h.actionId !== actionId)
    .map((h) => h.label);
}

export function duplicateHotkeyMessage(conflicts: string[], combo: string): string {
  const display = formatHotkeyDisplay(combo);
  if (conflicts.length === 0) return "";
  if (conflicts.length === 1) {
    return `${display} is already used by “${conflicts[0]}”.`;
  }
  return `${display} is already used by ${conflicts.length} actions: ${conflicts.join(", ")}.`;
}

export function duplicateGroupsMessage(groups: HotkeyDuplicateGroup[]): string {
  if (groups.length === 0) return "";
  const lines = groups.map((g) => {
    const names = g.actions.map((a) => a.label).join(", ");
    return `${g.display} → ${names}`;
  });
  return `Duplicate shortcuts detected: ${lines.join("; ")}`;
}

export function getHotkeyFieldState(
  actions: { id: string; label: string; defaultKey: string }[],
  prefs: { hotkeyOverrides: Record<string, string>; hotkeysDisabled: string[] },
  actionId: string,
  rawCombo: string,
  enabled: boolean,
): { error: string | null; warning: string | null; display: string | null } {
  if (!enabled) return { error: null, warning: null, display: null };

  const validation = validateHotkeyCombo(rawCombo);
  if (!validation.valid) {
    return { error: validation.error, warning: null, display: null };
  }

  const conflicts = getHotkeyConflicts(actions, prefs, actionId, rawCombo);
  const conflictMsg = duplicateHotkeyMessage(conflicts, rawCombo);

  return {
    error: conflictMsg || null,
    warning: validation.warning,
    display: validation.display,
  };
}
