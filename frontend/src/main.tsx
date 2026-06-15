import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import "./index.css";

const queryClient = new QueryClient();

// Apply saved theme before first paint
try {
  const raw = localStorage.getItem("synapse.theme");
  if (raw) {
    const { accent, mode } = JSON.parse(raw);
    if (accent) document.documentElement.setAttribute("data-accent", accent);
    if (mode) document.documentElement.setAttribute("data-mode", mode);
  }
} catch { /* ignore */ }

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
