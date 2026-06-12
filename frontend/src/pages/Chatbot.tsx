import { FormEvent, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bot, Send, Sparkles } from "lucide-react";
import { apiFetch } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import PageHeader from "../components/ui/PageHeader";
import StatusBadge from "../components/ui/StatusBadge";
import { ChatQueryResponse, ChatbotStatus } from "../types/api";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  meta?: { phi_redacted?: boolean; used_fallback?: boolean };
}

export default function Chatbot() {
  const { roles } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const isViewer = roles.includes("viewer") && !roles.some((r) => ["admin", "operator", "service_user"].includes(r));

  const { data: status } = useQuery({
    queryKey: ["chatbot-status"],
    queryFn: () => apiFetch<ChatbotStatus>("/api/v1/chatbot/status"),
    refetchInterval: 30000,
  });

  const { data: suggestionsData } = useQuery({
    queryKey: ["chatbot-suggestions"],
    queryFn: () => apiFetch<{ suggestions: string[] }>("/api/v1/chatbot/suggestions"),
  });

  const queryMutation = useMutation({
    mutationFn: (message: string) =>
      apiFetch<ChatQueryResponse>("/api/v1/chatbot/query", {
        method: "POST",
        body: JSON.stringify({ message }),
      }),
    onMutate: (message) => {
      setMessages((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, role: "user", content: message },
      ]);
      setInput("");
    },
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: data.answer,
          meta: { phi_redacted: data.phi_redacted, used_fallback: data.used_fallback },
        },
      ]);
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, queryMutation.isPending]);

  const sendMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || queryMutation.isPending) return;
    queryMutation.mutate(trimmed);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const suggestions = suggestionsData?.suggestions ?? [];

  return (
    <div className="chatbot-page">
      <PageHeader
        title="Service Chatbot"
        description="Ask about routing status, migration jobs, and system health. Read-only — powered by Ollama."
        actions={
          status && (
            <div className="connection-pill" style={{ marginRight: 0 }}>
              <Sparkles size={14} />
              {status.available && status.model_ready ? (
                <span style={{ color: "var(--color-success)" }}>Ollama ready</span>
              ) : status.available ? (
                <span style={{ color: "var(--color-warning)" }}>Model not pulled</span>
              ) : (
                <span>Offline — fallback mode</span>
              )}
            </div>
          )
        }
      />

      {isViewer && (
        <div className="alert alert-success" style={{ marginBottom: "1rem" }}>
          PHI redaction is enabled for your viewer role. Patient IDs and Study UIDs are masked in responses.
        </div>
      )}

      <div className="chatbot-layout">
        <div className="card chatbot-panel">
          <div className="chatbot-messages">
            {messages.length === 0 && (
              <div className="chatbot-welcome">
                <div className="chatbot-welcome-icon">
                  <Bot size={32} />
                </div>
                <h3>How can I help?</h3>
                <p>Ask about migration progress, routing failures, DIMSE status, or a specific Study UID.</p>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`chat-bubble chat-bubble--${msg.role}`}>
                <div className="chat-bubble-content">{msg.content}</div>
                {msg.role === "assistant" && msg.meta && (
                  <div className="chat-bubble-meta">
                    {msg.meta.phi_redacted && <StatusBadge status="info" label="PHI redacted" dot={false} />}
                    {msg.meta.used_fallback && <StatusBadge status="warning" label="Fallback" dot={false} />}
                  </div>
                )}
              </div>
            ))}

            {queryMutation.isPending && (
              <div className="chat-bubble chat-bubble--assistant">
                <div className="chat-bubble-content chat-typing">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}

            {queryMutation.isError && (
              <div className="alert alert-error">
                {(queryMutation.error as Error).message}
              </div>
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

          {status && !status.model_ready && status.available && (
            <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", marginTop: "1rem" }}>
              Pull the model:{" "}
              <code>docker exec synapse-ollama ollama pull {status.model}</code>
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
