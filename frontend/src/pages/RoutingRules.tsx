import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import { DICOM_TAGS, OPERATORS, Node, RoutingRule } from "../types/api";

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
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RoutingRule | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["routing-rules"],
    queryFn: () => apiFetch<RoutingRule[]>("/api/v1/routing-rules"),
  });

  const { data: nodes = [] } = useQuery({
    queryKey: ["nodes"],
    queryFn: () => apiFetch<Node[]>("/api/v1/nodes"),
  });

  const destinations = nodes.filter((n) => n.node_type === "destination" && n.is_active);

  const saveMutation = useMutation({
    mutationFn: (payload: typeof form) =>
      editing
        ? apiFetch<RoutingRule>(`/api/v1/routing-rules/${editing.id}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          })
        : apiFetch<RoutingRule>("/api/v1/routing-rules", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routing-rules"] });
      setModalOpen(false);
      setEditing(null);
      setForm(emptyForm);
      setError("");
    },
    onError: (err: Error) => setError(err.message),
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
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setModalOpen(true);
  };

  const openEdit = (rule: RoutingRule) => {
    setEditing(rule);
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
    setError("");
    setModalOpen(true);
  };

  const toggleDestination = (id: string) => {
    const ids = form.destination_node_ids.includes(id)
      ? form.destination_node_ids.filter((d) => d !== id)
      : [...form.destination_node_ids, id];
    setForm({ ...form, destination_node_ids: ids });
  };

  return (
    <div>
      <div className="header-bar">
        <h2 style={{ margin: 0 }}>Routing Rules</h2>
        <button onClick={openCreate}>Add Rule</button>
      </div>

      {isLoading ? (
        <p>Loading rules...</p>
      ) : (
        <div className="card">
          <DataTable
            data={rules}
            keyField="id"
            columns={[
              { key: "name", header: "Name" },
              { key: "priority", header: "Priority" },
              {
                key: "condition",
                header: "Condition",
                render: (r) => `${r.condition_tag} ${r.condition_operator} "${r.condition_value}"`,
              },
              {
                key: "destinations",
                header: "Destinations",
                render: (r) => r.destination_node_ids.map(nodeName).join(", "),
              },
              {
                key: "is_active",
                header: "Status",
                render: (r) => (
                  <span className={`badge ${r.is_active ? "badge-active" : "badge-inactive"}`}>
                    {r.is_active ? "Active" : "Disabled"}
                  </span>
                ),
              },
              {
                key: "actions",
                header: "Actions",
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

      <Modal title={editing ? "Edit Routing Rule" : "Add Routing Rule"} open={modalOpen} onClose={() => setModalOpen(false)} wide>
        {error && <div className="alert alert-error">{error}</div>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (form.destination_node_ids.length === 0) {
              setError("Select at least one destination node.");
              return;
            }
            saveMutation.mutate(form);
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
            <div className="form-field">
              <label>Condition Tag</label>
              <select value={form.condition_tag} onChange={(e) => setForm({ ...form, condition_tag: e.target.value })}>
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
              >
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
                required
                placeholder='e.g. CT, "Hospital A", CHEST'
              />
            </div>
            <div className="form-field full-width">
              <label>Destination Nodes</label>
              <div className="checkbox-group">
                {destinations.length === 0 ? (
                  <span className="placeholder">No destination nodes configured.</span>
                ) : (
                  destinations.map((n) => (
                    <label key={n.id}>
                      <input
                        type="checkbox"
                        checked={form.destination_node_ids.includes(n.id)}
                        onChange={() => toggleDestination(n.id)}
                      />
                      {n.name}
                    </label>
                  ))
                )}
              </div>
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
