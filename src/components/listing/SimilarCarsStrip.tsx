import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight, Car as CarIcon } from "lucide-react";
import type { CarListing } from "@/types/car";
import { VehicleThumbnail } from "@/components/VehicleThumbnail";
import { DealBadge } from "@/components/listing/DealBadge";
import { computeDealBadge } from "@/lib/dealBadge";
import { isLeaseTakeoverListing } from "@/lib/leaseTakeover";
import { getListingImageList } from "@/lib/listingImage";
import { canonicalizeMake, canonicalizeModel } from "@/lib/makeNormalization";
import { isReasonableListingPrice } from "@/lib/formatting";
import { formatPrice } from "@/services/api";
import { useAppPreferences } from "@/lib/appPreferences";

interface SimilarCarsStripProps {
  listings: CarListing[];
  /** Plan allows deal calls (non-safety badges). */
  fullAccess: boolean;
  title: string;
}

/** Horizontal, drag-free Embla strip of comparable listings. */
export function SimilarCarsStrip({ listings, fullAccess, title }: SimilarCarsStripProps) {
  const { t } = useAppPreferences();
  const reduced = typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "start",
    dragFree: true,
    containScroll: "trimSnaps",
    active: listings.length > 1,
    duration: reduced ? 1 : 22,
  });
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  useEffect(() => {
    if (!emblaApi) return;
    const update = () => {
      setCanPrev(emblaApi.canScrollPrev());
      setCanNext(emblaApi.canScrollNext());
    };
    update();
    emblaApi.on("select", update);
    emblaApi.on("reInit", update);
    emblaApi.on("scroll", update);
    return () => {
      emblaApi.off("select", update);
      emblaApi.off("reInit", update);
      emblaApi.off("scroll", update);
    };
  }, [emblaApi]);

  const prev = useCallback(() => emblaApi?.scrollPrev(reduced), [emblaApi, reduced]);
  const next = useCallback(() => emblaApi?.scrollNext(reduced), [emblaApi, reduced]);

  return (
    <section aria-labelledby="similar-cars-title" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="similar-cars-title" className="text-body font-bold text-foreground">{title}</h2>
        {listings.length > 1 && (
          <div className="hidden gap-1.5 sm:flex">
            <button
              type="button"
              onClick={prev}
              disabled={!canPrev}
              aria-label={t("listing.similar.prev", "Previous similar vehicles")}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground disabled:opacity-40"
            >
              <ChevronLeft aria-hidden className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={next}
              disabled={!canNext}
              aria-label={t("listing.similar.next", "More similar vehicles")}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground disabled:opacity-40"
            >
              <ChevronRight aria-hidden className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {listings.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card py-6 text-center">
          <CarIcon aria-hidden className="mx-auto mb-2 h-5 w-5 text-muted-foreground/40" />
          <p className="text-caption text-muted-foreground">{t("listing.noPeers", "No active peers tracked.")}</p>
        </div>
      ) : (
        <div ref={emblaRef} className="-mx-1 overflow-hidden px-1">
          <ul className="flex touch-pan-y gap-3">
            {listings.map((s) => {
              const price = Number(s.price_lkr || 0);
              const priced = isReasonableListingPrice(price);
              const median = Number(s.market_median_lkr);
              const badge = computeDealBadge({
                askingLkr: priced ? price : null,
                fmvLkr: Number.isFinite(median) && median > 0 ? median : null,
                isLeaseTakeover: isLeaseTakeoverListing(s),
                ratingAllowed: fullAccess && s.deal_score !== null && s.deal_score !== undefined,
              });
              const name = `${canonicalizeMake(s.make) || s.make} ${canonicalizeModel(s.model) || s.model}`;
              const img = getListingImageList(s)[0] ?? null;
              return (
                <li key={s.id} className="min-w-0 shrink-0 grow-0 basis-[68%] sm:basis-[42%] lg:basis-[30%]">
                  <Link
                    to={`/listing/${s.id}`}
                    className="group block overflow-hidden rounded-2xl border border-border bg-card no-underline transition-colors hover:border-primary/30"
                  >
                    <div className="aspect-[16/10] overflow-hidden bg-muted">
                      <VehicleThumbnail src={img} listingId={s.id} alt={name} source={s.source} sizes="(max-width: 640px) 68vw, 30vw" className="h-full w-full object-cover" />
                    </div>
                    <div className="space-y-1.5 p-3">
                      <p className="truncate text-footnote font-semibold text-foreground">
                        {name}{s.year ? ` · ${s.year}` : ""}
                      </p>
                      <p className="num text-body font-extrabold text-foreground">
                        {priced ? formatPrice(price) : t("listing.unlisted", "Unlisted")}
                      </p>
                      {badge.kind !== "none" && badge.kind !== "lease" && <DealBadge badge={badge} tone="soft" />}
                      {badge.kind === "lease" && (
                        <p className="text-caption font-semibold text-primary">{t("listing.sticky.lease", "Lease takeover — not full price")}</p>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
