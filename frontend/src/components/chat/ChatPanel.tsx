import { FormEvent, Fragment, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Trash2 } from "lucide-react";
import { apiFetch } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { ChatbotAvatar } from "../brand/BrandImage";
import StatusBadge from "../ui/StatusBadge";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";
import { formatNotificationMessage } from "../../lib/notificationMessages";
import { useNotifications } from "../../services/notifications";
import { formatChatDateLabel, formatChatTime, isSameChatDay } from "../../lib/chatFormat";
import { ChatActionExecuteResponse, ChatPendingAction, ChatQueryResponse } from "../../types/api";
import ChatActionCard from "./ChatActionCard";
import {
  appendChatMessages,
  CHAT_AWAITING_KEY,
  CHAT_MESSAGES_KEY,
  CHAT_PENDING_KEY,
  clearChatTransientState,
  fetchChatMessages,
  setChatAwaiting,
  setChatPending,
} from "./chatCache";

interface Props {
  variant?: "page" | "widget";
  showSuggestions?: boolean;
}

export default function ChatPanel({ variant = "page", showSuggestions = variant === "page" }: Props) {
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const { info, error: notifyError } = useNotifications();
  const { roles } = useAuth();
  const [input, setInput] = useState("");
  const [pendingAction, setPendingAction] = useState<ChatPendingAction | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const phiNoticeShown = useRef(false);
  const lastChatError = useRef<string | null>(null);

  const canOperate = roles.includes("admin") || roles.includes("operator");
  const isViewer = roles.includes("viewer") && !roles.some((r) => ["admin", "operator", "service_user"].includes(r));
  const isWidget = variant === "widget";

  const { data: suggestionsData } = useQuery({
    queryKey: ["chatbot-suggestions"],
    queryFn: () => apiFetch<{ suggestions: string[] }>("/api/v1/chatbot/suggestions"),
    enabled: showSuggestions,
  });

  const { data: history, isPending: historyPending } = useQuery({
    queryKey: CHAT_MESSAGES_KEY,
    queryFn: fetchChatMessages,
    staleTime: 30_000,
    refetchOnMount: "always",
    placeholderData: (previous) => previous,
  });

  const { data: pendingUserText = null } = useQuery<string | null>({
    queryKey: CHAT_PENDING_KEY,
    enabled: false,
    initialData: null,
  });

  const { data: awaitingResponse = false } = useQuery<boolean>({
    queryKey: CHAT_AWAITING_KEY,
    enabled: false,
    initialData: false,
  });

  const messages = history?.items ?? [];

  const queryMutation = useMutation({
    mutationFn: (message: string) =>
      apiFetch<ChatQueryResponse>("/api/v1/chatbot/query", {
        method: "POST",
        body: JSON.stringify({ message }),
      }),
    onMutate: (message) => {
      setInput("");
      setPendingAction(null);
      setChatPending(queryClient, message);
      setChatAwaiting(queryClient, true);
    },
    onSuccess: (data) => {
      appendChatMessages(queryClient, data.user_message, data.assistant_message);
      clearChatTransientState(queryClient);
      setPendingAction(canOperate ? data.pending_action : null);
    },
    onError: () => {
      clearChatTransientState(queryClient);
    },
  });

  const showTypingIndicator = queryMutation.isPending || awaitingResponse;

  const clearMutation = useMutation({
    mutationFn: () => apiFetch<void>("/api/v1/chatbot/messages", { method: "DELETE" }),
    onSuccess: () => {
      clearChatTransientState(queryClient);
      queryClient.setQueryData(CHAT_MESSAGES_KEY, { total: 0, items: [] });
      setPendingAction(null);
    },
  });

  const actionMutation = useMutation({
    mutationFn: (action: ChatPendingAction) =>
      apiFetch<ChatActionExecuteResponse>("/api/v1/chatbot/actions/execute", {
        method: "POST",
        body: JSON.stringify({
          entity_type: action.entity_type,
          action_type: action.action_type,
          target_id: action.target_id,
          payload: action.payload,
        }),
      }),
    onSuccess: (result) => {
      setPendingAction(null);
      info(result.message, 6000);
    },
    onError: (error) => {
      notifyError(formatNotificationMessage((error as Error).message));
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, showTypingIndicator, pendingUserText, pendingAction]);

  useEffect(() => {
    if (!isViewer || isWidget || phiNoticeShown.current) return;
    phiNoticeShown.current = true;
    info("PHI redaction is enabled for your viewer role. Patient IDs and Study UIDs are masked in responses.", 7000);
  }, [isViewer, isWidget, info]);

  useEffect(() => {
    if (!queryMutation.isError) {
      lastChatError.current = null;
      return;
    }
    const message = formatNotificationMessage((queryMutation.error as Error).message);
    if (lastChatError.current === message) return;
    lastChatError.current = message;
    notifyError(message);
  }, [queryMutation.isError, queryMutation.error, notifyError]);

  const sendMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || queryMutation.isPending || awaitingResponse) return;
    queryMutation.mutate(trimmed);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const confirmClearChat = () => {
    confirm({
      title: "Clear chat history",
      message: <p>Remove all messages from this conversation? This cannot be undone.</p>,
      confirmLabel: "Clear",
      onConfirm: () => clearMutation.mutate(),
    });
  };

  const suggestions = suggestionsData?.suggestions ?? [];
  const hasConversation = messages.length > 0 || !!pendingUserText || showTypingIndicator;

  return (
    <>
      <div className={isWidget ? "chatbot-widget-body" : "chatbot-layout"}>
        <div className={`card chatbot-panel${isWidget ? " chatbot-panel--widget" : ""}`}>
          {isWidget && hasConversation && (
            <div className="chatbot-widget-toolbar">
              <button
                type="button"
                className="btn-sm btn-secondary"
                onClick={confirmClearChat}
                disabled={clearMutation.isPending}
              >
                <Trash2 size={14} />
                Clear
              </button>
            </div>
          )}

          <div className="chatbot-messages">
            {historyPending && messages.length === 0 && !pendingUserText && !showTypingIndicator && (
              <div className="chatbot-welcome">
                <p>Loading conversation…</p>
              </div>
            )}

            {!historyPending && messages.length === 0 && !showTypingIndicator && !pendingUserText && (
              <div className="chatbot-welcome">
                <div className="chatbot-welcome-icon">
                  <ChatbotAvatar size={isWidget ? 56 : 72} />
                </div>
                <h3>How can I help?</h3>
                <p>Ask about migration progress, routing failures, DIMSE status, or a specific Study UID.</p>
                {showSuggestions && suggestions.length > 0 && (
                  <div className="chat-suggestions chat-suggestions--inline">
                    {suggestions.slice(0, isWidget ? 3 : suggestions.length).map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="chat-suggestion-chip"
                        onClick={() => sendMessage(s)}
                        disabled={queryMutation.isPending || awaitingResponse}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {messages.map((msg, index) => {
              const prev = index > 0 ? messages[index - 1] : null;
              const showDate = !prev || !isSameChatDay(msg.created_at, prev.created_at);

              return (
                <Fragment key={msg.id}>
                  {showDate && (
                    <div className="chat-date-divider" aria-label={formatChatDateLabel(msg.created_at)}>
                      {formatChatDateLabel(msg.created_at)}
                    </div>
                  )}
                  <div className={`chat-row chat-row--${msg.role}`}>
                    {msg.role === "assistant" && (
                      <ChatbotAvatar className="chat-avatar" size={isWidget ? 32 : 36} />
                    )}
                    <div className={`chat-bubble chat-bubble--${msg.role}`}>
                      <div className="chat-bubble-content">
                        <span className="chat-bubble-text">{msg.content}</span>
                        <time className="chat-bubble-time" dateTime={msg.created_at}>
                          {formatChatTime(msg.created_at)}
                        </time>
                      </div>
                      {msg.role === "assistant" && (msg.phi_redacted || msg.used_fallback) && (
                        <div className="chat-bubble-meta">
                          {msg.phi_redacted && <StatusBadge status="info" label="PHI redacted" dot={false} />}
                          {msg.used_fallback && <StatusBadge status="warning" label="Fallback" dot={false} />}
                        </div>
                      )}
                    </div>
                  </div>
                </Fragment>
              );
            })}

            {pendingUserText && (
              <div className="chat-row chat-row--user">
                <div className="chat-bubble chat-bubble--user">
                  <div className="chat-bubble-content">
                    <span className="chat-bubble-text">{pendingUserText}</span>
                    <time className="chat-bubble-time" dateTime={new Date().toISOString()}>
                      {formatChatTime(new Date())}
                    </time>
                  </div>
                </div>
              </div>
            )}

            {showTypingIndicator && (
              <div className="chat-row chat-row--assistant">
                <ChatbotAvatar className="chat-avatar" size={isWidget ? 32 : 36} />
                <div className="chat-bubble chat-bubble--assistant">
                  <div className="chat-bubble-content chat-typing">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </div>
            )}

            {pendingAction && canOperate && (
              <ChatActionCard
                action={pendingAction}
                loading={actionMutation.isPending}
                onCancel={() => setPendingAction(null)}
                onConfirm={() => actionMutation.mutate(pendingAction)}
              />
            )}

            <div ref={bottomRef} />
          </div>

          <form className="chatbot-input-row" onSubmit={handleSubmit}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about routing, migration, or system status…"
              disabled={queryMutation.isPending || awaitingResponse}
            />
            <button type="submit" disabled={queryMutation.isPending || awaitingResponse || !input.trim()}>
              <Send size={18} />
            </button>
          </form>
        </div>

        {showSuggestions && !isWidget && (
          <aside className="card chatbot-sidebar">
            <h3 className="card-title">Suggested prompts</h3>
            <div className="chat-suggestions">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="chat-suggestion-chip"
                  onClick={() => sendMessage(s)}
                  disabled={queryMutation.isPending || awaitingResponse}
                >
                  {s}
                </button>
              ))}
            </div>
          </aside>
        )}
      </div>

      <ConfirmDialog loading={clearMutation.isPending} />
    </>
  );
}
