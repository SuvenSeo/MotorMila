import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const availability = vi.hoisted(() => ({ ready: true }));
const engine = vi.hoisted(() => ({ scrollPrev: vi.fn(), scrollNext: vi.fn(), scrollTo: vi.fn(), selectedScrollSnap: () => 0, on: vi.fn(), off: vi.fn(), reInit: vi.fn() }));
vi.mock("embla-carousel-react", () => ({ default: () => [vi.fn(), availability.ready ? engine : undefined] }));
vi.mock("@/components/VehicleThumbnail", () => ({ VehicleThumbnail: ({ alt }: { alt: string }) => <img alt={alt} /> }));
vi.mock("@/components/listing/ListingLightbox", () => ({ default: () => null }));
import { ListingImageCarousel } from "@/components/ListingImageCarousel";
import MorphSlider from "@/components/MorphSlider";

beforeEach(() => {
  vi.clearAllMocks();
  availability.ready = true;
});

const photos = ["https://example.com/a.jpg", "https://example.com/b.jpg", "https://example.com/c.jpg"];

it("falls back to the filmstrip when WebGL is unavailable instead of crashing", async () => {
  // jsdom has no WebGL context, so the melt engine cannot start — the
  // gallery must degrade to the Embla filmstrip, never a blank page.
  const { container } = render(<ListingImageCarousel images={photos} alt="Toyota Aqua" variant="detail" morph />);
  // The melt slider hides the Embla arrows; they only reappear once the
  // engine failure has flipped the gallery back to the filmstrip.
  await waitFor(() => expect(screen.getByRole("button", { name: "Next photo" })).toBeInTheDocument());
  expect(container.querySelector(".morph-slider-canvas")).toBeNull();
  expect(container.querySelector('[data-photo-index="1"] img')).not.toBeNull();
});

it("reports an engine failure to the parent instead of throwing", async () => {
  const onTextureError = vi.fn();
  render(<MorphSlider items={photos.map((image) => ({ image }))} onTextureError={onTextureError} />);
  await waitFor(() => expect(onTextureError).toHaveBeenCalledWith(-1));
});

it("does not attempt the melt slider for a single photo", () => {
  const { container } = render(<ListingImageCarousel images={[photos[0]]} alt="Toyota Aqua" variant="detail" morph />);
  expect(container.querySelector(".morph-slider-canvas")).toBeNull();
  expect(container.querySelector('[data-photo-index="0"] img')).not.toBeNull();
});
