import { CSSProperties, useCallback, useEffect, useRef, useState } from "react";

export interface DragPosition {
  right: number;
  bottom: number;
  custom: boolean;
}

interface Options {
  storageKey: string;
  size: number;
  edge?: number;
}

function clamp(val: number, min: number, max: number) {
  return Math.min(max, Math.max(min, val));
}

function bounds(size: number) {
  return {
    min: 8,
    maxRight: window.innerWidth - size - 8,
    maxBottom: window.innerHeight - size - 8,
  };
}

function defaultPos(edge: number): DragPosition {
  return { right: edge, bottom: edge, custom: false };
}

function readPos(storageKey: string, edge: number): DragPosition {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const p = JSON.parse(raw) as Partial<DragPosition>;
      if (p.custom && typeof p.right === "number" && typeof p.bottom === "number") {
        return { right: p.right, bottom: p.bottom, custom: true };
      }
    }
  } catch {
    /* ignore */
  }
  return defaultPos(edge);
}

/** Fixed-position anchor using right/bottom offsets (stable — no getBoundingClientRect on press). */
export function useDraggablePosition({ storageKey, size, edge = 24 }: Options) {
  const [pos, setPos] = useState<DragPosition>(() => readPos(storageKey, edge));
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, origRight: edge, origBottom: edge, moved: false });
  const posRef = useRef(pos);
  posRef.current = pos;

  useEffect(() => {
    if (!pos.custom) return;
    const onResize = () => {
      const { min, maxRight, maxBottom } = bounds(size);
      setPos((p) => ({
        ...p,
        right: clamp(p.right, min, maxRight),
        bottom: clamp(p.bottom, min, maxBottom),
      }));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [pos.custom, size]);

  useEffect(() => {
    if (!pos.custom) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(pos));
    } catch {
      /* ignore */
    }
  }, [pos, pos.custom, storageKey]);

  const resolveAnchor = useCallback((): Pick<DragPosition, "right" | "bottom"> => {
    if (posRef.current.custom) {
      return { right: posRef.current.right, bottom: posRef.current.bottom };
    }
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const cssEdge = 1.5 * rem;
    return { right: cssEdge, bottom: cssEdge };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const anchor = resolveAnchor();
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origRight: anchor.right,
        origBottom: anchor.bottom,
        moved: false,
      };
      setDragging(true);

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - dragRef.current.startX;
        const dy = ev.clientY - dragRef.current.startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true;
        const { min, maxRight, maxBottom } = bounds(size);
        setPos({
          custom: true,
          right: clamp(dragRef.current.origRight - dx, min, maxRight),
          bottom: clamp(dragRef.current.origBottom - dy, min, maxBottom),
        });
      };

      const onUp = () => {
        setDragging(false);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [resolveAnchor, size],
  );

  const resetPosition = useCallback(() => {
    setPos(defaultPos(edge));
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  }, [edge, storageKey]);

  const consumeClickIfDragged = useCallback(() => {
    const moved = dragRef.current.moved;
    dragRef.current.moved = false;
    return moved;
  }, []);

  const positionStyle: CSSProperties | undefined = pos.custom
    ? { right: pos.right, bottom: pos.bottom }
    : undefined;

  return {
    pos,
    dragging,
    onPointerDown,
    resetPosition,
    consumeClickIfDragged,
    positionStyle,
    dragMovedRef: dragRef,
  };
}
