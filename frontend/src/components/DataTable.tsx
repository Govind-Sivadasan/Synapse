import { ReactNode, useEffect, useMemo, useState } from "react";
import Pagination from "./ui/Pagination";
import TableSearch from "./ui/TableSearch";

interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
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
  serverPagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
  };
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
  serverPagination,
}: Props<T>) {
  const [internalSearch, setInternalSearch] = useState("");
  const [clientPage, setClientPage] = useState(0);

  const search = searchValue ?? internalSearch;
  const setSearch = onSearchChange ?? setInternalSearch;
  const usingServerPagination = !!serverPagination;

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
          <table className="data-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.key}>{col.header}</th>
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
