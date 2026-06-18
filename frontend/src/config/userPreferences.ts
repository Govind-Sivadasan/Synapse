import { NavItem, NavSection, navSections } from "./navigation";
import { validateHotkeyCombo } from "../lib/hotkeys";

export {
  formatHotkeyDisplay,
  matchesHotkeyCombo as matchesCombo,
  eventToHotkeyCombo as eventToCombo,
} from "../lib/hotkeys";

const PREFS_PREFIX = "synapse.user.prefs";

export interface SidebarSectionConfig {
  id: string;
  label: string;
  paths: string[];
}

export type NotificationPosition = "top-right" | "top-left" | "bottom-right" | "bottom-left";

export type NotificationDurationScale = "short" | "normal" | "long";

export type NotificationProgressDirection = "left-to-right" | "right-to-left";

export interface UserPreferences {
  /** null = built-in default layout */
  sidebarSections: SidebarSectionConfig[] | null;
  /** action id -> key combo string e.g. "Alt+Shift+R" */
  hotkeyOverrides: Record<string, string>;
  /** action ids disabled by user */
  hotkeysDisabled: string[];
  notificationPosition: NotificationPosition;
  notificationDurationScale: NotificationDurationScale;
  notificationShowProgress: boolean;
  notificationProgressDirection: NotificationProgressDirection;
}

export interface HotkeyAction {
  id: string;
  label: string;
  defaultKey: string;
  /** path for nav actions */
  path?: string;
  category: "Navigation" | "Interface";
}

export const HOTKEY_ACTIONS: HotkeyAction[] = [
  { id: "nav.dashboard", label: "Dashboard", defaultKey: "Shift+D", path: "/dashboard", category: "Navigation" },
  { id: "nav.routing-monitor", label: "Routing Monitor", defaultKey: "Shift+R", path: "/routing-monitor", category: "Navigation" },
  { id: "nav.migration-jobs", label: "Migration Jobs", defaultKey: "Shift+M", path: "/migration-jobs", category: "Navigation" },
  { id: "nav.reports", label: "Reports", defaultKey: "Alt+Shift+P", path: "/reports", category: "Navigation" },
  { id: "nav.audit-logs", label: "Audit Logs", defaultKey: "Shift+A", path: "/audit-logs", category: "Navigation" },
  { id: "nav.chatbot", label: "Chatbot", defaultKey: "Shift+C", path: "/chatbot", category: "Navigation" },
  { id: "nav.nodes", label: "Nodes", defaultKey: "Shift+N", path: "/nodes", category: "Navigation" },
  { id: "nav.settings", label: "Settings", defaultKey: "Shift+S", path: "/settings", category: "Navigation" },
  { id: "ui.toggle-sidebar", label: "Toggle sidebar", defaultKey: "Alt+S", category: "Interface" },
  { id: "ui.toggle-chatbot", label: "Toggle chat widget", defaultKey: "Alt+C", category: "Interface" },
  { id: "ui.hotkeys-help", label: "Show keyboard shortcuts", defaultKey: "?", category: "Interface" },
];

const DEFAULT_PREFS: UserPreferences = {
  sidebarSections: null,
  hotkeyOverrides: {},
  hotkeysDisabled: [],
  notificationPosition: "top-right",
  notificationDurationScale: "normal",
  notificationShowProgress: true,
  notificationProgressDirection: "right-to-left",
};

function storageKey(username: string) {
  return `${PREFS_PREFIX}.${username || "default"}`;
}

export function loadUserPreferences(username: string): UserPreferences {
  try {
    const raw = localStorage.getItem(storageKey(username));
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return {
      sidebarSections: parsed.sidebarSections ?? null,
      hotkeyOverrides: parsed.hotkeyOverrides ?? {},
      hotkeysDisabled: parsed.hotkeysDisabled ?? [],
      notificationPosition: parsed.notificationPosition ?? "top-right",
      notificationDurationScale: parsed.notificationDurationScale ?? "normal",
      notificationShowProgress: parsed.notificationShowProgress ?? true,
      notificationProgressDirection: parsed.notificationProgressDirection ?? "right-to-left",
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveUserPreferences(username: string, prefs: UserPreferences) {
  localStorage.setItem(storageKey(username), JSON.stringify(prefs));
}

export function resetUserPreferences(username: string) {
  localStorage.removeItem(storageKey(username));
}

/** Flat catalog of all nav items (for sidebar editor). */
export function getNavCatalog(): NavItem[] {
  const seen = new Set<string>();
  const items: NavItem[] = [];
  for (const section of navSections) {
    for (const item of section.items) {
      if (!seen.has(item.path)) {
        seen.add(item.path);
        items.push(item);
      }
    }
  }
  return items;
}

export function defaultSidebarConfig(): SidebarSectionConfig[] {
  return navSections.map((section) => ({
    id: section.label.toLowerCase().replace(/\s+/g, "-"),
    label: section.label,
    paths: section.items.map((i) => i.path),
  }));
}

function itemByPath(path: string): NavItem | undefined {
  return getNavCatalog().find((i) => i.path === path);
}

/** Merge user sidebar layout with role visibility and built-in nav metadata. */
export function resolveNavSections(roles: string[], prefs: UserPreferences): NavSection[] {
  const catalog = getNavCatalog();
  const visiblePaths = new Set(
    catalog.filter((item) => item.roles.some((r) => roles.includes(r))).map((i) => i.path),
  );

  const sectionConfigs = prefs.sidebarSections ?? defaultSidebarConfig();
  const used = new Set<string>();
  const sections: NavSection[] = [];

  for (const config of sectionConfigs) {
    const items: NavItem[] = [];
    for (const path of config.paths) {
      if (!visiblePaths.has(path) || used.has(path)) continue;
      const item = itemByPath(path);
      if (item) {
        items.push(item);
        used.add(path);
      }
    }
    if (items.length > 0) {
      sections.push({ label: config.label, items });
    }
  }

  const remaining = [...visiblePaths].filter((p) => !used.has(p));
  if (remaining.length > 0) {
    sections.push({
      label: "Other",
      items: remaining.map((p) => itemByPath(p)).filter(Boolean) as NavItem[],
    });
  }

  return sections;
}

export function getHotkeyBinding(actionId: string, prefs: UserPreferences): string | null {
  if (prefs.hotkeysDisabled.includes(actionId)) return null;
  const raw = prefs.hotkeyOverrides[actionId] ?? HOTKEY_ACTIONS.find((a) => a.id === actionId)?.defaultKey ?? null;
  if (!raw) return null;
  const v = validateHotkeyCombo(raw);
  return v.valid ? v.display : raw;
}
