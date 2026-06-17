import { useState } from "react";
import { Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ActionButton from "../components/ui/ActionButton";
import { apiFetch } from "../api/client";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import PageHeader from "../components/ui/PageHeader";
import StatusBadge from "../components/ui/StatusBadge";
import { PageLoading } from "../components/ui/LoadingScreen";
import DicomTagSelect from "../components/forms/DicomTagSelect";
import Switch from "../components/ui/Switch";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { useAppMetadata } from "../hooks/useAppMetadata";
import { formatNotificationMessage } from "../lib/notificationMessages";
import { useNotifications } from "../services/notifications";
import { TagMorphingRule } from "../types/api";

const emptyForm = {
  name: "",
  condition_tag: "",
  condition_operator: "",
  condition_value: "",
  target_tag: "InstitutionName",
  new_value: "",
  is_active: true,
};

export default function TagMorphing() {
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const { data: metadata } = useAppMetadata();
  const { error: notifyError, success } = useNotifications();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TagMorphingRule | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [preview, setPreview] = useState<{ original_value: string; new_value: string; applies: boolean } | null>(null);

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["tag-morphing-rules"],
    queryFn: () => apiFetch<TagMorphingRule[]>("/api/v1/tag-morphing-rules"),
  });

  const saveMutation = useMutation({
    mutationFn: (payload: typeof form) => {
      const body = {
        ...payload,
        condition_tag: payload.condition_tag || null,
        condition_operator: payload.condition_operator || null,
        condition_value: payload.condition_value || null,
      };
      return editing
        ? apiFetch<TagMorphingRule>(`/api/v1/tag-morphing-rules/${editing.id}`, {
            method: "PUT",
            body: JSON.stringify(body),
          })
        : apiFetch<TagMorphingRule>("/api/v1/tag-morphing-rules", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tag-morphing-rules"] });
      setModalOpen(false);
      setEditing(null);
      setForm(emptyForm);
      setPreview(null);
      success("Tag morphing rule saved.");
    },
    onError: (err: Error) => notifyError(formatNotificationMessage(err.message)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/v1/tag-morphing-rules/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tag-morphing-rules"] }),
  });

  const previewMutation = useMutation({
    mutationFn: (ruleId: string) =>
      apiFetch<{ applies: boolean; original_value: string; new_value: string }>(
        `/api/v1/tag-morphing-rules/${ruleId}/preview`,
        {
          method: "POST",
          body: JSON.stringify({
            metadata: {
              Modality: "CT",
              InstitutionName: "Original Hospital",
              [form.target_tag]: "Original Hospital",
            },
          }),
        }
      ),
    onSuccess: (data) => setPreview(data),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setPreview(null);
    setModalOpen(true);
  };

  const openEdit = (rule: TagMorphingRule) => {
    setEditing(rule);
    setForm({
      name: rule.name,
      condition_tag: rule.condition_tag ?? "",
      condition_operator: rule.condition_operator ?? "",
      condition_value: rule.condition_value ?? "",
      target_tag: rule.target_tag,
      new_value: rule.new_value,
      is_active: rule.is_active,
    });
    setPreview(null);
    setModalOpen(true);
  };

  const dicomTags = metadata?.dicom_tags ?? ["Modality", "InstitutionName"];
  const operators = metadata?.operators ?? [{ value: "equals", label: "Equals" }];

  return (
    <div>
      <PageHeader
        title="Tag Morphing Rules"
        description="Rewrite DICOM metadata before STOW-RS upload to cloud destinations."
        actions={
          <ActionButton icon={<Plus size={16} />} onClick={openCreate}>
            Add Rule
          </ActionButton>
        }
      />

      {isLoading ? (
        <PageLoading label="Loading rules…" />
      ) : (
        <div className="card">
          <DataTable
            data={rules}
            keyField="id"
            paginate
            pageSize={10}
            searchable
            searchKeys={["name", "target_tag", "new_value", "condition_tag"]}
            searchPlaceholder="Search morphing rules…"
            columns={[
              { key: "name", header: "Name" },
              { key: "target_tag", header: "Target Tag" },
              { key: "new_value", header: "New Value" },
              {
                key: "condition",
                header: "Condition",
                render: (r) =>
                  r.condition_tag
                    ? `${r.condition_tag} ${r.condition_operator} "${r.condition_value}"`
                    : "Always apply",
              },
              {
                key: "is_active",
                header: "Status",
                render: (r) => (
                  <StatusBadge status={r.is_active ? "active" : "inactive"} label={r.is_active ? "Active" : "Disabled"} />
                ),
              },
              {
                key: "actions",
                header: "Actions",
                render: (r) => (
                  <>
                    <button className="btn-sm" onClick={() => openEdit(r)} style={{ marginRight: "0.5rem" }}>
                      Edit
                    </button>
                    <button
                      className="btn-sm btn-danger"
                      onClick={() =>
                        confirm({
                          title: "Delete tag morphing rule",
                          message: (
                            <p>
                              Delete <strong>{r.name}</strong>? This cannot be undone.
                            </p>
                          ),
                          confirmLabel: "Delete",
                          onConfirm: () => deleteMutation.mutate(r.id),
                        })
                      }
                    >
                      Delete
                    </button>
                  </>
                ),
              },
            ]}
          />
        </div>
      )}

      <Modal
        title={editing ? "Edit Tag Morphing Rule" : "Add Tag Morphing Rule"}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        wide
      >
        <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }}>
          <div className="form-grid">
            <div className="form-field">
              <label>Rule Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <DicomTagSelect
              label="Target Tag"
              value={form.target_tag}
              onChange={(target_tag) => setForm({ ...form, target_tag })}
              baseTags={dicomTags}
              required
            />
            <div className="form-field full-width">
              <label>New Value</label>
              <input value={form.new_value} onChange={(e) => setForm({ ...form, new_value: e.target.value })} required />
            </div>
            <DicomTagSelect
              label="Condition Tag (optional)"
              value={form.condition_tag}
              onChange={(condition_tag) => setForm({ ...form, condition_tag })}
              baseTags={dicomTags}
              allowEmpty
              emptyLabel="Always apply"
            />
            <div className="form-field">
              <label>Operator</label>
              <select
                value={form.condition_operator}
                onChange={(e) => setForm({ ...form, condition_operator: e.target.value })}
                disabled={!form.condition_tag}
              >
                <option value="">—</option>
                {operators.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="form-field full-width">
              <label>Condition Value</label>
              <input
                value={form.condition_value}
                onChange={(e) => setForm({ ...form, condition_value: e.target.value })}
                disabled={!form.condition_tag}
              />
            </div>
            <div className="form-field">
              <label>Active</label>
              <Switch
                checked={form.is_active}
                onChange={(is_active) => setForm({ ...form, is_active })}
              />
            </div>
          </div>

          {editing && (
            <div style={{ marginTop: "1rem" }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => previewMutation.mutate(editing.id)}
                disabled={previewMutation.isPending}
              >
                Preview with sample CT metadata
              </button>
              {preview && (
                <div className="card" style={{ marginTop: "0.75rem" }}>
                  <p><strong>Applies:</strong> {preview.applies ? "Yes" : "No"}</p>
                  <p><strong>Before:</strong> {preview.original_value || "(empty)"}</p>
                  <p><strong>After:</strong> {preview.new_value}</p>
                </div>
              )}
            </div>
          )}

          <div className="form-actions">
            <button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : "Save"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog loading={deleteMutation.isPending} />
    </div>
  );
}
