import { useRef, useState } from "react";
import { eventToHotkeyCombo, formatHotkeyDisplay, validateHotkeyCombo } from "../../lib/hotkeys";

interface Props {
  value: string;
  disabled?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
  "aria-label"?: string;
}

export default function HotkeyCaptureInput({
  value,
  disabled,
  placeholder,
  onChange,
  "aria-label": ariaLabel,
}: Props) {
  const [recording, setRecording] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

  const commitCombo = (combo: string) => {
    onChange(combo);
    setRecording(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;

    e.preventDefault();
    e.stopPropagation();

    if (e.key === "Escape") {
      setRecording(false);
      captureRef.current?.blur();
      return;
    }

    if (e.key === "Backspace" && !e.ctrlKey && !e.altKey && !e.metaKey) {
      onChange("");
      return;
    }

    const combo = eventToHotkeyCombo(e.nativeEvent);
    if (!combo) return;

    commitCombo(combo);
  };

  const handleBlur = () => {
    setRecording(false);
    const validation = validateHotkeyCombo(value);
    if (validation.valid && validation.display && validation.display !== value) {
      onChange(validation.display);
    }
  };

  const displayValue = value ? formatHotkeyDisplay(value) : "";

  return (
    <div
      ref={captureRef}
      role="textbox"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-readonly="true"
      className={[
        "settings-input",
        "prefs-hotkey-capture",
        recording ? "prefs-hotkey-capture--recording" : "",
        disabled ? "prefs-hotkey-capture--disabled" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onFocus={() => {
        if (!disabled) setRecording(true);
      }}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      title="Click here and press a key combination (e.g. Alt+Shift+R). Esc cancels."
    >
      {recording ? (
        <span className="prefs-hotkey-capture-hint">Press keys… (Esc to cancel)</span>
      ) : displayValue ? (
        <HotkeyComboDisplay combo={value} />
      ) : (
        <span className="prefs-hotkey-capture-placeholder">
          {placeholder ?? "Click & press keys"}
        </span>
      )}
    </div>
  );
}

export function HotkeyComboDisplay({ combo }: { combo: string }) {
  const display = formatHotkeyDisplay(combo);
  const parts = display.split("+");
  return (
    <span className="hotkey-combo-display">
      {parts.map((part, i) => (
        <span key={`${part}-${i}`}>
          {i > 0 && <span className="hotkey-combo-plus">+</span>}
          <kbd>{part}</kbd>
        </span>
      ))}
    </span>
  );
}
