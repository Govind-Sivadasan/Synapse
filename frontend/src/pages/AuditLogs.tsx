import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, RefreshCw } from "lucide-react";
import { apiFetch, downloadFile } from "../api/client";
import DataTable from "../components/DataTable";
import BarChart from "../components/ui/BarChart";
import PageHeader from "../components/ui/PageHeader";
import StatusBadge from "../components/ui/StatusBadge";
import { PageLoading } from "../components/ui/LoadingScreen";
import { AuditLog, AuditLogList, ChartDataPoint } from "../types/api";

const EVENT_TYPES = [
  "CONFIG_CHANGE",
  "DIMSE_ASSOCIATION",
  "STUDY_RECEPTION",
  "ROUTING_RULE_MATCH",
  "TAG_MORPHING_APPLIED",
  "JOB_STATUS_CHANGE",
  "USER_LOGIN",
  "CHATBOT_QUERY",
  "RETRY_ATTEMPT",
];

function formatDetails(details: Record<string, unknown> | null): string {
  if (!details) return "—";
  const parts = Object.entries(details).slice(0, 4).map(([k, v]) => {
    const val = typeof v === "object" ? JSON.stringify(v) : String(v);
    const short = val.length > 40 ? `${val.slice(0, 40)}…` : val;
    return `${k}: ${short}`;
  });
  return parts.join(" · ") || "—";
}

export default function AuditLogs() {
  const [eventType, setEventType] = useState("");
  const [userId, setUserId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["audit-logs", eventType, userId, dateFrom, dateTo],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "100" });
      if (eventType) params.set("event_type", eventType);
      if (userId) params.set("user_id", userId);
      if (dateFrom) params.set("date_from", new Date(dateFrom).toISOString());
      if (dateTo) params.set("date_to", new Date(`${dateTo}T23:59:59`).toISOString());
      return apiFetch<AuditLogList>(`/api/v1/audit-logs?${params}`);
    },
  });

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
            <button type="button" className="btn-secondary" onClick={() => refetch()}>
              <RefreshCw size={16} />
              Refresh
            </button>
            <button type="button" onClick={handleExport} disabled={exporting}>
              <Download size={16} />
              {exporting ? "Exporting…" : "Export CSV"}
            </button>
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
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>User ID</label>
            <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="Filter by user ID" />
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

        {isLoading ? (
          <PageLoading label="Loading audit logs…" />
        ) : (
          <>
            <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
              Showing {logs.length} of {data?.total ?? 0} records
            </p>
            <DataTable
              data={logs}
              keyField="id"
              columns={[
                {
                  key: "created_at",
                  header: "Timestamp",
                  render: (l) => new Date(l.created_at).toLocaleString(),
                },
                {
                  key: "event_type",
                  header: "Event",
                  render: (l) => <StatusBadge status="info" label={l.event_type} dot={false} />,
                },
                { key: "user_id", header: "User", render: (l) => l.user_id ?? "—" },
                { key: "entity_type", header: "Entity" },
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
          </>
        )}
      </div>
    </div>
  );
}
