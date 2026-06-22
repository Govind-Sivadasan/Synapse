import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Columns3 } from "lucide-react";
import Pagination from "./ui/Pagination";
import TableSearch from "./ui/TableSearch";
import ColumnHeaderMenu, { SortDir } from "./table/ColumnHeaderMenu";
import ManageColumnsPanel from "./table/ManageColumnsPanel";
import {
  ColumnPin,
  ACTIONS_COLUMN_WIDTH,
  loadTableColumnPrefs,
  mergeStoredColumnWidths,
  saveTableColumnPrefs,
  TableColumnPrefs,
} from "../lib/tableColumnPrefs";

export type { SortDir };

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  width?: number;
  minWidth?: number;
  sortable?: boolean;
  sortKey?: string;
  sortValue?: (row: T) => string | number | null | undefined;
  hideable?: boolean;
  pinnable?: boolean;
  defaultPin?: ColumnPin;
}

export interface ServerSortState {
  sortBy: string | null;
  sortDir: SortDir;
  defaultSort?: { sortBy: string; sortDir: SortDir };
  onSortChange: (sortBy: string | null, sortDir: SortDir | null) => void;
}

interface Props<T> {
  tableId?: string;
  columns: Column<T>[];
  data: T[];
  keyField: keyof T;
  emptyMessage?: string;
  pageSize?: number;
  paginate?: boolean;
  searchable?: boolean;
  searchKeys?: (keyof T)[];
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  resizable?: boolean;
  columnManagement?: boolean;
  serverSort?: ServerSortState;
  defaultClientSort?: { sortBy: string; sortDir: SortDir };
  serverPagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
  };
  /** Open detail/edit view when a row is clicked (not actions or other controls). */
  onRowClick?: (row: T) => void;
  /** Highlight the active row (e.g. while a detail modal is open). */
  selectedRowId?: string | null;
}

const DEFAULT_MIN_WIDTH = 72;

const EMPTY_COLUMN_PREFS: TableColumnPrefs = { hidden: [], pinned: {} };

function defaultColWidth<T extends { key: string; width?: number; minWidth?: number }>(col: T): number {
  if (col.key === "actions") {
    return col.minWidth ?? col.width ?? ACTIONS_COLUMN_WIDTH;
  }
  return col.minWidth ?? col.width ?? DEFAULT_MIN_WIDTH;
}

function measureColumnWidths<T extends { key: string; width?: number; minWidth?: number }>(
  table: HTMLTableElement,
  columns: T[],
): Record<string, number> {
  const headers = table.querySelectorAll("thead th");
  const widths: Record<string, number> = {};
  columns.forEach((col, index) => {
    const th = headers[index] as HTMLElement | undefined;
    widths[col.key] = Math.round(th?.getBoundingClientRect().width ?? defaultColWidth(col));
  });
  return widths;
}

function rowMatchesSearch<T extends object>(
  row: T,
  query: string,
  keys?: (keyof T)[],
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const record = row as Record<string, unknown>;
  const fields = keys?.length ? keys : (Object.keys(record) as (keyof T)[]);
  return fields.some((key) => String(record[key as string] ?? "").toLowerCase().includes(q));
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

function isColumnSortable<T>(col: Column<T>): boolean {
  if (col.sortable === false || col.key === "actions") return false;
  return true;
}

function isColumnHideable<T>(col: Column<T>): boolean {
  if (col.hideable === false || col.key === "actions") return false;
  return true;
}

function isColumnPinnable<T>(col: Column<T>): boolean {
  if (col.key === "actions") return false;
  return col.pinnable !== false;
}

function canResizeColumn<T extends { key: string }>(columns: T[], index: number): boolean {
  const col = columns[index];
  const next = columns[index + 1];
  if (!col || col.key === "actions") return false;
  if (!next || next.key === "actions") return false;
  return true;
}

function buildColumnWidths<T extends { key: string; width?: number; minWidth?: number }>(
  columns: T[],
  existing: Record<string, number>,
): Record<string, number> {
  const widths: Record<string, number> = {};
  for (const col of columns) {
    widths[col.key] = existing[col.key] ?? defaultColWidth(col);
  }
  return clampActionsColumnWidth(columns, widths);
}

function colWidthStyle<T extends { key: string; width?: number; minWidth?: number }>(
  col: T,
  widths: Record<string, number>,
): { width?: number; minWidth?: number } {
  const minWidth = col.minWidth ?? DEFAULT_MIN_WIDTH;
  const width = widths[col.key] ?? defaultColWidth(col);
  return { width, minWidth };
}

function clampActionsColumnWidth<T extends { key: string; width?: number; minWidth?: number }>(
  columns: T[],
  widths: Record<string, number>,
): Record<string, number> {
  return { ...widths };
}

function resolvePin<T>(col: Column<T>, pinned: Record<string, Exclude<ColumnPin, null>>): ColumnPin {
  if (col.key === "actions") return null;
  return pinned[col.key] ?? col.defaultPin ?? null;
}

function orderColumns<T>(columns: Column<T>[], pinned: Record<string, Exclude<ColumnPin, null>>) {
  const left: Column<T>[] = [];
  const center: Column<T>[] = [];
  const right: Column<T>[] = [];

  for (const col of columns) {
    const pin = resolvePin(col, pinned);
    if (pin === "left") left.push(col);
    else if (pin === "right") right.push(col);
    else center.push(col);
  }

  return [...left, ...center, ...right];
}

export default function DataTable<T extends object>({
  tableId,
  columns,
  data,
  keyField,
  emptyMessage = "No records found.",
  pageSize = 10,
  paginate = false,
  searchable = false,
  searchKeys,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  resizable = true,
  columnManagement,
  serverSort,
  defaultClientSort,
  serverPagination,
  onRowClick,
  selectedRowId,
}: Props<T>) {
  const manageColumns = columnManagement ?? Boolean(tableId);
  const [internalSearch, setInternalSearch] = useState("");
  const [clientPage, setClientPage] = useState(0);
  const [clientSortBy, setClientSortBy] = useState<string | null>(
    defaultClientSort?.sortBy ?? null,
  );
  const [clientSortDir, setClientSortDir] = useState<SortDir>(defaultClientSort?.sortDir ?? "asc");
  const initialPrefs = tableId ? loadTableColumnPrefs(tableId) : EMPTY_COLUMN_PREFS;

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() =>
    mergeStoredColumnWidths(columns, initialPrefs.widths, defaultColWidth),
  );
  const [layoutLocked, setLayoutLocked] = useState(
    () => Boolean(tableId && initialPrefs.widths && Object.keys(initialPrefs.widths).length > 0),
  );
  const [isResizing, setIsResizing] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [columnPrefs, setColumnPrefs] = useState<TableColumnPrefs>(() => initialPrefs);
  const tableRef = useRef<HTMLTableElement>(null);
  const columnWidthsRef = useRef(columnWidths);
  const columnPrefsRef = useRef(columnPrefs);
  const layoutLockedRef = useRef(layoutLocked);
  const resizeRef = useRef<{
    key: string;
    partnerKey: string;
    startX: number;
    startWidth: number;
    startPartnerWidth: number;
    minWidth: number;
    minPartnerWidth: number;
  } | null>(null);

  const columnKeys = useMemo(() => columns.map((col) => col.key).join("|"), [columns]);
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  columnWidthsRef.current = columnWidths;
  columnPrefsRef.current = columnPrefs;
  layoutLockedRef.current = layoutLocked;

  const persistTableLayout = useCallback(
    (prefs: TableColumnPrefs, widths: Record<string, number>) => {
      if (!tableId) return;
      saveTableColumnPrefs(tableId, { ...prefs, widths });
    },
    [tableId],
  );

  useEffect(() => {
    if (!tableId) return;
    const prefs = loadTableColumnPrefs(tableId);
    setColumnPrefs(prefs);
    setColumnWidths((prev) =>
      clampActionsColumnWidth(
        columnsRef.current,
        mergeStoredColumnWidths(
          columnsRef.current,
          prefs.widths ?? prev,
          defaultColWidth,
        ),
      ),
    );
    if (prefs.widths && Object.keys(prefs.widths).length > 0) {
      setLayoutLocked(true);
    }
  }, [tableId, columnKeys]);

  const persistPrefs = useCallback(
    (next: TableColumnPrefs) => {
      setColumnPrefs(next);
      persistTableLayout(next, columnWidthsRef.current);
    },
    [persistTableLayout],
  );

  const persistWidths = useCallback(
    (widths: Record<string, number>) => {
      const clamped = clampActionsColumnWidth(columnsRef.current, widths);
      columnWidthsRef.current = clamped;
      if (!tableId) return;
      persistTableLayout(columnPrefsRef.current, clamped);
    },
    [persistTableLayout, tableId],
  );

  const hiddenSet = useMemo(() => new Set(columnPrefs.hidden), [columnPrefs.hidden]);

  const visibleColumns = useMemo(() => {
    const shown = columns.filter((col) => !hiddenSet.has(col.key));
    return orderColumns(shown, columnPrefs.pinned);
  }, [columns, hiddenSet, columnPrefs.pinned]);

  const search = searchValue ?? internalSearch;
  const setSearch = onSearchChange ?? setInternalSearch;
  const usingServerPagination = !!serverPagination;
  const usingServerSort = !!serverSort;

  useEffect(() => {
    setColumnWidths((prev) => {
      const next = clampActionsColumnWidth(columnsRef.current, { ...prev });
      let changed = false;
      for (const col of columnsRef.current) {
        if (next[col.key] == null) {
          next[col.key] = defaultColWidth(col);
          changed = true;
        }
      }
      return changed || next.actions !== prev.actions ? next : prev;
    });
  }, [columnKeys]);

  const filteredData = useMemo(() => {
    if (usingServerPagination || !searchable || !search.trim()) return data;
    return data.filter((row) => rowMatchesSearch(row, search, searchKeys));
  }, [data, searchable, search, searchKeys, usingServerPagination]);

  const sortedData = useMemo(() => {
    if (usingServerSort) return filteredData;

    const sortBy = clientSortBy;
    if (!sortBy) return filteredData;

    const col = columns.find((c) => c.key === sortBy);
    if (!col || !isColumnSortable(col)) return filteredData;

    const dir = clientSortDir === "asc" ? 1 : -1;
    return [...filteredData].sort((rowA, rowB) => {
      const a = col.sortValue ? col.sortValue(rowA) : (rowA as Record<string, unknown>)[col.key];
      const b = col.sortValue ? col.sortValue(rowB) : (rowB as Record<string, unknown>)[col.key];
      return compareValues(a, b) * dir;
    });
  }, [filteredData, usingServerSort, clientSortBy, clientSortDir, columns]);

  useEffect(() => {
    setClientPage(0);
  }, [search, data.length, clientSortBy, clientSortDir]);

  const activePage = usingServerPagination ? serverPagination.page : clientPage;
  const activePageSize = usingServerPagination ? serverPagination.pageSize : pageSize;
  const total = usingServerPagination ? serverPagination.total : sortedData.length;

  const pageData = useMemo(() => {
    if (!paginate && !usingServerPagination) return sortedData;
    if (usingServerPagination) return data;
    const start = activePage * activePageSize;
    return sortedData.slice(start, start + activePageSize);
  }, [sortedData, data, paginate, usingServerPagination, activePage, activePageSize]);

  const handleResizeMove = useCallback((event: MouseEvent) => {
    const state = resizeRef.current;
    if (!state) return;

    const delta = event.clientX - state.startX;
    let nextWidth = state.startWidth + delta;
    let partnerWidth = state.startPartnerWidth - delta;

    if (nextWidth < state.minWidth) {
      nextWidth = state.minWidth;
      partnerWidth = state.startWidth + state.startPartnerWidth - state.minWidth;
    }
    if (partnerWidth < state.minPartnerWidth) {
      partnerWidth = state.minPartnerWidth;
      nextWidth = state.startWidth + state.startPartnerWidth - state.minPartnerWidth;
    }

    setColumnWidths((prev) => {
      const next = {
        ...prev,
        [state.key]: Math.round(nextWidth),
        [state.partnerKey]: Math.round(partnerWidth),
      };
      columnWidthsRef.current = next;
      return next;
    });
  }, []);

  const handleResizeEnd = useCallback(() => {
    resizeRef.current = null;
    setIsResizing(false);
    document.removeEventListener("mousemove", handleResizeMove);
    document.removeEventListener("mouseup", handleResizeEnd);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";

    persistWidths(columnWidthsRef.current);
  }, [handleResizeMove, persistWidths]);

  const startResize = (key: string, index: number, event: React.MouseEvent<HTMLSpanElement>) => {
    if (!resizable) return;
    const partnerKey = visibleColumns[index + 1]?.key;
    if (!partnerKey || partnerKey === "actions") return;

    event.preventDefault();
    event.stopPropagation();

    const table = tableRef.current;
    if (!table) return;

    const measured = measureColumnWidths(table, visibleColumns);

    if (!layoutLockedRef.current) {
      flushSync(() => {
        setColumnWidths(measured);
        setLayoutLocked(true);
      });
      layoutLockedRef.current = true;
    } else {
      setColumnWidths(measured);
    }
    columnWidthsRef.current = measured;

    const col = visibleColumns[index];
    const partnerCol = visibleColumns[index + 1];

    resizeRef.current = {
      key,
      partnerKey,
      startX: event.clientX,
      startWidth: measured[key],
      startPartnerWidth: measured[partnerKey],
      minWidth: col.minWidth ?? DEFAULT_MIN_WIDTH,
      minPartnerWidth: partnerCol?.minWidth ?? DEFAULT_MIN_WIDTH,
    };

    setIsResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", handleResizeEnd);
  };

  useEffect(() => () => handleResizeEnd(), [handleResizeEnd]);

  const activeSortBy = usingServerSort ? serverSort.sortBy : clientSortBy;
  const activeSortDir = usingServerSort ? serverSort.sortDir : clientSortDir;

  const handleSort = (col: Column<T>, dir: SortDir) => {
    const sortKey = col.sortKey ?? col.key;
    if (usingServerSort) {
      serverSort.onSortChange(sortKey, dir);
      return;
    }
    setClientSortBy(col.key);
    setClientSortDir(dir);
  };

  const handleUnsort = (col: Column<T>) => {
    const sortKey = col.sortKey ?? col.key;
    const isActive = usingServerSort
      ? serverSort.sortBy === sortKey || serverSort.sortBy === col.key
      : clientSortBy === col.key;

    if (!isActive) return;

    if (usingServerSort) {
      const fallback = serverSort.defaultSort;
      if (fallback) {
        serverSort.onSortChange(fallback.sortBy, fallback.sortDir);
      } else {
        serverSort.onSortChange(null, null);
      }
      return;
    }

    if (defaultClientSort) {
      setClientSortBy(defaultClientSort.sortBy);
      setClientSortDir(defaultClientSort.sortDir);
    } else {
      setClientSortBy(null);
      setClientSortDir("asc");
    }
  };

  const handlePin = (col: Column<T>, pin: ColumnPin) => {
    const nextPinned = { ...columnPrefs.pinned };
    if (pin) nextPinned[col.key] = pin;
    else delete nextPinned[col.key];
    persistPrefs({ ...columnPrefs, pinned: nextPinned });
  };

  const handleHide = (key: string) => {
    if (hiddenSet.has(key)) return;
    persistPrefs({ ...columnPrefs, hidden: [...columnPrefs.hidden, key] });
  };

  const handleToggleColumn = (key: string, visible: boolean) => {
    if (visible) {
      persistPrefs({ ...columnPrefs, hidden: columnPrefs.hidden.filter((k) => k !== key) });
    } else {
      handleHide(key);
    }
  };

  const handleRowClick = (row: T, event: React.MouseEvent<HTMLTableRowElement>) => {
    if (!onRowClick) return;
    const target = event.target as HTMLElement;
    if (target.closest(".row-actions-menu, button, a, input, select, textarea, label, [role='menu']")) {
      return;
    }
    onRowClick(row);
  };

  const leftPinnedKeys = visibleColumns.filter((c) => resolvePin(c, columnPrefs.pinned) === "left").map((c) => c.key);
  const rightPinnedKeys = visibleColumns.filter((c) => resolvePin(c, columnPrefs.pinned) === "right").map((c) => c.key);

  return (
    <div className="data-table-panel">
      {(searchable || manageColumns) && (
        <div className="data-table-toolbar">
          {searchable && (
            <TableSearch
              value={search}
              onChange={setSearch}
              placeholder={searchPlaceholder ?? "Search records…"}
            />
          )}
          {manageColumns && (
            <button
              type="button"
              className="btn-sm btn-secondary data-table-manage-cols"
              onClick={() => setManageOpen(true)}
            >
              <Columns3 size={14} />
              Manage columns
            </button>
          )}
        </div>
      )}

      {pageData.length === 0 ? (
        <p className="empty-message">{emptyMessage}</p>
      ) : (
        <div className={`table-wrap${isResizing ? " table-wrap--resizing" : ""}`}>
          <table
            ref={tableRef}
            className={`data-table${layoutLocked ? " data-table--locked" : ""}${leftPinnedKeys.length || rightPinnedKeys.length ? " data-table--pinned" : ""}`}
          >
            <colgroup>
              {visibleColumns.map((col) => (
                <col key={col.key} style={colWidthStyle(col, columnWidths)} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {visibleColumns.map((col, index) => {
                  const pin = resolvePin(col, columnPrefs.pinned);
                  const isActions = col.key === "actions";
                  const sortKey = col.sortKey ?? col.key;
                  const isSorted = activeSortBy === sortKey || activeSortBy === col.key;
                  const pinClass =
                    pin === "left" && col.key === leftPinnedKeys[leftPinnedKeys.length - 1]
                      ? "data-table-th--pin-left-edge"
                      : pin === "right" && col.key === rightPinnedKeys[0]
                        ? "data-table-th--pin-right-edge"
                        : pin === "left"
                          ? "data-table-th--pin-left"
                          : pin === "right"
                            ? "data-table-th--pin-right"
                            : undefined;

                  return (
                    <th
                      key={col.key}
                      style={colWidthStyle(col, columnWidths)}
                      className={[
                        resizable && !isActions ? "data-table-th--resizable" : undefined,
                        manageColumns && !isActions ? "data-table-th--managed" : undefined,
                        isActions ? "data-table-th--actions" : undefined,
                        pinClass,
                      ]
                        .filter(Boolean)
                        .join(" ") || undefined}
                    >
                      {isActions ? (
                        <span className="data-table-th-label data-table-th-label--actions">{col.header}</span>
                      ) : manageColumns ? (
                        <ColumnHeaderMenu
                          label={col.header}
                          sortable={isColumnSortable(col)}
                          pinnable={isColumnPinnable(col)}
                          hideable={isColumnHideable(col)}
                          pin={pin}
                          activeSortDir={isSorted ? activeSortDir : null}
                          onSort={(dir) => handleSort(col, dir)}
                          onUnsort={() => handleUnsort(col)}
                          onPin={(nextPin) => handlePin(col, nextPin)}
                          onHide={() => handleHide(col.key)}
                          onManageColumns={() => setManageOpen(true)}
                        />
                      ) : (
                        <span className="data-table-th-label">{col.header}</span>
                      )}
                      {resizable && canResizeColumn(visibleColumns, index) && (
                        <span
                          className="data-table-col-resize"
                          role="separator"
                          aria-orientation="vertical"
                          aria-label={`Resize ${col.header} column`}
                          onMouseDown={(event) => startResize(col.key, index, event)}
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {pageData.map((row) => {
                const rowId = String(row[keyField]);
                const isSelected = selectedRowId != null && rowId === selectedRowId;
                const rowClass = [
                  onRowClick ? "data-table-row--clickable" : undefined,
                  isSelected ? "data-table-row--selected" : undefined,
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <tr
                    key={rowId}
                    className={rowClass || undefined}
                    onClick={onRowClick ? (event) => handleRowClick(row, event) : undefined}
                  >
                  {visibleColumns.map((col) => {
                    const pin = resolvePin(col, columnPrefs.pinned);
                    const tdPinClass =
                      pin === "left" && col.key === leftPinnedKeys[leftPinnedKeys.length - 1]
                        ? "data-table-td--pin-left-edge"
                        : pin === "right" && col.key === rightPinnedKeys[0]
                          ? "data-table-td--pin-right-edge"
                          : pin === "left"
                            ? "data-table-td--pin-left"
                            : pin === "right"
                              ? "data-table-td--pin-right"
                              : undefined;

                    return (
                      <td
                        key={col.key}
                        className={[tdPinClass, col.key === "actions" ? "data-table-td--actions" : undefined]
                          .filter(Boolean)
                          .join(" ") || undefined}
                      >
                        {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? "")}
                      </td>
                    );
                  })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {(paginate || usingServerPagination) && (
        <Pagination
          page={activePage}
          pageSize={activePageSize}
          total={total}
          onPageChange={usingServerPagination ? serverPagination.onPageChange : setClientPage}
        />
      )}

      {manageColumns && (
        <ManageColumnsPanel
          open={manageOpen}
          columns={columns.map((col) => ({
            key: col.key,
            header: col.header,
            hideable: isColumnHideable(col),
          }))}
          hiddenKeys={hiddenSet}
          onToggle={handleToggleColumn}
          onShowAll={() => persistPrefs({ ...columnPrefs, hidden: [] })}
          onHideAll={() =>
            persistPrefs({
              ...columnPrefs,
              hidden: columns.filter(isColumnHideable).map((col) => col.key),
            })
          }
          onClose={() => setManageOpen(false)}
        />
      )}
    </div>
  );
}
