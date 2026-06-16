import StatusBadge, { statusVariant } from "./StatusBadge";

type BadgeVariant = "success" | "error" | "warning" | "info" | "neutral";

const EVENT_VARIANTS: Record<string, BadgeVariant> = {
  CONFIG_CHANGE: "warning",
  USER_LOGIN: "info",
  DIMSE_ASSOCIATION: "success",
  DIMSE_ASSOCIATION_REJECTED: "error",
  STUDY_RECEPTION: "success",
  ROUTING_RULE_MATCH: "info",
  TAG_MORPHING_APPLIED: "warning",
  JOB_STATUS_CHANGE: "info",
  CHATBOT_QUERY: "neutral",
  RETRY_ATTEMPT: "warning",
};

interface Props {
  eventType: string;
}

export default function EventBadge({ eventType }: Props) {
  const variant = EVENT_VARIANTS[eventType] ?? statusVariant(eventType.toLowerCase());
  const label = eventType.replace(/_/g, " ");

  return (
    <span className={`status-badge status-badge--${variant} event-badge`}>
      {label}
    </span>
  );
}
