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
  onSelectStudyUid?: (studyUid: string) => void;
  selectedStudyUid?: string | null;
  hoveredStudyUid?: string | null;
  onHoverStudyUid?: (studyUid: string | null) => void;
}

export default function ActivityFeed({
  items,
  emptyLabel = "No recent activity",
  onSelectStudyUid,
  selectedStudyUid,
  hoveredStudyUid,
  onHoverStudyUid,
}: Props) {
  if (!items.length) {
    return <p className="empty-message">{emptyLabel}</p>;
  }

  return (
    <div className="activity-feed">
      {items.map((item) => {
        const studyUid = item.type === "routing" && item.subtitle ? item.subtitle : null;
        const selectable = Boolean(studyUid && onSelectStudyUid);
        return (
        <div
          key={item.id}
          className={`activity-feed-item${selectable ? " activity-feed-item--selectable" : ""}${
            studyUid && studyUid === selectedStudyUid ? " activity-feed-item--selected" : ""
          }${studyUid && studyUid === hoveredStudyUid ? " activity-feed-item--hovered" : ""}`}
          role={selectable ? "button" : undefined}
          tabIndex={selectable ? 0 : undefined}
          onClick={selectable ? () => onSelectStudyUid!(studyUid!) : undefined}
          onMouseEnter={selectable ? () => onHoverStudyUid?.(studyUid!) : undefined}
          onMouseLeave={selectable ? () => onHoverStudyUid?.(null) : undefined}
          onKeyDown={
            selectable
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectStudyUid!(studyUid!);
                  }
                }
              : undefined
          }
        >
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
        );
      })}
    </div>
  );
}
