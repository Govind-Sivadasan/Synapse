import { statusVariant } from "./StatusBadge";

type ChipTone = "success" | "error" | "warning" | "info" | "neutral";

interface Option {
  value: string;
  label: string;
  tone?: ChipTone;
}

interface Props {
  label?: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
}

export default function FilterChips({ label, options, value, onChange }: Props) {
  return (
    <div className="filter-chips" role="group" aria-label={label ?? "Filter"}>
      {label && <span className="filter-chips-label">{label}</span>}
      <div className="filter-chips-row">
        {options.map((opt) => {
          const tone = opt.tone ?? (opt.value ? statusVariant(opt.value) : "neutral");
          const active = value === opt.value;
          return (
            <button
              key={opt.value || "__all__"}
              type="button"
              className={`filter-chip filter-chip--${tone}${active ? " filter-chip--active" : ""}`}
              aria-pressed={active}
              onClick={() => onChange(opt.value)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
