import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/api", () => ({
  getListing: vi.fn(async (id: string) => ({ id: Number(id), make: "Toyota", model: "Aqua" })),
  getSimilarListings: vi.fn(async () => [{ id: 99 }]),
  getListingPriceHistory: vi.fn(async () => null),
  getListingFmv: vi.fn(async () => null),
}));

import { peekRecentBundle, takeListingBundle } from "@/lib/listingHandoff";

describe("listingHandoff recent bundles (Back onto a listing)", () => {
  it("keeps the bundle a detail page showed so Back paints it without a skeleton", async () => {
    expect(peekRecentBundle("5")).toBeNull();
    const bundle = await takeListingBundle("5");
    expect(bundle[0]).toMatchObject({ id: 5 });
    expect(peekRecentBundle("5")).toBe(bundle);
    expect(peekRecentBundle("6")).toBeNull();
  });

  it("preserves temporary failures for retry instead of returning a missing listing", async () => {
    const api = await import("@/services/api");
    vi.mocked(api.getListing).mockRejectedValueOnce(new Error("offline"));
    await expect(takeListingBundle("808")).rejects.toThrow("offline");
  });

  it("returns a missing listing only for a confirmed 404", async () => {
    const api = await import("@/services/api");
    vi.mocked(api.getListing).mockRejectedValueOnce(Object.assign(new Error("missing"), { status: 404 }));
    expect((await takeListingBundle("809"))[0]).toBeNull();
  });

  it("does not keep a listing that failed to load", async () => {
    const api = await import("@/services/api");
    vi.mocked(api.getListing).mockResolvedValueOnce(null as never);
    await takeListingBundle("7");
    expect(peekRecentBundle("7")).toBeNull();
  });
});
