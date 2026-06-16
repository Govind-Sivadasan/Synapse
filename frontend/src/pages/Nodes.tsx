import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Radio } from "lucide-react";
import { apiFetch } from "../api/client";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import PageHeader from "../components/ui/PageHeader";
import StatusBadge from "../components/ui/StatusBadge";
import { PageLoading } from "../components/ui/LoadingScreen";
import AutoDismissAlert from "../components/ui/AutoDismissAlert";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { useAppMetadata } from "../hooks/useAppMetadata";
import { buildNodePayload, NodeFormState } from "../lib/nodes";
import { Node, NodeEchoResult } from "../types/api";

const emptyForm: NodeFormState = {
  name: "",
  node_type: "destination",
  protocol: "DICOMweb",
  host: "",
  port: null,
  ae_title: "",
  dicomweb_url: "",
  auth_type: "none",
  is_active: true,
};

export default function Nodes() {
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const { data: metadata } = useAppMetadata();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [echoResult, setEchoResult] = useState<{ nodeId: string; result: NodeEchoResult } | null>(null);

  const { data: nodes = [], isLoading } = useQuery({
    queryKey: ["nodes"],
    queryFn: () => apiFetch<Node[]>("/api/v1/nodes"),
  });

  const saveMutation = useMutation({
    mutationFn: ({ nodeId, payload }: { nodeId: string | null; payload: ReturnType<typeof buildNodePayload> }) =>
      nodeId
        ? apiFetch<Node>(`/api/v1/nodes/${nodeId}`, { method: "PUT", body: JSON.stringify(payload) })
        : apiFetch<Node>("/api/v1/nodes", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nodes"] });
      setModalOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      setError("");
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/v1/nodes/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["nodes"] }),
  });

  const echoMutation = useMutation({
    mutationFn: (id: string) => apiFetch<NodeEchoResult>(`/api/v1/nodes/${id}/echo`, { method: "POST" }),
    onSuccess: (result, nodeId) => setEchoResult({ nodeId, result }),
    onError: (err: Error, nodeId) =>
      setEchoResult({
        nodeId,
        result: { success: false, protocol: "", message: err.message },
      }),
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setModalOpen(true);
  };

  const openEdit = (node: Node) => {
    setEditingId(node.id);
    setForm({
      name: node.name,
      node_type: node.node_type,
      protocol: node.protocol,
      host: node.host,
      port: node.port,
      ae_title: node.ae_title ?? "",
      dicomweb_url: node.dicomweb_url ?? "",
      auth_type: node.auth_type ?? "none",
      is_active: node.is_active,
    });
    setError("");
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({
      nodeId: editingId,
      payload: buildNodePayload(form, !!editingId),
    });
  };

  const nodeTypes = metadata?.node_types ?? [
    { value: "source", label: "Source" },
    { value: "destination", label: "Destination" },
  ];
  const protocols = metadata?.protocols ?? [
    { value: "DIMSE", label: "DIMSE" },
    { value: "DICOMweb", label: "DICOMweb" },
  ];
  const authTypes = metadata?.auth_types ?? [
    { value: "none", label: "None" },
    { value: "basic", label: "Basic" },
    { value: "bearer", label: "Bearer" },
    { value: "apikey", label: "API Key" },
  ];

  return (
    <div>
      <PageHeader
        title="Node Configuration"
        description="Register source DIMSE endpoints and destination DICOMweb PACS nodes."
        actions={<button type="button" onClick={openCreate}>Add Node</button>}
      />

      {echoResult && (
        <AutoDismissAlert
          variant={echoResult.result.success ? "success" : "error"}
          onDismiss={() => setEchoResult(null)}
        >
          <span>
            <strong>{nodes.find((n) => n.id === echoResult.nodeId)?.name ?? "Node"}:</strong>{" "}
            {echoResult.result.message}
            {echoResult.result.latency_ms != null && (
              <span className="alert-muted"> ({echoResult.result.latency_ms} ms)</span>
            )}
          </span>
        </AutoDismissAlert>
      )}

      {isLoading ? (
        <PageLoading label="Loading nodes…" />
      ) : (
        <div className="card">
          <DataTable
            data={nodes}
            keyField="id"
            paginate
            pageSize={10}
            searchable
            searchKeys={["name", "node_type", "protocol", "host", "ae_title"]}
            searchPlaceholder="Search nodes…"
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
                render: (n) => {
                  const echoing = echoMutation.isPending && echoMutation.variables === n.id;
                  return (
                    <div className="table-actions">
                      <button
                        type="button"
                        className="btn-sm btn-secondary"
                        disabled={echoMutation.isPending}
                        onClick={() => {
                          setEchoResult(null);
                          echoMutation.mutate(n.id);
                        }}
                      >
                        {echoing ? <Loader2 size={14} className="spin-icon" /> : <Radio size={14} />}
                        {echoing ? "Testing…" : "Echo"}
                      </button>
                      <button type="button" className="btn-sm" onClick={() => openEdit(n)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn-sm btn-danger"
                        onClick={() =>
                          confirm({
                            title: "Delete node",
                            message: (
                              <p>
                                Delete <strong>{n.name}</strong>? This cannot be undone.
                              </p>
                            ),
                            confirmLabel: "Delete",
                            onConfirm: () => deleteMutation.mutate(n.id),
                          })
                        }
                      >
                        Delete
                      </button>
                    </div>
                  );
                },
              },
            ]}
          />
        </div>
      )}

      <Modal
        title={editingId ? "Edit Node" : "Add Node"}
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingId(null);
        }}
        wide
      >
        {error && (
          <AutoDismissAlert variant="error" onDismiss={() => setError("")}>
            {error}
          </AutoDismissAlert>
        )}
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
                onChange={(e) => {
                  const node_type = e.target.value as NodeFormState["node_type"];
                  setForm({
                    ...form,
                    node_type,
                    protocol: node_type === "destination" ? "DICOMweb" : form.protocol,
                  });
                }}
              >
                {nodeTypes.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Protocol</label>
              <select
                value={form.protocol}
                onChange={(e) => setForm({ ...form, protocol: e.target.value as NodeFormState["protocol"] })}
              >
                {protocols.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Host</label>
              <input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} required />
            </div>
            {(form.protocol === "DIMSE" || form.node_type === "source") && (
              <div className="form-field">
                <label>Port</label>
                <input
                  type="number"
                  value={form.port ?? ""}
                  onChange={(e) => setForm({ ...form, port: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
            )}
            {(form.protocol === "DIMSE" || form.node_type === "source") && (
              <div className="form-field">
                <label>AE Title</label>
                <input
                  value={form.ae_title}
                  onChange={(e) => setForm({ ...form, ae_title: e.target.value })}
                  maxLength={16}
                  placeholder={form.node_type === "source" ? "Calling AE from modality/PACS" : ""}
                />
              </div>
            )}
            {(form.protocol === "DICOMweb" || form.node_type === "source") && (
              <div className="form-field full-width">
                <label>DICOMweb URL</label>
                <input
                  value={form.dicomweb_url}
                  onChange={(e) => setForm({ ...form, dicomweb_url: e.target.value })}
                  placeholder="http://orthanc-onprem:8042/dicom-web"
                />
                {form.node_type === "source" && (
                  <p style={{ fontSize: "0.8rem", color: "#64748b", margin: "0.25rem 0 0" }}>
                    Required for migration jobs (QIDO/WADO). Orthanc sources often use DIMSE for intake and DICOMweb for migration.
                  </p>
                )}
              </div>
            )}
            <div className="form-field">
              <label>Auth Type</label>
              <select
                value={form.auth_type}
                onChange={(e) => setForm({ ...form, auth_type: e.target.value as NodeFormState["auth_type"] })}
              >
                {authTypes.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
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

      <ConfirmDialog loading={deleteMutation.isPending} />
    </div>
  );
}
