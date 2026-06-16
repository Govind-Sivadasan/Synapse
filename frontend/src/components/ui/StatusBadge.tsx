import { routingStatusLabel } from "../../lib/statusLabels";

type BadgeVariant = "success" | "error" | "warning" | "info" | "neutral";

const STATUS_MAP: Record<string, BadgeVariant> = {
  success: "success",
  healthy: "success",
  active: "success",
  connected: "success",
  partial: "warning",
  degraded: "warning",
  pending: "warning",
  failed: "error",
  error: "error",
  unhealthy: "error",
  inactive: "error",
  disconnected: "neutral",
  no_match: "info",
  not_started: "neutral",
  in_progress: "info",
  completed: "success",
  cancelled: "neutral",
  skipped: "neutral",
  unknown: "neutral",
};

interface Props {
  status: string;
  label?: string;
  dot?: boolean;
}

export function statusVariant(status: string): BadgeVariant {
  return STATUS_MAP[status.toLowerCase()] ?? "neutral";
}

export default function StatusBadge({ status, label, dot = true }: Props) {
  const variant = statusVariant(status);
  const text = label ?? routingStatusLabel(status);

  return (
    <span className={`status-badge status-badge--${variant}`}>
      {dot && <span className="badge-dot" />}
      {text}
    </span>
  );
}
