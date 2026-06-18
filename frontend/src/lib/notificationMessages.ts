import { NotificationVariant } from "../services/notifications";
import type { NotificationDurationScale } from "../config/userPreferences";

export const NOTIFICATION_DURATIONS: Record<NotificationVariant, number> = {
  success: 5000,
  error: 8000,
  warning: 7000,
  info: 5000,
};

export const NOTIFICATION_DURATION_SCALE: Record<NotificationDurationScale, number> = {
  short: 0.65,
  normal: 1,
  long: 1.6,
};

export const NOTIFICATION_DURATION_SCALE_LABELS: Record<NotificationDurationScale, string> = {
  short: "Short (about 3–5 s)",
  normal: "Normal (about 5–8 s)",
  long: "Long (about 8–13 s)",
};

export function resolveNotificationDuration(
  variant: NotificationVariant,
  scale: NotificationDurationScale = "normal",
): number {
  const multiplier = NOTIFICATION_DURATION_SCALE[scale] ?? 1;
  return Math.round(NOTIFICATION_DURATIONS[variant] * multiplier);
}

/** Shorten API/JSON error strings for compact toast display. */
export function formatNotificationMessage(raw: string): string {
  const trimmed = raw.trim();
  const jsonStart = trimmed.indexOf("{");
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(trimmed.slice(jsonStart)) as {
        error?: string;
        error_description?: string;
        message?: string;
        detail?: string;
      };
      return parsed.error_description || parsed.detail || parsed.message || parsed.error || trimmed;
    } catch {
      // keep full string when JSON is malformed
    }
  }
  return trimmed;
}

export function formatNodeEchoMessage(
  nodeName: string,
  message: string,
  latencyMs?: number | null,
): string {
  const summary = formatNotificationMessage(message);
  const latency = latencyMs != null ? ` (${latencyMs} ms)` : "";
  return `${nodeName}: ${summary}${latency}`;
}
