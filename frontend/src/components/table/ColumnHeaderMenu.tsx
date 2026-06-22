import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowUp,
  Columns3,
  EyeOff,
  MoreVertical,
  Pin,
  PinOff,
  RotateCcw,
} from "lucide-react";
import type { ColumnPin } from "../../lib/tableColumnPrefs";

export type SortDir = "asc" | "desc";

interface MenuPosition {
  top: number;
  left: number;
}

interface Props {
  label: string;
  sortable: boolean;
  pinnable: boolean;
  hideable: boolean;
  pin: ColumnPin;
  activeSortDir: SortDir | null;
  onSort: (dir: SortDir) => void;
  onUnsort: () => void;
  onPin: (pin: ColumnPin) => void;
  onHide: () => void;
  onManageColumns: () => void;
}

const MENU_GAP = 6;
const VIEWPORT_PADDING = 8;

function computeMenuPosition(
  trigger: HTMLButtonElement,
  menuWidth: number,
): MenuPosition {
  const rect = trigger.getBoundingClientRect();
  const width = menuWidth || 176;
  let left = rect.right - width;
  left = Math.max(VIEWPORT_PADDING, left);
  left = Math.min(left, window.innerWidth - width - VIEWPORT_PADDING);

  return {
    top: rect.bottom + MENU_GAP,
    left,
  };
}

export default function ColumnHeaderMenu({
  label,
  sortable,
  pinnable,
  hideable,
  pin,
  activeSortDir,
  onSort,
  onUnsort,
  onPin,
  onHide,
  onManageColumns,
}: Props) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const syncMenuPosition = useCallback(() => {
    if (!triggerRef.current) return;
    const menuWidth = menuRef.current?.offsetWidth ?? 0;
    setMenuPosition(computeMenuPosition(triggerRef.current, menuWidth));
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPosition(null);
      return;
    }
    syncMenuPosition();
    requestAnimationFrame(() => syncMenuPosition());
  }, [open, syncMenuPosition]);

  useEffect(() => {
    if (!open) return;

    const handleReposition = () => syncMenuPosition();
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);

    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [open, syncMenuPosition]);

  useEffect(() => {
    if (!open) return;

    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const run = (action: () => void) => {
    action();
    setOpen(false);
  };

  const handleLabelClick = () => {
    if (!sortable) return;
    if (!activeSortDir) onSort("asc");
    else if (activeSortDir === "asc") onSort("desc");
    else onSort("asc");
  };

  const sortToggleLabel = activeSortDir === "asc"
    ? `Sort ${label} descending`
    : activeSortDir === "desc"
      ? `Sort ${label} ascending`
      : `Sort ${label} ascending`;

  const menu = open && menuPosition
    ? createPortal(
        <div
          ref={menuRef}
          className="col-header-menu-dropdown col-header-menu-dropdown--portal"
          role="menu"
          style={{ top: menuPosition.top, left: menuPosition.left }}
        >
          {sortable && (
            <>
              {activeSortDir === "asc" ? (
                <button
                  type="button"
                  className="col-header-menu-item"
                  role="menuitem"
                  onClick={() => run(onUnsort)}
                >
                  <RotateCcw size={14} />
                  Clear sort
                </button>
              ) : (
                <button
                  type="button"
                  className="col-header-menu-item"
                  role="menuitem"
                  onClick={() => run(() => onSort("asc"))}
                >
                  <ArrowUp size={14} />
                  Sort ascending
                </button>
              )}
              {activeSortDir === "desc" ? (
                <button
                  type="button"
                  className="col-header-menu-item"
                  role="menuitem"
                  onClick={() => run(onUnsort)}
                >
                  <RotateCcw size={14} />
                  Clear sort
                </button>
              ) : (
                <button
                  type="button"
                  className="col-header-menu-item"
                  role="menuitem"
                  onClick={() => run(() => onSort("desc"))}
                >
                  <ArrowDown size={14} />
                  Sort descending
                </button>
              )}
              <div className="col-header-menu-sep" role="separator" />
            </>
          )}

          {pinnable && (
            <>
              <button
                type="button"
                className="col-header-menu-item"
                role="menuitem"
                disabled={pin === "left"}
                onClick={() => run(() => onPin("left"))}
              >
                <Pin size={14} />
                Pin left
              </button>
              <button
                type="button"
                className="col-header-menu-item"
                role="menuitem"
                disabled={pin === "right"}
                onClick={() => run(() => onPin("right"))}
              >
                <Pin size={14} />
                Pin right
              </button>
              {pin && (
                <button
                  type="button"
                  className="col-header-menu-item"
                  role="menuitem"
                  onClick={() => run(() => onPin(null))}
                >
                  <PinOff size={14} />
                  Unpin
                </button>
              )}
              <div className="col-header-menu-sep" role="separator" />
            </>
          )}

          {hideable && (
            <button
              type="button"
              className="col-header-menu-item"
              role="menuitem"
              onClick={() => run(onHide)}
            >
              <EyeOff size={14} />
              Hide column
            </button>
          )}

          <button
            type="button"
            className="col-header-menu-item"
            role="menuitem"
            onClick={() => run(onManageColumns)}
          >
            <Columns3 size={14} />
            Manage columns…
          </button>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <div
        className={`col-header-menu${activeSortDir ? " col-header-menu--sorted" : ""}${sortable ? " col-header-menu--sortable" : ""}`}
        ref={rootRef}
      >
        {sortable ? (
          <button
            type="button"
            className="col-header-menu-label col-header-menu-label-btn"
            aria-label={sortToggleLabel}
            onClick={handleLabelClick}
          >
            <span className="col-header-menu-label-text">{label}</span>
            {activeSortDir === "asc" && <ArrowUp size={12} className="col-header-menu-sort-icon" aria-hidden />}
            {activeSortDir === "desc" && <ArrowDown size={12} className="col-header-menu-sort-icon" aria-hidden />}
          </button>
        ) : (
          <span className="col-header-menu-label">{label}</span>
        )}
        <button
          ref={triggerRef}
          type="button"
          className="col-header-menu-trigger"
          aria-label={`Column options for ${label}`}
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={(event) => {
            event.stopPropagation();
            setOpen((value) => !value);
          }}
        >
          <MoreVertical size={14} aria-hidden />
        </button>
      </div>
      {menu}
    </>
  );
}
