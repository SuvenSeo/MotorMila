import { afterEach, describe, expect, it, vi } from "vitest";

function mockFetchOnce(payload: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => payload,
  });
}

describe("getPublicCatalogTotal", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("returns total_listings from the configured snapshot base", async () => {
    vi.stubEnv("VITE_SNAPSHOT_BASE_URL", "https://cdn.example/latest");
    const fetchMock = mockFetchOnce({ total_listings: 302084 });
    vi.stubGlobal("fetch", fetchMock);

    const { getPublicCatalogTotal } = await import("@/services/publicCatalog");
    await expect(getPublicCatalogTotal()).resolves.toBe(302084);
    expect(String(fetchMock.mock.calls[0]?.[0] || "")).toBe(
      "https://cdn.example/latest/stats-summary.json",
    );
  });

  it("falls back to the same-origin snapshot when the primary fails", async () => {
    vi.stubEnv("VITE_SNAPSHOT_BASE_URL", "https://cdn.example/latest");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ total_listings: 42 }) });
    vi.stubGlobal("fetch", fetchMock);

    const { getPublicCatalogTotal } = await import("@/services/publicCatalog");
    await expect(getPublicCatalogTotal()).resolves.toBe(42);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0] || "")).toContain("/snapshots/latest/stats-summary.json");
  });

  it("returns null when every snapshot read fails", async () => {
    vi.stubEnv("VITE_SNAPSHOT_BASE_URL", "https://cdn.example/latest");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const { getPublicCatalogTotal } = await import("@/services/publicCatalog");
    await expect(getPublicCatalogTotal()).resolves.toBeNull();
  });

  it("returns null when the snapshot has no usable total", async () => {
    vi.stubEnv("VITE_SNAPSHOT_BASE_URL", "https://cdn.example/latest");
    vi.stubGlobal("fetch", mockFetchOnce({ total_listings: 0 }));

    const { getPublicCatalogTotal } = await import("@/services/publicCatalog");
    await expect(getPublicCatalogTotal()).resolves.toBeNull();
  });
});
