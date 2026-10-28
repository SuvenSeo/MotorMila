import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { m, motion } from "motion/react";
import useEmblaCarousel from "embla-carousel-react";
import { Camera, ChevronLeft, ChevronRight, Expand } from "lucide-react";
import { VehicleThumbnail } from "@/components/VehicleThumbnail";
import { useAppPreferences } from "@/lib/appPreferences";
import { formatSourceName } from "@/lib/sourceAttribution";
import { spring, useReducedMotionOrLowData } from "@/lib/motion";
import { viewTransitionInFlight } from "@/lib/viewTransition";
import type { Silhouette } from "@/lib/vehicleSilhouette";

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
  /** No-photo plate: a vehicle-type silhouette instead of the branded SVG. */
  silhouette?: Silhouette;
  /** Detail filmstrip: per-slide sizing (replaces the full-width basis). */
  slideClassName?: string;
  /** Detail filmstrip: classes on the slide track. */
  trackClassName?: string;
  /** Classes for the photo viewport (default full height of the region). */
  frameClassName?: string;
  /** Report the active detail photo's proportions to its surrounding frame. */
  onPhotoAspectRatio?: (ratio: number | null) => void;
}

/** Listing grid: 1 column < 768px, 2 columns to 1279px, then 3 columns in a ≤1560px frame. */
const CARD_SIZES = "(max-width: 767px) 100vw, (max-width: 1279px) 50vw, 520px";

/**
 * Photo each card was left on, per listing (this tab). A card that remounts —
 * Back from the listing — shows the same photo, so the hero flies back into
 * the picture the visitor tapped and nothing swaps under them.
 */
const CARD_SLIDES = new Map<number, number>();

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
  silhouette,
  slideClassName,
  trackClassName,
  frameClassName,
  onPhotoAspectRatio,
}: ListingImageCarouselProps) {
  const { t } = useAppPreferences();
  const count = images.length;
  const multi = count > 1;
  const isDetail = variant === "detail";
  const reduced = useMemo(prefersReducedMotion, []);
  const calm = useReducedMotionOrLowData();
  const ringId = useId();
  // Detail hero: Embla starts after the card → listing View Transition. Its
  // init measure (which runs on construction, even inactive) forced a style + layout of the whole incoming page inside the
  // route commit (~40 ms at 4× CPU); slide 0 renders statically until then.
  // Cards: Embla starts on first intent (pointer over / focus / arrow or dot
  // tap). Building one engine per card on mount measured every slide of
  // every card (~200 ms of forced layout at 4× CPU on the home grid); until
  // then slide 0 renders statically and arrows/dots queue their target.
  const [initialSlide] = useState(() => {
    const saved = CARD_SLIDES.get(listingId) ?? 0;
    return saved > 0 && saved < count ? saved : 0;
  });
  const [carouselLive, setCarouselLive] = useState(false);
  const [pendingSlide, setPendingSlide] = useState<number | null>(null);
  const wake = useCallback(() => {
    if (multi && !isDetail) setCarouselLive(true);
  }, [multi, isDetail]);
  useEffect(() => {
    if (carouselLive || !multi || !isDetail) return;
    let raf = 0;
    let timer = 0;
    const go = () => {
      if (viewTransitionInFlight()) timer = window.setTimeout(go, 50);
      else raf = window.requestAnimationFrame(() => setCarouselLive(true));
    };
    timer = window.setTimeout(go, 0);
    return () => {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(raf);
    };
  }, [carouselLive, multi, isDetail]);
  const [emblaRef, emblaApi] = useEmblaCarousel({
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
    startIndex: initialSlide,
  });
  const [lightboxOrigin, setLightboxOrigin] = useState<{ x: number; y: number } | null>(null);
  const [index, setIndex] = useState(initialSlide);
  const regionRef = useRef<HTMLDivElement>(null);
  const reportPhotoAspect = useCallback(() => {
    if (!onPhotoAspectRatio) return;
    const img = regionRef.current?.querySelector<HTMLImageElement>(`[data-photo-index="${index}"] .cine-gallery__img`);
    if (img?.complete && img.naturalWidth && img.naturalHeight && img.dataset.placeholder !== "true") {
      onPhotoAspectRatio(img.naturalWidth / img.naturalHeight);
    } else if (!img || img.dataset.placeholder === "true") {
      onPhotoAspectRatio(null);
    }
    // Still loading: keep the ratio we have (the card's, handed over with the
    // tap). Clearing it here dropped the frame to the fixed-height fallback
    // until the photo landed, so the hero box jumped ~30px right after the
    // card → listing morph had flown into it. onLoadCapture reports again.
  }, [index, onPhotoAspectRatio]);
  useEffect(() => { reportPhotoAspect(); }, [reportPhotoAspect, images]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxRequested, setLightboxRequested] = useState(false);
  const sourceName = formatSourceName(source);
  // Only mount the photos someone can see or is about to: the current slide,
  // plus its neighbours once the carousel is touched/hovered (cards) or right
  // away (detail). Every card used to download all of its slides up front —
  // ~50 full-size photos (≈8 MB) on the home grid.
  const [mounted, setMounted] = useState<ReadonlySet<number>>(() => new Set(isDetail && multi ? [0, 1, count - 1] : [initialSlide]));
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
    const onSelect = () => {
      const i = emblaApi.selectedScrollSnap();
      setIndex(i);
      if (!isDetail && listingId != null) {
        if (i > 0) CARD_SLIDES.set(listingId, i);
        else CARD_SLIDES.delete(listingId);
      }
    };
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, isDetail, listingId]);

  const goTo = useCallback(
    (i: number) => {
      if (emblaApi) emblaApi.scrollTo(i, reduced);
      else {
        setPendingSlide(i);
        wake();
      }
    },
    [emblaApi, reduced, wake],
  );
  const prev = useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev(reduced);
    else goTo((index - 1 + count) % count);
  }, [emblaApi, reduced, goTo, index, count]);
  const next = useCallback(() => {
    if (emblaApi) emblaApi.scrollNext(reduced);
    else goTo((index + 1) % count);
  }, [emblaApi, reduced, goTo, index, count]);
  // An arrow/dot tapped before the engine existed plays once it is up.
  useEffect(() => {
    if (!emblaApi || pendingSlide === null) return;
    prime(pendingSlide);
    emblaApi.scrollTo(pendingSlide, reduced);
    setPendingSlide(null);
  }, [emblaApi, pendingSlide, reduced, prime]);

  // Reset when the listing changes.
  const imagesKey = images.join("|");
  const lastImagesKey = useRef(imagesKey);
  useEffect(() => {
    // Only a new photo set resets. The engine coming up (lazy init) must not
    // snap back over a queued arrow/dot tap.
    if (lastImagesKey.current === imagesKey) return;
    lastImagesKey.current = imagesKey;
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
    // No usable photo: the vehicle-type silhouette plate (or the branded SVG).
    const plate = (
      <VehicleThumbnail
        src={null}
        alt={alt}
        source={source}
        priority={priority}
        silhouette={silhouette}
        className={`h-full w-full object-cover${imageClassName ? ` ${imageClassName}` : ""}`}
      />
    );
    if (!slideClassName) return plate;
    return (
      <div className={className}>
        <div className={`flex w-full justify-center ${frameClassName ?? "h-full"} ${trackClassName ?? ""}`} data-single="">
          <div className={slideClassName}>{plate}</div>
        </div>
      </div>
    );
  }

  const label = (i: number) =>
    t("listingImage.photoLabel", "Photo {current} of {total}", {
      current: String(i + 1),
      total: String(count),
    });

  const arrowClass =
    "vt-overlay tap-44 pointer-events-auto absolute top-1/2 z-30 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-black/55 text-white opacity-0 transition-opacity hover:bg-black/80 focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100";

  return (
    <div
      ref={regionRef}
      role="region"
      aria-roledescription="carousel"
      aria-label={t("listingImage.carousel", "Listing photos")}
      className={className}
      onLoadCapture={reportPhotoAspect}
      onPointerEnter={multi ? () => { prime(index); wake(); } : undefined}
      onFocus={multi ? () => { prime(index); wake(); } : undefined}
    >
      <div className={`relative w-full overflow-hidden ${frameClassName ?? "h-full"}`}>
        {/* Embla attaches only when it has work to do: it builds its engine (and
            measures every slide, forcing a style + layout of the page) on
            construction even with `active: false`, so single-photo listings and
            the detail hero before the card → listing transition get no viewport ref. */}
        <div ref={multi && carouselLive ? emblaRef : undefined} className="h-full w-full overflow-hidden">
          {/* A remounted card starts on its saved photo. The transform is set
              once (constant prop) so React never fights Embla over it later. */}
          <div
            className={`flex h-full w-full touch-pan-y${trackClassName ? ` ${trackClassName}` : ""}${!multi && slideClassName ? " justify-center" : ""}`}
            data-single={multi ? undefined : ""}
            style={initialSlide > 0 ? { transform: `translate3d(${-initialSlide * 100}%, 0, 0)` } : undefined}
          >
            {images.map((src, i) => (
              <div
                key={`${src}-${i}`}
                data-photo-index={i}
                className={slideClassName ?? "h-full w-full min-w-0 shrink-0 grow-0 basis-full"}
                aria-hidden={multi && i !== index}
              >
                {!mounted.has(i) ? (
                  <div className="h-full w-full bg-muted" />
                ) : isDetail ? (
                  <button
                    type="button"
                    className="relative isolate block h-full w-full cursor-zoom-in"
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
                      sizes="(max-width: 767px) 100vw, 800px"
                      marker={i === initialSlide ? "hero" : undefined}
                      silhouette={silhouette}
                      fadeIn
                      className={`${slideClassName ? "cine-gallery__img " : ""}h-full w-full object-cover${imageClassName ? ` ${imageClassName}` : ""}`}
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
                    silhouette={silhouette}
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
            {/* Cards: top-centre (bottom corners carry price / deal / source
                overlays). Detail: bottom-right corner of the single photo frame. */}
            <span
              className={`vt-overlay pointer-events-none absolute z-30 flex items-center gap-1 rounded-full border border-border bg-black/60 px-2 py-0.5 text-caption font-semibold tabular-nums text-white ${
                isDetail ? "cine-gallery__count bottom-3 right-3" : "left-1/2 top-2.5 -translate-x-1/2"
              }`}
            >
              <Camera aria-hidden className="h-3 w-3" />
              {index + 1}/{count}
            </span>
          </>
        )}

        {multi && !isDetail && (
          <span className="vt-overlay pointer-events-auto absolute bottom-12 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1">
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
            className="cine-gallery__expand vt-overlay tap-44 absolute right-2.5 top-2.5 z-30 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-black/55 text-white transition-colors hover:bg-black/80"
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
