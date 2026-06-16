interface Option {
  value: string;
  label: string;
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
        {options.map((opt) => (
          <button
            key={opt.value || "__all__"}
            type="button"
            className={`filter-chip${value === opt.value ? " filter-chip--active" : ""}`}
            aria-pressed={value === opt.value}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
