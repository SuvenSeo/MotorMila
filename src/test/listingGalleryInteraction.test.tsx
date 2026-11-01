import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const availability = vi.hoisted(() => ({ ready: true }));
const engine = vi.hoisted(() => ({ scrollPrev: vi.fn(), scrollNext: vi.fn(), scrollTo: vi.fn(), selectedScrollSnap: () => 0, on: vi.fn(), off: vi.fn(), reInit: vi.fn() }));
vi.mock("embla-carousel-react", () => ({ default: () => [vi.fn(), availability.ready ? engine : undefined] }));
vi.mock("@/components/VehicleThumbnail", () => ({ VehicleThumbnail: ({ alt }: { alt: string }) => <img alt={alt} /> }));
vi.mock("@/components/listing/ListingLightbox", () => ({ default: ({ open, index, onClose, onIndexChange }: { open: boolean; index: number; onClose: () => void; onIndexChange: (index: number) => void }) => open ? <div role="dialog" aria-label={`Fullscreen photo ${index + 1}`}><button onClick={() => onIndexChange(index + 1)}>Next fullscreen photo</button><button onClick={onClose}>Close viewer</button></div> : null }));
import { ListingImageCarousel } from "@/components/ListingImageCarousel";

beforeEach(() => {
  vi.clearAllMocks();
  availability.ready = true;
});
const photos = ["https://example.com/a.jpg", "https://example.com/b.jpg"];

it("mounts a distant photo before scrolling to its thumbnail", () => {
  const images = Array.from({ length: 6 }, (_, i) => `https://example.com/${i}.jpg`);
  const { container } = render(<ListingImageCarousel images={images} alt="Toyota Aqua" variant="detail" />);
  fireEvent.click(screen.getByRole("button", { name: "Photo 4 of 6" }));
  expect(container.querySelector('[data-photo-index="3"] img')).not.toBeNull();
});

it("mounts the photos crossed during a distant thumbnail jump", () => {
  const images = Array.from({ length: 8 }, (_, i) => `https://example.com/${i}.jpg`);
  const { container } = render(<ListingImageCarousel images={images} alt="Toyota" variant="detail" />);
  fireEvent.click(screen.getByRole("button", { name: "Photo 6 of 8" }));
  for (let i = 0; i <= 5; i++) {
    expect(container.querySelector(`[data-photo-index="${i}"] img`)).not.toBeNull();
  }
});

it("keeps successive arrow taps queued before the carousel initializes", () => {
  availability.ready = false;
  const images = Array.from({ length: 5 }, (_, i) => `https://example.com/${i}.jpg`);
  const { rerender } = render(<ListingImageCarousel images={images} alt="Toyota" variant="detail" />);
  fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
  fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
  availability.ready = true;
  rerender(<ListingImageCarousel images={images} alt="Toyota" variant="detail" />);
  expect(engine.scrollTo).toHaveBeenLastCalledWith(2, false);
});

it("does not wrap backwards on a finite detail gallery before initialization", () => {
  availability.ready = false;
  const { rerender } = render(<ListingImageCarousel images={photos} alt="Toyota" variant="detail" />);
  fireEvent.click(screen.getByRole("button", { name: "Previous photo" }));
  availability.ready = true;
  rerender(<ListingImageCarousel images={photos} alt="Toyota" variant="detail" />);
  expect(engine.scrollTo).toHaveBeenLastCalledWith(0, false);
});

it("continues from a queued thumbnail and clamps at the last detail photo", () => {
  availability.ready = false;
  const { rerender } = render(<ListingImageCarousel images={photos} alt="Toyota" variant="detail" />);
  fireEvent.click(screen.getByRole("button", { name: "Photo 2 of 2" }));
  fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
  availability.ready = true;
  rerender(<ListingImageCarousel images={photos} alt="Toyota" variant="detail" />);
  expect(engine.scrollTo).toHaveBeenLastCalledWith(1, false);
});

it("retains looping arrow navigation for cards before initialization", () => {
  availability.ready = false;
  const { rerender } = render(<ListingImageCarousel images={photos} alt="Toyota" />);
  fireEvent.click(screen.getByRole("button", { name: "Previous photo" }));
  availability.ready = true;
  rerender(<ListingImageCarousel images={photos} alt="Toyota" />);
  expect(engine.scrollTo).toHaveBeenLastCalledWith(1, false);
});

it("synchronizes the final fullscreen selection only on close", async () => {
  render(<ListingImageCarousel images={photos} alt="Toyota" variant="detail" />);
  fireEvent.click(screen.getByRole("button", { name: /open photo 1/i }));
  await screen.findByRole("dialog");
  engine.scrollTo.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "Next fullscreen photo" }));
  expect(screen.getByRole("dialog")).toHaveAttribute("aria-label", "Fullscreen photo 2");
  expect(engine.scrollTo).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Close viewer" }));
  expect(engine.scrollTo).toHaveBeenCalledWith(1, true);
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
