import { Activity, Layers } from "lucide-react";
import MetricCard from "../ui/MetricCard";
import { useWebSocket } from "../../hooks/useWebSocket";

export default function MigrationQueueWidget() {
  const { opsSnapshot, connected } = useWebSocket();

  const migrationQueued = opsSnapshot?.migration_queue.queued ?? "—";
  const migrationActive = opsSnapshot?.migration_queue.active_tasks ?? 0;
  const routingQueued = opsSnapshot?.routing_queue.queued ?? "—";
  const routingActive = opsSnapshot?.routing_queue.active_tasks ?? 0;
  const workersOnline = opsSnapshot?.workers_online;

  const migrationSub = !connected
    ? "WebSocket disconnected — counts may be stale"
    : !opsSnapshot
      ? "Waiting for queue stats…"
      : `${migrationActive} active · ${workersOnline} workers`;

  const routingSub = !connected
    ? "Reconnecting…"
    : !opsSnapshot
      ? "Waiting for queue stats…"
      : `${routingActive} active`;

  return (
    <div className="migration-ops-grid">
      <MetricCard
        label="Migration queue"
        value={migrationQueued}
        icon={<Layers size={18} />}
        tone={
          typeof migrationQueued === "number" && migrationQueued > 100
            ? "warning"
            : "info"
        }
        sub={migrationSub}
      />
      <MetricCard
        label="Routing queue"
        value={routingQueued}
        icon={<Activity size={18} />}
        tone={
          typeof routingQueued === "number" && routingQueued > 50 ? "warning" : "info"
        }
        sub={routingSub}
      />
    </div>
  );
}
