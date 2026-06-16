import { CSSProperties, useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { GripVertical, Maximize2, Sparkles, X } from "lucide-react";
import { apiFetch } from "../../api/client";
import { BRAND } from "../../config/brand";
import { useDraggablePosition } from "../../hooks/useDraggablePosition";
import { ChatbotStatus } from "../../types/api";
import ChatPanel from "./ChatPanel";

const CHAT_ROLES = ["viewer", "service_user", "operator", "admin"];

const FAB_SIZE = 56;
const DRAWER_GAP = 12;

interface Props {
  roles: string[];
}

export default function ChatbotWidget({ roles }: Props) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const { pos, dragging, onPointerDown, resetPosition, consumeClickIfDragged, positionStyle } =
    useDraggablePosition({
      storageKey: "synapse.chatbot.pos.v2",
      size: FAB_SIZE,
    });

  const canUse = roles.some((r) => CHAT_ROLES.includes(r));
  const onChatPage = location.pathname === "/chatbot";

  const { data: status } = useQuery({
    queryKey: ["chatbot-status"],
    queryFn: () => apiFetch<ChatbotStatus>("/api/v1/chatbot/status"),
    refetchInterval: 30000,
    enabled: canUse && !onChatPage,
  });

  useEffect(() => {
    const toggle = () => setOpen((v) => !v);
    window.addEventListener("synapse:toggle-chatbot", toggle);
    return () => window.removeEventListener("synapse:toggle-chatbot", toggle);
  }, []);

  const handleFabClick = useCallback(() => {
    if (!consumeClickIfDragged()) setOpen((v) => !v);
  }, [consumeClickIfDragged]);

  const onHeaderPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest("button, a")) return;
      onPointerDown(e);
    },
    [onPointerDown],
  );

  if (!canUse || onChatPage) return null;

  const statusDot =
    status?.available && status.model_ready
      ? "chatbot-fab-status--ready"
      : status?.available
        ? "chatbot-fab-status--warning"
        : "chatbot-fab-status--offline";

  const wrapClass = `chatbot-fab-wrap${dragging ? " chatbot-fab-wrap--dragging" : ""}${
    pos.custom ? " chatbot-fab-wrap--custom" : ""
  }${open ? " chatbot-fab-wrap--open" : ""}`;

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
        <div className={drawerClass} role="dialog" aria-label="Service chatbot" style={drawerStyle}>
          <div
            className="chatbot-drawer-header chatbot-drawer-header--draggable"
            onPointerDown={onHeaderPointerDown}
            title="Drag to move"
          >
            <div className="chatbot-drawer-title">
              <GripVertical size={14} className="chatbot-drawer-grip-icon" aria-hidden />
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

      <div className={wrapClass} style={positionStyle}>
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
