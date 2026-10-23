import { useEffect, useState, type ReactNode } from "react";

/**
 * Scroll distance (px) after which the home banners tuck away. The banners
 * rest 8px below the fixed header (see `.hero-banners` padding), so any
 * further scroll would slide them under the transparent nav and then the
 * floating capsule. Tucking a little before that keeps them from ever
 * sharing pixels with the header.
 */
export const HERO_BANNERS_TUCK_AT = 4;

function useScrolledPast(threshold: number) {
  const [past, setPast] = useState(() => typeof window !== "undefined" && window.scrollY > threshold);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const next = window.scrollY > threshold;
      setPast((cur) => (cur === next ? cur : next));
    };
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [threshold]);

  return past;
}

/**
 * Floating banner stack over the homepage hero, just under the fixed header.
 * At the top of the page the banners sit fully below the nav; once the page
 * scrolls they fade out (opacity/transform only, so no layout shift) instead
 * of sliding under the header, and return when scrolled back to the top.
 */
export function HeroBanners({ children }: { children: ReactNode }) {
  const tucked = useScrolledPast(HERO_BANNERS_TUCK_AT);
  return (
    <div className="hero-banners" data-tucked={tucked ? "true" : undefined}>
      {children}
    </div>
  );
}
