import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const engine = vi.hoisted(() => ({ scrollPrev: vi.fn(), scrollNext: vi.fn(), scrollTo: vi.fn(), selectedScrollSnap: () => 0, on: vi.fn(), off: vi.fn(), reInit: vi.fn() }));
vi.mock("embla-carousel-react", () => ({ default: () => [vi.fn(), engine] }));
vi.mock("@/components/VehicleThumbnail", () => ({ VehicleThumbnail: ({ alt }: { alt: string }) => <img alt={alt} /> }));
import { ListingImageCarousel } from "@/components/ListingImageCarousel";

beforeEach(() => vi.clearAllMocks());
const photos = ["https://example.com/a.jpg", "https://example.com/b.jpg"];

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
