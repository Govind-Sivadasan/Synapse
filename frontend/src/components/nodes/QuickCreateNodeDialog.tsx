import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { createPortal } from "react-dom";
import { apiFetch } from "../../api/client";
import Modal from "../Modal";
import { buildNodePayload, NodeFormState } from "../../lib/nodes";
import { formatNotificationMessage } from "../../lib/notificationMessages";
import { useNotifications } from "../../services/notifications";
import { Node } from "../../types/api";

const CREATE_NODE_OPTION = "__create_node__";
export { CREATE_NODE_OPTION };

function emptyForm(nodeType: "source" | "destination"): NodeFormState {
  return {
    name: "",
    node_type: nodeType,
    protocol: "DICOMweb",
    host: "",
    port: null,
    ae_title: "",
    dicomweb_url: "",
    auth_type: "none",
    is_active: true,
  };
}

function isFormValid(form: NodeFormState): boolean {
  return !!(form.name.trim() && form.host.trim() && form.dicomweb_url.trim());
}

interface Props {
  open: boolean;
  nodeType: "source" | "destination";
  onClose: () => void;
  onCreated: (node: Node) => void;
}

export default function QuickCreateNodeDialog({ open, nodeType, onClose, onCreated }: Props) {
  const queryClient = useQueryClient();
  const { error: notifyError } = useNotifications();
  const [form, setForm] = useState(() => emptyForm(nodeType));

  useEffect(() => {
    if (open) {
      setForm(emptyForm(nodeType));
    }
  }, [open, nodeType]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch<Node>("/api/v1/nodes", {
        method: "POST",
        body: JSON.stringify(buildNodePayload(form, false)),
      }),
    onSuccess: (node) => {
      queryClient.invalidateQueries({ queryKey: ["nodes"] });
      onCreated(node);
      onClose();
    },
    onError: (err: Error) => notifyError(formatNotificationMessage(err.message)),
  });

  const handleCreate = useCallback(() => {
    if (!isFormValid(form)) {
      notifyError("Name, host, and DICOMweb URL are required.");
      return;
    }
    saveMutation.mutate();
  }, [form, notifyError, saveMutation]);

  const handleFieldKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      handleCreate();
    }
  };

  const label = nodeType === "source" ? "source" : "destination";

  const dialog = (
    <Modal
      title={`Add ${label} node`}
      open={open}
      onClose={onClose}
      wide
      nested
    >
      <div className="quick-create-form">
        <p className="form-field-hint" style={{ marginTop: 0 }}>
          Create a node without leaving this form. Your other entries are kept.
        </p>
        <div className="form-grid">
          <div className="form-field">
            <label>Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              onKeyDown={handleFieldKeyDown}
              placeholder={nodeType === "source" ? "On-prem PACS" : "Cloud PACS"}
              required
            />
          </div>
          <div className="form-field">
            <label>Host</label>
            <input
              value={form.host}
              onChange={(e) => setForm({ ...form, host: e.target.value })}
              onKeyDown={handleFieldKeyDown}
              placeholder="orthanc-onprem"
              required
            />
          </div>
          <div className="form-field full-width">
            <label>DICOMweb URL</label>
            <input
              value={form.dicomweb_url}
              onChange={(e) => setForm({ ...form, dicomweb_url: e.target.value })}
              onKeyDown={handleFieldKeyDown}
              placeholder="http://orthanc-onprem:8042/dicom-web"
              required
            />
          </div>
          {nodeType === "source" && (
            <>
              <div className="form-field">
                <label>Port (optional)</label>
                <input
                  type="number"
                  value={form.port ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, port: e.target.value ? Number(e.target.value) : null })
                  }
                  onKeyDown={handleFieldKeyDown}
                />
              </div>
              <div className="form-field">
                <label>AE Title (optional)</label>
                <input
                  value={form.ae_title}
                  onChange={(e) => setForm({ ...form, ae_title: e.target.value })}
                  onKeyDown={handleFieldKeyDown}
                  maxLength={16}
                />
              </div>
            </>
          )}
        </div>
        <div className="form-actions">
          <button
            type="button"
            disabled={saveMutation.isPending}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleCreate();
            }}
          >
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
      </div>
    </Modal>
  );

  if (!open) return null;

  return createPortal(dialog, document.body);
}
