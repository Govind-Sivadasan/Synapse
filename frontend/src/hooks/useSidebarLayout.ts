import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_WIDTH = "synapse.sidebar.width";
const STORAGE_COLLAPSED = "synapse.sidebar.collapsed";

export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 420;
export const SIDEBAR_DEFAULT_WIDTH = 240;
export const SIDEBAR_MINI_WIDTH = 68;

function readStoredWidth(): number {
  try {
    const raw = localStorage.getItem(STORAGE_WIDTH);
    if (!raw) return SIDEBAR_DEFAULT_WIDTH;
    const n = Number(raw);
    if (!Number.isFinite(n)) return SIDEBAR_DEFAULT_WIDTH;
    return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, n));
  } catch {
    return SIDEBAR_DEFAULT_WIDTH;
  }
}

function readStoredCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_COLLAPSED) === "1";
  } catch {
    return false;
  }
}

export function useSidebarLayout() {
  const [width, setWidth] = useState(readStoredWidth);
  const [collapsed, setCollapsed] = useState(readStoredCollapsed);
  const [resizing, setResizing] = useState(false);
  const widthRef = useRef(width);

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_WIDTH, String(width));
    } catch {
      /* ignore */
    }
  }, [width]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_COLLAPSED, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => !c);
  }, []);

  const openSidebar = useCallback(() => {
    setCollapsed(false);
  }, []);

  const closeSidebar = useCallback(() => {
    setCollapsed(true);
  }, []);

  const startResize = useCallback((clientX: number) => {
    const startX = clientX;
    const startWidth = widthRef.current;

    setResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: PointerEvent) => {
      const next = Math.min(
        SIDEBAR_MAX_WIDTH,
        Math.max(SIDEBAR_MIN_WIDTH, startWidth + (ev.clientX - startX)),
      );
      setWidth(next);
    };

    const onUp = () => {
      setResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  const sidebarWidth = collapsed ? SIDEBAR_MINI_WIDTH : width;

  return {
    width,
    sidebarWidth,
    collapsed,
    resizing,
    toggleCollapsed,
    openSidebar,
    closeSidebar,
    startResize,
  };
}
