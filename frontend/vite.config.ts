
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: "frontend",

  plugins: [react(), tailwindcss()],

  server: {
    host: "0.0.0.0",
    port: 5174,
    strictPort: true,

    // Allow changing Cloudflare Quick Tunnel hostnames.
    allowedHosts: [".trycloudflare.com"],

    // Local development proxy; this does not deploy the backend.
    proxy: {
      "/api": "http://127.0.0.1:4000",
      "/health": "http://127.0.0.1:4000",
    },
  },

  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
