import { ArrowLeftRight, Radio } from "lucide-react";
import StatusBadge from "./StatusBadge";

export interface ActivityItem {
  id: string;
  type: string;
  title: string;
  subtitle: string | null;
  status: string | null;
  timestamp: string;
}

interface Props {
  items: ActivityItem[];
  emptyLabel?: string;
}

export default function ActivityFeed({ items, emptyLabel = "No recent activity" }: Props) {
  if (!items.length) {
    return <p className="empty-message">{emptyLabel}</p>;
  }

  return (
    <div className="activity-feed">
      {items.map((item) => (
        <div key={item.id} className="activity-feed-item">
          <div className={`activity-feed-icon activity-feed-icon--${item.type}`}>
            {item.type === "migration" ? <ArrowLeftRight size={16} /> : <Radio size={16} />}
          </div>
          <div className="activity-feed-body">
            <strong>{item.title}</strong>
            {item.subtitle && <code>{item.subtitle}</code>}
          </div>
          <div className="activity-feed-meta">
            {item.status && <StatusBadge status={item.status} dot={false} />}
            <time>{new Date(item.timestamp).toLocaleString()}</time>
          </div>
        </div>
      ))}
    </div>
  );
}
