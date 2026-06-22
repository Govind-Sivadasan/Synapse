import ActionButton from "../ui/ActionButton";
import { ChatPendingAction } from "../../types/api";

interface Props {
  action: ChatPendingAction;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

function detailRows(action: ChatPendingAction): Array<{ label: string; value: string }> {
  return [{ label: "Action", value: action.summary }, ...action.details];
}

export default function ChatActionCard({ action, onConfirm, onCancel, loading = false }: Props) {
  const rows = detailRows(action);
  const titleMap = {
    routing_rule: "routing rule",
    migration_job: "migration job",
    node: "node",
    tag_morphing: "tag morphing rule",
  } as const;
  const confirmLabel = action.confirm_label;

  return (
    <div className="chat-action-card" role="region" aria-label={`Pending ${titleMap[action.entity_type]} change`}>
      <div className="chat-action-card-header">
        <strong>Confirm {titleMap[action.entity_type]} change</strong>
        <span className="chat-action-card-badge">
          {action.role_required === "admin" ? "Admin action" : "Operator action"}
        </span>
      </div>
      <dl className="chat-action-card-details">
        {rows.map((row) => (
          <div key={row.label} className="chat-action-card-row">
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className="chat-action-card-actions">
        <ActionButton variant="secondary" onClick={onCancel} disabled={loading}>
          Cancel
        </ActionButton>
        <ActionButton
          className={action.action_type === "delete" ? "btn-danger" : undefined}
          onClick={onConfirm}
          disabled={loading}
        >
          {loading ? "Applying…" : confirmLabel}
        </ActionButton>
      </div>
    </div>
  );
}
