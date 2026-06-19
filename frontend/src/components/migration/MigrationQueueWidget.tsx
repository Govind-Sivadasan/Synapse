import { Activity, Layers } from "lucide-react";
import MetricCard from "../ui/MetricCard";
import { useWebSocket } from "../../hooks/useWebSocket";

export default function MigrationQueueWidget() {
  const { opsSnapshot, connected } = useWebSocket();

  const migrationQueued = opsSnapshot?.migration_queue.queued ?? "—";
  const migrationActive = opsSnapshot?.migration_queue.active_tasks ?? 0;
  const routingQueued = opsSnapshot?.routing_queue.queued ?? "—";
  const workers = opsSnapshot?.workers_online;

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
        sub={
          connected
            ? `${migrationActive} active · ${workers ?? "?"} workers`
            : "WebSocket disconnected — counts may be stale"
        }
      />
      <MetricCard
        label="Routing queue"
        value={routingQueued}
        icon={<Activity size={18} />}
        tone={
          typeof routingQueued === "number" && routingQueued > 50 ? "warning" : "info"
        }
        sub={connected ? `${opsSnapshot?.routing_queue.active_tasks ?? 0} active` : "Reconnecting…"}
      />
    </div>
  );
}
