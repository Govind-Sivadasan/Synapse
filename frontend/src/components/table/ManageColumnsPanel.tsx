import { useEffect, useRef } from "react";
import { Eye, EyeOff, X } from "lucide-react";
import Switch from "../ui/Switch";

interface ColumnOption {
  key: string;
  header: string;
  hideable: boolean;
}

interface Props {
  open: boolean;
  columns: ColumnOption[];
  hiddenKeys: Set<string>;
  onToggle: (key: string, visible: boolean) => void;
  onShowAll: () => void;
  onHideAll: () => void;
  onClose: () => void;
}

export default function ManageColumnsPanel({
  open,
  columns,
  hiddenKeys,
  onToggle,
  onShowAll,
  onHideAll,
  onClose,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const hideableColumns = columns.filter((col) => col.hideable);
  const allVisible = hideableColumns.every((col) => !hiddenKeys.has(col.key));
  const allHidden = hideableColumns.every((col) => hiddenKeys.has(col.key));

  return (
    <div className="manage-columns-backdrop">
      <div className="manage-columns-panel" ref={panelRef} role="dialog" aria-label="Manage columns">
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
    </div>
  );
}
