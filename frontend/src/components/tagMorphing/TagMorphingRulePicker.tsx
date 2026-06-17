import { useState } from "react";
import { Plus } from "lucide-react";
import { TagMorphingRule } from "../../types/api";
import Checkbox from "../ui/Checkbox";
import QuickCreateMorphRuleDialog from "./QuickCreateMorphRuleDialog";

interface Props {
  rules: TagMorphingRule[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  label?: string;
}

export default function TagMorphingRulePicker({
  rules,
  selectedIds,
  onChange,
  label = "Tag Morphing Rules (optional)",
}: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const activeRules = rules.filter((r) => r.is_active);

  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id) ? selectedIds.filter((r) => r !== id) : [...selectedIds, id],
    );
  };

  return (
    <>
      <div className="form-field full-width">
        <div className="picker-field-header">
          <label>{label}</label>
          <button type="button" className="btn-sm btn-secondary" onClick={() => setCreateOpen(true)}>
            <Plus size={14} />
            Create rule
          </button>
        </div>
        <div className="checkbox-group">
          {activeRules.map((r) => (
            <Checkbox
              key={r.id}
              checked={selectedIds.includes(r.id)}
              onChange={() => toggle(r.id)}
              label={`${r.name} (${r.target_tag} → ${r.new_value})`}
            />
          ))}
          {activeRules.length === 0 && (
            <span className="placeholder">No active tag morphing rules.</span>
          )}
        </div>
      </div>

      <QuickCreateMorphRuleDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(rule) => {
          if (rule.is_active) {
            onChange([...selectedIds, rule.id]);
          }
        }}
      />
    </>
  );
}
