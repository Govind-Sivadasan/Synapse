interface DataPoint {
  label: string;
  value: number;
}

interface Props {
  data: DataPoint[];
  color?: string;
  emptyLabel?: string;
}

export default function BarChart({ data, color = "var(--color-primary)", emptyLabel = "No data" }: Props) {
  if (!data.length) {
    return <p className="empty-message" style={{ padding: "1.5rem" }}>{emptyLabel}</p>;
  }

  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="bar-chart">
      {data.map((point) => (
        <div key={point.label} className="bar-chart-row">
          <span className="bar-chart-label" title={point.label}>
            {point.label.length > 10 ? `${point.label.slice(0, 10)}…` : point.label}
          </span>
          <div className="bar-chart-track">
            <div
              className="bar-chart-fill"
              style={{ width: `${(point.value / max) * 100}%`, background: color }}
            />
          </div>
          <span className="bar-chart-value">{point.value}</span>
        </div>
      ))}
    </div>
  );
}
