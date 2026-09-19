import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";

export default defineConfig({
  // CodeSandbox exposes the dev server through a reverse proxy. Bind
  // explicitly to IPv4/all interfaces and keep one deterministic port so
  // the proxy never follows Vite's automatic port fallback.
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    // CodeSandbox's port proxy handles page requests, but its public
    // WebSocket endpoint is environment-dependent. Disable HMR here so a
    // failed WebSocket upgrade can never take down the HTTP preview. `vite dev` remains fully usable with manual refresh.
  },
  plugins: [
    tanstackStart({
      server: { entry: "server" },
    }),
    viteReact(),
    tailwindcss(),
    nitro({ preset: "bun" }),
  ],
});
