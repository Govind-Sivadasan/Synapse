import keycloak from "./keycloak";

export interface AccountProfile {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
}

export function getAccountProfile(): AccountProfile {
  const token = keycloak.tokenParsed as Record<string, string | undefined> | undefined;
  const firstName = token?.given_name ?? "";
  const lastName = token?.family_name ?? "";
  const displayName =
    token?.name ??
    ([firstName, lastName].filter(Boolean).join(" ") || token?.preferred_username || "");

  return {
    username: token?.preferred_username ?? "",
    email: token?.email ?? "",
    firstName,
    lastName,
    displayName,
  };
}

/** Keycloak hosted password update flow (works with synapse-ui session). */
export function startPasswordChange(): void {
  void keycloak.login({
    action: "UPDATE_PASSWORD",
    redirectUri: `${window.location.origin}/account`,
  });
}
