/**
 * Vite config for the Playwright E2E run.
 *
 * Reuses the app's vite.config.ts unchanged and only retargets the dev
 * server: its own port (E2E_WEB_PORT, default 4173) and an `/api` proxy to the
 * E2E backend (E2E_API_PORT, default 8010), so the suite never collides with a
 * developer's regular 8080/8000 servers.
 */
import { defineConfig, mergeConfig } from "vite";
import base from "../vite.config";

const webPort = Number(process.env.E2E_WEB_PORT ?? 4173);
const apiPort = Number(process.env.E2E_API_PORT ?? 8010);

export default mergeConfig(
  base,
  defineConfig({
    server: {
      host: "127.0.0.1",
      port: webPort,
      strictPort: true,
      proxy: {
        "/api": { target: `http://127.0.0.1:${apiPort}`, changeOrigin: true },
      },
    },
  }),
);
