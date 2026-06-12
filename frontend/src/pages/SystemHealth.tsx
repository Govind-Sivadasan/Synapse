import { useQuery } from "@tanstack/react-query";
import { Activity, RefreshCw, Server } from "lucide-react";
import { apiFetch } from "../api/client";
import PageHeader from "../components/ui/PageHeader";
import StatusBadge, { statusVariant } from "../components/ui/StatusBadge";
import { PageLoading } from "../components/ui/LoadingScreen";
import AutoDismissAlert from "../components/ui/AutoDismissAlert";

interface HealthComponent {
  name: string;
  status: string;
  message?: string;
}

interface HealthResponse {
  status: string;
  components: HealthComponent[];
  timestamp: string;
}

function healthIconClass(status: string) {
  const v = statusVariant(status);
  if (v === "success") return "health-card-icon health-card-icon--healthy";
  if (v === "warning") return "health-card-icon health-card-icon--degraded";
  return "health-card-icon health-card-icon--unhealthy";
}

export default function SystemHealth() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["health"],
    queryFn: () => apiFetch<HealthResponse>("/api/v1/health"),
    refetchInterval: 15000,
  });

  const overallVariant = data ? statusVariant(data.status) : "neutral";
  const bannerClass =
    overallVariant === "success"
      ? "overall-health-banner overall-health-banner--healthy"
      : "overall-health-banner overall-health-banner--degraded";

  return (
    <div>
      <PageHeader
        title="System Health"
        description="Live status of Synapse services and dependencies."
        actions={
          <button type="button" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={16} />
            {isFetching ? "Refreshing…" : "Refresh"}
          </button>
        }
      />

      {isLoading && <PageLoading label="Checking services…" />}
      {error && (
        <AutoDismissAlert variant="error">Error: {(error as Error).message}</AutoDismissAlert>
      )}

      {data && (
        <>
          <div className={bannerClass}>
            <Activity size={28} style={{ color: overallVariant === "success" ? "#059669" : "#d97706" }} />
            <div>
              <div style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)", marginBottom: "0.15rem" }}>
                Overall status
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <strong style={{ fontSize: "1.25rem", textTransform: "capitalize" }}>{data.status}</strong>
                <StatusBadge status={data.status} dot={false} />
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.35rem" }}>
                Last checked {new Date(data.timestamp).toLocaleString()}
              </div>
            </div>
          </div>

          <div className="health-grid">
            {data.components.map((c) => (
              <div className="health-card" key={c.name}>
                <div className={healthIconClass(c.status)}>
                  <Server size={18} />
                </div>
                <div className="health-card-body">
                  <strong>{c.name}</strong>
                  <StatusBadge status={c.status} />
                  {c.message && <p>{c.message}</p>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
