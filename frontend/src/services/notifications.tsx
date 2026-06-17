import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import {
  NotificationPosition,
  loadUserPreferences,
} from "../config/userPreferences";
import { NOTIFICATION_DURATIONS } from "../lib/notificationMessages";

export type NotificationVariant = "success" | "error" | "warning" | "info";

export interface NotificationItem {
  id: string;
  variant: NotificationVariant;
  message: ReactNode;
  durationMs: number;
}

interface NotificationContextValue {
  position: NotificationPosition;
  setPosition: (position: NotificationPosition) => void;
  notify: (variant: NotificationVariant, message: ReactNode, durationMs?: number) => void;
  success: (message: ReactNode, durationMs?: number) => void;
  error: (message: ReactNode, durationMs?: number) => void;
  warning: (message: ReactNode, durationMs?: number) => void;
  info: (message: ReactNode, durationMs?: number) => void;
  dismiss: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

let counter = 0;

export function NotificationProvider({
  username,
  children,
}: {
  username: string;
  children: ReactNode;
}) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [position, setPositionState] = useState<NotificationPosition>(() =>
    loadUserPreferences(username).notificationPosition,
  );

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const notify = useCallback(
    (variant: NotificationVariant, message: ReactNode, durationMs?: number) => {
      const ms = durationMs ?? NOTIFICATION_DURATIONS[variant];
      const id = `toast-${++counter}`;
      setItems((prev) => [...prev, { id, variant, message, durationMs: ms }]);
      if (ms > 0) {
        window.setTimeout(() => dismiss(id), ms);
      }
    },
    [dismiss],
  );

  const value = useMemo<NotificationContextValue>(
    () => ({
      position,
      setPosition: setPositionState,
      notify,
      success: (message, durationMs) => notify("success", message, durationMs),
      error: (message, durationMs) => notify("error", message, durationMs),
      warning: (message, durationMs) => notify("warning", message, durationMs),
      info: (message, durationMs) => notify("info", message, durationMs),
      dismiss,
    }),
    [position, notify, dismiss],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <NotificationHost items={items} position={position} onDismiss={dismiss} />
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
}

function NotificationHost({
  items,
  position,
  onDismiss,
}: {
  items: NotificationItem[];
  position: NotificationPosition;
  onDismiss: (id: string) => void;
}) {
  if (!items.length) return null;

  return createPortal(
    <div className={`notification-host notification-host--${position}`} aria-live="polite">
      {items.map((item) => (
        <div
          key={item.id}
          className={`notification-toast notification-toast--${item.variant}`}
          role={item.variant === "error" || item.variant === "warning" ? "alert" : "status"}
        >
          <div className="notification-toast__row">
            <div className="notification-toast__body">{item.message}</div>
            <button
              type="button"
              className="notification-toast__close"
              aria-label="Dismiss notification"
              onClick={() => onDismiss(item.id)}
            >
              <X size={14} />
            </button>
          </div>
          {item.durationMs > 0 && (
            <div
              className="notification-toast__progress"
              style={{ animationDuration: `${item.durationMs}ms` }}
              aria-hidden
            />
          )}
        </div>
      ))}
    </div>,
    document.body,
  );
}
