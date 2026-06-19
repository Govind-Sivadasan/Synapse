import { useEffect, useRef, useState } from "react";
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
import {
  DashboardLeftSidecar,
  DashboardRightSidecar,
} from "../components/dashboard/DashboardSidecars";
import ActivityFeed, { ActivityItem } from "../components/ui/ActivityFeed";
import BarChart from "../components/ui/BarChart";
import MetricCard from "../components/ui/MetricCard";
import PageHeader from "../components/ui/PageHeader";
import { PageLoading } from "../components/ui/LoadingScreen";
import { formatNotificationMessage } from "../lib/notificationMessages";
import { useNotifications } from "../services/notifications";
import { routingStatusLabel } from "../lib/statusLabels";
import { useWebSocket } from "../hooks/useWebSocket";
import { ChartDataPoint, DashboardMetrics, RoutingTransaction, VolumeChart } from "../types/api";

interface DimseStatus {
  recent_events: { type: string; calling_ae?: string; study_uid?: string; at: string }[];
}

interface TransactionList {
  total: number;
  items: RoutingTransaction[];
}

export default function Dashboard() {
  const { error: notifyError } = useNotifications();
  const lastError = useRef<string | null>(null);
  const { events } = useWebSocket();
  const [selectedStudyUid, setSelectedStudyUid] = useState<string | null>(null);

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
    queryFn: () => apiFetch<{ items: ActivityItem[] }>("/api/v1/dashboard/activity?limit=8"),
    refetchInterval: 10000,
  });

  const { data: dimse } = useQuery({
    queryKey: ["dimse-status"],
    queryFn: () => apiFetch<DimseStatus>("/api/v1/dimse/status"),
    refetchInterval: 10000,
    retry: false,
  });

  const { data: selectedTxnData } = useQuery({
    queryKey: ["dashboard-selected-txn", selectedStudyUid],
    queryFn: () =>
      apiFetch<TransactionList>(
        `/api/v1/routing-transactions?study_uid=${encodeURIComponent(selectedStudyUid!)}&limit=1`,
      ),
    enabled: Boolean(selectedStudyUid),
    retry: false,
  });

  const selectedTransaction = selectedTxnData?.items[0] ?? null;

  useEffect(() => {
    if (!error) {
      lastError.current = null;
      return;
    }
    const message = `Error loading metrics: ${formatNotificationMessage((error as Error).message)}`;
    if (lastError.current === message) return;
    lastError.current = message;
    notifyError(message);
  }, [error, notifyError]);

  if (isLoading) return <PageLoading label="Loading dashboard metrics…" />;
  if (error || !data) {
    return (
      <div>
        <PageHeader title="Dashboard" description="Operational overview of routing, migration, and DIMSE intake." />
        <div className="card">
          <p className="empty-message">Unable to load dashboard metrics. Check the notification for details.</p>
        </div>
      </div>
    );
  }

  const routing = data.routing;
  const migration = data.migration;
  const dimseMetrics = data.dimse;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Real-time overview of DICOM routing, migration, and DIMSE intake."
      />

      <div className="dashboard-layout">
        <div className="dashboard-main">
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
              value={dimseMetrics.studies_assembled}
              icon={<Server size={20} />}
              tone={dimseMetrics.listening ? "success" : "warning"}
              sub={dimseMetrics.listening ? `${dimseMetrics.instances_received} instances` : "Listener offline"}
            />
          </div>

          <div className="grid dashboard-split">
            <div className="card dashboard-volume-card">
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
            <div className="card dashboard-activity-card">
              <h3 className="card-title">Recent Activity</h3>
              <ActivityFeed
                items={activity?.items ?? []}
                onSelectStudyUid={setSelectedStudyUid}
                selectedStudyUid={selectedStudyUid}
              />
            </div>
          </div>

          <div
            className="grid"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", marginBottom: "1.5rem" }}
          >
            <div className="card">
              <h3 className="card-title">Routing by Status</h3>
              <BarChart data={statusBreakdown} color="var(--color-accent)" formatLabel={routingStatusLabel} />
            </div>
            <div className="card">
              <h3 className="card-title">Modalities (30 days)</h3>
              <BarChart data={modalities} />
            </div>
          </div>

          <h3 className="card-title" style={{ marginBottom: "0.75rem" }}>
            Quick access
          </h3>
          <div className="quick-links">
            <Link to="/routing-monitor" className="quick-link-card">
              <div className="quick-link-icon">
                <Radio size={18} />
              </div>
              <div>
                <strong>Routing Monitor</strong>
                <span>Live DIMSE intake and STOW-RS delivery status</span>
              </div>
            </Link>
            <Link to="/reports" className="quick-link-card">
              <div className="quick-link-icon">
                <TrendingUp size={18} />
              </div>
              <div>
                <strong>Reports</strong>
                <span>Operational summaries and audit CSV export</span>
              </div>
            </Link>
            <Link to="/health" className="quick-link-card">
              <div className="quick-link-icon">
                <Activity size={18} />
              </div>
              <div>
                <strong>System Health</strong>
                <span>Service status for Orthanc, Keycloak, and workers</span>
              </div>
            </Link>
          </div>
        </div>

        <div className="monitor-sidecar-column">
          <DashboardLeftSidecar
            wsEvents={events}
            dimseEvents={dimse?.recent_events ?? []}
            selectedStudyUid={selectedStudyUid}
            onSelectStudyUid={setSelectedStudyUid}
          />
          <DashboardRightSidecar
            selectedStudyUid={selectedStudyUid}
            selectedTransaction={selectedTransaction}
          />
        </div>
      </div>
    </div>
  );
}
