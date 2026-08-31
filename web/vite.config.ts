import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // THE bug behind "weather returns 404": a bare string proxy forwards
      // /api/weather/BLR verbatim; the backend serves /weather/BLR. Rewrite it.
      "/api": { target: "http://localhost:8000", rewrite: p => p.replace(/^\/api/, "") },
    },
  },
});
