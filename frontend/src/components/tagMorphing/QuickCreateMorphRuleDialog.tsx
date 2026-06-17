import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { apiFetch } from "../../api/client";
import { useAppMetadata } from "../../hooks/useAppMetadata";
import Modal from "../Modal";
import DicomTagSelect from "../forms/DicomTagSelect";
import Switch from "../ui/Switch";
import { formatNotificationMessage } from "../../lib/notificationMessages";
import { useNotifications } from "../../services/notifications";
import { TagMorphingRule } from "../../types/api";

const emptyForm = {
  name: "",
  target_tag: "InstitutionName",
  new_value: "",
  is_active: true,
};

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (rule: TagMorphingRule) => void;
}

export default function QuickCreateMorphRuleDialog({ open, onClose, onCreated }: Props) {
  const queryClient = useQueryClient();
  const { data: metadata } = useAppMetadata();
  const { error: notifyError } = useNotifications();
  const baseTags = metadata?.dicom_tags ?? ["Modality", "PatientID", "StudyDate"];
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (open) {
      setForm(emptyForm);
    }
  }, [open]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch<TagMorphingRule>("/api/v1/tag-morphing-rules", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          condition_tag: null,
          condition_operator: null,
          condition_value: null,
        }),
      }),
    onSuccess: (rule) => {
      queryClient.invalidateQueries({ queryKey: ["tag-morphing-rules"] });
      onCreated(rule);
      onClose();
    },
    onError: (err: Error) => notifyError(formatNotificationMessage(err.message)),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    saveMutation.mutate();
  };

  return (
    <Modal title="Add tag morphing rule" open={open} onClose={onClose} wide nested>
      <form onSubmit={handleSubmit}>
        <p className="form-field-hint" style={{ marginTop: 0 }}>
          Create a morphing rule without leaving this form. Your other entries are kept.
        </p>
        <div className="form-grid">
          <div className="form-field">
            <label>Rule Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <DicomTagSelect
            label="Target Tag"
            value={form.target_tag}
            onChange={(target_tag) => setForm({ ...form, target_tag })}
            baseTags={baseTags}
            required
          />
          <div className="form-field full-width">
            <label>New Value</label>
            <input
              value={form.new_value}
              onChange={(e) => setForm({ ...form, new_value: e.target.value })}
              required
            />
          </div>
          <div className="form-field">
            <Switch
              checked={form.is_active}
              onChange={(is_active) => setForm({ ...form, is_active })}
              label="Active"
            />
          </div>
        </div>
        <div className="form-actions">
          <button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (
              <>
                <Loader2 size={16} className="spin-icon" />
                Creating…
              </>
            ) : (
              "Create & select"
            )}
          </button>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saveMutation.isPending}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
