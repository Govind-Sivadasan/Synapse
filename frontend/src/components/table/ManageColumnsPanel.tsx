import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, EyeOff, X } from "lucide-react";
import Switch from "../ui/Switch";

interface ColumnOption {
  key: string;
  header: string;
  hideable: boolean;
}

interface MenuPosition {
  top: number;
  left: number;
}

interface Props {
  open: boolean;
  anchorEl: HTMLElement | null;
  columns: ColumnOption[];
  hiddenKeys: Set<string>;
  onToggle: (key: string, visible: boolean) => void;
  onShowAll: () => void;
  onHideAll: () => void;
  onClose: () => void;
}

const PANEL_GAP = 6;
const VIEWPORT_PADDING = 8;

function computePanelPosition(
  anchor: HTMLElement,
  panelWidth: number,
  panelHeight: number,
): MenuPosition {
  const rect = anchor.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.min(panelWidth || 280, viewportWidth - VIEWPORT_PADDING * 2);
  const height = Math.min(panelHeight || 320, viewportHeight - VIEWPORT_PADDING * 2);

  let left = rect.right - width;
  if (left < VIEWPORT_PADDING) {
    left = Math.max(VIEWPORT_PADDING, Math.min(rect.left, viewportWidth - width - VIEWPORT_PADDING));
  }
  left = Math.min(left, viewportWidth - width - VIEWPORT_PADDING);

  let top = rect.bottom + PANEL_GAP;
  const spaceBelow = viewportHeight - VIEWPORT_PADDING - top;
  const spaceAbove = rect.top - VIEWPORT_PADDING - PANEL_GAP;
  if (height > spaceBelow && spaceAbove > spaceBelow) {
    top = rect.top - PANEL_GAP - height;
  }
  top = Math.max(VIEWPORT_PADDING, Math.min(top, viewportHeight - height - VIEWPORT_PADDING));

  return { top, left };
}

export default function ManageColumnsPanel({
  open,
  anchorEl,
  columns,
  hiddenKeys,
  onToggle,
  onShowAll,
  onHideAll,
  onClose,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  const syncPosition = useCallback(() => {
    if (!anchorEl || !panelRef.current) return;
    const { offsetWidth, offsetHeight } = panelRef.current;
    setPosition(computePanelPosition(anchorEl, offsetWidth, offsetHeight));
  }, [anchorEl]);

  useLayoutEffect(() => {
    if (!open || !anchorEl) {
      setPosition(null);
      return;
    }
    syncPosition();
    requestAnimationFrame(() => syncPosition());
  }, [open, anchorEl, syncPosition, columns.length]);

  useEffect(() => {
    if (!open) return;

    const handleReposition = () => syncPosition();
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);

    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [open, syncPosition]);

  useEffect(() => {
    if (!open) return;

    const handler = (event: MouseEvent) => {
      const target = event.target as globalThis.Node;
      if (panelRef.current?.contains(target)) return;
      if (anchorEl?.contains(target)) return;
      onClose();
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose, anchorEl]);

  if (!open || !anchorEl) return null;

  const hideableColumns = columns.filter((col) => col.hideable);
  const allVisible = hideableColumns.every((col) => !hiddenKeys.has(col.key));
  const allHidden = hideableColumns.every((col) => hiddenKeys.has(col.key));

  return createPortal(
    <>
      <div className="manage-columns-backdrop" aria-hidden />
      <div
        ref={panelRef}
        className="manage-columns-panel manage-columns-panel--portal"
        role="dialog"
        aria-label="Manage columns"
        style={position ? { top: position.top, left: position.left } : { visibility: "hidden" }}
      >
        <header className="manage-columns-header">
          <h3>Manage columns</h3>
          <button type="button" className="manage-columns-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        <div className="manage-columns-actions">
          <button type="button" className="btn-sm btn-secondary" disabled={allVisible} onClick={onShowAll}>
            <Eye size={14} />
            Show all
          </button>
          <button type="button" className="btn-sm btn-secondary" disabled={allHidden} onClick={onHideAll}>
            <EyeOff size={14} />
            Hide all
          </button>
        </div>

        <ul className="manage-columns-list">
          {columns.map((col) => {
            const visible = !hiddenKeys.has(col.key);
            return (
              <li key={col.key} className="manage-columns-row">
                <span>{col.header}</span>
                {col.hideable ? (
                  <Switch checked={visible} onChange={(checked) => onToggle(col.key, checked)} />
                ) : (
                  <span className="manage-columns-fixed">Always visible</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </>,
    document.body,
  );
}
