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
  const inputRef = useRef<HTMLInputElement>(null);

  const commitCombo = (combo: string) => {
    onChange(combo);
    setRecording(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    e.preventDefault();
    e.stopPropagation();

    if (e.key === "Escape") {
      setRecording(false);
      inputRef.current?.blur();
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

  return (
    <div className={`prefs-hotkey-capture${recording ? " prefs-hotkey-capture--recording" : ""}`}>
      <input
        ref={inputRef}
        className={`prefs-hotkey-input${recording ? " prefs-hotkey-input--recording" : ""}`}
        value={value}
        disabled={disabled}
        readOnly
        placeholder={recording ? "Press keys… (Esc to cancel)" : placeholder ?? "Click & press keys"}
        aria-label={ariaLabel}
        onFocus={() => {
          if (!disabled) setRecording(true);
        }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        title="Click here and press a key combination (e.g. Alt+Shift+R). Esc cancels."
      />
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
