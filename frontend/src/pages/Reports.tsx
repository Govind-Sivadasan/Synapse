import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileBarChart } from "lucide-react";
import { apiFetch, downloadFile } from "../api/client";
import BarChart from "../components/ui/BarChart";
import MetricCard from "../components/ui/MetricCard";
import PageHeader from "../components/ui/PageHeader";
import { PageLoading } from "../components/ui/LoadingScreen";
import { ChartDataPoint, ReportSummary } from "../types/api";

export default function Reports() {
  const [days, setDays] = useState(7);
  const [exporting, setExporting] = useState(false);

  const { data: summary, isLoading } = useQuery({
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
      await downloadFile(`/api/v1/reports/audit/export?days=${days}`, `synapse-audit-${days}d.csv`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Operational summaries and audit export for compliance review."
        actions={
          <>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              style={{ padding: "0.5rem 0.75rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}
            >
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <button type="button" onClick={handleExport} disabled={exporting}>
              <Download size={16} />
              {exporting ? "Exporting…" : "Export Audit CSV"}
            </button>
          </>
        }
      />

      {isLoading ? (
        <PageLoading label="Generating report…" />
      ) : summary && (
        <>
          <div className="grid" style={{ marginBottom: "1.25rem" }}>
            <MetricCard
              label="Routing Studies"
              value={summary.routing_studies}
              icon={<FileBarChart size={20} />}
              tone="primary"
              sub={`${summary.routing_success_rate}% success rate`}
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
              <BarChart data={summary.routing_by_status} color="var(--color-accent)" />
            </div>
            <div className="card">
              <h3 className="card-title">Top Modalities</h3>
              <BarChart data={summary.top_modalities} />
            </div>
            <div className="card">
              <h3 className="card-title">Audit Events by Type</h3>
              <BarChart data={auditSummary} color="var(--color-warning)" emptyLabel="No audit events in period" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
