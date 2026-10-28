import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    // Playwright specs (e2e/*.e2e.ts) run via `npm run e2e`, never vitest.
    exclude: [...configDefaults.exclude, "e2e/**"],
    // Tests exercise the same-origin dev/proxy path, matching real dev runs.
    env: {
      VITE_API_URL: "/api/v1",
      // Unit tests exercise the live-API contract by default; snapshot tests
      // opt in with vi.stubEnv("VITE_SNAPSHOT_BASE_URL", ...) + vi.resetModules().
      VITE_SNAPSHOT_BASE_URL: "off",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
