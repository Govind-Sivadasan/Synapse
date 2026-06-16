interface DataPoint {
  label: string;
  value: number;
}

interface Props {
  data: DataPoint[];
  color?: string;
  emptyLabel?: string;
  formatLabel?: (label: string) => string;
}

export default function BarChart({
  data,
  color = "var(--color-primary)",
  emptyLabel = "No data",
  formatLabel,
}: Props) {
  if (!data.length) {
    return <p className="empty-message" style={{ padding: "1.5rem" }}>{emptyLabel}</p>;
  }

  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="bar-chart">
      {data.map((point) => {
        const displayLabel = formatLabel ? formatLabel(point.label) : point.label;
        return (
        <div key={point.label} className="bar-chart-row">
          <span className="bar-chart-label" title={displayLabel}>
            {displayLabel.length > 14 ? `${displayLabel.slice(0, 14)}…` : displayLabel}
          </span>
          <div className="bar-chart-track">
            <div
              className="bar-chart-fill"
              style={{ width: `${(point.value / max) * 100}%`, background: color }}
            />
          </div>
          <span className="bar-chart-value">{point.value}</span>
        </div>
        );
      })}
    </div>
  );
}
