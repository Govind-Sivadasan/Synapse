interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  id?: string;
  className?: string;
}

export default function Switch({
  checked,
  onChange,
  disabled,
  label,
  id,
  className,
}: SwitchProps) {
  return (
    <label className={["settings-switch", className].filter(Boolean).join(" ")}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="settings-switch-slider" aria-hidden />
      {label && <span className="switch-label">{label}</span>}
    </label>
  );
}
