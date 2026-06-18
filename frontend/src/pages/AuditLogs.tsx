import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, RefreshCw } from "lucide-react";
import { apiFetch, downloadFile } from "../api/client";
import DataTable from "../components/DataTable";
import TableSearch from "../components/ui/TableSearch";
import BarChart from "../components/ui/BarChart";
import PageHeader from "../components/ui/PageHeader";
import EventBadge from "../components/ui/EventBadge";
import { PageLoading } from "../components/ui/LoadingScreen";
import ActionButton from "../components/ui/ActionButton";
import { useNotifications } from "../services/notifications";
import { AuditLog, AuditLogList, ChartDataPoint } from "../types/api";

function formatDetails(details: Record<string, unknown> | null): string {
  if (!details) return "—";
  const parts = Object.entries(details)
    .filter(([k]) => k !== "username")
    .slice(0, 4)
    .map(([k, v]) => {
      const val = typeof v === "object" ? JSON.stringify(v) : String(v);
      const short = val.length > 40 ? `${val.slice(0, 40)}…` : val;
      return `${k}: ${short}`;
    });
  return parts.join(" · ") || "—";
}

function auditUserLabel(log: AuditLog): { primary: string; secondary?: string } {
  if (log.username) {
    return {
      primary: log.username,
      secondary: log.user_id ? `${log.user_id.slice(0, 8)}…` : undefined,
    };
  }
  if (log.user_id) {
    return { primary: `${log.user_id.slice(0, 8)}…`, secondary: log.user_id };
  }
  return { primary: "—" };
}

export default function AuditLogs() {
  const { success, error: notifyError } = useNotifications();
  const [eventType, setEventType] = useState("");
  const [userId, setUserId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    setPage(0);
  }, [eventType, userId, dateFrom, dateTo, search]);

  const { data: eventTypes = [] } = useQuery({
    queryKey: ["audit-event-types"],
    queryFn: () => apiFetch<string[]>("/api/v1/audit-logs/event-types"),
    staleTime: 60 * 1000,
  });

  const { data, isLoading, refetch, error } = useQuery({
    queryKey: ["audit-logs", eventType, userId, dateFrom, dateTo, search, page],
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(page * pageSize),
      });
      if (eventType) params.set("event_type", eventType);
      if (userId) params.set("user_id", userId);
      if (search) params.set("search", search);
      if (dateFrom) params.set("date_from", new Date(dateFrom).toISOString());
      if (dateTo) params.set("date_to", new Date(`${dateTo}T23:59:59`).toISOString());
      return apiFetch<AuditLogList>(`/api/v1/audit-logs?${params}`);
    },
  });

  useEffect(() => {
    if (error) notifyError((error as Error).message);
  }, [error, notifyError]);

  const { data: auditSummary = [] } = useQuery({
    queryKey: ["audit-summary", 7],
    queryFn: () => apiFetch<ChartDataPoint[]>("/api/v1/reports/audit/summary?days=7"),
  });

  const logs: AuditLog[] = data?.items ?? [];

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({ days: "30" });
      if (eventType) params.set("event_type", eventType);
      if (userId) params.set("user_id", userId);
      await downloadFile(`/api/v1/reports/audit/export?${params}`, "synapse-audit.csv");
      success("Audit log export started.");
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        description="Immutable record of configuration changes, routing events, and user activity."
        actions={
          <>
            <ActionButton variant="secondary" icon={<RefreshCw size={16} />} onClick={() => refetch()}>
              Refresh
            </ActionButton>
            <ActionButton icon={<Download size={16} />} onClick={handleExport} disabled={exporting}>
              {exporting ? "Exporting…" : "Export CSV"}
            </ActionButton>
          </>
        }
      />

      {auditSummary.length > 0 && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h3 className="card-title">Last 7 Days — Events by Type</h3>
          <BarChart data={auditSummary} color="var(--color-warning)" />
        </div>
      )}

      <div className="card">
        <div className="form-grid" style={{ marginBottom: "1rem" }}>
          <div className="form-field">
            <label>Event Type</label>
            <select value={eventType} onChange={(e) => setEventType(e.target.value)}>
              <option value="">All events</option>
              {eventTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>User</label>
            <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="Username or Keycloak user ID" />
          </div>
          <div className="form-field">
            <label>Date From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="form-field">
            <label>Date To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>

        <TableSearch
          value={search}
          onChange={setSearch}
          placeholder="Search event, user, entity, details…"
        />

        {isLoading ? (
          <PageLoading label="Loading audit logs…" compact />
        ) : (
          <DataTable
            data={logs}
            keyField="id"
            serverPagination={{
              page,
              pageSize,
              total: data?.total ?? 0,
              onPageChange: setPage,
            }}
            columns={[
              {
                key: "created_at",
                header: "Timestamp",
                render: (l) => new Date(l.created_at).toLocaleString(),
              },
              {
                key: "event_type",
                header: "Event",
                render: (l) => <EventBadge eventType={l.event_type} />,
              },
              {
                key: "user_id",
                header: "User",
                render: (l) => {
                  const user = auditUserLabel(l);
                  return (
                    <span className="audit-user-cell" title={user.secondary ?? user.primary}>
                      <strong>{user.primary}</strong>
                      {user.secondary && user.username && (
                        <span className="audit-user-cell-id">{user.secondary}</span>
                      )}
                    </span>
                  );
                },
              },
              { key: "entity_type", header: "Entity", render: (l) => l.entity_type ?? "—" },
              {
                key: "details",
                header: "Details",
                render: (l) => (
                  <span style={{ fontSize: "0.8125rem" }} title={l.details ? JSON.stringify(l.details) : ""}>
                    {formatDetails(l.details)}
                  </span>
                ),
              },
            ]}
          />
        )}
      </div>
    </div>
  );
}
