import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Trash2 } from "lucide-react";
import { apiFetch } from "../api/client";
import ChatPanel from "../components/chat/ChatPanel";
import { CHAT_MESSAGES_KEY, clearChatTransientState, fetchChatMessages } from "../components/chat/chatCache";
import ActionButton from "../components/ui/ActionButton";
import PageHeader from "../components/ui/PageHeader";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { ChatbotStatus } from "../types/api";

export default function Chatbot() {
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const { data: status } = useQuery({
    queryKey: ["chatbot-status"],
    queryFn: () => apiFetch<ChatbotStatus>("/api/v1/chatbot/status"),
    refetchInterval: 30000,
  });

  const { data: history } = useQuery({
    queryKey: CHAT_MESSAGES_KEY,
    queryFn: fetchChatMessages,
    enabled: status?.enabled !== false,
    staleTime: 30_000,
  });

  const clearMutation = useMutation({
    mutationFn: () => apiFetch<void>("/api/v1/chatbot/messages", { method: "DELETE" }),
    onSuccess: () => {
      clearChatTransientState(queryClient);
      queryClient.setQueryData(CHAT_MESSAGES_KEY, { total: 0, items: [] });
    },
  });

  if (status && !status.enabled) {
    return (
      <div className="chatbot-page">
        <PageHeader
          title="Synapse Assistant"
          description="The assistant is currently disabled by an administrator."
        />
        <div className="card">
          <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
            Enable Synapse Assistant under Settings → Chatbot / LLM to restore access.
          </p>
        </div>
      </div>
    );
  }

  const hasMessages = (history?.items?.length ?? 0) > 0;

  const confirmClearChat = () => {
    confirm({
      title: "Clear chat history",
      message: <p>Remove all messages from this conversation? This cannot be undone.</p>,
      confirmLabel: "Clear",
      onConfirm: () => clearMutation.mutate(),
    });
  };

  const statusTooltip =
    status && !status.available
      ? "offline"
      : status && !status.model_ready
        ? "pulling"
        : null;

  return (
    <div className="chatbot-page">
      <PageHeader
        title="Synapse Assistant"
        description="Ask about routing status, migration jobs, nodes, tag morphing, and system health. Admins and operators can confirm supported changes here — powered by Ollama."
        actions={
          <>
            {hasMessages && (
              <ActionButton
                variant="secondary"
                icon={<Trash2 size={16} />}
                onClick={confirmClearChat}
                disabled={clearMutation.isPending}
              >
                Clear chat
              </ActionButton>
            )}
            {status && (
              <div
                className={`connection-pill-wrap${statusTooltip ? " connection-pill-wrap--has-tooltip" : ""}`}
                style={{ marginRight: 0 }}
              >
                <div
                  className="connection-pill"
                  tabIndex={statusTooltip ? 0 : undefined}
                  aria-describedby={statusTooltip ? "ollama-status-tooltip" : undefined}
                >
                  <Sparkles size={14} />
                  {status.available && status.model_ready ? (
                    <span style={{ color: "var(--color-success)" }}>Ollama ready</span>
                  ) : status.available ? (
                    <span style={{ color: "var(--color-warning)" }}>Model not pulled</span>
                  ) : (
                    <span>Offline — fallback mode</span>
                  )}
                </div>
                {statusTooltip && (
                  <div id="ollama-status-tooltip" className="connection-pill-tooltip" role="tooltip">
                    {statusTooltip === "pulling" ? (
                      <>
                        Model <code>{status.model}</code> is downloading or not installed yet. Watch progress with{" "}
                        <code>docker logs -f synapse-ollama</code>. The chatbot uses fallback answers until the pull
                        completes.
                      </>
                    ) : (
                      <>
                        Ollama is unreachable — responses use live Synapse data only (fallback mode).
                        {status.error && <> ({status.error})</>}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        }
      />

      <ChatPanel variant="page" showSuggestions />

      <ConfirmDialog loading={clearMutation.isPending} />
    </div>
  );
}
