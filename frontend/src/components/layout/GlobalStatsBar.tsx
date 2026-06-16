import { useQuery } from "@tanstack/react-query";
import { Activity, CheckCircle2, FileStack } from "lucide-react";
import { apiFetch } from "../../api/client";
import { DashboardMetrics } from "../../types/api";

export default function GlobalStatsBar() {
  const { data } = useQuery({
    queryKey: ["dashboard-metrics"],
    queryFn: () => apiFetch<DashboardMetrics>("/api/v1/dashboard/metrics"),
    refetchInterval: 15000,
    staleTime: 10000,
  });

  if (!data) return null;

  const { routing, migration, dimse } = data;

  return (
    <div className="app-topbar-metrics" data-tour="global-stats">
      <div className="global-stats-bar" aria-label="System summary">
        <div className="global-stats-item">
          <FileStack size={14} aria-hidden />
          <span className="global-stats-label">Studies today</span>
          <strong>{routing.studies_today.toLocaleString()}</strong>
        </div>
        <div className="global-stats-item">
          <CheckCircle2 size={14} aria-hidden />
          <span className="global-stats-label">Success rate</span>
          <strong>{routing.success_rate_today}%</strong>
        </div>
        <div className="global-stats-item">
          <Activity size={14} aria-hidden />
          <span className="global-stats-label">Active jobs</span>
          <strong>{migration.active_jobs}</strong>
        </div>
      </div>
      <div
        className={`global-stats-live-pill${dimse.listening ? " is-live" : ""}`}
        title={dimse.listening ? "DIMSE listener is accepting associations" : "DIMSE listener is offline"}
      >
        {dimse.listening && <span className="global-stats-live-dot" aria-hidden />}
        <strong>{dimse.listening ? "Live" : "Offline"}</strong>
      </div>
    </div>
  );
}
