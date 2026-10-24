import { describe, expect, it } from "vitest";
import type { CarListing } from "@/types/car";
import { getListingImageUrl } from "@/lib/listing-card-meta";

type ListingImageInput = Pick<CarListing, "thumbnail_url" | "images" | "url" | "external_url">;

describe("getListingImageUrl", () => {
  it("prefers thumbnail_url when available", () => {
    expect(
      getListingImageUrl({
        thumbnail_url: "https://example.com/thumb.jpg",
        images: ["https://example.com/gallery.jpg"],
      } as ListingImageInput),
    ).toBe("https://example.com/thumb.jpg");
  });

  it("falls back to the first image when thumbnail_url is missing", () => {
    expect(
      getListingImageUrl({
        images: ["https://example.com/gallery.jpg", "https://example.com/gallery-2.jpg"],
      } as ListingImageInput),
    ).toBe("https://example.com/gallery.jpg");
  });

  it("returns null when no image exists", () => {
    expect(getListingImageUrl({} as ListingImageInput)).toBeNull();
  });

  it("resolves relative thumbnails against the listing source URL", () => {
    expect(
      getListingImageUrl({
        thumbnail_url: "/images/listing-thumb.jpg",
        url: "https://www.riyasewana.com/buy/toyota-prius-1234",
      } as ListingImageInput),
    ).toBe("https://www.riyasewana.com/images/listing-thumb.jpg");
  });

  it("falls back to relative gallery images using external_url as base", () => {
    expect(
      getListingImageUrl({
        images: ["gallery/cover.webp"],
        external_url: "https://ikman.lk/en/ad/toyota-vitz-for-sale-colombo",
      } as ListingImageInput),
    ).toBe("https://ikman.lk/en/ad/gallery/cover.webp");
  });

  it("keeps Motormila demo thumbs on the app origin instead of the listing source", () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    expect(
      getListingImageUrl({
        thumbnail_url: "/demo/aqua.webp",
        url: "https://example.com/demo-aqua",
      } as ListingImageInput),
    ).toBe(`${origin}/demo/aqua.webp`);
  });
});
describe("getListingImageList", () => {
  it("returns the gallery first, then the thumbnail when not duplicated", async () => {
    const { getListingImageList } = await import("@/lib/listingImage");
    expect(
      getListingImageList({
        thumbnail_url: "https://example.com/thumb.jpg",
        images: ["https://example.com/1.jpg", "https://example.com/2.jpg"],
      } as ListingImageInput),
    ).toEqual([
      "https://example.com/1.jpg",
      "https://example.com/2.jpg",
      "https://example.com/thumb.jpg",
    ]);
  });

  it("dedupes the thumbnail when it is already the first gallery image", async () => {
    const { getListingImageList } = await import("@/lib/listingImage");
    expect(
      getListingImageList({
        thumbnail_url: "https://example.com/1.jpg",
        images: ["https://example.com/1.jpg", "https://example.com/2.jpg"],
      } as ListingImageInput),
    ).toEqual(["https://example.com/1.jpg", "https://example.com/2.jpg"]);
  });

  it("falls back to the thumbnail alone when there is no gallery", async () => {
    const { getListingImageList } = await import("@/lib/listingImage");
    expect(
      getListingImageList({ thumbnail_url: "https://example.com/thumb.jpg" } as ListingImageInput),
    ).toEqual(["https://example.com/thumb.jpg"]);
  });

  it("returns an empty list when there are no images", async () => {
    const { getListingImageList } = await import("@/lib/listingImage");
    expect(getListingImageList({} as ListingImageInput)).toEqual([]);
  });
});

describe("marketplace photo helpers", () => {
  it("builds an ikman srcset at the original aspect ratio", async () => {
    const { marketplaceSrcSet } = await import("@/lib/listingImage");
    const url = "https://i.ikman-st.com/bajaj-2001-for-sale-colombo-62/8f1e10ea/1080/810/cropped.jpg";
    expect(marketplaceSrcSet(url)).toBe(
      "https://i.ikman-st.com/bajaj-2001-for-sale-colombo-62/8f1e10ea/320/240/cropped.jpg 320w, " +
        "https://i.ikman-st.com/bajaj-2001-for-sale-colombo-62/8f1e10ea/480/360/cropped.jpg 480w, " +
        "https://i.ikman-st.com/bajaj-2001-for-sale-colombo-62/8f1e10ea/620/465/cropped.jpg 620w, " +
        "https://i.ikman-st.com/bajaj-2001-for-sale-colombo-62/8f1e10ea/1080/810/cropped.jpg 1080w",
    );
    expect(marketplaceSrcSet("https://riyasewana.com/uploads/a-1.jpg")).toBeUndefined();
    expect(marketplaceSrcSet(null)).toBeUndefined();
  });

  it("stops hot-linking a host after repeated refusals, unless it ever served a photo", async () => {
    const { imageHostBlocked, noteImageResult, resetImageHostState } = await import("@/lib/listingImage");
    resetImageHostState();
    const a = "https://riyasewana.com/uploads/a.jpg";
    for (let i = 0; i < 3; i += 1) noteImageResult(a, false);
    expect(imageHostBlocked(a)).toBe(false);
    noteImageResult(a, false);
    expect(imageHostBlocked("https://riyasewana.com/uploads/b.jpg")).toBe(true);
    noteImageResult(a, true);
    expect(imageHostBlocked(a)).toBe(false);
    for (let i = 0; i < 6; i += 1) noteImageResult(a, false);
    expect(imageHostBlocked(a)).toBe(false);
    expect(imageHostBlocked("/demo/car.webp")).toBe(false);
    resetImageHostState();
  });
});
