import { ReactNode, useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Placement = "auto" | "above" | "below";
type Align = "center" | "start" | "end";

interface Props {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  placement?: Placement;
  align?: Align;
  tooltipClassName?: string;
}

const GAP = 8;
const VIEWPORT_PAD = 8;

export default function FloatingTooltip({
  content,
  children,
  className,
  placement = "auto",
  align = "center",
  tooltipClassName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    const tooltip = tooltipRef.current;
    if (!anchor || !tooltip) return;

    const rect = anchor.getBoundingClientRect();
    const tt = tooltip.getBoundingClientRect();

    let top: number;
    const spaceBelow = window.innerHeight - rect.bottom - GAP;
    const spaceAbove = rect.top - GAP;
    const showBelow =
      placement === "below" ||
      (placement === "auto" && (spaceBelow >= tt.height || spaceBelow >= spaceAbove));

    if (showBelow) {
      top = rect.bottom + GAP;
    } else {
      top = rect.top - GAP - tt.height;
    }

    let left: number;
    if (align === "end") {
      left = rect.right - tt.width;
    } else if (align === "start") {
      left = rect.left;
    } else {
      left = rect.left + rect.width / 2 - tt.width / 2;
    }

    left = Math.max(VIEWPORT_PAD, Math.min(left, window.innerWidth - tt.width - VIEWPORT_PAD));
    top = Math.max(VIEWPORT_PAD, Math.min(top, window.innerHeight - tt.height - VIEWPORT_PAD));

    setCoords({ top, left });
  }, [placement, align]);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    updatePosition();
  }, [open, content, updatePosition]);

  useLayoutEffect(() => {
    if (!open) return;

    const onReposition = () => updatePosition();
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    return () => {
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
  }, [open, updatePosition]);

  const tooltipClass = ["chart-tooltip", "chart-tooltip--floating", tooltipClassName]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <div
        ref={anchorRef}
        className={className}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setOpen(false);
          }
        }}
        tabIndex={0}
      >
        {children}
      </div>
      {open &&
        createPortal(
          <div
            ref={tooltipRef}
            className={tooltipClass}
            role="tooltip"
            style={{
              top: coords?.top ?? -9999,
              left: coords?.left ?? -9999,
              opacity: coords ? 1 : 0,
            }}
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}
