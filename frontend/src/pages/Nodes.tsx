import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Radio, Trash2 } from "lucide-react";
import ActionButton from "../components/ui/ActionButton";
import { apiFetch } from "../api/client";
import DataTable from "../components/DataTable";
import RowActionsMenu from "../components/table/RowActionsMenu";
import Modal from "../components/Modal";
import PageHeader from "../components/ui/PageHeader";
import StatusBadge from "../components/ui/StatusBadge";
import { PageLoading } from "../components/ui/LoadingScreen";
import Switch from "../components/ui/Switch";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { useAppMetadata } from "../hooks/useAppMetadata";
import { buildNodePayload, emptyNodeForm, formatNodeType, isNodeAuthValid, nodeIsDestination, nodeIsSource, nodeToForm, NodeFormState } from "../lib/nodes";
import NodeAuthFields from "../components/nodes/NodeAuthFields";
import { formatNodeEchoMessage, formatNotificationMessage } from "../lib/notificationMessages";
import { useNotifications } from "../services/notifications";
import { Node, NodeEchoResult } from "../types/api";

const emptyForm = emptyNodeForm;

export default function Nodes() {
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const { data: metadata } = useAppMetadata();
  const { success, error: notifyError } = useNotifications();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingAuth, setEditingAuth] = useState<Record<string, string> | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: nodes = [], isLoading } = useQuery({
    queryKey: ["nodes"],
    queryFn: () => apiFetch<Node[]>("/api/v1/nodes"),
  });

  const nodeName = (id: string) => nodes.find((n) => n.id === id)?.name ?? "Node";

  const notifyEcho = (nodeId: string, result: NodeEchoResult) => {
    const message = formatNodeEchoMessage(nodeName(nodeId), result.message, result.latency_ms);
    if (result.success) success(message);
    else notifyError(message);
  };

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
      success("Node saved.");
    },
    onError: (err: Error) => notifyError(formatNotificationMessage(err.message)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/v1/nodes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nodes"] });
      success("Node deleted.");
    },
    onError: (err: Error) => notifyError(formatNotificationMessage(err.message)),
  });

  const echoMutation = useMutation({
    mutationFn: (id: string) => apiFetch<NodeEchoResult>(`/api/v1/nodes/${id}/echo`, { method: "POST" }),
    onSuccess: (result, nodeId) => notifyEcho(nodeId, result),
    onError: (err: Error, nodeId) =>
      notifyError(formatNodeEchoMessage(nodeName(nodeId), err.message)),
  });

  const openCreate = () => {
    setEditingId(null);
    setEditingAuth(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (node: Node) => {
    setEditingId(node.id);
    setEditingAuth(node.auth_config);
    setForm(nodeToForm(node));
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isNodeAuthValid(form, !!editingId)) {
      notifyError("Enter credentials for the selected auth type.");
      return;
    }
    saveMutation.mutate({
      nodeId: editingId,
      payload: buildNodePayload(form, !!editingId, editingAuth),
    });
  };

  const nodeTypes = metadata?.node_types ?? [
    { value: "source", label: "Source" },
    { value: "destination", label: "Destination" },
    { value: "both", label: "Source & Destination" },
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
        actions={
          <ActionButton icon={<Plus size={16} />} onClick={openCreate}>
            Add Node
          </ActionButton>
        }
      />

      {isLoading ? (
        <PageLoading label="Loading nodes…" />
      ) : (
        <div className="card">
          <DataTable
            tableId="nodes"
            data={nodes}
            keyField="id"
            onRowClick={openEdit}
            selectedRowId={editingId}
            paginate
            pageSize={10}
            searchable
            searchKeys={["name", "node_type", "protocol", "host", "ae_title"]}
            searchPlaceholder="Search nodes…"
            defaultClientSort={{ sortBy: "name", sortDir: "asc" }}
            columns={[
              { key: "name", header: "Name", width: 200, minWidth: 140 },
              {
                key: "node_type",
                header: "Type",
                width: 160,
                minWidth: 120,
                sortValue: (n) => formatNodeType(n),
                render: (n) => formatNodeType(n),
              },
              { key: "protocol", header: "Protocol", width: 108, minWidth: 88 },
              { key: "host", header: "Host", minWidth: 160 },
              {
                key: "is_active",
                header: "Status",
                width: 100,
                minWidth: 88,
                sortValue: (n) => (n.is_active ? 1 : 0),
                render: (n) => (
                  <StatusBadge status={n.is_active ? "active" : "inactive"} label={n.is_active ? "Active" : "Inactive"} />
                ),
              },
              {
                key: "actions",
                header: "Actions",
                width: 84,
                minWidth: 84,
                sortable: false,
                hideable: false,
                pinnable: false,
                render: (n) => {
                  const echoing = echoMutation.isPending && echoMutation.variables === n.id;
                  return (
                    <RowActionsMenu
                      ariaLabel={`Actions for ${n.name}`}
                      items={[
                        {
                          key: "echo",
                          label: echoing ? "Testing…" : "Echo",
                          icon: echoing ? undefined : <Radio size={14} />,
                          disabled: echoMutation.isPending,
                          onClick: () => echoMutation.mutate(n.id),
                        },
                        {
                          key: "edit",
                          label: "Edit",
                          icon: <Pencil size={14} />,
                          onClick: () => openEdit(n),
                        },
                        {
                          key: "delete",
                          label: "Delete",
                          icon: <Trash2 size={14} />,
                          danger: true,
                          onClick: () =>
                            confirm({
                              title: "Delete node",
                              message: (
                                <p>
                                  Delete <strong>{n.name}</strong>? This cannot be undone.
                                </p>
                              ),
                              confirmLabel: "Delete",
                              onConfirm: () => deleteMutation.mutate(n.id),
                            }),
                        },
                      ]}
                    />
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
            {(form.protocol === "DIMSE" || nodeIsSource(form)) && (
              <div className="form-field">
                <label>Port</label>
                <input
                  type="number"
                  value={form.port ?? ""}
                  onChange={(e) => setForm({ ...form, port: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
            )}
            {(form.protocol === "DIMSE" || nodeIsSource(form)) && (
              <div className="form-field">
                <label>AE Title</label>
                <input
                  value={form.ae_title}
                  onChange={(e) => setForm({ ...form, ae_title: e.target.value })}
                  maxLength={16}
                  placeholder={nodeIsSource(form) ? "Calling AE from modality/PACS" : ""}
                />
              </div>
            )}
            {(form.protocol === "DICOMweb" || nodeIsSource(form) || nodeIsDestination(form)) && (
              <div className="form-field full-width">
                <label>DICOMweb URL</label>
                <input
                  value={form.dicomweb_url}
                  onChange={(e) => setForm({ ...form, dicomweb_url: e.target.value })}
                  placeholder="http://orthanc-onprem:8042/dicom-web"
                />
                {form.node_type === "both" && (
                  <p className="form-field-hint">
                    DICOMweb URL is used for Study Browser, migration, and routing on this node.
                  </p>
                )}
                {form.node_type === "source" && (
                  <p className="form-field-hint">
                    Required for migration jobs and Study Browser (QIDO/WADO). Orthanc sources often use DIMSE for intake and DICOMweb for migration.
                  </p>
                )}
                {form.node_type === "destination" && (
                  <p className="form-field-hint">Required for migration and routing (STOW-RS).</p>
                )}
              </div>
            )}
            <div className="form-field">
              <label>Auth Type</label>
              <select
                value={form.auth_type}
                onChange={(e) => {
                  const auth_type = e.target.value as NodeFormState["auth_type"];
                  setForm({
                    ...form,
                    auth_type,
                    auth_username: "",
                    auth_password: "",
                    auth_token: "",
                    auth_api_key: "",
                  });
                }}
              >
                {authTypes.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
            <NodeAuthFields form={form} onChange={setForm} editing={!!editingId} />
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
