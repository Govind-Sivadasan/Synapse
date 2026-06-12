import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import keycloak from "./keycloak";

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  token: string | undefined;
  roles: string[];
  username: string;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    keycloak
      .init({ onLoad: "login-required", checkLoginIframe: false })
      .then((authenticated) => {
        setIsAuthenticated(authenticated);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);

  const value: AuthContextValue = {
    isAuthenticated,
    isLoading,
    token: keycloak.token,
    roles: keycloak.realmAccess?.roles ?? [],
    username: keycloak.tokenParsed?.preferred_username ?? "",
    login: () => keycloak.login(),
    logout: () => keycloak.logout({ redirectUri: window.location.origin }),
  };

  if (isLoading) {
    return <div style={{ padding: "2rem" }}>Loading authentication...</div>;
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function hasRole(roles: string[], required: string[]): boolean {
  return required.some((r) => roles.includes(r));
}
