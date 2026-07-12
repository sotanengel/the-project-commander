import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// APIサーバーのポートは VITE_API_PORT で上書き可能（並行開発時のポート衝突対策）
const apiPort = process.env.VITE_API_PORT ?? "3000";
const apiTarget = `http://localhost:${apiPort}`;

export default defineConfig({
  build: {
    target: 'es2022',
  },
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": apiTarget,
      "/mcp": apiTarget,
    },
  },
});
