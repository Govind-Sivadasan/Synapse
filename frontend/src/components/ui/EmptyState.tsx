import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

interface Props {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}

export default function EmptyState({ icon: Icon, title, description, action }: Props) {
  return (
    <div className="card">
      <div className="empty-state">
        <div className="empty-state-icon">
          <Icon size={28} strokeWidth={1.75} />
        </div>
        <h3>{title}</h3>
        <p>{description}</p>
        {action && <div style={{ marginTop: "1.25rem" }}>{action}</div>}
      </div>
    </div>
  );
}
