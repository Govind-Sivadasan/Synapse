import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import {
  DICOM_MODALITIES,
  DicomModalityOption,
  filterModalities,
  formatModalityLabel,
} from "../../lib/dicomModalities";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
  /** Show "Any modality" when true (migration filters). Default true. */
  includeAny?: boolean;
  required?: boolean;
  disabled?: boolean;
  emptyLabel?: string;
}

export default function ModalitySelect({
  label,
  value,
  onChange,
  id,
  includeAny = true,
  required,
  disabled,
  emptyLabel = "Select modality…",
}: Props) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const listboxId = `${fieldId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = useMemo((): DicomModalityOption | null => {
    if (!value) {
      return includeAny ? DICOM_MODALITIES[0] : null;
    }
    return DICOM_MODALITIES.find((m) => m.value === value) ?? { value, code: value, name: value };
  }, [value, includeAny]);

  const filtered = useMemo(() => filterModalities(search, { includeAny }), [search, includeAny]);

  const displayLabel = selected ? formatModalityLabel(selected) : emptyLabel;

  const close = () => {
    setOpen(false);
    setSearch("");
  };

  const selectOption = (option: DicomModalityOption) => {
    onChange(option.value);
    close();
  };

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        close();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    searchRef.current?.focus();
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={`form-field modality-combobox${open ? " modality-combobox--open" : ""}${disabled ? " modality-combobox--disabled" : ""}`}
    >
      <label id={`${fieldId}-label`} htmlFor={fieldId}>
        {label}
      </label>

      <button
        id={fieldId}
        type="button"
        className={`modality-combobox-trigger${!selected && !includeAny ? " modality-combobox-trigger--placeholder" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-labelledby={`${fieldId}-label`}
        aria-required={required}
        disabled={disabled}
        onClick={() => {
          if (!disabled) setOpen((prev) => !prev);
        }}
      >
        <span className="modality-combobox-value">{displayLabel}</span>
        <ChevronDown size={16} strokeWidth={2} aria-hidden className="modality-combobox-chevron" />
      </button>

      {open && (
        <div className="modality-combobox-menu">
          <div className="modality-combobox-search">
            <Search size={16} strokeWidth={2} aria-hidden />
            <input
              ref={searchRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by code…"
              aria-label="Search modality codes"
              onKeyDown={(e) => {
                if (e.key === "Enter" && filtered[0]) {
                  e.preventDefault();
                  selectOption(filtered[0]);
                }
              }}
            />
          </div>

          <ul id={listboxId} className="modality-combobox-list" role="listbox" aria-labelledby={`${fieldId}-label`}>
            {filtered.length === 0 ? (
              <li className="modality-combobox-empty" role="presentation">
                No modality codes match &ldquo;{search.trim()}&rdquo;
              </li>
            ) : (
              filtered.map((m) => {
                const active = m.value === value;
                return (
                  <li key={m.value || "any"} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`modality-combobox-option${active ? " modality-combobox-option--active" : ""}`}
                      onClick={() => selectOption(m)}
                    >
                      <span className="modality-combobox-option-code">{m.code || "—"}</span>
                      <span className="modality-combobox-option-name">{m.name}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export type { DicomModalityOption };
