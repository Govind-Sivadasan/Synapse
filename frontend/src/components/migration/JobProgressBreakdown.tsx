import { MigrationJobProgress } from "../../types/api";

interface Props {
  progress: MigrationJobProgress;
  compact?: boolean;
}

const STAGES = [
  { key: "discovered" as const, label: "Discovered", tone: "var(--color-info)" },
  { key: "enqueued" as const, label: "Enqueued", tone: "var(--color-warning)" },
  { key: "in_flight" as const, label: "In flight", tone: "var(--color-primary)" },
  { key: "done" as const, label: "Done", tone: "var(--color-success)" },
];

export default function JobProgressBreakdown({ progress, compact = false }: Props) {
  const total = Math.max(progress.discovered, progress.done + progress.enqueued + progress.in_flight, 1);

  return (
    <div className={`job-progress-breakdown${compact ? " job-progress-breakdown--compact" : ""}`}>
      <div className="job-progress-breakdown-stats">
        {STAGES.map((stage) => (
          <div key={stage.key} className="job-progress-breakdown-stat">
            <span>{stage.label}</span>
            <strong>{progress[stage.key]}</strong>
          </div>
        ))}
      </div>
      <div className="job-progress-breakdown-bar" aria-hidden>
        {STAGES.map((stage) => {
          const value = progress[stage.key];
          if (!value) return null;
          return (
            <div
              key={stage.key}
              className="job-progress-breakdown-segment"
              style={{
                width: `${(value / total) * 100}%`,
                background: stage.tone,
              }}
              title={`${stage.label}: ${value}`}
            />
          );
        })}
      </div>
      {!compact && (progress.failed > 0 || progress.skipped > 0) && (
        <p className="job-progress-breakdown-note">
          {progress.failed > 0 && `${progress.failed} failed`}
          {progress.failed > 0 && progress.skipped > 0 && " · "}
          {progress.skipped > 0 && `${progress.skipped} skipped`}
        </p>
      )}
    </div>
  );
}
