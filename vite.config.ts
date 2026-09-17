import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The dev server binds to 0.0.0.0 so it can be exposed through a tunnel
// (cloudflared / ngrok) and embedded inside an HTTPS Zoho Creator page.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // Accept any tunnel hostname; the app never assumes its own origin.
    allowedHosts: true,
  },
  preview: {
    host: true,
    port: 5173,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
