import { useEffect, useRef, useState } from "react";

function resolveWebSocketUrl(): string {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  if (import.meta.env.DEV && typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/ws/events`;
  }
  return "ws://localhost:8000/ws/events";
}

const WS_URL = resolveWebSocketUrl();

export interface WsEvent {
  event_type: string;
  data: Record<string, unknown>;
}

export function useWebSocket(enabled = true) {
  const [events, setEvents] = useState<WsEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (msg) => {
      try {
        const payload = JSON.parse(msg.data) as WsEvent;
        setEvents((prev) => [payload, ...prev].slice(0, 50));
      } catch {
        // ignore malformed messages
      }
    };

    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send("ping");
      }
    }, 30000);

    return () => {
      clearInterval(ping);
      ws.close();
    };
  }, [enabled]);

  return { events, connected };
}
