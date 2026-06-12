import { ReactNode } from "react";

type Tone = "primary" | "success" | "warning" | "error" | "info" | "default";

interface Props {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  sub?: string;
}

export default function MetricCard({ label, value, icon, tone = "default", sub }: Props) {
  const valueClass = tone === "primary" ? "metric-value metric-value--primary" : "metric-value";

  return (
    <div className="metric-card">
      {icon && (
        <div className="metric-card-header">
          <div className={`metric-icon metric-icon--${tone === "default" ? "primary" : tone}`}>{icon}</div>
        </div>
      )}
      <div className={valueClass}>{value}</div>
      <div className="metric-label">{label}</div>
      {sub && <div className="metric-sub">{sub}</div>}
    </div>
  );
}
