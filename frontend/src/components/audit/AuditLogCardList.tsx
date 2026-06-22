import EventBadge from "../ui/EventBadge";
import FloatingTooltip from "../ui/FloatingTooltip";
import { AuditLog } from "../../types/api";

function formatDetails(details: Record<string, unknown> | null): string {
  if (!details) return "";
  const parts = Object.entries(details)
    .filter(([k]) => k !== "username")
    .slice(0, 3)
    .map(([k, v]) => {
      const val = typeof v === "object" ? JSON.stringify(v) : String(v);
      const short = val.length > 48 ? `${val.slice(0, 48)}…` : val;
      return `${k}: ${short}`;
    });
  return parts.join(" · ");
}

function userLabel(log: AuditLog): string {
  if (log.username) return log.username;
  if (log.user_id) return `${log.user_id.slice(0, 8)}…`;
  return "System";
}

interface Props {
  logs: AuditLog[];
  emptyLabel?: string;
}

export default function AuditLogCardList({ logs, emptyLabel = "No recent audit events" }: Props) {
  if (!logs.length) {
    return <p className="empty-message audit-log-card-list-empty">{emptyLabel}</p>;
  }

  return (
    <div className="audit-log-card-list">
      {logs.map((log) => {
        const details = formatDetails(log.details);
        return (
          <FloatingTooltip
            key={log.id}
            className="audit-log-card-item"
            align="end"
            content={
              <>
                <strong>{log.event_type.replace(/_/g, " ")}</strong>
                <span>{new Date(log.created_at).toLocaleString()}</span>
                <span>
                  {userLabel(log)}
                  {log.entity_type ? ` · ${log.entity_type}` : ""}
                </span>
                {details && <span>{details}</span>}
              </>
            }
          >
            <div className="audit-log-card-item__head">
              <EventBadge eventType={log.event_type} />
              <time className="audit-log-card-item__time" dateTime={log.created_at}>
                {new Date(log.created_at).toLocaleString()}
              </time>
            </div>
            <div className="audit-log-card-item__meta">
              <span className="audit-log-card-item__user">{userLabel(log)}</span>
              {log.entity_type && (
                <>
                  <span className="audit-log-card-item__sep" aria-hidden>
                    ·
                  </span>
                  <span className="audit-log-card-item__entity">{log.entity_type}</span>
                </>
              )}
            </div>
            {details && <p className="audit-log-card-item__details">{details}</p>}
          </FloatingTooltip>
        );
      })}
    </div>
  );
}
