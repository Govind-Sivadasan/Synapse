import { AlertTriangle, Loader2, Trash2, X } from "lucide-react";
import { ReactNode } from "react";

interface Props {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  loading = false,
  onConfirm,
  onClose,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="confirm-modal-overlay"
      onClick={loading ? undefined : onClose}
      role="presentation"
    >
      <div
        className={`confirm-modal confirm-modal--${variant}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="confirm-modal-close"
          onClick={onClose}
          disabled={loading}
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="confirm-modal-icon-wrap">
          <div className="confirm-modal-icon">
            {variant === "danger" ? <Trash2 size={26} strokeWidth={2} /> : <AlertTriangle size={26} strokeWidth={2} />}
          </div>
        </div>

        <h3 id="confirm-modal-title" className="confirm-modal-title">
          {title}
        </h3>

        <div className="confirm-modal-message">{message}</div>

        <div className="confirm-modal-actions">
          <button
            type="button"
            className="btn-secondary confirm-modal-btn"
            disabled={loading}
            onClick={onClose}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`confirm-modal-btn confirm-modal-btn-confirm${variant === "danger" ? " btn-danger" : ""}`}
            disabled={loading}
            onClick={onConfirm}
          >
            {loading && <Loader2 size={16} className="spin-icon" />}
            {loading ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
