import { MigrationThroughputSample } from "../../types/api";

interface Props {
  samples: MigrationThroughputSample[];
  metric: "studies" | "bytes";
  emptyLabel?: string;
}

function sampleValue(sample: MigrationThroughputSample, metric: Props["metric"]): number {
  return metric === "studies" ? sample.studies_per_minute : sample.megabytes_per_second;
}

function formatTick(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ThroughputSparkChart({
  samples,
  metric,
  emptyLabel = "No throughput samples yet",
}: Props) {
  const recent = samples.filter((s) => sampleValue(s, metric) > 0).slice(-20);
  const display = recent.length > 0 ? recent : samples.slice(-12);

  if (!display.length || display.every((s) => sampleValue(s, metric) === 0)) {
    return <p className="empty-message throughput-spark-empty">{emptyLabel}</p>;
  }

  const max = Math.max(...display.map((s) => sampleValue(s, metric)), 0.001);

  return (
    <div className="throughput-spark">
      {display.map((sample) => {
        const value = sampleValue(sample, metric);
        return (
          <div key={sample.timestamp} className="throughput-spark-bar-wrap" title={`${formatTick(sample.timestamp)}: ${value}`}>
            <div
              className="throughput-spark-bar"
              style={{ height: `${Math.max(4, (value / max) * 100)}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}
