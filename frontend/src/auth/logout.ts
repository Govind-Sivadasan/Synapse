import keycloak from "./keycloak";

const ID_TOKEN_KEY = "synapse_id_token";

function authServerUrl(): string {
  const url = keycloak.authServerUrl || import.meta.env.VITE_KEYCLOAK_URL || "http://localhost:8080";
  return url.replace(/\/$/, "");
}

function isTokenUsable(jwt: string | undefined): jwt is string {
  if (!jwt) return false;
  try {
    const payload = JSON.parse(atob(jwt.split(".")[1]));
    return typeof payload.exp === "number" && payload.exp * 1000 > Date.now() + 10_000;
  } catch {
    return false;
  }
}

function persistIdToken() {
  if (keycloak.idToken) {
    sessionStorage.setItem(ID_TOKEN_KEY, keycloak.idToken);
  }
}

/** Call after Keycloak init so sign-out always has a fresh id_token_hint available. */
export function bindKeycloakTokenPersistence() {
  keycloak.onAuthSuccess = persistIdToken;
  keycloak.onAuthRefreshSuccess = persistIdToken;
  if (keycloak.idToken) {
    persistIdToken();
  }
}

/**
 * RP-initiated logout. Prefers id_token_hint (instant logout + redirect).
 * Falls back to client_id when the session token cannot be refreshed.
 */
export async function logoutFromKeycloak(): Promise<void> {
  const redirectUri = `${window.location.origin}/`;

  try {
    await keycloak.updateToken(30);
    persistIdToken();
  } catch {
    // Continue with last known id token
  }

  const stored = sessionStorage.getItem(ID_TOKEN_KEY) ?? undefined;
  const idToken = isTokenUsable(keycloak.idToken)
    ? keycloak.idToken
    : isTokenUsable(stored)
      ? stored
      : undefined;

  sessionStorage.removeItem(ID_TOKEN_KEY);

  if (idToken) {
    (keycloak as typeof keycloak & { idToken?: string }).idToken = idToken;
    keycloak.logout({ redirectUri });
    return;
  }

  keycloak.clearToken();
  const params = new URLSearchParams({
    client_id: keycloak.clientId || import.meta.env.VITE_KEYCLOAK_CLIENT_ID || "synapse-ui",
    post_logout_redirect_uri: redirectUri,
  });
  window.location.href = `${authServerUrl()}/realms/${keycloak.realm}/protocol/openid-connect/logout?${params}`;
}
