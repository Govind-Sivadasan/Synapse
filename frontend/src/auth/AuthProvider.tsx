import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { apiFetch } from "../api/client";
import LoadingScreen from "../components/ui/LoadingScreen";
import keycloak from "./keycloak";
import { bindKeycloakTokenPersistence, logoutFromKeycloak } from "./logout";

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  token: string | undefined;
  roles: string[];
  username: string;
  login: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    bindKeycloakTokenPersistence();
    keycloak
      .init({ onLoad: "login-required", checkLoginIframe: false })
      .then((authenticated) => {
        bindKeycloakTokenPersistence();
        setIsAuthenticated(authenticated);
        setIsLoading(false);
        if (authenticated) {
          apiFetch("/api/v1/auth/login-audit", { method: "POST" }).catch(() => {});
        }
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
    logout: logoutFromKeycloak,
  };

  if (isLoading) {
    return <LoadingScreen />;
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
