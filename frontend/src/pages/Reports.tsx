import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileBarChart } from "lucide-react";
import { apiFetch, downloadFile } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import BarChart from "../components/ui/BarChart";
import MetricCard from "../components/ui/MetricCard";
import PageHeader from "../components/ui/PageHeader";
import { PageLoading } from "../components/ui/LoadingScreen";
import { ChartDataPoint, ReportSummary } from "../types/api";

function periodLabel(days: number): string {
  if (days <= 0) return "All time";
  if (days === 7) return "Last 7 days";
  if (days === 14) return "Last 14 days";
  if (days === 30) return "Last 30 days";
  if (days === 90) return "Last 90 days";
  return `Last ${days} days`;
}

export default function Reports() {
  const { roles } = useAuth();
  const [days, setDays] = useState(7);
  const [exporting, setExporting] = useState(false);
  const canExport = roles.some((r) => ["operator", "admin"].includes(r));

  const { data: summary, isLoading, isError, error } = useQuery({
    queryKey: ["report-summary", days],
    queryFn: () => apiFetch<ReportSummary>(`/api/v1/reports/summary?days=${days}`),
  });

  const { data: auditSummary = [] } = useQuery({
    queryKey: ["audit-summary", days],
    queryFn: () => apiFetch<ChartDataPoint[]>(`/api/v1/reports/audit/summary?days=${days}`),
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      const exportDays = days <= 0 ? 0 : days;
      await downloadFile(
        `/api/v1/reports/audit/export?days=${exportDays}`,
        days <= 0 ? "synapse-audit-all-time.csv" : `synapse-audit-${days}d.csv`,
      );
    } finally {
      setExporting(false);
    }
  };

  const routingEmpty =
    days <= 0
      ? "No routing studies recorded yet."
      : "No routing activity in this period. Try All time or send studies via DIMSE.";

  return (
    <div>
      <PageHeader
        title="Reports"
        description={`Operational summaries and audit export for compliance review. Showing ${periodLabel(days).toLowerCase()}.`}
        actions={
          <>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              style={{ padding: "0.5rem 0.75rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}
            >
              <option value={0}>All time</option>
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            {canExport && (
              <button type="button" onClick={handleExport} disabled={exporting}>
                <Download size={16} />
                {exporting ? "Exporting…" : "Export Audit CSV"}
              </button>
            )}
          </>
        }
      />

      {isLoading ? (
        <PageLoading label="Generating report…" />
      ) : isError ? (
        <p className="empty-message">{(error as Error).message}</p>
      ) : summary ? (
        <>
          <div className="grid" style={{ marginBottom: "1.25rem" }}>
            <MetricCard
              label="Routing Studies"
              value={summary.routing_studies}
              icon={<FileBarChart size={20} />}
              tone="primary"
              sub={
                summary.routing_studies > 0
                  ? `${summary.routing_success_rate}% success rate`
                  : "No routing data in period"
              }
            />
            <MetricCard
              label="Migrations Completed"
              value={summary.migration_studies_completed}
              tone="success"
            />
            <MetricCard
              label="Migration Failures"
              value={summary.migration_studies_failed}
              tone="error"
            />
            <MetricCard
              label="Audit Events"
              value={summary.audit_events}
              tone="info"
            />
          </div>

          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            <div className="card">
              <h3 className="card-title">Routing by Status</h3>
              <BarChart data={summary.routing_by_status} color="var(--color-accent)" emptyLabel={routingEmpty} />
            </div>
            <div className="card">
              <h3 className="card-title">Top Modalities</h3>
              <BarChart
                data={summary.top_modalities}
                emptyLabel={
                  days <= 0
                    ? "No modality data recorded yet."
                    : "No modalities in this period."
                }
              />
            </div>
            <div className="card">
              <h3 className="card-title">Audit Events by Type</h3>
              <BarChart
                data={auditSummary}
                color="var(--color-warning)"
                emptyLabel={
                  days <= 0
                    ? "No audit events recorded yet."
                    : "No audit events in this period."
                }
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
