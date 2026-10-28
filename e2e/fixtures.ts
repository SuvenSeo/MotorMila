import { expect, test as base, type Page } from "@playwright/test";

/**
 * Shared fixtures for the E2E suite.
 *
 * `pageErrors` collects uncaught exceptions, console.error output and failed
 * API calls (5xx, or any 4xx other than an expected 404) for the current page,
 * so specs can assert a route rendered cleanly. Plain "Failed to load
 * resource" console lines are ignored: they are the browser echoing a network
 * 404, and optional static files (e.g. generated sparklines) legitimately 404
 * in a dev checkout. Analytics 429s are also ignored (see below).
 */
export type PageErrors = { messages: string[] };

function track(page: Page): PageErrors {
  const errors: PageErrors = { messages: [] };
  page.on("pageerror", (err) => errors.messages.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (text.startsWith("Failed to load resource")) return;
    errors.messages.push(`console.error: ${text}`);
  });
  page.on("response", (res) => {
    const url = new URL(res.url());
    if (!url.pathname.startsWith("/api/")) return;
    const status = res.status();
    // Fire-and-forget analytics are capped at 60 events/min per client IP;
    // the whole parallel suite shares one IP, so 429s there are expected.
    if (status === 429 && url.pathname === "/api/v1/events") return;
    if (status >= 500 || (status >= 400 && status !== 404 && status !== 401)) {
      errors.messages.push(`api ${status}: ${url.pathname}${url.search}`);
    }
  });
  return errors;
}

export const test = base.extend<{ pageErrors: PageErrors }>({
  // Named `provide` (not Playwright's usual `use`) so react-hooks lint
  // doesn't mistake it for React's use() hook.
  pageErrors: async ({ page }, provide) => {
    await provide(track(page));
  },
});

export { expect };

/** Seeded data (see e2e/seed.py). */
export const SEED = {
  total: 22,
  prius: { make: "Toyota", model: "Prius", count: 11 },
  wagonR: { make: "Suzuki", model: "Wagon R", count: 3 },
  vezel: { make: "Honda", model: "Vezel", count: 3 },
} as const;

/** Listing cards expose an accessible "Open <Make> <Model>" link. */
export function listingLinks(page: Page, name: string | RegExp = /^Open /) {
  return page.getByRole("link", { name });
}
