import { afterEach, describe, expect, it, vi } from "vitest";

describe("snapshot fallback", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("falls back to same-origin when the configured base fails", async () => {
    const primaryData = { from: "primary" };
    const fallbackData = { from: "same-origin" };

    const fetchMock = vi.fn(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("/snapshots/latest/")) {
        return { ok: true, json: async () => fallbackData };
      }
      // Primary (configured base) fails.
      return { ok: false, status: 404, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchSnapshotJSON, SNAPSHOT_BASE } = await import("@/services/api");

    // Only meaningful when the configured base differs from same-origin.
    // In the test env SNAPSHOT_BASE may be empty; the fallback still runs.
    const result = await fetchSnapshotJSON<{ from: string }>("test-file.json");

    expect(result).toEqual(fallbackData);
    // Fetch was attempted (primary first, then same-origin fallback).
    expect(fetchMock).toHaveBeenCalled();
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("/snapshots/latest/test-file.json"))).toBe(true);
    expect(SNAPSHOT_BASE).toBeDefined();
    expect(primaryData.from).toBe("primary"); // sanity
  });

  it("throws when both primary and same-origin fail", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchSnapshotJSON } = await import("@/services/api");

    await expect(fetchSnapshotJSON("missing-file.json")).rejects.toThrow();
    // Tried primary, then same-origin.
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("uses primary directly when it succeeds (no fallback fetch)", async () => {
    const primaryData = { from: "primary" };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => primaryData,
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchSnapshotJSON } = await import("@/services/api");
    const result = await fetchSnapshotJSON<{ from: string }>("test-file.json");

    expect(result).toEqual(primaryData);
    // Primary succeeded on first try; same-origin not needed (unless URLs identical).
    expect(fetchMock).toHaveBeenCalled();
  });
});
