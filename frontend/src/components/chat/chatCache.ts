import { QueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../api/client";
import { ChatMessageList } from "../../types/api";

export const CHAT_MESSAGES_KEY = ["chatbot-messages"] as const;
export const CHAT_PENDING_KEY = ["chatbot-pending-message"] as const;
export const CHAT_AWAITING_KEY = ["chatbot-awaiting-response"] as const;

export function fetchChatMessages() {
  return apiFetch<ChatMessageList>("/api/v1/chatbot/messages?limit=200");
}

export function appendChatMessages(
  queryClient: QueryClient,
  userMessage: ChatMessageList["items"][number],
  assistantMessage: ChatMessageList["items"][number],
) {
  queryClient.setQueryData<ChatMessageList>(CHAT_MESSAGES_KEY, (old) => {
    const items = old?.items ?? [];
    const ids = new Set(items.map((m) => m.id));
    const next = [...items];
    if (!ids.has(userMessage.id)) next.push(userMessage);
    if (!ids.has(assistantMessage.id)) next.push(assistantMessage);
    return { total: next.length, items: next };
  });
}

export function setChatPending(queryClient: QueryClient, message: string | null) {
  queryClient.setQueryData(CHAT_PENDING_KEY, message);
}

export function setChatAwaiting(queryClient: QueryClient, awaiting: boolean) {
  queryClient.setQueryData(CHAT_AWAITING_KEY, awaiting);
}

export function clearChatTransientState(queryClient: QueryClient) {
  setChatPending(queryClient, null);
  setChatAwaiting(queryClient, false);
}

export function ensureChatMessages(queryClient: QueryClient) {
  return queryClient.ensureQueryData({
    queryKey: CHAT_MESSAGES_KEY,
    queryFn: fetchChatMessages,
  });
}
