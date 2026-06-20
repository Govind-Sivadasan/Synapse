import { X } from "lucide-react";
import { ReactNode } from "react";
import { createPortal } from "react-dom";

interface Props {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  extraWide?: boolean;
  nested?: boolean;
}

export default function Modal({ title, open, onClose, children, wide, extraWide, nested }: Props) {
  if (!open) return null;

  const sizeClass = extraWide ? "modal-xl" : wide ? "modal-wide" : "";
  const overlayClass = nested ? "modal-overlay modal-overlay--nested" : "modal-overlay";

  return createPortal(
    <div className={overlayClass}>
      <div className={`modal ${sizeClass}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
