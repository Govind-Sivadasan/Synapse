import { routingStatusLabel } from "../../lib/statusLabels";
import { statusVariant } from "./StatusBadge";

const STATUS_COLORS: Record<string, string> = {
  success: "var(--color-success)",
  error: "var(--color-error)",
  warning: "var(--color-warning)",
  info: "var(--color-info)",
  neutral: "var(--color-text-muted)",
};

const STATUS_HINTS: Record<string, string> = {
  pending: "Waiting to be migrated.",
  in_progress: "Migration in progress.",
  success: "Study migrated successfully.",
  failed: "Migration failed. Use Retry to attempt again.",
  skipped: "Study was skipped.",
};

const PROGRESS_FRACTION: Record<string, number> = {
  pending: 0.2,
  in_progress: 0.72,
  failed: 0.78,
  skipped: 0.45,
};

interface Props {
  status: string;
  size?: number;
}

export default function StudyProgressRing({ status, size = 28 }: Props) {
  const normalized = status.toLowerCase();
  const variant = statusVariant(status);
  const color = STATUS_COLORS[variant];
  const label = routingStatusLabel(status);
  const hint = STATUS_HINTS[normalized] ?? label;
  const center = size / 2;
  const innerRadius = size * 0.28;
  const outerRadius = size * 0.44;
  const dotCount = 12;
  const circumference = 2 * Math.PI * outerRadius;
  const showOuterRing = normalized !== "success";
  const progressFraction = PROGRESS_FRACTION[normalized] ?? 0.35;
  const joinedLength = circumference * progressFraction;
  const gapLength = circumference - joinedLength;

  return (
    <span
      className={`study-progress-ring study-progress-ring--${normalized}`}
      title={`${label} — ${hint}`}
      aria-label={`${label}: ${hint}`}
      role="img"
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        {showOuterRing && (
          <g className="study-progress-ring-outer">
            {/* Dotted track — remaining / unjoined portion */}
            <circle
              cx={center}
              cy={center}
              r={outerRadius}
              fill="none"
              stroke={color}
              strokeWidth={size * 0.045}
              strokeDasharray={`${size * 0.04} ${size * 0.07}`}
              strokeLinecap="round"
              opacity={0.35}
              transform={`rotate(-90 ${center} ${center})`}
            />

            {/* Solid arc joining dots */}
            <circle
              className="study-progress-ring-arc"
              cx={center}
              cy={center}
              r={outerRadius}
              fill="none"
              stroke={color}
              strokeWidth={size * 0.055}
              strokeDasharray={`${joinedLength} ${gapLength}`}
              strokeLinecap="round"
              transform={`rotate(-90 ${center} ${center})`}
            />

            {/* Outer dot markers */}
            {Array.from({ length: dotCount }).map((_, index) => {
              const angle = (index / dotCount) * Math.PI * 2 - Math.PI / 2;
              const dotProgress = (index + 1) / dotCount;
              const isJoined = dotProgress <= progressFraction;
              const x = center + Math.cos(angle) * outerRadius;
              const y = center + Math.sin(angle) * outerRadius;
              return (
                <circle
                  key={index}
                  cx={x}
                  cy={y}
                  r={size * 0.032}
                  fill={isJoined ? color : "var(--color-border)"}
                  opacity={isJoined ? 1 : 0.55}
                />
              );
            })}
          </g>
        )}

        <circle cx={center} cy={center} r={innerRadius} fill={color} />

        {normalized === "success" && (
          <path
            d={`M ${center - innerRadius * 0.45} ${center + innerRadius * 0.05} L ${center - innerRadius * 0.05} ${center + innerRadius * 0.45} L ${center + innerRadius * 0.55} ${center - innerRadius * 0.35}`}
            fill="none"
            stroke="#fff"
            strokeWidth={size * 0.07}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {normalized === "failed" && (
          <>
            <path
              d={`M ${center - innerRadius * 0.35} ${center - innerRadius * 0.35} L ${center + innerRadius * 0.35} ${center + innerRadius * 0.35}`}
              fill="none"
              stroke="#fff"
              strokeWidth={size * 0.07}
              strokeLinecap="round"
            />
            <path
              d={`M ${center + innerRadius * 0.35} ${center - innerRadius * 0.35} L ${center - innerRadius * 0.35} ${center + innerRadius * 0.35}`}
              fill="none"
              stroke="#fff"
              strokeWidth={size * 0.07}
              strokeLinecap="round"
            />
          </>
        )}

        {normalized === "in_progress" && (
          <circle cx={center} cy={center} r={innerRadius * 0.2} fill="#fff" opacity={0.95} />
        )}

        {normalized === "pending" && (
          <circle cx={center} cy={center} r={innerRadius * 0.16} fill="#fff" opacity={0.85} />
        )}

        {normalized === "skipped" && (
          <path
            d={`M ${center - innerRadius * 0.4} ${center} L ${center + innerRadius * 0.4} ${center}`}
            fill="none"
            stroke="#fff"
            strokeWidth={size * 0.07}
            strokeLinecap="round"
          />
        )}
      </svg>
    </span>
  );
}
