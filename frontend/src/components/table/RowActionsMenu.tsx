import { ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, MoreVertical } from "lucide-react";

export interface RowActionItem {
  key: string;
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  hidden?: boolean;
}

interface MenuPosition {
  top: number;
  left: number;
}

interface Props {
  items: RowActionItem[];
  ariaLabel?: string;
}

const MENU_GAP = 6;
const VIEWPORT_PADDING = 8;

function computeMenuPosition(trigger: HTMLButtonElement, menuWidth: number): MenuPosition {
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

export default function RowActionsMenu({ items, ariaLabel = "Row actions" }: Props) {
  const visibleItems = items.filter((item) => !item.hidden);
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
  }, [open, syncMenuPosition, visibleItems.length]);

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

  if (!visibleItems.length) return null;

  const run = (item: RowActionItem) => {
    if (item.disabled || !item.onClick) return;
    item.onClick();
    setOpen(false);
  };

  const menu = open && menuPosition
    ? createPortal(
        <div
          ref={menuRef}
          className="col-header-menu-dropdown col-header-menu-dropdown--portal row-actions-menu-dropdown"
          role="menu"
          style={{ top: menuPosition.top, left: menuPosition.left }}
        >
          {visibleItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={[
                "col-header-menu-item",
                item.danger ? "col-header-menu-item--danger" : undefined,
              ]
                .filter(Boolean)
                .join(" ")}
              role="menuitem"
              disabled={item.disabled}
              onClick={() => run(item)}
            >
              {item.disabled ? <Loader2 size={14} className="spin-icon" /> : item.icon}
              {item.label}
            </button>
          ))}
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="row-actions-menu" ref={rootRef} onClick={(event) => event.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        className="row-actions-menu-trigger"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
      >
        <MoreVertical size={16} aria-hidden />
      </button>
      {menu}
    </div>
  );
}
