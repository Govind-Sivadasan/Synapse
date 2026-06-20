import { useCallback, useEffect, useRef, useState } from "react";

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

export interface QueueOpsSnapshot {
  queued: number;
  active_tasks: number;
}

export interface OpsSnapshot {
  timestamp?: string;
  queues: Record<string, number>;
  workers_online: number;
  routing_queue: QueueOpsSnapshot;
  migration_queue: QueueOpsSnapshot;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeIncomingEvents(payload: WsEvent): WsEvent[] {
  if (payload.event_type === "event_batch") {
    const raw = payload.data.events;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((item): item is WsEvent => isRecord(item) && typeof item.event_type === "string")
      .map((item) => ({
        event_type: item.event_type,
        data: isRecord(item.data) ? item.data : {},
      }));
  }
  return [payload];
}

function parseOpsSnapshot(data: Record<string, unknown>): OpsSnapshot | null {
  const queues = isRecord(data.queues) ? data.queues : {};
  const routing = isRecord(data.routing_queue) ? data.routing_queue : {};
  const migration = isRecord(data.migration_queue) ? data.migration_queue : {};
  return {
    timestamp: typeof data.timestamp === "string" ? data.timestamp : undefined,
    queues: {
      routing_queue: Number(queues.routing_queue ?? routing.queued ?? 0),
      migration_queue: Number(queues.migration_queue ?? migration.queued ?? 0),
    },
    workers_online: Number(data.workers_online ?? 0),
    routing_queue: {
      queued: Number(routing.queued ?? queues.routing_queue ?? 0),
      active_tasks: Number(routing.active_tasks ?? 0),
    },
    migration_queue: {
      queued: Number(migration.queued ?? queues.migration_queue ?? 0),
      active_tasks: Number(migration.active_tasks ?? 0),
    },
  };
}

export function useWebSocket(enabled = true) {
  const [events, setEvents] = useState<WsEvent[]>([]);
  const [opsSnapshot, setOpsSnapshot] = useState<OpsSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [connectKey, setConnectKey] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);

  const reconnect = useCallback(() => {
    setReconnecting(true);
    setConnected(false);
    wsRef.current?.close();
    setConnectKey((key) => key + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setReconnecting(false);
    };
    ws.onclose = () => {
      setConnected(false);
      setReconnecting(false);
    };
    ws.onerror = () => {
      setConnected(false);
      setReconnecting(false);
    };
    const ingestOpsSnapshot = (event: WsEvent) => {
      if (event.event_type !== "ops_snapshot") return false;
      const snapshot = parseOpsSnapshot(event.data);
      if (snapshot) setOpsSnapshot(snapshot);
      return true;
    };

    ws.onmessage = (msg) => {
      try {
        const payload = JSON.parse(msg.data) as WsEvent;
        if (ingestOpsSnapshot(payload)) return;

        const normalized = normalizeIncomingEvents(payload);
        if (normalized.length === 0) return;

        const activityEvents = normalized.filter((event) => !ingestOpsSnapshot(event));
        if (activityEvents.length === 0) return;
        setEvents((prev) => [...activityEvents, ...prev].slice(0, 50));
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
  }, [enabled, connectKey]);

  return { events, opsSnapshot, connected, reconnecting, reconnect };
}
