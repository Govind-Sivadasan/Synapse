import { ReactNode } from "react";

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  className?: string;
  disabled?: boolean;
}

export default function Checkbox({ checked, onChange, label, className, disabled }: Props) {
  return (
    <label className={["form-checkbox", className].filter(Boolean).join(" ")}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="form-checkbox-label">{label}</span>
    </label>
  );
}
