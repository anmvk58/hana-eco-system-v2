import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Only the shared web entry point participates in dependency discovery.
  optimizeDeps: { entries: ["index.html"] },
  server: {
    allowedHosts: [".trycloudflare.com"],
    port: 5173,
    watch: { ignored: ["**/apk-local/**", "**/android/**"] },
    proxy: {
      "/api": {
        target: "http://api:8000",
        changeOrigin: true,
      },
    },
  },
});

