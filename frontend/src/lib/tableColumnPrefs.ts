export type ColumnPin = "left" | "right" | null;

export interface TableColumnPrefs {
  hidden: string[];
  pinned: Record<string, Exclude<ColumnPin, null>>;
  widths?: Record<string, number>;
}

const STORAGE_PREFIX = "synapse-table-cols:";
const MIN_STORED_WIDTH = 72;

function storageKey(tableId: string): string {
  return `${STORAGE_PREFIX}${tableId}`;
}

function sanitizeWidths(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  const widths: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value) && value >= MIN_STORED_WIDTH) {
      widths[key] = Math.round(value);
    }
  }
  return widths;
}

export function loadTableColumnPrefs(tableId: string): TableColumnPrefs {
  try {
    const raw = localStorage.getItem(storageKey(tableId));
    if (!raw) return { hidden: [], pinned: {} };
    const parsed = JSON.parse(raw) as TableColumnPrefs;
    return {
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden : [],
      pinned: parsed.pinned && typeof parsed.pinned === "object" ? parsed.pinned : {},
      widths: sanitizeWidths(parsed.widths),
    };
  } catch {
    return { hidden: [], pinned: {} };
  }
}

export function saveTableColumnPrefs(tableId: string, prefs: TableColumnPrefs): void {
  try {
    const payload: TableColumnPrefs = {
      hidden: prefs.hidden,
      pinned: prefs.pinned,
    };
    if (prefs.widths && Object.keys(prefs.widths).length > 0) {
      payload.widths = prefs.widths;
    }
    localStorage.setItem(storageKey(tableId), JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}

export function mergeStoredColumnWidths<T extends { key: string; width?: number; minWidth?: number }>(
  columns: T[],
  stored: Record<string, number> | undefined,
  fallbackFor: (col: T) => number,
): Record<string, number> {
  const widths: Record<string, number> = {};
  for (const col of columns) {
    const min = col.minWidth ?? MIN_STORED_WIDTH;
    const saved = stored?.[col.key];
    if (typeof saved === "number" && saved >= min) {
      widths[col.key] = saved;
    } else {
      widths[col.key] = fallbackFor(col);
    }
  }
  return widths;
}
