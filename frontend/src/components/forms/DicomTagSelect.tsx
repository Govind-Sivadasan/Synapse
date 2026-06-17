import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { mergeDicomTags, useCustomDicomTags } from "../../hooks/useCustomDicomTags";

interface Props {
  label: string;
  value: string;
  onChange: (tag: string) => void;
  baseTags: string[];
  allowEmpty?: boolean;
  emptyLabel?: string;
  required?: boolean;
}

export default function DicomTagSelect({
  label,
  value,
  onChange,
  baseTags,
  allowEmpty,
  emptyLabel = "—",
  required,
}: Props) {
  const { customTags, addTag } = useCustomDicomTags();
  const [customInput, setCustomInput] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const allTags = useMemo(() => mergeDicomTags(baseTags, customTags), [baseTags, customTags]);

  const handleAddCustom = () => {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    if (addTag(trimmed)) {
      onChange(trimmed);
    }
    setCustomInput("");
    setShowAdd(false);
  };

  return (
    <div className="form-field dicom-tag-select">
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} required={required}>
        {allowEmpty && <option value="">{emptyLabel}</option>}
        {allTags.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      {!showAdd ? (
        <button type="button" className="btn-text" onClick={() => setShowAdd(true)}>
          <Plus size={14} />
          Add custom tag
        </button>
      ) : (
        <div className="dicom-tag-select-custom">
          <input
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            placeholder="e.g. InstitutionName"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddCustom();
              }
            }}
          />
          <button type="button" className="btn-sm" disabled={!customInput.trim()} onClick={handleAddCustom}>
            Add
          </button>
          <button type="button" className="btn-sm btn-secondary" onClick={() => setShowAdd(false)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
