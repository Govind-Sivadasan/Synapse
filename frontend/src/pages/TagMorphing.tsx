import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import PageHeader from "../components/ui/PageHeader";
import StatusBadge from "../components/ui/StatusBadge";
import { PageLoading } from "../components/ui/LoadingScreen";
import { DICOM_TAGS, OPERATORS, TagMorphingRule } from "../types/api";

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
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TagMorphingRule | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
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
      setError("");
      setPreview(null);
    },
    onError: (err: Error) => setError(err.message),
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
    setError("");
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
    setError("");
    setPreview(null);
    setModalOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="Tag Morphing Rules"
        description="Rewrite DICOM metadata before STOW-RS upload to cloud destinations."
        actions={<button type="button" onClick={openCreate}>Add Rule</button>}
      />

      {isLoading ? (
        <PageLoading label="Loading rules…" />
      ) : (
        <div className="card">
          <DataTable
            data={rules}
            keyField="id"
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
                      onClick={() => {
                        if (confirm(`Delete rule "${r.name}"?`)) deleteMutation.mutate(r.id);
                      }}
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
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }}>
          <div className="form-grid">
            <div className="form-field">
              <label>Rule Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="form-field">
              <label>Target Tag</label>
              <select value={form.target_tag} onChange={(e) => setForm({ ...form, target_tag: e.target.value })}>
                {DICOM_TAGS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="form-field full-width">
              <label>New Value</label>
              <input value={form.new_value} onChange={(e) => setForm({ ...form, new_value: e.target.value })} required />
            </div>
            <div className="form-field">
              <label>Condition Tag (optional)</label>
              <select
                value={form.condition_tag}
                onChange={(e) => setForm({ ...form, condition_tag: e.target.value })}
              >
                <option value="">Always apply</option>
                {DICOM_TAGS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Operator</label>
              <select
                value={form.condition_operator}
                onChange={(e) => setForm({ ...form, condition_operator: e.target.value })}
                disabled={!form.condition_tag}
              >
                <option value="">—</option>
                {OPERATORS.map((o) => (
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
              <label>
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />{" "}
                Active
              </label>
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
    </div>
  );
}
