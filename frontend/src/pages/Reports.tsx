import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Download,
  FileBarChart,
  FileSearch,
  Radio,
  ArrowLeftRight,
  Activity,
} from "lucide-react";
import { apiFetch, downloadFile } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import BarChart from "../components/ui/BarChart";
import MetricCard from "../components/ui/MetricCard";
import PageHeader from "../components/ui/PageHeader";
import { PageLoading } from "../components/ui/LoadingScreen";
import ActionButton from "../components/ui/ActionButton";
import { routingStatusLabel } from "../lib/statusLabels";
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
  const canRouting = roles.some((r) => ["service_user", "operator", "admin"].includes(r));
  const canMigration = roles.some((r) => ["operator", "admin"].includes(r));
  const canAudit = roles.some((r) => ["service_user", "operator", "admin"].includes(r));

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

  const periodQuery = days > 0 ? `?days=${days}` : "";

  return (
    <div>
      <PageHeader
        title="Reports"
        description={`Operational summaries and audit export for compliance review. Showing ${periodLabel(days).toLowerCase()}.`}
        actions={
          <>
            <select
              className="reports-period-select"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              <option value={0}>All time</option>
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            {canExport && (
              <ActionButton icon={<Download size={16} />} onClick={handleExport} disabled={exporting}>
                {exporting ? "Exporting…" : "Export Audit CSV"}
              </ActionButton>
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
          <div className="grid reports-kpi-grid">
            <MetricCard
              variant="kpi"
              label="Routing Studies"
              value={summary.routing_studies}
              icon={<FileBarChart size={20} />}
              tone="primary"
              sub={
                summary.routing_studies > 0
                  ? `${summary.routing_success_rate}% success rate`
                  : "No routing data in period"
              }
              actions={
                canRouting
                  ? [{ label: "Routing monitor", href: "/routing-monitor" }]
                  : undefined
              }
            />
            <MetricCard
              variant="kpi"
              label="Migrations Completed"
              value={summary.migration_studies_completed}
              tone="success"
              icon={<ArrowLeftRight size={20} />}
              sub={
                summary.migration_studies_completed > 0
                  ? "Studies successfully migrated"
                  : "No completed migrations in period"
              }
              actions={
                canMigration ? [{ label: "Migration jobs", href: "/migration-jobs" }] : undefined
              }
            />
            <MetricCard
              variant="kpi"
              label="Migration Failures"
              value={summary.migration_studies_failed}
              tone="error"
              icon={<Activity size={20} />}
              sub={
                summary.migration_studies_failed > 0
                  ? "Review failed jobs and retry"
                  : "No failed migrations in period"
              }
              actions={
                canMigration ? [{ label: "View failures", href: "/migration-jobs" }] : undefined
              }
            />
            <MetricCard
              variant="kpi"
              label="Audit Events"
              value={summary.audit_events}
              tone="info"
              icon={<FileSearch size={20} />}
              sub={
                summary.audit_events > 0
                  ? `${auditSummary.length} event types in period`
                  : "No audit activity in period"
              }
              actions={
                canAudit
                  ? [
                      { label: "Audit logs", href: `/audit-logs${periodQuery}` },
                      ...(canExport
                        ? [{ label: exporting ? "Exporting…" : "Export CSV", onClick: () => void handleExport() }]
                        : []),
                    ]
                  : undefined
              }
            />
          </div>

          <div className="card reports-quick-links" style={{ marginBottom: "1.25rem" }}>
            <h3 className="card-title">Quick actions</h3>
            <div className="reports-link-grid">
              {canRouting && (
                <Link to="/routing-monitor" className="reports-quick-link">
                  <Radio size={18} />
                  <span>Live routing monitor</span>
                  <ArrowRight size={14} />
                </Link>
              )}
              {canMigration && (
                <Link to="/migration-jobs" className="reports-quick-link">
                  <ArrowLeftRight size={18} />
                  <span>Migration jobs</span>
                  <ArrowRight size={14} />
                </Link>
              )}
              {canAudit && (
                <Link to={`/audit-logs${periodQuery}`} className="reports-quick-link">
                  <FileSearch size={18} />
                  <span>Audit log explorer</span>
                  <ArrowRight size={14} />
                </Link>
              )}
              {canRouting && summary.routing_studies === 0 && (
                <Link to="/routing-rules" className="reports-quick-link reports-quick-link--hint">
                  <FileBarChart size={18} />
                  <span>Configure routing rules to start receiving studies</span>
                  <ArrowRight size={14} />
                </Link>
              )}
            </div>
          </div>

          <div className="grid reports-charts-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            <div className="card reports-chart-card">
              <div className="reports-chart-head">
                <h3 className="card-title">Routing by Status</h3>
                {canRouting && (
                  <Link to="/routing-monitor" className="reports-chart-link">
                    Details <ArrowRight size={14} />
                  </Link>
                )}
              </div>
              <div className="reports-chart-body">
                <BarChart
                  data={summary.routing_by_status}
                  color="var(--color-accent)"
                  emptyLabel={routingEmpty}
                  formatLabel={routingStatusLabel}
                />
              </div>
              {summary.routing_studies === 0 && canRouting && (
                <div className="reports-chart-footer">
                  <Link to="/routing-monitor" className="reports-empty-cta">
                    Send a test study via DIMSE
                  </Link>
                </div>
              )}
            </div>
            <div className="card reports-chart-card">
              <div className="reports-chart-head">
                <h3 className="card-title">Top Modalities</h3>
                {canRouting && summary.top_modalities.length > 0 && (
                  <Link to="/routing-rules" className="reports-chart-link">
                    Rules <ArrowRight size={14} />
                  </Link>
                )}
              </div>
              <div className="reports-chart-body">
                <BarChart
                  data={summary.top_modalities}
                  emptyLabel={
                    days <= 0
                      ? "No modality data recorded yet."
                      : "No modalities in this period."
                  }
                />
              </div>
            </div>
            <div className="card reports-chart-card">
              <div className="reports-chart-head">
                <h3 className="card-title">Audit Events by Type</h3>
                {canAudit && (
                  <Link to={`/audit-logs${periodQuery}`} className="reports-chart-link">
                    View all <ArrowRight size={14} />
                  </Link>
                )}
              </div>
              <div className="reports-chart-body">
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
              {canExport && summary.audit_events > 0 && (
                <div className="reports-chart-footer">
                  <button type="button" className="reports-empty-cta" onClick={() => void handleExport()} disabled={exporting}>
                    {exporting ? "Exporting…" : "Download audit CSV for this period"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
