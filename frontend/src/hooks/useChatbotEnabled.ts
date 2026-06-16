import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import { ChatbotStatus } from "../types/api";

const CHAT_ROLES = ["viewer", "service_user", "operator", "admin"];

export function useChatbotEnabled(roles: string[]) {
  const canUse = roles.some((r) => CHAT_ROLES.includes(r));

  const { data, isLoading } = useQuery({
    queryKey: ["chatbot-status"],
    queryFn: () => apiFetch<ChatbotStatus>("/api/v1/chatbot/status"),
    enabled: canUse,
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const enabled = canUse && !isLoading && data?.enabled !== false;

  return { canUse, enabled, isLoading, status: data };
}
