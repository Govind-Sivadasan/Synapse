import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, RefreshCw, Server } from "lucide-react";
import { apiFetch } from "../api/client";
import PageHeader from "../components/ui/PageHeader";
import StatusBadge, { statusVariant } from "../components/ui/StatusBadge";
import { PageLoading } from "../components/ui/LoadingScreen";
import ActionButton from "../components/ui/ActionButton";
import { formatNotificationMessage } from "../lib/notificationMessages";
import { useNotifications } from "../services/notifications";

interface HealthComponent {
  name: string;
  status: string;
  message?: string;
  latency_ms?: number | null;
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
  const { error: notifyError } = useNotifications();
  const lastError = useRef<string | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["health"],
    queryFn: () => apiFetch<HealthResponse>("/api/v1/health"),
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (!error) {
      lastError.current = null;
      return;
    }
    const message = formatNotificationMessage((error as Error).message);
    const full = `Error: ${message}`;
    if (lastError.current === full) return;
    lastError.current = full;
    notifyError(full);
  }, [error, notifyError]);

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
          <ActionButton
            icon={<RefreshCw size={16} className={isFetching ? "spin-icon" : undefined} />}
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? "Refreshing…" : "Refresh"}
          </ActionButton>
        }
      />

      {isLoading && <PageLoading label="Checking services…" />}

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
                  <strong>{c.name.replace(/_/g, " ")}</strong>
                  <StatusBadge status={c.status} />
                  {(c.latency_ms != null || c.message) && (
                    <p>
                      {[c.latency_ms != null ? `${c.latency_ms}ms` : null, c.message].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
