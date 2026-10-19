import { afterEach, describe, expect, it, vi } from "vitest";

import { getAlerts, matchAlerts } from "@/services/api";

/**
 * The alerts page reported "Loading alerts" forever with 405/500 on active
 * alerts. The root cause was transport-level: /alerts/match is a POST
 * endpoint, and the client issued a GET, so the server answered 405.
 */
describe("alerts transport contract", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("matches alerts with POST, not GET", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [], checked_at: "2026-01-01T00:00:00Z" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await matchAlerts("token-1234");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/alerts/match");
    expect(init.method).toBe("POST");
  });

  it("sends the alert token header when listing alerts", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    });
    vi.stubGlobal("fetch", fetchMock);

    await getAlerts("token-1234");

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["X-Alert-Token"]).toBe("token-1234");
  });
});
