import { render } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const viewer = vi.hoisted(() => vi.fn<(props: { slides: { src: string; alt: string }[] }) => null>(() => null));
vi.mock("yet-another-react-lightbox", () => ({ default: viewer }));
import ListingLightbox from "@/components/listing/ListingLightbox";

it("preserves the slide list while the selected photo changes so navigation animations are not reset", () => {
  const images = ["https://example.com/a.jpg", "https://example.com/b.jpg", "https://example.com/c.jpg"];
  const { rerender } = render(<ListingLightbox open index={0} images={images} alt="Toyota" onClose={() => {}} />);
  const initialSlides = viewer.mock.calls.at(-1)?.[0]?.slides;
  rerender(<ListingLightbox open index={1} images={images} alt="Toyota" onClose={() => {}} />);
  expect(viewer.mock.calls.at(-1)?.[0]?.slides).toBe(initialSlides);
  rerender(<ListingLightbox open index={2} images={images} alt="Toyota" onClose={() => {}} />);
  expect(viewer.mock.calls.at(-1)?.[0]?.slides).toBe(initialSlides);
});
