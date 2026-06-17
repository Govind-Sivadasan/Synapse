import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backend = process.env.VITE_DEV_BACKEND_URL || "http://localhost:8000";
const backendWs = backend.replace(/^http/, "ws");

export default defineConfig(({ mode }) => ({
  plugins: [
    react({
      // Fast Refresh: React component edits update in-place without full page reload.
    }),
  ],
  server: {
    port: 5173,
    host: true,
    strictPort: true,
    open: mode === "development",
    hmr: {
      overlay: true,
    },
    watch: {
      // Set VITE_USE_POLLING=true if file changes are not detected (rare on Windows).
      usePolling: process.env.VITE_USE_POLLING === "true",
    },
    proxy: {
      "/api": {
        target: backend,
        changeOrigin: true,
      },
      "/ws": {
        target: backendWs,
        ws: true,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 5173,
    host: true,
  },
}));
