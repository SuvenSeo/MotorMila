import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ChevronLeft, ChevronRight, Expand } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { VehicleThumbnail } from "@/components/VehicleThumbnail";
import { useAppPreferences } from "@/lib/appPreferences";

interface ListingImageCarouselProps {
  images: string[];
  alt: string;
  listingId?: number;
  /** "card" keeps tap-to-open intact (arrows/dots only); "detail" adds swipe, keyboard, thumbs, lightbox. */
  variant?: "card" | "detail";
  className?: string;
  /** Extra classes applied to every slide image (e.g. the card hover-zoom). */
  imageClassName?: string;
  /** First-screen images should load eagerly to protect LCP. */
  priority?: boolean;
  /** Source marketplace, shown on the branded placeholder when a photo can't load. */
  source?: string | null;
}

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
  e.preventDefault();
}

/**
 * Multi-photo carousel for listings. Listings whose scrapers only know the
 * thumbnail render exactly like before (single image, no controls).
 */
export function ListingImageCarousel({
  images,
  alt,
  listingId,
  variant = "card",
  className,
  imageClassName,
  priority = false,
  source,
}: ListingImageCarouselProps) {
  const { t } = useAppPreferences();
  const [index, setIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const count = images.length;

  const goTo = useCallback(
    (next: number) => setIndex(((next % count) + count) % count),
    [count],
  );
  const prev = useCallback(() => goTo(index - 1), [goTo, index]);
  const next = useCallback(() => goTo(index + 1), [goTo, index]);

  // Reset when the listing changes.
  const imagesKey = images.join("|");
  useEffect(() => setIndex(0), [imagesKey]);

  // Keyboard navigation (detail only); ignored while typing in a field.
  useEffect(() => {
    if (variant !== "detail") return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variant, prev, next]);

  if (count === 0) {
    // No usable photo: same branded SVG fallback the single-image path showed.
    return (
      <VehicleThumbnail
        src={null}
        alt={alt}
        source={source}
        priority={priority}
        className={`h-full w-full object-cover${imageClassName ? ` ${imageClassName}` : ""}`}
      />
    );
  }
  const multi = count > 1;
  const label = (i: number) =>
    t("listingImage.photoLabel", "Photo {current} of {total}", {
      current: String(i + 1),
      total: String(count),
    });

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) > 32) {
      stop(e);
      if (dx < 0) next();
      else prev();
    }
  };

  const arrows = multi && (
    <>
      <button
        type="button"
        aria-label={t("listingImage.prev", "Previous photo")}
        onClick={(e) => {
          stop(e);
          prev();
        }}
        className="pointer-events-auto absolute left-2 top-1/2 z-30 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/55 text-white opacity-0 backdrop-blur-md transition-all hover:bg-black/80 focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label={t("listingImage.next", "Next photo")}
        onClick={(e) => {
          stop(e);
          next();
        }}
        className="pointer-events-auto absolute right-2 top-1/2 z-30 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/55 text-white opacity-0 backdrop-blur-md transition-all hover:bg-black/80 focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </>
  );

  // Top-center: the bottom-right corner is occupied by card/detail overlay
  // badges (deal-score "+N deal", source pill), which this used to overlap.
  const counter = multi && (
    <span className="pointer-events-auto absolute left-1/2 top-2.5 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-black/60 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-white backdrop-blur-md">
      <Camera aria-hidden className="h-3 w-3" />
      {index + 1}/{count}
    </span>
  );

  const dots = multi && variant === "card" && (
    <span className="pointer-events-auto absolute bottom-2.5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1">
      {images.map((_, i) => (
        <button
          key={i}
          type="button"
          aria-label={label(i)}
          aria-current={i === index}
          onClick={(e) => {
            stop(e);
            goTo(i);
          }}
          className={`h-1.5 rounded-full transition-all ${
            i === index ? "w-4 bg-white" : "w-1.5 bg-white/45 hover:bg-white/75"
          }`}
        />
      ))}
    </span>
  );

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={t("listingImage.carousel", "Listing photos")}
      className={className}
      onTouchStart={variant === "detail" ? onTouchStart : undefined}
      onTouchEnd={variant === "detail" ? onTouchEnd : undefined}
    >
      <div className="relative h-full w-full overflow-hidden">
        <div
          className="flex h-full w-full transition-transform duration-500 ease-apple"
          style={{ transform: multi ? `translateX(-${index * 100}%)` : undefined }}
        >
          {images.map((src, i) => (
            <div
              key={`${src}-${i}`}
              className="h-full w-full shrink-0"
              aria-hidden={multi && i !== index}
            >
              <VehicleThumbnail
                src={src}
                listingId={listingId}
                alt={i === 0 ? alt : `${alt} — ${label(i)}`}
                source={source}
                priority={priority && i === 0}
                className={`h-full w-full object-cover${imageClassName ? ` ${imageClassName}` : ""}`}
              />
            </div>
          ))}
        </div>

        {arrows}
        {counter}
        {dots}

        {variant === "detail" && (
          <button
            type="button"
            aria-label={t("listingImage.expand", "View fullscreen")}
            onClick={(e) => {
              stop(e);
              setLightboxOpen(true);
            }}
            className="absolute right-2.5 top-2.5 z-30 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/55 text-white backdrop-blur-md transition-all hover:bg-black/80"
          >
            <Expand className="h-4 w-4" />
          </button>
        )}
      </div>

      {variant === "detail" && multi && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label={t("listingImage.thumbs", "Photo thumbnails")}>
          {images.map((src, i) => (
            <button
              key={`thumb-${src}-${i}`}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={label(i)}
              onClick={() => goTo(i)}
              className={`relative h-14 w-20 shrink-0 overflow-hidden rounded-xl border-2 transition-all ${
                i === index ? "border-primary" : "border-transparent opacity-60 hover:opacity-100"
              }`}
            >
              <VehicleThumbnail src={src} listingId={listingId} alt="" source={source} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {variant === "detail" && (
        <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
          <DialogContent
            className="max-w-[96vw] border-0 bg-black/95 p-0 sm:max-w-[1100px]"
            aria-label={t("listingImage.lightbox", "Photo viewer")}
          >
            <div className="relative">
              <img
                src={images[index]}
                alt={label(index)}
                className="max-h-[86vh] w-full object-contain"
              />
              {multi && (
                <>
                  <button
                    type="button"
                    aria-label={t("listingImage.prev", "Previous photo")}
                    onClick={prev}
                    className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md hover:bg-black/85"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    aria-label={t("listingImage.next", "Next photo")}
                    onClick={next}
                    className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md hover:bg-black/85"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold tabular-nums text-white backdrop-blur-md">
                    {index + 1} / {count}
                  </span>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
