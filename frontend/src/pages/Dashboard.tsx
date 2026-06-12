import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowLeftRight,
  CheckCircle2,
  FileStack,
  Radio,
  Server,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { apiFetch } from "../api/client";
import ActivityFeed, { ActivityItem } from "../components/ui/ActivityFeed";
import BarChart from "../components/ui/BarChart";
import MetricCard from "../components/ui/MetricCard";
import PageHeader from "../components/ui/PageHeader";
import { PageLoading } from "../components/ui/LoadingScreen";
import { ChartDataPoint, DashboardMetrics, VolumeChart } from "../types/api";

export default function Dashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard-metrics"],
    queryFn: () => apiFetch<DashboardMetrics>("/api/v1/dashboard/metrics"),
    refetchInterval: 10000,
  });

  const { data: volume } = useQuery({
    queryKey: ["dashboard-volume"],
    queryFn: () => apiFetch<VolumeChart>("/api/v1/dashboard/charts/volume?days=7"),
    refetchInterval: 30000,
  });

  const { data: modalities = [] } = useQuery({
    queryKey: ["dashboard-modality"],
    queryFn: () => apiFetch<ChartDataPoint[]>("/api/v1/dashboard/charts/modality?days=30"),
    refetchInterval: 30000,
  });

  const { data: statusBreakdown = [] } = useQuery({
    queryKey: ["dashboard-status"],
    queryFn: () => apiFetch<ChartDataPoint[]>("/api/v1/dashboard/charts/status"),
    refetchInterval: 30000,
  });

  const { data: activity } = useQuery({
    queryKey: ["dashboard-activity"],
    queryFn: () => apiFetch<{ items: ActivityItem[] }>("/api/v1/dashboard/activity?limit=12"),
    refetchInterval: 10000,
  });

  if (isLoading) return <PageLoading label="Loading dashboard metrics…" />;
  if (error) {
    return <div className="alert alert-error">Error loading metrics: {(error as Error).message}</div>;
  }

  const routing = data!.routing;
  const migration = data!.migration;
  const dimse = data!.dimse;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Real-time overview of DICOM routing, migration, and DIMSE intake."
      />

      <div className="grid" style={{ marginBottom: "1.25rem" }}>
        <MetricCard
          label="Studies Routed"
          value={routing.total}
          icon={<FileStack size={20} />}
          tone="primary"
          sub={`${routing.success_rate}% success`}
        />
        <MetricCard
          label="Routing Success"
          value={routing.success}
          icon={<CheckCircle2 size={20} />}
          tone="success"
        />
        <MetricCard
          label="Routing Failed"
          value={routing.failed}
          icon={<XCircle size={20} />}
          tone="error"
          sub={routing.partial ? `${routing.partial} partial` : undefined}
        />
        <MetricCard
          label="Studies Migrated"
          value={migration.studies_migrated}
          icon={<ArrowLeftRight size={20} />}
          tone="info"
          sub={`${migration.active_jobs} active jobs`}
        />
        <MetricCard
          label="DIMSE Assembled"
          value={dimse.studies_assembled}
          icon={<Server size={20} />}
          tone={dimse.listening ? "success" : "warning"}
          sub={dimse.listening ? `${dimse.instances_received} instances` : "Listener offline"}
        />
      </div>

      <div className="grid" style={{ gridTemplateColumns: "2fr 1fr", marginBottom: "1.25rem" }}>
        <div className="card">
          <h3 className="card-title">Volume — Last 7 Days</h3>
          <div className="dual-chart">
            <div>
              <span className="chart-legend chart-legend--routing">Routing</span>
              <BarChart
                data={(volume?.routing ?? []).map((d) => ({
                  label: d.label.slice(5),
                  value: d.value,
                }))}
                color="var(--color-primary)"
              />
            </div>
            <div>
              <span className="chart-legend chart-legend--migration">Migration</span>
              <BarChart
                data={(volume?.migration ?? []).map((d) => ({
                  label: d.label.slice(5),
                  value: d.value,
                }))}
                color="var(--color-accent)"
              />
            </div>
          </div>
        </div>
        <div className="card">
          <h3 className="card-title">Recent Activity</h3>
          <ActivityFeed items={activity?.items ?? []} />
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", marginBottom: "1.5rem" }}>
        <div className="card">
          <h3 className="card-title">Routing by Status</h3>
          <BarChart data={statusBreakdown} color="var(--color-accent)" />
        </div>
        <div className="card">
          <h3 className="card-title">Modalities (30 days)</h3>
          <BarChart data={modalities} />
        </div>
      </div>

      <h3 className="card-title" style={{ marginBottom: "0.75rem" }}>Quick access</h3>
      <div className="quick-links">
        <Link to="/routing-monitor" className="quick-link-card">
          <div className="quick-link-icon"><Radio size={18} /></div>
          <div>
            <strong>Routing Monitor</strong>
            <span>Live DIMSE intake and STOW-RS delivery status</span>
          </div>
        </Link>
        <Link to="/reports" className="quick-link-card">
          <div className="quick-link-icon"><TrendingUp size={18} /></div>
          <div>
            <strong>Reports</strong>
            <span>Operational summaries and audit CSV export</span>
          </div>
        </Link>
        <Link to="/health" className="quick-link-card">
          <div className="quick-link-icon"><Activity size={18} /></div>
          <div>
            <strong>System Health</strong>
            <span>Service status for Orthanc, Keycloak, and workers</span>
          </div>
        </Link>
      </div>
    </div>
  );
}
