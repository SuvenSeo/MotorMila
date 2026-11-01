import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const engine = vi.hoisted(() => ({ scrollPrev: vi.fn(), scrollNext: vi.fn(), scrollTo: vi.fn(), selectedScrollSnap: () => 0, on: vi.fn(), off: vi.fn(), reInit: vi.fn() }));
vi.mock("embla-carousel-react", () => ({ default: () => [vi.fn(), engine] }));
vi.mock("@/components/VehicleThumbnail", () => ({ VehicleThumbnail: ({ alt }: { alt: string }) => <img alt={alt} /> }));
vi.mock("@/components/listing/ListingLightbox", () => ({ default: ({ open, index, onClose }: { open: boolean; index: number; onClose: () => void }) => open ? <div role="dialog" aria-label={`Fullscreen photo ${index + 1}`}><button onClick={onClose}>Close viewer</button></div> : null }));
import { ListingImageCarousel } from "@/components/ListingImageCarousel";

beforeEach(() => {
  vi.clearAllMocks();
});
const photos = ["https://example.com/a.jpg", "https://example.com/b.jpg"];

it("mounts a distant photo before scrolling to its thumbnail", () => {
  const images = Array.from({ length: 6 }, (_, i) => `https://example.com/${i}.jpg`);
  const { container } = render(<ListingImageCarousel images={images} alt="Toyota Aqua" variant="detail" />);
  fireEvent.click(screen.getByRole("button", { name: "Photo 4 of 6" }));
  expect(container.querySelector('[data-photo-index="3"] img')).not.toBeNull();
});

it("opens the photo actually clicked, including a peeking neighbour", async () => {
  render(<ListingImageCarousel images={photos} alt="Toyota Aqua" variant="detail" />);
  fireEvent.click(screen.getByRole("button", { name: /open photo 2/i, hidden: true }));
  expect(await screen.findByRole("dialog")).toHaveAttribute("aria-label", "Fullscreen photo 2");
});

it("does not open fullscreen after a drag gesture", () => {
  render(<ListingImageCarousel images={photos} alt="Toyota Aqua" variant="detail" />);
  const photo = screen.getByRole("button", { name: /open photo 1/i });
  // Embla cancels the click in native capture after crossing its drag threshold.
  photo.addEventListener("click", (event) => event.preventDefault(), { capture: true, once: true });
  fireEvent.click(photo);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("returns the page gallery to the photo viewed fullscreen without another scroll animation", async () => {
  render(<ListingImageCarousel images={photos} alt="Toyota Aqua" variant="detail" />);
  fireEvent.click(screen.getByRole("button", { name: /open photo 2/i, hidden: true }));
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", { name: "Close viewer" }));
  expect(engine.scrollTo).toHaveBeenCalledWith(1, true);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("closes the viewer when its photo set changes", async () => {
  const { rerender } = render(<ListingImageCarousel images={photos} alt="Toyota Aqua" variant="detail" />);
  fireEvent.click(screen.getByRole("button", { name: /open photo 1/i }));
  await screen.findByRole("dialog");
  rerender(<ListingImageCarousel images={["https://example.com/new.jpg"]} alt="Honda Fit" variant="detail" />);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

it("does not hijack arrow keys outside the photo gallery", () => {
  render(<><button>Unrelated control</button><ListingImageCarousel images={photos} alt="Toyota Aqua" variant="detail" /></>);
  fireEvent.keyDown(screen.getByRole("button", { name: "Unrelated control" }), { key: "ArrowRight" });
  expect(engine.scrollNext).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole("button", { name: /open photo 1/i }), { key: "ArrowRight" });
  expect(engine.scrollNext).toHaveBeenCalledOnce();
});

it("uses ordinary pressed buttons for thumbnails rather than incomplete tabs", () => {
  render(<ListingImageCarousel images={photos} alt="Toyota Aqua" variant="detail" />);
  expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Photo 1 of 2" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Photo 2 of 2" })).toHaveAttribute("aria-pressed", "false");
});
