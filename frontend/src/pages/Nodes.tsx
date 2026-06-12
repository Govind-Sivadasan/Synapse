import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import PageHeader from "../components/ui/PageHeader";
import StatusBadge from "../components/ui/StatusBadge";
import { PageLoading } from "../components/ui/LoadingScreen";
import { Node } from "../types/api";

const emptyForm = {
  name: "",
  node_type: "destination" as const,
  protocol: "DICOMweb" as const,
  host: "",
  port: null as number | null,
  ae_title: "",
  dicomweb_url: "",
  auth_type: "none" as const,
  is_active: true,
};

export default function Nodes() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Node | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");

  const { data: nodes = [], isLoading } = useQuery({
    queryKey: ["nodes"],
    queryFn: () => apiFetch<Node[]>("/api/v1/nodes"),
  });

  const saveMutation = useMutation({
    mutationFn: (payload: typeof form) =>
      editing
        ? apiFetch<Node>(`/api/v1/nodes/${editing.id}`, { method: "PUT", body: JSON.stringify(payload) })
        : apiFetch<Node>("/api/v1/nodes", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nodes"] });
      setModalOpen(false);
      setEditing(null);
      setForm(emptyForm);
      setError("");
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/v1/nodes/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["nodes"] }),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setModalOpen(true);
  };

  const openEdit = (node: Node) => {
    setEditing(node);
    setForm({
      name: node.name,
      node_type: node.node_type,
      protocol: node.protocol,
      host: node.host,
      port: node.port,
      ae_title: node.ae_title ?? "",
      dicomweb_url: node.dicomweb_url ?? "",
      auth_type: (node.auth_type as "none") ?? "none",
      is_active: node.is_active,
    });
    setError("");
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({
      ...form,
      port: form.port || null,
      ae_title: form.ae_title || null,
      dicomweb_url: form.dicomweb_url || null,
      auth_type: form.auth_type || "none",
    });
  };

  return (
    <div>
      <PageHeader
        title="Node Configuration"
        description="Register source DIMSE endpoints and destination DICOMweb PACS nodes."
        actions={<button type="button" onClick={openCreate}>Add Node</button>}
      />

      {isLoading ? (
        <PageLoading label="Loading nodes…" />
      ) : (
        <div className="card">
          <DataTable
            data={nodes}
            keyField="id"
            columns={[
              { key: "name", header: "Name" },
              { key: "node_type", header: "Type" },
              { key: "protocol", header: "Protocol" },
              { key: "host", header: "Host" },
              {
                key: "is_active",
                header: "Status",
                render: (n) => (
                  <StatusBadge status={n.is_active ? "active" : "inactive"} label={n.is_active ? "Active" : "Inactive"} />
                ),
              },
              {
                key: "actions",
                header: "Actions",
                render: (n) => (
                  <>
                    <button className="btn-sm" onClick={() => openEdit(n)} style={{ marginRight: "0.5rem" }}>
                      Edit
                    </button>
                    <button
                      className="btn-sm btn-danger"
                      onClick={() => {
                        if (confirm(`Delete node "${n.name}"?`)) deleteMutation.mutate(n.id);
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

      <Modal title={editing ? "Edit Node" : "Add Node"} open={modalOpen} onClose={() => setModalOpen(false)} wide>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-field">
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="form-field">
              <label>Type</label>
              <select
                value={form.node_type}
                onChange={(e) => setForm({ ...form, node_type: e.target.value as "source" | "destination" })}
              >
                <option value="source">Source</option>
                <option value="destination">Destination</option>
              </select>
            </div>
            <div className="form-field">
              <label>Protocol</label>
              <select
                value={form.protocol}
                onChange={(e) => setForm({ ...form, protocol: e.target.value as "DIMSE" | "DICOMweb" })}
              >
                <option value="DIMSE">DIMSE</option>
                <option value="DICOMweb">DICOMweb</option>
              </select>
            </div>
            <div className="form-field">
              <label>Host</label>
              <input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} required />
            </div>
            <div className="form-field">
              <label>Port</label>
              <input
                type="number"
                value={form.port ?? ""}
                onChange={(e) => setForm({ ...form, port: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
            <div className="form-field">
              <label>AE Title</label>
              <input value={form.ae_title} onChange={(e) => setForm({ ...form, ae_title: e.target.value })} />
            </div>
            <div className="form-field full-width">
              <label>DICOMweb URL</label>
              <input
                value={form.dicomweb_url}
                onChange={(e) => setForm({ ...form, dicomweb_url: e.target.value })}
                placeholder="http://orthanc-cloud:8042/dicom-web"
              />
            </div>
            <div className="form-field">
              <label>Auth Type</label>
              <select
                value={form.auth_type}
                onChange={(e) => setForm({ ...form, auth_type: e.target.value as "none" })}
              >
                <option value="none">None</option>
                <option value="basic">Basic</option>
                <option value="bearer">Bearer</option>
                <option value="apikey">API Key</option>
              </select>
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
