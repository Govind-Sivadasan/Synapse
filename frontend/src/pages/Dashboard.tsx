import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";

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

  if (isLoading) return <p>Loading metrics...</p>;
  if (error) return <p>Error loading metrics: {(error as Error).message}</p>;

  return (
    <div>
      <h2>Dashboard</h2>
      <div className="grid">
        <div className="card">
          <div className="metric">{data?.total_studies_processed ?? 0}</div>
          <div className="metric-label">Studies Processed</div>
        </div>
        <div className="card">
          <div className="metric">{data?.successful_studies ?? 0}</div>
          <div className="metric-label">Successful</div>
        </div>
        <div className="card">
          <div className="metric">{data?.failed_studies ?? 0}</div>
          <div className="metric-label">Failed</div>
        </div>
        <div className="card">
          <div className="metric">{data?.success_rate ?? 0}%</div>
          <div className="metric-label">Success Rate</div>
        </div>
        <div className="card">
          <div className="metric">{data?.active_migration_jobs ?? 0}</div>
          <div className="metric-label">Active Migration Jobs</div>
        </div>
      </div>
    </div>
  );
}
