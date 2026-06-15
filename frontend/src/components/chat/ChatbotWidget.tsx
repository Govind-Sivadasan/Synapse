import { CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { GripVertical, Maximize2, Sparkles, X } from "lucide-react";
import { apiFetch } from "../../api/client";
import { BRAND } from "../../config/brand";
import { ChatbotStatus } from "../../types/api";
import ChatPanel from "./ChatPanel";

const CHAT_ROLES = ["viewer", "service_user", "operator", "admin"];
const POS_KEY = "synapse.chatbot.pos.v2";

const FAB_SIZE = 56;
const EDGE = 24;
const DRAWER_GAP = 12;

interface Pos {
  right: number;
  bottom: number;
  /** True after the user drags the widget off the default corner */
  custom: boolean;
}

function clamp(val: number, min: number, max: number) {
  return Math.min(max, Math.max(min, val));
}

function bounds() {
  return {
    min: 8,
    maxRight: window.innerWidth - FAB_SIZE - 8,
    maxBottom: window.innerHeight - FAB_SIZE - 8,
  };
}

function fromRect(rect: DOMRect): Pick<Pos, "right" | "bottom"> {
  return {
    right: window.innerWidth - rect.right,
    bottom: window.innerHeight - rect.bottom,
  };
}

function readPos(): Pos {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Pos>;
      if (p.custom && typeof p.right === "number" && typeof p.bottom === "number") {
        return {
          right: p.right,
          bottom: p.bottom,
          custom: true,
        };
      }
    }
  } catch {
    /* ignore */
  }
  return { right: EDGE, bottom: EDGE, custom: false };
}

interface Props {
  roles: string[];
}

export default function ChatbotWidget({ roles }: Props) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos>(readPos);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, origRight: EDGE, origBottom: EDGE, moved: false });
  const wrapRef = useRef<HTMLDivElement>(null);
  const posRef = useRef(pos);
  posRef.current = pos;

  const canUse = roles.some((r) => CHAT_ROLES.includes(r));
  const onChatPage = location.pathname === "/chatbot";

  const { data: status } = useQuery({
    queryKey: ["chatbot-status"],
    queryFn: () => apiFetch<ChatbotStatus>("/api/v1/chatbot/status"),
    refetchInterval: 30000,
    enabled: canUse && !onChatPage,
  });

  useEffect(() => {
    if (!pos.custom) return;
    const onResize = () => {
      const { min, maxRight, maxBottom } = bounds();
      setPos((p) => ({
        ...p,
        right: clamp(p.right, min, maxRight),
        bottom: clamp(p.bottom, min, maxBottom),
      }));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [pos.custom]);

  useEffect(() => {
    if (!pos.custom) return;
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(pos));
    } catch {
      /* ignore */
    }
  }, [pos]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const rect = wrapRef.current?.getBoundingClientRect();
    const anchor = rect ? fromRect(rect) : { right: posRef.current.right, bottom: posRef.current.bottom };

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
      const { min, maxRight, maxBottom } = bounds();
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
  }, []);

  const handleFabClick = useCallback(() => {
    if (!dragRef.current.moved) setOpen((v) => !v);
    dragRef.current.moved = false;
  }, []);

  const resetPosition = useCallback(() => {
    setPos({ right: EDGE, bottom: EDGE, custom: false });
    try {
      localStorage.removeItem(POS_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  if (!canUse || onChatPage) return null;

  const statusDot =
    status?.available && status.model_ready
      ? "chatbot-fab-status--ready"
      : status?.available
        ? "chatbot-fab-status--warning"
        : "chatbot-fab-status--offline";

  const wrapClass = `chatbot-fab-wrap${dragging ? " chatbot-fab-wrap--dragging" : ""}${
    pos.custom ? " chatbot-fab-wrap--custom" : ""
  }`;

  const wrapStyle: CSSProperties | undefined = pos.custom
    ? { right: pos.right, bottom: pos.bottom }
    : undefined;

  const drawerClass = `chatbot-drawer card${pos.custom ? "" : " chatbot-drawer--default"}`;

  const drawerStyle: CSSProperties | undefined = pos.custom
    ? {
        position: "fixed",
        right: pos.right,
        bottom: pos.bottom + FAB_SIZE + DRAWER_GAP,
        zIndex: 999,
      }
    : undefined;

  return (
    <>
      {open && (
        <div
          className={drawerClass}
          role="dialog"
          aria-label="Service chatbot"
          style={drawerStyle}
        >
          <div className="chatbot-drawer-header">
            <div className="chatbot-drawer-title">
              <img src={BRAND.chatbotPng} alt="" width={28} height={28} />
              <div>
                <strong>Service Chatbot</strong>
                {status && (
                  <span className="chatbot-drawer-status">
                    <Sparkles size={12} />
                    {status.available && status.model_ready
                      ? "Ollama ready"
                      : status.available
                        ? "Model loading"
                        : "Fallback mode"}
                  </span>
                )}
              </div>
            </div>
            <div className="chatbot-drawer-actions">
              <Link to="/chatbot" title="Open full page" onClick={() => setOpen(false)}>
                <Maximize2 size={16} />
              </Link>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close chat">
                <X size={18} />
              </button>
            </div>
          </div>
          <ChatPanel variant="widget" showSuggestions />
        </div>
      )}

      <div ref={wrapRef} className={wrapClass} style={wrapStyle}>
        <button
          type="button"
          className="chatbot-fab-grip"
          onPointerDown={onPointerDown}
          onDoubleClick={resetPosition}
          aria-label="Move chatbot"
          title="Drag to move · double-click to reset"
        >
          <GripVertical size={14} />
        </button>
        <button
          type="button"
          className={`chatbot-fab${open ? " chatbot-fab--open" : ""}`}
          onClick={handleFabClick}
          aria-expanded={open}
          aria-label={open ? "Close chat" : "Open chat"}
        >
          <span className={`chatbot-fab-status ${statusDot}`} aria-hidden />
          {open ? <X size={24} /> : <img src={BRAND.chatbotPng} alt="" width={32} height={32} />}
        </button>
      </div>
    </>
  );
}
