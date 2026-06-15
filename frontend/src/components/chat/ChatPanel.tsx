import { FormEvent, Fragment, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Trash2 } from "lucide-react";
import { apiFetch } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { ChatbotAvatar } from "../brand/BrandImage";
import StatusBadge from "../ui/StatusBadge";
import AutoDismissAlert from "../ui/AutoDismissAlert";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";
import { formatChatDateLabel, formatChatTime, isSameChatDay } from "../../lib/chatFormat";
import { ChatMessageList, ChatQueryResponse } from "../../types/api";

interface Props {
  variant?: "page" | "widget";
  showSuggestions?: boolean;
}

export default function ChatPanel({ variant = "page", showSuggestions = variant === "page" }: Props) {
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const { roles } = useAuth();
  const [input, setInput] = useState("");
  const [pendingUserText, setPendingUserText] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isViewer = roles.includes("viewer") && !roles.some((r) => ["admin", "operator", "service_user"].includes(r));
  const isWidget = variant === "widget";

  const { data: suggestionsData } = useQuery({
    queryKey: ["chatbot-suggestions"],
    queryFn: () => apiFetch<{ suggestions: string[] }>("/api/v1/chatbot/suggestions"),
    enabled: showSuggestions,
  });

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ["chatbot-messages"],
    queryFn: () => apiFetch<ChatMessageList>("/api/v1/chatbot/messages?limit=200"),
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
      setPendingUserText(message);
    },
    onSuccess: () => {
      setPendingUserText(null);
      queryClient.invalidateQueries({ queryKey: ["chatbot-messages"] });
    },
    onError: () => {
      setPendingUserText(null);
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => apiFetch<void>("/api/v1/chatbot/messages", { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chatbot-messages"] });
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, queryMutation.isPending, pendingUserText]);

  const sendMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || queryMutation.isPending) return;
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

  return (
    <>
      {isViewer && !isWidget && (
        <AutoDismissAlert variant="info" style={{ marginBottom: "1rem" }}>
          PHI redaction is enabled for your viewer role. Patient IDs and Study UIDs are masked in responses.
        </AutoDismissAlert>
      )}

      <div className={isWidget ? "chatbot-widget-body" : "chatbot-layout"}>
        <div className={`card chatbot-panel${isWidget ? " chatbot-panel--widget" : ""}`}>
          {isWidget && messages.length > 0 && (
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
            {historyLoading && messages.length === 0 && (
              <div className="chatbot-welcome">
                <p>Loading conversation…</p>
              </div>
            )}

            {!historyLoading && messages.length === 0 && !queryMutation.isPending && (
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
                        disabled={queryMutation.isPending}
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

            {queryMutation.isPending && (
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

            {queryMutation.isError && (
              <AutoDismissAlert variant="error">
                {(queryMutation.error as Error).message}
              </AutoDismissAlert>
            )}

            <div ref={bottomRef} />
          </div>

          <form className="chatbot-input-row" onSubmit={handleSubmit}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about routing, migration, or system status…"
              disabled={queryMutation.isPending}
            />
            <button type="submit" disabled={queryMutation.isPending || !input.trim()}>
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
                  disabled={queryMutation.isPending}
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
