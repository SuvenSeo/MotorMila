import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HERO_BANNERS_TUCK_AT, HeroBanners } from "@/components/HeroBanners";

function setScrollY(y: number) {
  Object.defineProperty(window, "scrollY", { configurable: true, value: y });
}

afterEach(() => {
  setScrollY(0);
  vi.restoreAllMocks();
});

describe("HeroBanners", () => {
  it("sits in view at the top and tucks away once the page scrolls under the header", () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => frames.push(cb));
    const flushFrames = () => frames.splice(0).forEach((cb) => cb(0));
    setScrollY(0);
    const { container } = render(
      <HeroBanners>
        <p>Market update</p>
      </HeroBanners>,
    );
    const stack = container.querySelector(".hero-banners")!;
    expect(stack.hasAttribute("data-tucked")).toBe(false);

    act(() => {
      setScrollY(HERO_BANNERS_TUCK_AT + 40);
      window.dispatchEvent(new Event("scroll"));
      flushFrames();
    });
    expect(stack.getAttribute("data-tucked")).toBe("true");

    act(() => {
      setScrollY(0);
      window.dispatchEvent(new Event("scroll"));
      flushFrames();
    });
    expect(stack.hasAttribute("data-tucked")).toBe(false);
  });
});
