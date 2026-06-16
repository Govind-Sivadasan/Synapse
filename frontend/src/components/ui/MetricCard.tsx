import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

type Tone = "primary" | "success" | "warning" | "error" | "info" | "default";

export interface MetricCardAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface Props {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  sub?: string;
  /** @deprecated use actions — kept for simple single-link cards */
  href?: string;
  actions?: MetricCardAction[];
  /** Larger KPI style for report summary tiles */
  variant?: "default" | "kpi";
}

export default function MetricCard({
  label,
  value,
  icon,
  tone = "default",
  sub,
  href,
  actions,
  variant = "default",
}: Props) {
  const toneClass = tone === "default" ? "primary" : tone;
  const footerActions =
    actions && actions.length > 0
      ? actions
      : href
        ? [{ label: "View details", href }]
        : [];

  const cardClass = [
    "metric-card",
    `metric-card--${toneClass}`,
    variant === "kpi" ? "metric-card--kpi" : "",
    footerActions.length > 0 ? "metric-card--has-footer" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cardClass}>
      <div className="metric-card__body">
        {icon && <div className={`metric-icon metric-icon--${toneClass}`}>{icon}</div>}
        <div className="metric-card__content">
          <div className={`metric-value${tone === "primary" ? " metric-value--primary" : ""}`}>{value}</div>
          <div className="metric-label">{label}</div>
          {sub && <div className="metric-sub">{sub}</div>}
        </div>
      </div>

      {footerActions.length > 0 && (
        <div className="metric-card__footer">
          {footerActions.map((action) =>
            action.href ? (
              <Link key={action.label} to={action.href} className="metric-footer-action">
                {action.label}
                <ArrowRight size={13} strokeWidth={2.5} />
              </Link>
            ) : (
              <button
                key={action.label}
                type="button"
                className="metric-footer-action"
                onClick={action.onClick}
              >
                {action.label}
                <ArrowRight size={13} strokeWidth={2.5} />
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
