import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Pagination from "./ui/Pagination";
import TableSearch from "./ui/TableSearch";

interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  width?: number;
  minWidth?: number;
}

interface Props<T> {
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
  serverPagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
  };
}

const DEFAULT_COL_WIDTH = 140;
const DEFAULT_MIN_WIDTH = 72;

function buildInitialWidths<T>(columns: Column<T>[]): Record<string, number> {
  const widths: Record<string, number> = {};
  for (const col of columns) {
    widths[col.key] = col.width ?? DEFAULT_COL_WIDTH;
  }
  return widths;
}

function rowMatchesSearch<T extends Record<string, unknown>>(
  row: T,
  query: string,
  keys?: (keyof T)[],
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const fields = keys?.length ? keys : (Object.keys(row) as (keyof T)[]);
  return fields.some((key) => String(row[key] ?? "").toLowerCase().includes(q));
}

export default function DataTable<T extends Record<string, unknown>>({
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
  serverPagination,
}: Props<T>) {
  const [internalSearch, setInternalSearch] = useState("");
  const [clientPage, setClientPage] = useState(0);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() =>
    buildInitialWidths(columns),
  );
  const tableRef = useRef<HTMLTableElement>(null);
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

  const search = searchValue ?? internalSearch;
  const setSearch = onSearchChange ?? setInternalSearch;
  const usingServerPagination = !!serverPagination;

  useEffect(() => {
    setColumnWidths((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const col of columns) {
        if (next[col.key] == null) {
          next[col.key] = col.width ?? DEFAULT_COL_WIDTH;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [columnKeys, columns]);

  const filteredData = useMemo(() => {
    if (usingServerPagination || !searchable || !search.trim()) return data;
    return data.filter((row) => rowMatchesSearch(row, search, searchKeys));
  }, [data, searchable, search, searchKeys, usingServerPagination]);

  useEffect(() => {
    setClientPage(0);
  }, [search, data.length]);

  const activePage = usingServerPagination ? serverPagination.page : clientPage;
  const activePageSize = usingServerPagination ? serverPagination.pageSize : pageSize;
  const total = usingServerPagination ? serverPagination.total : filteredData.length;

  const pageData = useMemo(() => {
    if (!paginate && !usingServerPagination) return filteredData;
    if (usingServerPagination) return data;
    const start = activePage * activePageSize;
    return filteredData.slice(start, start + activePageSize);
  }, [filteredData, data, paginate, usingServerPagination, activePage, activePageSize]);

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

    setColumnWidths((prev) => ({
      ...prev,
      [state.key]: nextWidth,
      [state.partnerKey]: partnerWidth,
    }));
  }, []);

  const handleResizeEnd = useCallback(() => {
    resizeRef.current = null;
    document.removeEventListener("mousemove", handleResizeMove);
    document.removeEventListener("mouseup", handleResizeEnd);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, [handleResizeMove]);

  const startResize = (key: string, index: number, event: React.MouseEvent) => {
    if (!resizable) return;
    const partnerKey = columns[index + 1]?.key ?? columns[index - 1]?.key;
    if (!partnerKey) return;

    event.preventDefault();
    event.stopPropagation();

    const col = columns[index];
    const partnerCol = columns.find((c) => c.key === partnerKey);

    resizeRef.current = {
      key,
      partnerKey,
      startX: event.clientX,
      startWidth: columnWidths[key] ?? DEFAULT_COL_WIDTH,
      startPartnerWidth: columnWidths[partnerKey] ?? DEFAULT_COL_WIDTH,
      minWidth: col.minWidth ?? DEFAULT_MIN_WIDTH,
      minPartnerWidth: partnerCol?.minWidth ?? DEFAULT_MIN_WIDTH,
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", handleResizeEnd);
  };

  useEffect(() => () => handleResizeEnd(), [handleResizeEnd]);

  return (
    <div className="data-table-panel">
      {searchable && (
        <TableSearch
          value={search}
          onChange={setSearch}
          placeholder={searchPlaceholder ?? "Search records…"}
        />
      )}

      {pageData.length === 0 ? (
        <p className="empty-message">{emptyMessage}</p>
      ) : (
        <div className="table-wrap">
          <table ref={tableRef} className="data-table">
            <colgroup>
              {columns.map((col) => (
                <col
                  key={col.key}
                  style={{
                    width: columnWidths[col.key] ?? DEFAULT_COL_WIDTH,
                    minWidth: col.minWidth ?? DEFAULT_MIN_WIDTH,
                  }}
                />
              ))}
            </colgroup>
            <thead>
              <tr>
                {columns.map((col, index) => (
                  <th
                    key={col.key}
                    style={{
                      width: columnWidths[col.key] ?? DEFAULT_COL_WIDTH,
                      minWidth: col.minWidth ?? DEFAULT_MIN_WIDTH,
                    }}
                    className={resizable ? "data-table-th--resizable" : undefined}
                  >
                    <span className="data-table-th-label">{col.header}</span>
                    {resizable && index < columns.length - 1 && (
                      <span
                        className="data-table-col-resize"
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`Resize ${col.header} column`}
                        onMouseDown={(event) => startResize(col.key, index, event)}
                      />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageData.map((row) => (
                <tr key={String(row[keyField])}>
                  {columns.map((col) => (
                    <td key={col.key}>{col.render ? col.render(row) : String(row[col.key] ?? "")}</td>
                  ))}
                </tr>
              ))}
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
    </div>
  );
}
