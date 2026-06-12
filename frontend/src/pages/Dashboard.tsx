import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowLeftRight,
  CheckCircle2,
  FileStack,
  Radio,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { apiFetch } from "../api/client";
import MetricCard from "../components/ui/MetricCard";
import PageHeader from "../components/ui/PageHeader";
import { PageLoading } from "../components/ui/LoadingScreen";

interface Metrics {
  total_studies_processed: number;
  successful_studies: number;
  failed_studies: number;
  active_migration_jobs: number;
  success_rate: number;
}

export default function Dashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard-metrics"],
    queryFn: () => apiFetch<Metrics>("/api/v1/dashboard/metrics"),
    refetchInterval: 10000,
  });

  if (isLoading) return <PageLoading label="Loading dashboard metrics…" />;
  if (error) {
    return (
      <div className="alert alert-error">Error loading metrics: {(error as Error).message}</div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Real-time overview of DICOM routing and migration activity."
      />

      <div className="grid" style={{ marginBottom: "1.5rem" }}>
        <MetricCard
          label="Studies Processed"
          value={data?.total_studies_processed ?? 0}
          icon={<FileStack size={20} />}
          tone="primary"
        />
        <MetricCard
          label="Successful"
          value={data?.successful_studies ?? 0}
          icon={<CheckCircle2 size={20} />}
          tone="success"
        />
        <MetricCard
          label="Failed"
          value={data?.failed_studies ?? 0}
          icon={<XCircle size={20} />}
          tone="error"
        />
        <MetricCard
          label="Success Rate"
          value={`${data?.success_rate ?? 0}%`}
          icon={<TrendingUp size={20} />}
          tone="info"
        />
        <MetricCard
          label="Active Migration Jobs"
          value={data?.active_migration_jobs ?? 0}
          icon={<ArrowLeftRight size={20} />}
          tone="warning"
        />
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
        <Link to="/migration-jobs" className="quick-link-card">
          <div className="quick-link-icon">
            <ArrowLeftRight size={18} />
          </div>
          <div>
            <strong>Migration Jobs</strong>
            <span>Bulk QIDO/WADO to STOW-RS migration workflows</span>
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
  );
}
