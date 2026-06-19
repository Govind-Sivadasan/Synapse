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
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { useAppMetadata } from "../hooks/useAppMetadata";
import { formatNotificationMessage } from "../lib/notificationMessages";
import { useNotifications } from "../services/notifications";
import DicomTagSelect from "../components/forms/DicomTagSelect";
import ModalitySelect from "../components/forms/ModalitySelect";
import { isModalityTag } from "../lib/dicomModalities";
import DestinationNodePicker from "../components/nodes/DestinationNodePicker";
import TagMorphingRulePicker from "../components/tagMorphing/TagMorphingRulePicker";
import Switch from "../components/ui/Switch";
import { Node, RoutingRule, TagMorphingRule } from "../types/api";

const emptyForm = {
  name: "",
  condition_tag: "Modality",
  condition_operator: "equals",
  condition_value: "",
  destination_node_ids: [] as string[],
  tag_morphing_rule_ids: [] as string[],
  priority: 100,
  is_active: true,
};

export default function RoutingRules() {
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const { data: metadata } = useAppMetadata();
  const { error: notifyError, success } = useNotifications();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["routing-rules"],
    queryFn: () => apiFetch<RoutingRule[]>("/api/v1/routing-rules"),
  });

  const { data: nodes = [] } = useQuery({
    queryKey: ["nodes"],
    queryFn: () => apiFetch<Node[]>("/api/v1/nodes"),
  });

  const { data: morphRules = [] } = useQuery({
    queryKey: ["tag-morphing-rules"],
    queryFn: () => apiFetch<TagMorphingRule[]>("/api/v1/tag-morphing-rules"),
  });

  const dicomTags = metadata?.dicom_tags ?? ["Modality", "PatientID", "StudyDate"];
  const operators = metadata?.operators ?? [{ value: "equals", label: "Equals" }];

  const saveMutation = useMutation({
    mutationFn: ({ ruleId, payload }: { ruleId: string | null; payload: typeof form }) =>
      ruleId
        ? apiFetch<RoutingRule>(`/api/v1/routing-rules/${ruleId}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          })
        : apiFetch<RoutingRule>("/api/v1/routing-rules", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routing-rules"] });
      setModalOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      success("Routing rule saved.");
    },
    onError: (err: Error) => notifyError(formatNotificationMessage(err.message)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/v1/routing-rules/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["routing-rules"] }),
  });

  const toggleMutation = useMutation({
    mutationFn: (rule: RoutingRule) =>
      apiFetch<RoutingRule>(`/api/v1/routing-rules/${rule.id}`, {
        method: "PUT",
        body: JSON.stringify({ is_active: !rule.is_active }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["routing-rules"] }),
  });

  const nodeName = (id: string) => nodes.find((n) => n.id === id)?.name ?? id.slice(0, 8);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (rule: RoutingRule) => {
    setEditingId(rule.id);
    setForm({
      name: rule.name,
      condition_tag: rule.condition_tag,
      condition_operator: rule.condition_operator,
      condition_value: rule.condition_value,
      destination_node_ids: rule.destination_node_ids,
      tag_morphing_rule_ids: rule.tag_morphing_rule_ids ?? [],
      priority: rule.priority,
      is_active: rule.is_active,
    });
    setModalOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="Routing Rules"
        description="Match incoming studies by DICOM tags and route to cloud destinations via STOW-RS."
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
            tableId="routing-rules"
            data={rules}
            keyField="id"
            paginate
            pageSize={10}
            searchable
            searchKeys={["name", "condition_tag", "condition_value"]}
            searchPlaceholder="Search routing rules…"
            defaultClientSort={{ sortBy: "priority", sortDir: "asc" }}
            columns={[
              { key: "name", header: "Name" },
              { key: "priority", header: "Priority", sortValue: (r) => r.priority },
              {
                key: "condition",
                header: "Condition",
                sortable: false,
                render: (r) => `${r.condition_tag} ${r.condition_operator} "${r.condition_value}"`,
              },
              {
                key: "destinations",
                header: "Destinations",
                sortable: false,
                render: (r) => r.destination_node_ids.map(nodeName).join(", "),
              },
              {
                key: "is_active",
                header: "Status",
                sortValue: (r) => (r.is_active ? 1 : 0),
                render: (r) => (
                  <StatusBadge status={r.is_active ? "active" : "inactive"} label={r.is_active ? "Active" : "Disabled"} />
                ),
              },
              {
                key: "actions",
                header: "Actions",
                sortable: false,
                hideable: false,
                defaultPin: "right",
                render: (r) => (
                  <>
                    <button className="btn-sm" onClick={() => openEdit(r)} style={{ marginRight: "0.25rem" }}>
                      Edit
                    </button>
                    <button className="btn-sm btn-secondary" onClick={() => toggleMutation.mutate(r)} style={{ marginRight: "0.25rem" }}>
                      {r.is_active ? "Disable" : "Enable"}
                    </button>
                    <button
                      className="btn-sm btn-danger"
                      onClick={() =>
                        confirm({
                          title: "Delete routing rule",
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

      <Modal title={editingId ? "Edit Routing Rule" : "Add Routing Rule"} open={modalOpen} onClose={() => setModalOpen(false)} wide>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (form.destination_node_ids.length === 0) {
              notifyError("Select at least one destination node.");
              return;
            }
            saveMutation.mutate({ ruleId: editingId, payload: form });
          }}
        >
          <div className="form-grid">
            <div className="form-field">
              <label>Rule Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="form-field">
              <label>Priority (lower = higher)</label>
              <input
                type="number"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
              />
            </div>
            <DicomTagSelect
              label="Condition Tag"
              value={form.condition_tag}
              onChange={(condition_tag) => setForm({ ...form, condition_tag })}
              baseTags={dicomTags}
              required
            />
            <div className="form-field">
              <label>Operator</label>
              <select
                value={form.condition_operator}
                onChange={(e) => setForm({ ...form, condition_operator: e.target.value })}
              >
                {operators.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            {isModalityTag(form.condition_tag) ? (
              <div className="full-width">
                <ModalitySelect
                  label="Condition Value"
                  value={form.condition_value}
                  onChange={(condition_value) => setForm({ ...form, condition_value })}
                  includeAny={false}
                  required
                />
              </div>
            ) : (
              <div className="form-field full-width">
                <label>Condition Value</label>
                <input
                  value={form.condition_value}
                  onChange={(e) => setForm({ ...form, condition_value: e.target.value })}
                  required
                  placeholder='e.g. CT, "Hospital A", CHEST'
                />
              </div>
            )}
            <DestinationNodePicker
              nodes={nodes}
              selectedIds={form.destination_node_ids}
              onChange={(destination_node_ids) => setForm({ ...form, destination_node_ids })}
            />
            <TagMorphingRulePicker
              rules={morphRules}
              selectedIds={form.tag_morphing_rule_ids}
              onChange={(tag_morphing_rule_ids) => setForm({ ...form, tag_morphing_rule_ids })}
            />
            <div className="form-field">
              <label>Active</label>
              <Switch
                checked={form.is_active}
                onChange={(is_active) => setForm({ ...form, is_active })}
              />
            </div>
          </div>
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
