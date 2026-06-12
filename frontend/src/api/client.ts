import keycloak from "../auth/keycloak";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export function parseApiError(body: string, status: number): string {
  const trimmed = body.trim();
  if (!trimmed) return `Request failed (${status})`;

  try {
    const parsed = JSON.parse(trimmed) as { detail?: string | { msg?: string }[] };
    if (typeof parsed.detail === "string") return parsed.detail;
    if (Array.isArray(parsed.detail) && parsed.detail[0]?.msg) {
      return parsed.detail.map((d) => d.msg).join(", ");
    }
  } catch {
    // plain text body
  }

  if (trimmed === "Failed to fetch") {
    return "Could not reach the API. Check that the backend is running.";
  }

  if (trimmed === "Internal Server Error" || status >= 500) {
    return `Server error (${status}). Check backend logs for details.`;
  }

  return trimmed;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (keycloak.token) {
    headers.Authorization = `Bearer ${keycloak.token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(parseApiError(error, response.status));
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}
