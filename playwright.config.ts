import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end suite: real FastAPI backend (seeded SQLite) + Vite dev server.
 *
 * Ports are deliberately not the dev defaults (8080 / 8000) so a local run
 * never collides with servers you already have up. Override with
 * E2E_WEB_PORT / E2E_API_PORT. See e2e/README.md.
 */
const CI = !!process.env.CI;
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 4173);
const API_PORT = Number(process.env.E2E_API_PORT ?? 8010);
const DB_PATH = path.join(ROOT, "e2e", ".output", "e2e.db");

// Local dev uses the backend virtualenv (see AGENTS.md); CI installs the
// requirements into the setup-python interpreter.
const venvPython = path.join(ROOT, "backend", ".venv", "bin", "python");
const PYTHON = process.env.E2E_PYTHON ?? (existsSync(venvPython) ? venvPython : "python");

const backendEnv: Record<string, string> = {
  DATABASE_URL: `sqlite:///${DB_PATH}`,
  HOT_DATABASE_URL: "",
  COLD_DATABASE_URL: "",
  AUTH_DATABASE_URL: "",
  ALLOW_SQLITE_FALLBACK: "true",
  PRO_ACCESS_ENFORCED: "false",
  APP_ACCESS_ENFORCED: "false",
  // Never reach out to the network or run background jobs during tests.
  SQLITE_FAILOVER: "false",
  DAILY_SYNC_ENABLED: "false",
  DIGEST_FLUSH_ENABLED: "false",
  SENTRY_DSN: "",
};

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.(e2e|playwright-spec)\.ts$/,
  outputDir: "./e2e/.output/test-results",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: CI ? 2 : undefined,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  reporter: CI
    ? [["github"], ["list"], ["html", { outputFolder: "e2e/.output/report", open: "never" }]]
    : [["list"], ["html", { outputFolder: "e2e/.output/report", open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      name: "backend",
      // Re-seed a dedicated SQLite file, then serve it.
      command: `"${PYTHON}" e2e/seed.py "${DB_PATH}" && cd backend && "${PYTHON}" -m uvicorn app.main:app --host 127.0.0.1 --port ${API_PORT}`,
      cwd: ROOT,
      env: backendEnv,
      url: `http://127.0.0.1:${API_PORT}/api/v1/listings?limit=1`,
      reuseExistingServer: !CI,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      name: "frontend",
      command: `npx vite --config e2e/vite.e2e.config.ts`,
      cwd: ROOT,
      env: {
        E2E_WEB_PORT: String(WEB_PORT),
        E2E_API_PORT: String(API_PORT),
        // Read the seeded live API, not the bundled public/snapshots data.
        VITE_SNAPSHOT_BASE_URL: "off",
        VITE_API_URL: "/api/v1",
      },
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
  ],
});
