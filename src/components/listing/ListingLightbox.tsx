/**
 * Full-screen photo viewer with pinch/double-tap zoom. Lazy-loaded on first
 * tap (default export for React.lazy) so the lightbox JS + CSS never ship in
 * the listing route's initial chunk.
 */
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import "@/styles/listing-motion.css";

export interface ListingLightboxProps {
  open: boolean;
  index: number;
  images: string[];
  alt: string;
  /** Source marketplace credit, e.g. "riyasewana.com". */
  sourceName?: string | null;
  creditLabel?: string;
  /** Viewport centre of the photo that was tapped: the viewer zooms out of it. */
  origin?: { x: number; y: number } | null;
  onClose: () => void;
  onIndexChange?: (index: number) => void;
}

export default function ListingLightbox({
  open,
  index,
  images,
  alt,
  sourceName,
  creditLabel,
  origin,
  onClose,
  onIndexChange,
}: ListingLightboxProps) {
  const reduced =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.classList.contains("low-data"));
  const originStyle = origin
    ? ({ "--mm-lb-ox": `${Math.round(origin.x)}px`, "--mm-lb-oy": `${Math.round(origin.y)}px` } as Record<string, string>)
    : undefined;
  return (
    <Lightbox
      open={open}
      close={onClose}
      index={index}
      slides={images.map((src, i) => ({ src, alt: `${alt} ${i + 1}/${images.length}` }))}
      plugins={[Zoom]}
      className={reduced ? undefined : "mm-lightbox-zoom"}
      styles={originStyle ? { root: originStyle } : undefined}
      // Pinch / double-tap / wheel zoom with spec easing.
      zoom={{ maxZoomPixelRatio: 3, scrollToZoom: true, pinchZoomV4: true }}
      // Same Referer policy as the card/detail photos (VehicleThumbnail), so a
      // photo that showed on the page also opens here.
      carousel={{ finite: images.length <= 1, preload: 1, imageProps: { referrerPolicy: "no-referrer" } }}
      animation={
        reduced
          ? { fade: 0, swipe: 0, zoom: 0, navigation: 0 }
          : {
              fade: 280,
              swipe: 320,
              zoom: 280,
              // Literal curves (same as --ease-standard / --ease-decelerate in index.css):
              // swipe/navigation run through Element.animate(), which rejects var() easings.
              easing: {
                fade: "cubic-bezier(0.2, 0, 0, 1)",
                swipe: "cubic-bezier(0, 0, 0, 1)",
                navigation: "cubic-bezier(0, 0, 0, 1)",
              },
            }
      }
      // Swipe down to dismiss, like the native photo viewer.
      controller={{ closeOnBackdropClick: true, closeOnPullDown: true }}
      on={{ view: ({ index: i }) => onIndexChange?.(i) }}
      render={{
        // Single-photo listings: hide arrows.
        buttonPrev: images.length <= 1 ? () => null : undefined,
        buttonNext: images.length <= 1 ? () => null : undefined,
        slideFooter: () =>
          sourceName ? (
            <span
              style={{
                position: "absolute",
                bottom: 12,
                left: "50%",
                transform: "translateX(-50%)",
                padding: "4px 10px",
                borderRadius: 999,
                background: "rgba(0,0,0,0.6)",
                color: "#fff",
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              {creditLabel ?? `Photo: ${sourceName}`}
            </span>
          ) : null,
      }}
    />
  );
}
