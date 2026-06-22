import FloatingTooltip from "./FloatingTooltip";

interface DataPoint {
  label: string;
  value: number;
}

interface Props {
  data: DataPoint[];
  color?: string;
  emptyLabel?: string;
  formatLabel?: (label: string) => string;
  /** Lay out rows in two columns (fills top-to-bottom, left then right). */
  columns?: 1 | 2;
  /** Show hover tooltip with label, count, and share of total. */
  showTooltip?: boolean;
}

export default function BarChart({
  data,
  color = "var(--color-primary)",
  emptyLabel = "No data",
  formatLabel,
  columns = 1,
  showTooltip = true,
}: Props) {
  if (!data.length) {
    return <p className="empty-message" style={{ padding: "1.5rem" }}>{emptyLabel}</p>;
  }

  const max = Math.max(...data.map((d) => d.value), 1);
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const chartClass = ["bar-chart", columns === 2 ? "bar-chart--cols-2" : ""].filter(Boolean).join(" ");

  return (
    <div className={chartClass}>
      {data.map((point) => {
        const displayLabel = formatLabel ? formatLabel(point.label) : point.label;
        const row = (
          <>
            <span className="bar-chart-label" title={displayLabel}>
              {displayLabel}
            </span>
            <div className="bar-chart-track">
              <div
                className="bar-chart-fill"
                style={{ width: `${(point.value / max) * 100}%`, background: color }}
              />
            </div>
            <span className="bar-chart-value">{point.value.toLocaleString()}</span>
          </>
        );

        if (!showTooltip) {
          return (
            <div key={point.label} className="bar-chart-row">
              {row}
            </div>
          );
        }

        return (
          <FloatingTooltip
            key={point.label}
            className="bar-chart-row"
            placement="below"
            content={
              <>
                <strong>{displayLabel}</strong>
                <span>
                  {point.value.toLocaleString()} events ·{" "}
                  {total > 0 ? `${((point.value / total) * 100).toFixed(1)}%` : "0%"} of total
                </span>
              </>
            }
          >
            {row}
          </FloatingTooltip>
        );
      })}
    </div>
  );
}
