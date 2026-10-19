import { memo } from "react";
import { CarListing } from "@/types/car";
import { formatPrice } from "@/services/api";
import { Gauge, MapPin, ArrowRight, Heart, Check, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { ListingImageCarousel } from "@/components/ListingImageCarousel";
import { PriceUnavailableBadge } from "@/components/PriceUnavailableBadge";
import { isReasonableListingPrice } from "@/lib/formatting";
import { getListingImageList } from "@/lib/listingImage";
import {
  getListingDaysOnMarketLabel,
  getListingDealLabel,
} from "@/lib/listing-card-meta";
import { HybridCliffBadge } from "@/components/HybridCliffBadge";
import { plausibleEngineCc } from "@/lib/engineCapacity";
import { MileageTrustChip } from "@/components/MileageTrustChip";
import { summarizeFmv } from "@/lib/fmv";
import { useAuth } from "@/lib/authContext";
import { hasFullPlatformAccess } from "@/lib/planLimits";
import { prefetchRoute } from "@/lib/routePrefetch";
import { useAppPreferences } from "@/lib/appPreferences";
import { canonicalizeMake, canonicalizeModel } from "@/lib/makeNormalization";
import BadgeDelta from "@tremor/react/dist/components/icon-elements/BadgeDelta/BadgeDelta.js";

interface ListingCardProps {
  listing: CarListing;
  onCompareToggle?: (listing: CarListing) => void;
  isComparing?: boolean;
  onWatchlistToggle?: (listing: CarListing) => void;
  isWatchlisted?: boolean;
  priority?: boolean;
}

function getDealBadgeClasses(label: ReturnType<typeof getListingDealLabel>): string {
  // Near-opaque fills: these render over arbitrary photos, so translucent
  // tints cannot guarantee the 4.5:1 the 10px text needs (WCAG 1.4.3).
  if (label === "Good Deal") return "bg-zinc-950/85 border-emerald-500/40 text-emerald-300";
  if (label === "Overpriced") return "bg-zinc-950/85 border-rose-500/40 text-rose-300";
  return "bg-zinc-950/85 border-white/8 text-zinc-200";
}

function formatToken(value: string | undefined): string {
  if (!value) return "Unknown";
  return value
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function formatMileage(value: number | null | undefined): string {
  if (!Number.isFinite(value)) return "Mileage N/A";
  if ((value as number) >= 1000) {
    const compact = ((value as number) / 1000).toFixed((value as number) >= 100000 ? 0 : 1).replace(/\.0$/, "");
    return `${compact}k km`;
  }
  return `${value} km`;
}

function formatEngineCc(value: number | null | undefined): string {
  const cc = plausibleEngineCc(value, undefined);
  if (cc === undefined) return "CC N/A";
  return `${Math.round(cc).toLocaleString()} cc`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export const ListingCard = memo(function ListingCard({
  listing,
  onCompareToggle,
  isComparing,
  onWatchlistToggle,
  isWatchlisted,
  priority = false,
}: ListingCardProps) {
  const { t } = useAppPreferences();
  const { hasProAccess, isAdmin } = useAuth();
  const fullAccess = hasFullPlatformAccess({ hasProAccess, isAdmin });
  // null deal_score = rating suppressed server-side (thin cohort, old vehicle,
  // extreme price) — show no badge rather than a fake-neutral one.
  const hasDealScore = fullAccess && listing.deal_score !== null && listing.deal_score !== undefined;
  const dealScore = Number(listing.deal_score ?? 0);
  // Full photo set (primary first); single-image listings behave exactly as before.
  const galleryImages = getListingImageList(listing);
  const dealLabel = getListingDealLabel(dealScore);
  const daysOnMarketLabel = getListingDaysOnMarketLabel(listing.first_seen_at || listing.scraped_at);
  const priceValue = Number(listing.price_lkr || 0);
  const hasKnownPrice = isReasonableListingPrice(priceValue);
  const marketDeltaPct =
    hasKnownPrice && Number.isFinite(listing.market_median_lkr) && Number(listing.market_median_lkr) > 0
      ? (((priceValue - Number(listing.market_median_lkr)) / Number(listing.market_median_lkr)) * 100)
      : null;
  const fmv = hasKnownPrice
    ? summarizeFmv(priceValue, Number(listing.market_median_lkr || 0))
    : null;
  const marketPosition = marketDeltaPct === null ? 50 : clamp(50 - marketDeltaPct, 8, 92);
  const displayMake = canonicalizeMake(listing.make) || listing.make;
  const displayModel = canonicalizeModel(listing.model) || listing.model;
  const listingTitle = `${displayMake} ${displayModel} ${listing.variant || ""}`.trim();

  return (
    <article
      role="article"
      aria-label={t("listingCard.aria", "{title} listing card", { title: listingTitle || "Vehicle" })}
      className="liquid-panel vehicle-card group relative isolate h-full overflow-hidden rounded-3xl border border-transparent shadow-soft transition-all duration-500 ease-apple hover:-translate-y-2 hover:border-primary/35 hover:shadow-soft-xl active:scale-[0.985] active:shadow-soft"
      onPointerEnter={() => {
        // Only warm the route chunk. Data prefetch on hover used to pull the
        // whole snapshot catalogue (tens of MB) the first time a card was hovered.
        prefetchRoute(`/listing/${listing.id}`);
      }}
    >
      <Link
        to={`/listing/${listing.id}`}
        aria-label={t("listingCard.openAria", "Open {title}", { title: listingTitle || "vehicle listing" })}
        className="absolute inset-0 z-10 rounded-3xl"
      />

      <div className="pointer-events-none relative z-20 flex h-full flex-col">
        <div className="relative aspect-[16/10] overflow-hidden bg-muted">
          <ListingImageCarousel
            images={galleryImages}
            listingId={listing.id}
            alt={`${displayMake} ${displayModel}`}
            variant="card"
            priority={priority}
            className="h-full w-full"
            imageClassName="transition-transform duration-[800ms] ease-out group-hover:scale-[1.08]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/82 via-black/25 to-transparent" />

          <div className="absolute left-3 top-3 flex items-center gap-1.5">
            <span className="rounded-full border border-white/8 bg-black/60 px-2.5 py-0.5 text-[10px] font-semibold tracking-tight text-white backdrop-blur-md">
              {formatToken(listing.condition)}
            </span>
          </div>

          <div className="absolute right-3 top-3 flex items-center gap-1.5">
            {onWatchlistToggle && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onWatchlistToggle(listing); }}
                className={`pointer-events-auto relative z-30 flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur-md transition-all ${
                  isWatchlisted
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-black/60 text-white/90 border-white/8 hover:text-white hover:bg-black/75"
                }`}
                aria-label={isWatchlisted ? t("listingCard.removeWatchlist", "Remove from watchlist") : t("listingCard.addWatchlist", "Add to watchlist")}
              >
                <Heart className={`w-3.5 h-3.5 ${isWatchlisted ? "fill-current" : ""}`} />
              </button>
            )}
            {onCompareToggle && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onCompareToggle(listing); }}
                className={`pointer-events-auto relative z-30 flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur-md transition-all ${
                  isComparing
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-black/60 text-white/90 border-white/8 hover:text-white hover:bg-black/75"
                }`}
                aria-label={isComparing ? t("listingCard.removeCompare", "Remove from comparison") : t("listingCard.addCompare", "Add to comparison")}
              >
                {isComparing ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
              </button>
            )}
          </div>

          <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
            {hasKnownPrice ? (
              <p className="font-display text-[1.35rem] font-semibold leading-none tracking-tight text-white num">
                {formatPrice(priceValue)}
              </p>
            ) : (
              <PriceUnavailableBadge
                label={t("listingCard.priceUnavailable", "Price unavailable")}
                className="bg-black/75 border-primary/40 text-primary-bright px-2 py-0.5 text-[10px] tracking-[0.1em]"
              />
            )}
            {hasDealScore && (
              <span className={`rounded-full border px-2 py-0.5 text-[12px] font-semibold num ${getDealBadgeClasses(dealLabel)}`}>
                {t("listingCard.deal", "{score} deal", { score: `${dealScore >= 0 ? "+" : ""}${dealScore.toFixed(0)}` })}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-display text-[1.05rem] font-semibold tracking-tight text-foreground transition-colors group-hover:text-primary truncate">
              {listingTitle}
            </h3>
            <span className="shrink-0 text-[13px] font-semibold text-muted-foreground num">{listing.year || t("common.na", "N/A")}</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <span className="spec-pill">
              <Gauge className="h-3 w-3 text-muted-foreground/70" />
              {formatToken(listing.transmission)}
            </span>
            <span className="spec-pill num">
              {Number.isFinite(listing.mileage_km) ? formatMileage(listing.mileage_km) : t("listingCard.mileageNa", "Mileage N/A")}
            </span>
            <span className="spec-pill">{formatToken(listing.fuel_type)}</span>
            <span className="spec-pill num">
              {(Number.isFinite(listing.engine_cc) && Number(listing.engine_cc) > 0)
                ? formatEngineCc(listing.engine_cc)
                : t("listingCard.ccNa", "CC N/A")}
            </span>
          </div>
          <HybridCliffBadge
            fuelType={listing.fuel_type}
            engineCc={plausibleEngineCc(listing.engine_cc, listing.year)}
            compact
            className="self-start"
          />
          <MileageTrustChip
            mileageKm={listing.mileage_km}
            year={listing.year}
            className="self-start !px-2 !py-0.5 !text-[10px]"
          />

          <div className="mt-auto">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[12px] font-medium text-muted-foreground">
                {t("listingCard.fmv", "Fair market value")}
              </p>
              <div className="flex items-center gap-1.5">
                {marketDeltaPct !== null && (
                  <span className="apex">
                    <BadgeDelta
                      deltaType={marketDeltaPct <= 0 ? "moderateDecrease" : "moderateIncrease"}
                      isIncreasePositive={false}
                      size="xs"
                    >
                      {t("listingCard.vsMarket", "{pct}% vs market", {
                        pct: `${marketDeltaPct <= 0 ? "−" : "+"}${Math.abs(marketDeltaPct).toFixed(0)}`,
                      })}
                    </BadgeDelta>
                  </span>
                )}
                <p className={`text-[11px] font-semibold num ${
                  fmv == null
                    ? "text-muted-foreground"
                    : fmv.band === "below"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : fmv.band === "above"
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-foreground"
                }`}>
                  {fmv == null ? t("listingCard.pending", "Pending") : fmv.label}
                </p>
              </div>
            </div>
            {fmv != null && (
              <p className="mb-2 text-[10px] font-medium text-muted-foreground num">
                FMV {formatPrice(fmv.fmv_lkr)}
              </p>
            )}
            <div className="relative h-1.5 overflow-hidden rounded-full bg-foreground/[0.08]">
              <div
                className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${
                  fmv == null
                    ? "bg-muted-foreground/50"
                    : fmv.band === "below"
                      ? "bg-emerald-500"
                      : fmv.band === "above"
                        ? "bg-rose-500"
                        : "bg-primary"
                }`}
                style={{ width: `${marketPosition}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-3.5 border-t border-white/5">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[12px] font-medium text-foreground/80 truncate">
                <MapPin className="h-3 w-3 shrink-0 text-muted-foreground/70" />
                {listing.district || t("listingCard.districtNa", "District N/A")}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
                {listing.source}
                {daysOnMarketLabel ? ` · ${daysOnMarketLabel}` : ""}
              </p>
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border transition-all group-hover:border-primary/30 group-hover:bg-primary/10">
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-300 group-hover:translate-x-1 group-hover:text-primary" />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
});

ListingCard.displayName = "ListingCard";
