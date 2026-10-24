import { memo, useEffect, useMemo, useRef, useState } from "react";
import { m } from "motion/react";
import { CarListing } from "@/types/car";
import { formatPrice } from "@/services/api";
import { Gauge, MapPin, ArrowRight, TrendingDown, Clock, Layers } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { ListingImageCarousel } from "@/components/ListingImageCarousel";
import { PriceUnavailableBadge } from "@/components/PriceUnavailableBadge";
import { isReasonableListingPrice } from "@/lib/formatting";
import { getListingImageList } from "@/lib/listingImage";
import { getListingDaysOnMarketLabel } from "@/lib/listing-card-meta";
import { HybridCliffBadge } from "@/components/HybridCliffBadge";
import { plausibleEngineCc } from "@/lib/engineCapacity";
import { MileageTrustChip } from "@/components/MileageTrustChip";
import { computeMileageTrust } from "@/lib/mileageTrust";
import { vehicleTokenLabel } from "@/lib/vehicleTokens";
import { summarizeFmv } from "@/lib/fmv";
import { useAuth } from "@/lib/authContext";
import { hasFullPlatformAccess } from "@/lib/planLimits";
import { prefetchRoute } from "@/lib/routePrefetch";
import { useAppPreferences } from "@/lib/appPreferences";
import { canonicalizeMake, canonicalizeModel } from "@/lib/makeNormalization";
import { usePriceSparklines } from "@/hooks/usePriceSparklines";
import { isMeaningfulDrop, summarizePricePoints, toPricePoints } from "@/lib/priceHistory";
import { PriceSparkline } from "@/components/PriceSparkline";
import { getSourceAttribution } from "@/lib/sourceAttribution";
import { computeDealBadge, DEAL_BAR_CLASSES, DEAL_TEXT_CLASSES } from "@/lib/dealBadge";
import { isLeaseTakeoverListing } from "@/lib/leaseTakeover";
import { estimateListingMonthly, formatMonthlyLkr } from "@/lib/listingFinance";
import { DealBadge } from "@/components/listing/DealBadge";
import { CompareGlyph, SaveHeartIcon } from "@/components/listing/SaveHeart";
import { fadeIn, fadeUp, hoverLift, press, useReducedMotionOrLowData } from "@/lib/motion";
import { cardVariants } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { navigateWithHeroTransition, revealDelay, useCanHover, visibleCardImage, withShowDelay } from "@/components/listing/listingMotion";

interface ListingCardProps {
  listing: CarListing;
  onCompareToggle?: (listing: CarListing) => void;
  isComparing?: boolean;
  onWatchlistToggle?: (listing: CarListing) => void;
  isWatchlisted?: boolean;
  priority?: boolean;
  /**
   * Number of marketplaces this same vehicle was matched on (cross-source
   * duplicate detection). Only pass a real, detected count — the chip is
   * hidden when absent or below 2.
   */
  seenOnSites?: number | null;
  /** Position in its grid: the first 8 cards stagger in (40ms apart), the rest appear together. */
  revealIndex?: number;
}

function formatMileage(value: number | null | undefined): string | null {
  // Missing mileage must not read as "0 km" (Number(null) === 0).
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const km = Number(value);
  if (!Number.isFinite(km) || km < 0) return null;
  if (km >= 1000) {
    const compact = (km / 1000).toFixed(km >= 100000 ? 0 : 1).replace(/\.0$/, "");
    return `${compact}k km`;
  }
  return `${km} km`;
}

function formatEngineCc(value: number | null | undefined): string | null {
  if (!(Number.isFinite(value) && Number(value) > 0)) return null;
  const cc = plausibleEngineCc(value, undefined);
  if (cc === undefined) return null;
  return `${Math.round(cc).toLocaleString()} cc`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Listing ids whose card already played its reveal this session. */
const REVEALED_LISTINGS = new Set<number | string>();

export const ListingCard = memo(function ListingCard({
  listing,
  onCompareToggle,
  isComparing,
  onWatchlistToggle,
  isWatchlisted,
  priority = false,
  seenOnSites,
  revealIndex,
}: ListingCardProps) {
  const { t } = useAppPreferences();
  const { hasProAccess, isAdmin } = useAuth();
  const fullAccess = hasFullPlatformAccess({ hasProAccess, isAdmin });
  const navigate = useNavigate();
  const cardRef = useRef<HTMLElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  // Motion's whileTap listens with a *native* pointerdown on the <article>, so a
  // React stopPropagation can't keep the card from pressing when the heart /
  // compare / gallery buttons are tapped. Stop it natively one level below.
  useEffect(() => {
    const el = controlsRef.current;
    if (!el) return;
    const stop = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest?.("button, [role='button'], input, select")) e.stopPropagation();
    };
    el.addEventListener("pointerdown", stop);
    return () => el.removeEventListener("pointerdown", stop);
  }, []);
  const calm = useReducedMotionOrLowData();
  const canHover = useCanHover();
  // Reveal once per session: a card the visitor already saw (back from a
  // listing, a re-sort, page 2 → page 1) is simply there, no second stagger.
  const [alreadyRevealed] = useState(() => listing.id != null && REVEALED_LISTINGS.has(listing.id));
  // Scroll-in reveal (once). Reduced motion / low data: opacity only.
  const revealVariants = useMemo(
    () => withShowDelay(calm ? fadeIn : fadeUp, calm ? 0 : revealDelay(revealIndex)),
    [calm, revealIndex],
  );
  // Full photo set (primary first); single-image listings behave exactly as before.
  const galleryImages = getListingImageList(listing);
  const daysOnMarketLabel = getListingDaysOnMarketLabel(listing.first_seen_at || listing.scraped_at, t);
  const priceValue = Number(listing.price_lkr || 0);
  const hasKnownPrice = isReasonableListingPrice(priceValue);
  const median = Number(listing.market_median_lkr);
  const hasMedian = Number.isFinite(median) && median > 0;
  const isLease = useMemo(
    () => isLeaseTakeoverListing(listing),
    [listing],
  );

  // null deal_score = rating suppressed server-side (thin cohort, old vehicle,
  // extreme price) or plan-gated — only safety labels (verify/lease) show then.
  const deal = computeDealBadge({
    askingLkr: hasKnownPrice ? priceValue : null,
    fmvLkr: hasMedian ? median : null,
    isLeaseTakeover: isLease,
    ratingAllowed: fullAccess && listing.deal_score !== null && listing.deal_score !== undefined,
  });
  const fmv = hasKnownPrice && !isLease ? summarizeFmv(priceValue, hasMedian ? median : 0, t) : null;
  const marketDeltaPct = fmv ? fmv.delta_pct : null;
  const marketPosition = marketDeltaPct === null ? 50 : clamp(50 - marketDeltaPct, 8, 92);
  // FMV tone follows the deal badge so a "verify" outlier is never painted green.
  const fmvKind = deal.kind === "verify" ? "verify" : fmv?.band === "below" ? "below" : fmv?.band === "above" ? "above" : "fair";

  const monthly = hasKnownPrice
    ? estimateListingMonthly({
        priceLkr: priceValue,
        condition: listing.condition,
        fuelType: listing.fuel_type,
        year: listing.year,
        isLeaseTakeover: isLease,
      })
    : null;

  const displayMake = canonicalizeMake(listing.make) || listing.make;
  const displayModel = canonicalizeModel(listing.model) || listing.model;
  const listingTitle = `${displayMake} ${displayModel} ${listing.variant || ""}`.trim();

  // Price path from the shared snapshot index (loaded on idle, once per page).
  const sparklines = usePriceSparklines();
  const pricePoints = toPricePoints(sparklines?.[String(listing.id)]);
  const priceSummary = summarizePricePoints(pricePoints);
  const snapshotDropPct = Number(listing.price_drop_pct);
  const showDropBadge =
    isMeaningfulDrop(priceSummary) || (Number.isFinite(snapshotDropPct) && snapshotDropPct >= 1 && snapshotDropPct < 80);
  const dropPctLabel = priceSummary && priceSummary.totalChangePct < 0
    ? Math.abs(priceSummary.totalChangePct).toFixed(0)
    : Number.isFinite(snapshotDropPct) && snapshotDropPct > 0
      ? snapshotDropPct.toFixed(0)
      : null;
  const attribution = getSourceAttribution(listing);
  const sites = Number(seenOnSites);
  const showSites = Number.isFinite(sites) && sites >= 2;

  const conditionLabel = vehicleTokenLabel("condition", listing.condition, t);
  const specPills = [
    { key: "tx", text: vehicleTokenLabel("transmission", listing.transmission, t), icon: true },
    { key: "km", text: formatMileage(listing.mileage_km), icon: false },
    { key: "fuel", text: vehicleTokenLabel("fuel", listing.fuel_type, t), icon: false },
    { key: "cc", text: formatEngineCc(listing.engine_cc), icon: false },
  ].filter((p): p is { key: string; text: string; icon: boolean } => Boolean(p.text));
  const mileageKnown = computeMileageTrust({ mileageKm: listing.mileage_km, year: listing.year }).risk !== "unknown";

  return (
    <m.article
      ref={cardRef}
      role="article"
      initial={alreadyRevealed ? false : "hidden"}
      whileInView="show"
      viewport={{ once: true, amount: 0.15 }}
      variants={revealVariants}
      onViewportEnter={() => {
        if (listing.id != null) REVEALED_LISTINGS.add(listing.id);
      }}
      {...(calm ? {} : press)}
      {...(canHover && !calm ? hoverLift : {})}
      // Motion's whileTap adds tabindex="0"; the title link and buttons inside are the tab stops.
      tabIndex={-1}
      aria-label={t("listingCard.aria", "{title} listing card", { title: listingTitle || "Vehicle" })}
      className={cn(
        cardVariants({ variant: "media", padding: "none" }),
        // Off-screen cards skip style/layout/paint while scrolling (sized from
        // their last render; 440px until then).
        "[content-visibility:auto] [contain-intrinsic-size:auto_440px]",
        "group isolate h-full transition-[border-color,box-shadow] duration-medium ease-decelerate hover:border-primary/30 hover:shadow-e2 motion-reduce:transition-none",
      )}
      onPointerEnter={() => {
        // Only warm the route chunk. Data prefetch on hover used to pull the
        // whole snapshot catalogue (tens of MB) the first time a card was hovered.
        prefetchRoute(`/listing/${listing.id}`);
      }}
    >
      <Link
        to={`/listing/${listing.id}`}
        aria-label={t("listingCard.openAria", "Open {title}", { title: listingTitle || "vehicle listing" })}
        onClick={(e) => {
          // Card → detail photo continuity (View Transitions, feature-detected).
          if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          const to = `/listing/${listing.id}`;
          if (navigateWithHeroTransition(() => navigate(to), visibleCardImage(cardRef.current))) e.preventDefault();
        }}
        className="absolute inset-0 z-10 rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      />

      <div ref={controlsRef} className="pointer-events-none relative z-20 flex h-full flex-col">
        <div className="listing-card-photo relative aspect-[16/10] overflow-hidden bg-surface-2">
          <ListingImageCarousel
            images={galleryImages}
            listingId={listing.id}
            alt={`${displayMake} ${displayModel}`}
            variant="card"
            source={listing.source}
            priority={priority}
            className="h-full w-full"
          />
          {/* Bottom-only scrim: keeps the price legible without dimming the
              placeholder lockup, which lives in the top 60% of the frame. */}
          <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />

          {conditionLabel && (
            <div className="absolute left-3 top-3 flex items-center gap-1.5">
              {/* Over the photo: dark chip regardless of theme. */}
              <span className="inline-flex h-6 items-center rounded-full bg-black/60 px-2.5 text-caption font-semibold text-white">
                {conditionLabel}
              </span>
            </div>
          )}

          <div className="absolute right-3 top-3 flex items-center gap-1.5">
            {onWatchlistToggle && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onWatchlistToggle(listing); }}
                className={`tap-44 pointer-events-auto relative z-30 flex h-9 w-9 items-center justify-center rounded-full border transition-[background-color,border-color,color,transform] duration-short ease-standard active:scale-90 active:duration-micro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:active:scale-100 ${
                  isWatchlisted
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-transparent bg-black/55 text-white hover:bg-black/70"
                }`}
                aria-label={isWatchlisted ? t("listingCard.removeWatchlist", "Remove from watchlist") : t("listingCard.addWatchlist", "Add to watchlist")}
              >
                <SaveHeartIcon saved={Boolean(isWatchlisted)} className="h-4 w-4" />
              </button>
            )}
            {onCompareToggle && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onCompareToggle(listing); }}
                className={`tap-44 pointer-events-auto relative z-30 flex h-9 w-9 items-center justify-center rounded-full border transition-[background-color,border-color,color,transform] duration-short ease-standard active:scale-90 active:duration-micro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:active:scale-100 ${
                  isComparing
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-transparent bg-black/55 text-white hover:bg-black/70"
                }`}
                aria-label={isComparing ? t("listingCard.removeCompare", "Remove from comparison") : t("listingCard.addCompare", "Add to comparison")}
              >
                <CompareGlyph active={Boolean(isComparing)} className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
            {hasKnownPrice ? (
              <p className="font-display text-title3 font-semibold leading-none tracking-tight text-white num [text-shadow:0_1px_8px_rgba(0,0,0,0.55)]">
                {formatPrice(priceValue)}
              </p>
            ) : (
              <PriceUnavailableBadge
                label={t("listingCard.priceUnavailable", "Price unavailable")}
                className="border-transparent bg-black/60 px-2.5 py-0.5 text-caption text-white"
              />
            )}
            {monthly && (
              <p
                className="shrink-0 text-right text-caption font-medium leading-tight text-white/85 num"
                title={t("listingCard.monthlyTitle", "Estimate: {ltv}% loan (CBSL cap), {rate}% a year over {years} years. Banks set the final terms.", {
                  ltv: monthly.ltvPct,
                  rate: monthly.ratePct,
                  years: monthly.termYears,
                })}
              >
                {t("listingCard.monthly", "{amount} est. /mo", { amount: formatMonthlyLkr(monthly.monthlyLkr) })}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="truncate text-callout font-semibold text-foreground transition-colors duration-short group-hover:text-primary">
              {listingTitle}
            </h3>
            {listing.year ? (
              <span className="num shrink-0 text-footnote font-semibold text-label-2">{listing.year}</span>
            ) : null}
          </div>

          {deal.kind !== "none" && <DealBadge badge={deal} tone="soft" className="self-start" />}

          {(listing.is_active === false || showDropBadge || daysOnMarketLabel || showSites) && (
            <div className="flex flex-wrap gap-1.5">
              {listing.is_active === false && (
                <Badge variant="warning">{t("listingCard.archived", "Archived / Past ad")}</Badge>
              )}
              {showDropBadge && (
                <Badge variant="info">
                  <TrendingDown aria-hidden />
                  {dropPctLabel
                    ? t("listingCard.priceDroppedPct", "Price dropped {pct}%", { pct: dropPctLabel })
                    : t("listingCard.priceDropped", "Price dropped")}
                </Badge>
              )}
              {daysOnMarketLabel && (
                <Badge variant="neutral" className="num font-medium">
                  <Clock aria-hidden />
                  {daysOnMarketLabel}
                </Badge>
              )}
              {showSites && (
                <Badge variant="neutral" className="num font-medium">
                  <Layers aria-hidden />
                  {t("listingCard.onSites", "On {n} sites", { n: sites })}
                </Badge>
              )}
            </div>
          )}

          {specPills.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {specPills.map((p) => (
                <Badge key={p.key} variant="outline" className={cn("font-medium text-label-2", (p.key === "km" || p.key === "cc") && "num")}>
                  {p.icon && <Gauge aria-hidden />}
                  {p.text}
                </Badge>
              ))}
            </div>
          )}
          <HybridCliffBadge
            fuelType={listing.fuel_type}
            engineCc={plausibleEngineCc(listing.engine_cc, listing.year)}
            compact
            className="self-start"
          />
          {mileageKnown && (
            <MileageTrustChip
              mileageKm={listing.mileage_km}
              year={listing.year}
              className="self-start !px-2 !py-0.5 !text-caption"
            />
          )}

          <div className="mt-auto">
            {fmv != null && (
              <>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="num text-caption font-medium text-label-2">
                    {t("listingCard.typical", "Typical {price}", { price: formatPrice(fmv.fmv_lkr) })}
                  </p>
                  <p className={`text-caption font-semibold num ${DEAL_TEXT_CLASSES[fmvKind]}`}>{fmv.label}</p>
                </div>
                <div className="relative mb-2 h-1.5 overflow-hidden rounded-full bg-foreground/10">
                  <div
                    className={`absolute inset-y-0 left-0 rounded-full transition-ui duration-long motion-reduce:transition-none ${DEAL_BAR_CLASSES[fmvKind]}`}
                    style={{ width: `${marketPosition}%` }}
                  />
                </div>
              </>
            )}
            {pricePoints.length >= 2 && (
              <div className="flex items-center justify-end gap-1.5">
                <span className="text-caption text-label-2">
                  {t("listingCard.priceMoves", "{n} price changes", { n: pricePoints.length - 1 })}
                </span>
                <PriceSparkline
                  points={pricePoints}
                  width={56}
                  height={18}
                  label={t("listingCard.sparkAria", "Asking price went from {from} to {to}", {
                    from: formatPrice(pricePoints[0].price),
                    to: formatPrice(pricePoints[pricePoints.length - 1].price),
                  })}
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-separator pt-3">
            <div className="min-w-0">
              {listing.district && (
                <p className="flex items-center gap-1.5 truncate text-footnote font-medium text-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-label-2" aria-hidden />
                  {listing.district}
                </p>
              )}
              <p className="mt-0.5 truncate text-caption text-label-2">
                {t("listingCard.listedOn", "Listed on {source}", { source: attribution.sourceName })}
                {attribution.checkedAgo ? ` · ${t("listingCard.checked", "checked {ago}", { ago: attribution.checkedAgo })}` : ""}
              </p>
            </div>
            <div aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 transition-colors duration-short group-hover:bg-primary/10">
              <ArrowRight className="h-4 w-4 text-label-2 transition-transform duration-medium ease-standard group-hover:translate-x-0.5 group-hover:text-primary" />
            </div>
          </div>
        </div>
      </div>
    </m.article>
  );
});

ListingCard.displayName = "ListingCard";
