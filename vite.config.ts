import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The dev server binds to 0.0.0.0 so it can be exposed through a tunnel
// (cloudflared / ngrok) and embedded inside an HTTPS Zoho Creator page.
/**
 * Vite only exposes `VITE_`-prefixed variables to client code, and Vercel warns
 * against that prefix because such values are public. Both are correct: the
 * Creator publish keys ARE public (they appear in the published URLs). To accept
 * either spelling, unprefixed build-time variables are inlined here.
 */
const inlineEnv = (name: string) => JSON.stringify(process.env[name] ?? "");

export default defineConfig({
  plugins: [react()],
  define: {
    __CREATOR_FORM_PRIVATE_LINK__: inlineEnv("CREATOR_FORM_PRIVATE_LINK"),
    __CREATOR_REPORT_PRIVATE_LINK__: inlineEnv("CREATOR_REPORT_PRIVATE_LINK"),
    __CREATOR_APP_NAME__: inlineEnv("CREATOR_APP_NAME"),
    __CREATOR_FORM_LINK_NAME__: inlineEnv("CREATOR_FORM_LINK_NAME"),
    __CREATOR_REPORT_LINK_NAME__: inlineEnv("CREATOR_REPORT_LINK_NAME"),
    __CREATOR_USE_MOCK__: inlineEnv("USE_CREATOR_MOCK"),
  },
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
