import { memo, useEffect, useMemo, useRef } from "react";
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

/** Title-cases an enum token; returns null for empty/unknown so the pill is hidden. */
function formatToken(value: string | undefined | null): string | null {
  if (!value) return null;
  const clean = value.replace(/[_-]/g, " ").trim();
  if (!clean || /^(unknown|n\/?a|none|other|-)$/i.test(clean)) return null;
  return clean
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function formatMileage(value: number | null | undefined): string | null {
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
  // Scroll-in reveal (once). Reduced motion / low data: opacity only.
  const revealVariants = useMemo(
    () => withShowDelay(calm ? fadeIn : fadeUp, calm ? 0 : revealDelay(revealIndex)),
    [calm, revealIndex],
  );
  // Full photo set (primary first); single-image listings behave exactly as before.
  const galleryImages = getListingImageList(listing);
  const daysOnMarketLabel = getListingDaysOnMarketLabel(listing.first_seen_at || listing.scraped_at);
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
  const fmv = hasKnownPrice && !isLease ? summarizeFmv(priceValue, hasMedian ? median : 0) : null;
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

  const conditionLabel = formatToken(listing.condition);
  const specPills = [
    { key: "tx", text: formatToken(listing.transmission), icon: true },
    { key: "km", text: formatMileage(listing.mileage_km), icon: false },
    { key: "fuel", text: formatToken(listing.fuel_type), icon: false },
    { key: "cc", text: formatEngineCc(listing.engine_cc), icon: false },
  ].filter((p): p is { key: string; text: string; icon: boolean } => Boolean(p.text));
  const mileageKnown = computeMileageTrust({ mileageKm: listing.mileage_km, year: listing.year }).risk !== "unknown";

  return (
    <m.article
      ref={cardRef}
      role="article"
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.15 }}
      variants={revealVariants}
      {...(calm ? {} : press)}
      {...(canHover && !calm ? hoverLift : {})}
      aria-label={t("listingCard.aria", "{title} listing card", { title: listingTitle || "Vehicle" })}
      className="liquid-panel vehicle-card group relative isolate h-full overflow-hidden rounded-3xl border border-transparent shadow-soft transition-[border-color,box-shadow] duration-medium ease-decelerate hover:border-primary/35 hover:shadow-soft-xl motion-reduce:transition-none"
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
        className="absolute inset-0 z-10 rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      />

      <div ref={controlsRef} className="pointer-events-none relative z-20 flex h-full flex-col">
        <div className="listing-card-photo relative aspect-[16/10] overflow-hidden bg-muted">
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
              <span className="rounded-full border border-border bg-black/70 px-2.5 py-0.5 text-caption font-semibold tracking-tight text-white">
                {conditionLabel}
              </span>
            </div>
          )}

          <div className="absolute right-3 top-3 flex items-center gap-1.5">
            {onWatchlistToggle && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onWatchlistToggle(listing); }}
                className={`pointer-events-auto relative z-30 flex h-9 w-9 items-center justify-center rounded-full border transition-[background-color,border-color,color,transform] duration-short active:scale-90 motion-reduce:active:scale-100 ${
                  isWatchlisted
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-black/60 text-white/90 border-border hover:text-white hover:bg-black/75"
                }`}
                aria-label={isWatchlisted ? t("listingCard.removeWatchlist", "Remove from watchlist") : t("listingCard.addWatchlist", "Add to watchlist")}
              >
                <SaveHeartIcon saved={Boolean(isWatchlisted)} className="w-3.5 h-3.5" />
              </button>
            )}
            {onCompareToggle && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onCompareToggle(listing); }}
                className={`pointer-events-auto relative z-30 flex h-9 w-9 items-center justify-center rounded-full border transition-[background-color,border-color,color,transform] duration-short active:scale-90 motion-reduce:active:scale-100 ${
                  isComparing
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-black/60 text-white/90 border-border hover:text-white hover:bg-black/75"
                }`}
                aria-label={isComparing ? t("listingCard.removeCompare", "Remove from comparison") : t("listingCard.addCompare", "Add to comparison")}
              >
                <CompareGlyph active={Boolean(isComparing)} className="h-3 w-3" />
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
                className="bg-black/75 border-primary/40 text-primary-bright px-2 py-0.5 text-caption tracking-caps"
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

        <div className="flex flex-1 flex-col gap-3.5 p-5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-display text-callout font-semibold tracking-tight text-foreground transition-colors group-hover:text-primary truncate">
              {listingTitle}
            </h3>
            {listing.year ? (
              <span className="shrink-0 text-footnote font-semibold text-muted-foreground num">{listing.year}</span>
            ) : null}
          </div>

          {deal.kind !== "none" && <DealBadge badge={deal} tone="soft" className="self-start" />}

          {(listing.is_active === false || showDropBadge || daysOnMarketLabel || showSites) && (
            <div className="flex flex-wrap gap-1.5">
              {listing.is_active === false && (
                <span className="inline-flex items-center rounded-full border border-deal-caution/30 bg-deal-caution/10 px-2 py-0.5 text-caption font-semibold text-deal-caution-text">
                  {t("listingCard.archived", "Archived / Past ad")}
                </span>
              )}
              {showDropBadge && (
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-caption font-semibold text-foreground">
                  <TrendingDown className="h-3 w-3 text-primary" aria-hidden />
                  {dropPctLabel
                    ? t("listingCard.priceDroppedPct", "Price dropped {pct}%", { pct: dropPctLabel })
                    : t("listingCard.priceDropped", "Price dropped")}
                </span>
              )}
              {daysOnMarketLabel && (
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-caption font-medium text-muted-foreground num">
                  <Clock className="h-3 w-3" aria-hidden />
                  {daysOnMarketLabel}
                </span>
              )}
              {showSites && (
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-caption font-medium text-muted-foreground num">
                  <Layers className="h-3 w-3" aria-hidden />
                  {t("listingCard.onSites", "On {n} sites", { n: sites })}
                </span>
              )}
            </div>
          )}

          {specPills.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {specPills.map((p) => (
                <span key={p.key} className={`spec-pill${p.key === "km" || p.key === "cc" ? " num" : ""}`}>
                  {p.icon && <Gauge className="h-3 w-3 text-muted-foreground/70" aria-hidden />}
                  {p.text}
                </span>
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
                  <p className="text-caption font-medium text-muted-foreground num">
                    {t("listingCard.typical", "Typical {price}", { price: formatPrice(fmv.fmv_lkr) })}
                  </p>
                  <p className={`text-caption font-semibold num ${DEAL_TEXT_CLASSES[fmvKind]}`}>{fmv.label}</p>
                </div>
                <div className="relative mb-2 h-1.5 overflow-hidden rounded-full bg-foreground/[0.08]">
                  <div
                    className={`absolute inset-y-0 left-0 rounded-full transition-ui duration-long motion-reduce:transition-none ${DEAL_BAR_CLASSES[fmvKind]}`}
                    style={{ width: `${marketPosition}%` }}
                  />
                </div>
              </>
            )}
            {pricePoints.length >= 2 && (
              <div className="flex items-center justify-end gap-1.5">
                <span className="text-caption text-muted-foreground">
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

          <div className="flex items-center justify-between pt-3.5 border-t border-border">
            <div className="min-w-0">
              {listing.district && (
                <p className="flex items-center gap-1.5 text-caption font-medium text-foreground/80 truncate">
                  <MapPin className="h-3 w-3 shrink-0 text-muted-foreground/70" />
                  {listing.district}
                </p>
              )}
              <p className="mt-0.5 text-caption text-muted-foreground truncate">
                {t("listingCard.listedOn", "Listed on {source}", { source: attribution.sourceName })}
                {attribution.checkedAgo ? ` · ${t("listingCard.checked", "checked {ago}", { ago: attribution.checkedAgo })}` : ""}
              </p>
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border transition-ui group-hover:border-primary/30 group-hover:bg-primary/10">
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-medium group-hover:translate-x-1 group-hover:text-primary" />
            </div>
          </div>
        </div>
      </div>
    </m.article>
  );
});

ListingCard.displayName = "ListingCard";
