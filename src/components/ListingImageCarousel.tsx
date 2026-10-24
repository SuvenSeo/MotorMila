import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useState } from "react";
import { m, motion } from "motion/react";
import useEmblaCarousel from "embla-carousel-react";
import { Camera, ChevronLeft, ChevronRight, Expand } from "lucide-react";
import { VehicleThumbnail } from "@/components/VehicleThumbnail";
import { useAppPreferences } from "@/lib/appPreferences";
import { formatSourceName } from "@/lib/sourceAttribution";
import { spring, useReducedMotionOrLowData } from "@/lib/motion";

// Lightbox JS + CSS load only when someone taps a photo (low-end Android first).
const ListingLightbox = lazy(() => import("@/components/listing/ListingLightbox"));

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
  /** Source marketplace, shown on the branded placeholder and as photo credit. */
  source?: string | null;
}

/** Listing grid: 1 column < 768px, 2 columns to 1279px, then 3 columns in a ≤1560px frame. */
const CARD_SIZES = "(max-width: 767px) 100vw, (max-width: 1279px) 50vw, 520px";

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
  e.preventDefault();
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

/**
 * Multi-photo carousel for listings (Embla). Single-photo listings render a
 * plain image with no carousel JS work. Photos are hotlinked from the source
 * marketplace with credit; nothing is re-hosted.
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
  const count = images.length;
  const multi = count > 1;
  const isDetail = variant === "detail";
  const reduced = useMemo(prefersReducedMotion, []);
  const calm = useReducedMotionOrLowData();
  const ringId = useId();
  const [emblaRef, emblaApi] = useEmblaCarousel({
    // Single-photo listings skip Embla's measuring work entirely.
    active: multi,
    // Detail: no loop so the first/last photo rubber-bands against the edge
    // (Embla's built-in edge resistance); cards keep looping arrows.
    loop: multi && !isDetail,
    // Cards: arrows/dots only so a tap still opens the listing.
    watchDrag: isDetail && multi,
    // Momentum: a flick carries to the next snap on Embla's scroll physics.
    dragThreshold: 6,
    skipSnaps: false,
    duration: reduced ? 1 : isDetail ? 26 : 22,
  });
  const [lightboxOrigin, setLightboxOrigin] = useState<{ x: number; y: number } | null>(null);
  const [index, setIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxRequested, setLightboxRequested] = useState(false);
  const sourceName = formatSourceName(source);
  // Only mount the photos someone can see or is about to: the current slide,
  // plus its neighbours once the carousel is touched/hovered (cards) or right
  // away (detail). Every card used to download all of its slides up front —
  // ~50 full-size photos (≈8 MB) on the home grid.
  const [mounted, setMounted] = useState<ReadonlySet<number>>(() => new Set(isDetail && multi ? [0, 1, count - 1] : [0]));
  const prime = useCallback(
    (center: number) => {
      if (!multi) return;
      setMounted((cur) => {
        const want = [center, (center + 1) % count, (center - 1 + count) % count];
        if (want.every((i) => cur.has(i))) return cur;
        const next = new Set(cur);
        want.forEach((i) => next.add(i));
        return next;
      });
    },
    [multi, count],
  );
  useEffect(() => {
    if (index !== 0) prime(index);
  }, [index, prime]);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setIndex(emblaApi.selectedScrollSnap());
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi]);

  const goTo = useCallback((i: number) => emblaApi?.scrollTo(i, reduced), [emblaApi, reduced]);
  const prev = useCallback(() => emblaApi?.scrollPrev(reduced), [emblaApi, reduced]);
  const next = useCallback(() => emblaApi?.scrollNext(reduced), [emblaApi, reduced]);

  // Reset when the listing changes.
  const imagesKey = images.join("|");
  useEffect(() => {
    setIndex(0);
    setMounted(new Set(isDetail && multi ? [0, 1, count - 1] : [0]));
    emblaApi?.reInit();
    emblaApi?.scrollTo(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only on a new photo set
  }, [imagesKey, emblaApi]);

  // Keyboard navigation (detail only); ignored while typing or in the lightbox.
  useEffect(() => {
    if (!isDetail || !multi || lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDetail, multi, lightboxOpen, prev, next]);

  const openLightbox = (from?: Element | null) => {
    const r = from?.getBoundingClientRect();
    setLightboxOrigin(r && r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null);
    setLightboxRequested(true);
    setLightboxOpen(true);
  };

  if (count === 0) {
    // No usable photo: branded SVG placeholder (full lockup, overlay-safe).
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

  const label = (i: number) =>
    t("listingImage.photoLabel", "Photo {current} of {total}", {
      current: String(i + 1),
      total: String(count),
    });

  const arrowClass =
    "tap-44 pointer-events-auto absolute top-1/2 z-30 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-black/55 text-white opacity-0 transition-opacity hover:bg-black/80 focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100";

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={t("listingImage.carousel", "Listing photos")}
      className={className}
      onPointerEnter={multi ? () => prime(index) : undefined}
      onFocus={multi ? () => prime(index) : undefined}
    >
      <div className="relative h-full w-full overflow-hidden">
        <div ref={emblaRef} className="h-full w-full overflow-hidden">
          <div className="flex h-full w-full touch-pan-y">
            {images.map((src, i) => (
              <div
                key={`${src}-${i}`}
                className="h-full w-full min-w-0 shrink-0 grow-0 basis-full"
                aria-hidden={multi && i !== index}
              >
                {!mounted.has(i) ? (
                  <div className="h-full w-full bg-muted" />
                ) : isDetail ? (
                  <button
                    type="button"
                    className="block h-full w-full cursor-zoom-in"
                    aria-label={t("listingImage.openPhoto", "Open {label} full screen", { label: label(i) })}
                    tabIndex={i === index ? 0 : -1}
                    onClick={(e) => openLightbox(e.currentTarget)}
                  >
                    <VehicleThumbnail
                      src={src}
                      listingId={listingId}
                      alt={i === 0 ? alt : `${alt} — ${label(i)}`}
                      source={source}
                      priority={priority && i === 0}
                      sizes="(max-width: 1024px) 100vw, 60vw"
                      marker={i === 0 ? "hero" : undefined}
                      fadeIn
                      className={`h-full w-full object-cover${imageClassName ? ` ${imageClassName}` : ""}`}
                    />
                  </button>
                ) : (
                  <VehicleThumbnail
                    src={src}
                    listingId={listingId}
                    alt={i === 0 ? alt : `${alt} — ${label(i)}`}
                    source={source}
                    priority={priority && i === 0}
                    sizes={CARD_SIZES}
                    marker="card"
                    fadeIn
                    className={`h-full w-full object-cover${imageClassName ? ` ${imageClassName}` : ""}`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {multi && (
          <>
            <button
              type="button"
              aria-label={t("listingImage.prev", "Previous photo")}
              onClick={(e) => {
                stop(e);
                prev();
              }}
              className={`${arrowClass} left-2`}
            >
              <ChevronLeft aria-hidden className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={t("listingImage.next", "Next photo")}
              onClick={(e) => {
                stop(e);
                next();
              }}
              className={`${arrowClass} right-2`}
            >
              <ChevronRight aria-hidden className="h-4 w-4" />
            </button>
            {/* Top-centre: bottom corners carry price / deal / source overlays. */}
            <span className="pointer-events-none absolute left-1/2 top-2.5 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-black/60 px-2 py-0.5 text-caption font-semibold tabular-nums text-white">
              <Camera aria-hidden className="h-3 w-3" />
              {index + 1}/{count}
            </span>
          </>
        )}

        {multi && !isDetail && (
          <span className="pointer-events-auto absolute bottom-12 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1">
            {/* Sliding indicator: one dot moves by transform (dots are 6px + 4px gap). */}
            {index < 8 && (
              <m.span
                aria-hidden
                className="pointer-events-none absolute left-0 top-1/2 h-1.5 w-1.5 -mt-[3px] rounded-full bg-foreground shadow-[0_0_0_1.5px_rgba(255,255,255,0.35)]"
                initial={false}
                animate={{ x: index * 10 }}
                transition={calm ? { duration: 0 } : spring.snappy}
              />
            )}
            {images.slice(0, 8).map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={label(i)}
                aria-current={i === index}
                onClick={(e) => {
                  stop(e);
                  goTo(i);
                }}
                className="h-1.5 w-1.5 rounded-full bg-foreground/45 transition-opacity hover:bg-foreground/75"
              />
            ))}
          </span>
        )}

        {isDetail && (
          <button
            type="button"
            aria-label={t("listingImage.expand", "View fullscreen")}
            onClick={(e) => {
              stop(e);
              openLightbox(e.currentTarget.parentElement);
            }}
            className="tap-44 absolute right-2.5 top-2.5 z-30 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-black/55 text-white transition-colors hover:bg-black/80"
          >
            <Expand aria-hidden className="h-4 w-4" />
          </button>
        )}
      </div>

      {isDetail && multi && (
        <div className="mt-2 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label={t("listingImage.thumbs", "Photo thumbnails")}>
          {images.map((src, i) => (
            <button
              key={`thumb-${src}-${i}`}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={label(i)}
              onClick={() => goTo(i)}
              className={`relative h-14 w-20 shrink-0 overflow-hidden rounded-xl transition-opacity ${
                i === index ? "" : "opacity-60 hover:opacity-100"
              }`}
            >
              <VehicleThumbnail src={src} listingId={listingId} alt="" source={source} sizes="80px" className="h-full w-full object-cover" />
              {i === index && (
                // Active ring glides between thumbnails (shared layout id).
                <motion.span
                  aria-hidden
                  layoutId={`thumb-ring-${ringId}`}
                  transition={calm ? { duration: 0 } : spring.snappy}
                  className="pointer-events-none absolute inset-0 rounded-xl border-2 border-primary"
                />
              )}
            </button>
          ))}
        </div>
      )}

      {isDetail && lightboxRequested && (
        <Suspense fallback={null}>
          <ListingLightbox
            open={lightboxOpen}
            index={index}
            images={images}
            alt={alt}
            sourceName={sourceName}
            origin={lightboxOrigin}
            creditLabel={sourceName ? t("listingImage.credit", "Photo: {source}", { source: sourceName }) : undefined}
            onClose={() => setLightboxOpen(false)}
            onIndexChange={(i) => {
              if (i !== index) goTo(i);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
