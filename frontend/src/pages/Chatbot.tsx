import { useQuery } from "@tanstack/react-query";
import { Sparkles, Trash2 } from "lucide-react";
import { apiFetch } from "../api/client";
import ChatPanel from "../components/chat/ChatPanel";
import PageHeader from "../components/ui/PageHeader";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChatbotStatus } from "../types/api";

export default function Chatbot() {
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const { data: status } = useQuery({
    queryKey: ["chatbot-status"],
    queryFn: () => apiFetch<ChatbotStatus>("/api/v1/chatbot/status"),
    refetchInterval: 30000,
  });

  const clearMutation = useMutation({
    mutationFn: () => apiFetch<void>("/api/v1/chatbot/messages", { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chatbot-messages"] });
    },
  });

  const { data: history } = useQuery({
    queryKey: ["chatbot-messages"],
    queryFn: () => apiFetch<{ items: unknown[] }>("/api/v1/chatbot/messages?limit=200"),
  });

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
        title="Service Chatbot"
        description="Ask about routing status, migration jobs, and system health. Read-only — powered by Ollama."
        actions={
          <>
            {hasMessages && (
              <button
                type="button"
                className="btn-secondary"
                onClick={confirmClearChat}
                disabled={clearMutation.isPending}
              >
                <Trash2 size={16} />
                Clear chat
              </button>
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
