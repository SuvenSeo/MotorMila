import { describe, expect, it, vi } from "vitest";
import { loaderKeyFor, pathnameOf, prefetchRoute } from "@/lib/routePrefetch";

describe("routePrefetch", () => {
  it("normalizes hashes and trailing slashes", () => {
    expect(pathnameOf("/#market")).toBe("/");
    expect(pathnameOf("/trends/")).toBe("/trends");
    expect(pathnameOf("https://motormila.pages.dev/docs")).toBe("");
  });

  it("maps dynamic listing and hub paths to shared chunk keys", () => {
    expect(loaderKeyFor("/")).toBe("/");
    expect(loaderKeyFor("/listing/433500")).toBe("listing-detail");
    expect(loaderKeyFor("/cars/toyota")).toBe("make-hub");
    expect(loaderKeyFor("/cars/toyota/aqua")).toBe("make-model-hub");
    expect(loaderKeyFor("/official-pulse/guide/dmt")).toBe("pulse-guide");
    expect(loaderKeyFor("/official-pulse/12")).toBe("pulse-detail");
    expect(loaderKeyFor("/unknown")).toBeNull();
  });

  it("warms a matching chunk only once", async () => {
    const first = prefetchRoute("/trends");
    const second = prefetchRoute("/trends");
    expect(first).toBeUndefined();
    expect(second).toBeUndefined();
    await vi.waitFor(() => {
      expect(loaderKeyFor("/trends")).toBe("/trends");
    });
  });
});
