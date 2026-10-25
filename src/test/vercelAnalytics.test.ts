import { describe, expect, it } from "vitest";
import { shouldLoadVercelAnalytics } from "@/lib/vercelAnalytics";

describe("shouldLoadVercelAnalytics", () => {
  it("loads on Vercel hosts", () => {
    expect(shouldLoadVercelAnalytics("motormila.vercel.app")).toBe(true);
  });
  it("skips the Cloudflare Pages mirror and previews", () => {
    expect(shouldLoadVercelAnalytics("motormila.pages.dev")).toBe(false);
    expect(shouldLoadVercelAnalytics("web-premium-p1.motormila.pages.dev")).toBe(false);
  });
  it("skips local hosts and empty input", () => {
    expect(shouldLoadVercelAnalytics("localhost")).toBe(false);
    expect(shouldLoadVercelAnalytics("127.0.0.1")).toBe(false);
    expect(shouldLoadVercelAnalytics("")).toBe(false);
  });
  it("honours the VITE_VERCEL_ANALYTICS override", () => {
    expect(shouldLoadVercelAnalytics("web-premium-p1.motormila.pages.dev", "on")).toBe(true);
    expect(shouldLoadVercelAnalytics("motormila.vercel.app", "off")).toBe(false);
  });
});
