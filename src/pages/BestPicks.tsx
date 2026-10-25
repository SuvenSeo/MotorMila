import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { m } from "motion/react";
import { cleanDistrict, isPlausiblePriceDrop } from "@/lib/dataSanity";
import { ExternalLink, Star, TrendingDown } from "lucide-react";
import { getListings, getPriceDrops, formatPrice } from "@/services/api";
import type { CarListing, FilterState, PriceDropItem } from "@/types/car";
import { VehicleThumbnail } from "@/components/VehicleThumbnail";

import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Card, cardVariants } from "@/components/ui/card";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SectionHeader } from "@/components/SectionHeader";
import { cn } from "@/lib/utils";
import { pickVehicleImageUrl } from "@/lib/listingImage";
import { isReasonableListingPrice } from "@/lib/formatting";
import { minCashDownForPrice, sortListingsByAffordability } from "@/lib/cashToOwn";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { PageHero } from "@/components/PageHero";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { duration, fadeUp, hoverLift, listStagger, press, revealItem, useReducedMotionOrLowData } from "@/lib/motion";
import type { Variants } from "motion/react";
import { useAuth } from "@/lib/authContext";
import { useAppPreferences } from "@/lib/appPreferences";
import {
  FREE_BEST_PICKS_LIMIT,
  FREE_PRICE_DROPS_LIMIT,
  freePlanCopy,
  hasFullPlatformAccess,
} from "@/lib/planLimits";
import { MorphingDialog } from "@/components/ui/MorphingDialog";


const PICKS_PAGES = 4;
const MIN_DEAL_SCORE = 8;

export type BestPicksSortMode = "deal_score" | "affordability";

function dealBand(score: number): "elite" | "strong" | "watch" {
  if (score >= 15) return "elite";
  if (score >= 10) return "strong";
  return "watch";
}

function dealBandLabel(score: number, t: (key: string, fallback?: string) => string): string {
  const b = dealBand(score);
  return b === "elite" ? t("picks.bandElite", "Elite") : b === "strong" ? t("picks.bandStrong", "Strong") : t("picks.bandWatch", "Watch");
}

/** Deal band → the kit's one deal palette (styles/TOKENS.md). */
function dealBandVariant(score: number): "deal-great" | "deal-good" | "info" {
  const b = dealBand(score);
  return b === "elite" ? "deal-great" : b === "strong" ? "deal-good" : "info";
}

function dealMeter(score: number): string {
  const b = dealBand(score);
  return b === "elite" ? "bg-deal-great" : b === "strong" ? "bg-deal-good" : "bg-primary";
}

/**
 * Deal-band chip that morphs into a score explainer dialog (#6 UI review —
 * Motion Primitives morphing dialog). Real per-listing score, shared layout
 * animation from chip to panel.
 */
function DealScoreExplainer({
  listing,
  score,
  t,
}: {
  listing: CarListing;
  score: number;
  t: (key: string, fallback?: string) => string;
}) {
  const band = dealBand(score);
  const bands: { key: "elite" | "strong" | "watch"; range: string; blurb: string }[] = [
    { key: "elite", range: "15+", blurb: t("picks.bandEliteBlurb", "Priced far below the lane median — the sharpest deals.") },
    { key: "strong", range: "10–14", blurb: t("picks.bandStrongBlurb", "Clearly under median — strong value.") },
    { key: "watch", range: "< 10", blurb: t("picks.bandWatchBlurb", "Near or above median — worth watching, not chasing.") },
  ];
  return (
    <MorphingDialog
      ariaLabel={t("picks.scoreDialogLabel", "Deal score explained")}
      triggerClassName={cn(
        badgeVariants({ variant: dealBandVariant(score) }),
        "transition-transform duration-short ease-standard active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
      trigger={
        <>
          <Star aria-hidden />
          {dealBandLabel(score, t)}
        </>
      }
    >
      <p className="text-footnote font-semibold text-primary">
        {t("picks.scoreEyebrow", "Deal score")}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <span className="num font-display text-title1 font-semibold text-foreground">+{score.toFixed(0)}</span>
        <Badge variant={dealBandVariant(score)}>{dealBandLabel(score, t)}</Badge>
      </div>
      <p className="mt-1 text-footnote text-label-2">
        {listing.make} {listing.model}{listing.year ? ` · ${listing.year}` : ""}
      </p>
      <p className="mt-4 text-body text-label-2">
        {t(
          "picks.scoreBody",
          "The score compares this listing against the live market median for its lane. Higher means further below median — more deal for the money.",
        )}
      </p>
      <ul className="mt-4 space-y-2">
        {bands.map((b) => {
          const active = b.key === band;
          return (
            <li
              key={b.key}
              className={cn("flex items-center gap-3 rounded-control border px-3 py-2.5", active ? "border-deal-good/30 bg-deal-good/10" : "border-border bg-surface-2")}
            >
              <span className={cn("num w-12 shrink-0 text-footnote font-semibold", active ? "text-deal-good-text" : "text-label-2")}>
                {b.range}
              </span>
              <div>
                <p className="text-footnote font-semibold text-foreground">
                  {b.key === "elite" ? t("picks.bandElite", "Elite") : b.key === "strong" ? t("picks.bandStrong", "Strong") : t("picks.bandWatch", "Watch")}
                </p>
                <p className="text-caption text-label-2">{b.blurb}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </MorphingDialog>
  );
}

function sortPicks(listings: CarListing[], mode: BestPicksSortMode): CarListing[] {
  switch (mode) {
    case "affordability":
      return sortListingsByAffordability(listings, "registered_used");
    case "deal_score":
      return [...listings].sort((a, b) => Number(b.deal_score || 0) - Number(a.deal_score || 0));
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

const PICKS_TIMEOUT_MS = 15_000;

/** Items past the stagger cap: plain fade, all together after the first 8. */
const lateFade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: duration.medium, delay: 8 * 0.04 } },
};

/** Loading placeholder shaped like the final page: featured pick (image +
 * text, 2 columns on desktop), then a shortlist of 16:10 tiles. */
function PicksSkeleton() {
  return (
    <div className="space-y-14 lg:space-y-20" aria-hidden>
      <div className={cardVariants({ variant: "media", padding: "none", className: "grid lg:grid-cols-[1.1fr_1fr]" })}>
        <Skeleton className="aspect-[16/10] w-full rounded-none lg:aspect-auto lg:min-h-80" />
        <div className="flex min-w-0 flex-col justify-between gap-6 p-6 sm:p-8">
          <div className="space-y-4">
            <Skeleton shape="text" className="h-3 w-24" />
            <Skeleton shape="title" className="h-9 w-3/4" />
            <Skeleton shape="text" className="h-3 w-32" />
            <div className="flex items-baseline justify-between border-t border-separator pt-4">
              <Skeleton shape="text" className="h-8 w-40" />
              <Skeleton shape="text" className="h-3 w-16" />
            </div>
            <Skeleton shape="text" className="h-1" />
          </div>
          <Skeleton shape="text" className="h-11" />
        </div>
      </div>
      <div>
        <div className="mb-8 space-y-2">
          <Skeleton shape="text" className="h-3 w-24" />
          <Skeleton shape="text" className="h-7 w-48" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={cardVariants({ variant: "media", padding: "none", className: "flex flex-col" })}>
              <Skeleton className="aspect-[16/10] w-full rounded-none" />
              <div className="flex flex-col gap-3 p-4 sm:p-5">
                <Skeleton shape="text" className="h-3 w-20" />
                <Skeleton shape="text" className="w-2/3" />
                <div className="flex justify-between">
                  <Skeleton shape="text" className="w-24" />
                  <Skeleton shape="text" className="h-3 w-8" />
                </div>
                <Skeleton shape="text" className="h-1" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function BestPicks() {
  const { t } = useAppPreferences();
  const motionStill = useReducedMotionOrLowData();
  const canHoverLift = typeof window !== "undefined" && window.matchMedia?.("(hover: hover) and (pointer: fine)").matches === true;
  const { hasProAccess, isAdmin } = useAuth();
  const fullAccess = hasFullPlatformAccess({ hasProAccess, isAdmin });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [picks, setPicks] = useState<CarListing[]>([]);
  const [drops, setDrops] = useState<PriceDropItem[]>([]);
  const [dropsLoaded, setDropsLoaded] = useState(false);
  const navigate = useNavigate();
  const [timedOut, setTimedOut] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [sortMode, setSortMode] = useState<BestPicksSortMode>(() =>
    fullAccess ? "deal_score" : "affordability",
  );

  useEffect(() => {
    let cancelled = false;
    getPriceDrops(7, fullAccess ? 8 : FREE_PRICE_DROPS_LIMIT)
      .then((items) => { if (!cancelled) setDrops(items.filter(isPlausiblePriceDrop)); })
      .catch(() => { /* feed is additive — page works without it */ })
      .finally(() => { if (!cancelled) setDropsLoaded(true); });
    return () => { cancelled = true; };
  }, [fullAccess]);

  useEffect(() => {
    let cancelled = false;
    // Never leave the page on "loading" forever: after PICKS_TIMEOUT_MS show a
    // proper "taking longer than usual" state with a retry.
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      cancelled = true;
      setTimedOut(true);
      setLoading(false);
    }, PICKS_TIMEOUT_MS);
    (async () => {
      setLoading(true); setError(null); setTimedOut(false);
      try {
        // Free cannot receive deal_score from the API — use newest teasers ranked
        // by affordability instead of an empty deal-score filter.
        const pagesToFetch = fullAccess ? PICKS_PAGES : 1;
        const sort = fullAccess ? "deal_score" : "newest";
        const base: FilterState = { sort, page: 1, vehicle_category: "cars" };
        const responses = await Promise.all(
          Array.from({ length: pagesToFetch }, (_, i) => getListings({ ...base, page: i + 1 })),
        );
        if (cancelled) return;
        const unique = new Map<number, CarListing>();
        const candidates = responses
          .flatMap((r) => r.listings)
          .filter((l) => isReasonableListingPrice(Number(l.price_lkr || 0)));
        const filtered = fullAccess
          ? candidates.filter((l) => Number(l.deal_score || 0) >= MIN_DEAL_SCORE)
          : candidates;
        filtered
          .sort((a, b) => Number(b.deal_score || 0) - Number(a.deal_score || 0))
          .forEach((l) => {
            if (!unique.has(l.id)) unique.set(l.id, l);
          });
        setPicks(Array.from(unique.values()));
      } catch {
        if (!cancelled) setError(t("picks.loadError", "Unable to load best picks."));
      } finally {
        window.clearTimeout(timer);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [fullAccess, t, reloadKey]);

  const ranked = useMemo(() => {
    const sorted = sortPicks(picks, sortMode);
    return fullAccess ? sorted : sorted.slice(0, FREE_BEST_PICKS_LIMIT);
  }, [picks, sortMode, fullAccess]);
  const topScore = useMemo(() => ranked.reduce((mx, l) => Math.max(mx, Number(l.deal_score || 0)), 0), [ranked]);
  const [featured, ...rest] = ranked;
  const rankCaption =
    sortMode === "affordability"
      ? t("picks.rankAfford", "ranked by min cash down (CBSL LTV)")
      : t("picks.rankDeal", "ranked by deal strength");
  const hiddenPickCount = fullAccess ? 0 : Math.max(0, picks.length - FREE_BEST_PICKS_LIMIT);
  return (
    <PageCanvas>
      <PageHero
        theme="deals"
        eyebrow={t("picks.eyebrow", "Best picks")}
        eyebrowIcon={Star}
        watermarkIcon={Star}
        title={<>{t("shell.picks.title", "Best deals.")}</>}
        description={loading
          ? t("shell.picks.loading", "Finding the best-priced listings…")
          : timedOut || error
            ? t("shell.picks.descUnavailable", "Vehicles priced clearly below similar ads.")
            : fullAccess
              ? t("shell.picks.descPro", "{n} vehicles priced well below similar ads, {rank}.", { n: ranked.length, rank: rankCaption })
              : t("shell.picks.descFree", "{n} recent listings, smallest down payment first. Deal scores are coming with Pro.", { n: ranked.length })}
        highlights={
          loading || timedOut || error
            ? undefined
            : [{ label: t("shell.picks.hlCount", "Listings"), value: String(ranked.length), hint: t("shell.picks.hlCountHint", "In this shortlist") }]
        }
      >
        {!loading && !error && !timedOut && picks.length > 0 && (
          <SegmentedControl
            value={sortMode}
            onValueChange={(v: BestPicksSortMode) => setSortMode(v)}
            aria-label={t("picks.sortAria", "Sort best picks")}
            className="mt-6 max-w-xs"
            options={[
              { value: "deal_score", label: t("picks.sortDealScore", "Deal score") },
              { value: "affordability", label: t("picks.sortAffordability", "Affordability") },
            ]}
          />
        )}
      </PageHero>

      <PageBody className="space-y-12 pb-16 pt-2 sm:pt-4 lg:space-y-16 lg:pt-4">
        {/* Biggest cuts this week — powered by per-listing price history */}
        <m.section initial="hidden" animate="show" variants={revealItem} aria-labelledby="picks-cuts-heading">
          <Card padding="md">
            <div className="flex items-center gap-3 border-b border-separator pb-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-deal-good/10 text-deal-good-text">
                <TrendingDown className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 id="picks-cuts-heading" className="text-callout font-semibold text-foreground">{t("picks.cutsTitle", "Biggest cuts this week")}</h2>
                <p className="text-footnote text-label-2">{t("shell.picks.cutsSubtitle", "Sellers who lowered their asking price in the last 7 days")}</p>
              </div>
            </div>
            {!dropsLoaded ? (
              <div className="grid gap-3 pt-4 sm:grid-cols-2 lg:grid-cols-4" role="status" aria-label={t("picks.cutsLoading", "Loading price cuts")}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 w-full" />
                ))}
              </div>
            ) : drops.length === 0 ? (
              <EmptyState
                icon={TrendingDown}
                title={t("picks.cutsEmptyTitle", "No price cuts this week")}
                body={t("shell.picks.cutsEmpty", "No price cuts spotted in the last 7 days. They show up here when a seller lowers an asking price.")}
                className="py-10"
              />
            ) : (
              <ul className="content-in grid gap-3 pt-4 sm:grid-cols-2 lg:grid-cols-4">
                {drops.map((drop) => (
                  <li key={drop.listing.id}>
                    <Link
                      to={`/listing/${drop.listing.id}`}
                      className={cardVariants({
                        variant: "interactive",
                        padding: "sm",
                        className: "group block h-full bg-surface-2 no-underline shadow-none",
                      })}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-body font-semibold text-foreground transition-colors duration-short group-hover:text-primary">
                          {drop.listing.make} {drop.listing.model}{drop.listing.year ? ` ${drop.listing.year}` : ""}
                        </span>
                        <Badge variant="deal-good" className="num shrink-0">−{drop.drop_pct.toFixed(1)}%</Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
                        <span className="num text-footnote text-label-2 line-through">{formatPrice(drop.previous_price_lkr)}</span>
                        <span className="num text-callout font-semibold text-foreground">{formatPrice(drop.new_price_lkr)}</span>
                      </div>
                      <p className="mt-1 text-footnote text-label-2">
                        {cleanDistrict(drop.listing.district) || drop.listing.source}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </m.section>

        {loading ? (
          <div role="status" aria-live="polite">
            <p className="mb-3 text-footnote font-medium text-label-2">{t("shell.picks.loading", "Finding the best-priced listings…")}</p>
            <PicksSkeleton />
          </div>
        ) : timedOut ? (
          <Card padding="none">
            <ErrorState
              title={t("shell.picks.timeoutTitle", "This is taking longer than usual")}
              body={t("shell.picks.timeoutBody", "We couldn't load deal picks just now. Try again, or browse all listings.")}
              onRetry={() => setReloadKey((k) => k + 1)}
              retryLabel={t("shell.picks.retry", "Try again")}
            />
          </Card>
        ) : error ? (
          <Card padding="none">
            <ErrorState body={error} onRetry={() => setReloadKey((k) => k + 1)} retryLabel={t("shell.picks.retry", "Try again")} />
          </Card>
        ) : ranked.length === 0 ? (
          <Card padding="none">
            <EmptyState
              icon={Star}
              title={t("shell.picks.emptyTitle", "No standout deals right now")}
              body={t("shell.picks.emptyBody", "We only list vehicles priced clearly below similar ads. Check back after the next update, or browse everything.")}
              actionLabel={t("shell.picks.browse", "Browse all listings")}
              onAction={() => navigate("/#market")}
            />
          </Card>
        ) : (
          <>
            {/* Featured — the one hero pick, at 2× weight */}
            {featured && (() => {
              const score = Number(featured.deal_score || 0);
              const pct = topScore > 0 ? Math.min(100, Math.round((score / topScore) * 100)) : 0;
              const cashDown = minCashDownForPrice(Number(featured.price_lkr || 0));
              return (
                <m.article
                  initial="hidden"
                  animate="show"
                  variants={revealItem}
                  className={cn(
                    cardVariants({ variant: "media", padding: "none" }),
                    "group content-in grid grid-cols-1 transition-[border-color,box-shadow] duration-medium ease-decelerate hover:border-primary/30 hover:shadow-e2 lg:grid-cols-[1.1fr_1fr]",
                  )}
                >
                  <Link to={`/listing/${featured.id}`} tabIndex={-1} aria-hidden className="listing-card-photo block aspect-[16/10] overflow-hidden bg-surface-2 no-underline lg:aspect-auto lg:min-h-80">
                    <VehicleThumbnail src={pickVehicleImageUrl([featured.thumbnail_url, ...(Array.isArray(featured.images) ? featured.images : [])], [featured.url, featured.detail_url, featured.external_url])} listingId={featured.id} alt={`${featured.make} ${featured.model}`} className="h-full w-full object-cover" />
                  </Link>
                  <div className="flex flex-col justify-between gap-6 p-6 sm:p-8">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-footnote font-medium text-label-2">{featured.source}</span>
                        {score > 0 ? <DealScoreExplainer listing={featured} score={score} t={t} /> : null}
                      </div>
                      <Link to={`/listing/${featured.id}`} className="block no-underline">
                        <h2 className="font-display text-title1 font-semibold text-foreground transition-colors duration-short group-hover:text-primary">{featured.make} {featured.model}</h2>
                        <p className="num mt-1.5 text-body text-label-2">{featured.year || t("common.na", "N/A")} · {featured.district || "LK"}</p>
                      </Link>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-separator pt-4">
                        <p className="num font-display text-title1 font-semibold text-foreground">{formatPrice(Number(featured.price_lkr || 0))}</p>
                        {sortMode === "affordability" && cashDown != null ? (
                          <p className="num text-footnote font-semibold text-primary">{t("picks.down", "{price} down", { price: formatPrice(cashDown) })}</p>
                        ) : (
                          score > 0 ? <p className="num text-footnote font-semibold text-deal-good-text">{t("picks.deal", "+{score} deal", { score: score.toFixed(0) })}</p> : null
                        )}
                      </div>
                      {pct > 0 ? (
                        <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
                          <div className={cn("h-full rounded-full", dealMeter(score))} style={{ width: `${pct}%` }} />
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="lg" className="min-w-0 flex-1">
                        <Link to={`/listing/${featured.id}`} className="no-underline">{t("picks.openDetail", "Open detail")}</Link>
                      </Button>
                      {featured.external_url && (
                        <Button asChild variant="secondary" size="lg">
                          <a href={featured.external_url} target="_blank" rel="noopener noreferrer" className="no-underline">
                            {t("common.source", "Source")} <ExternalLink aria-hidden />
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </m.article>
              );
            })()}

            {/* Ranked grid — calm, uniform tiles after the one hero */}
            {rest.length > 0 && (
              <div>
                <SectionHeader
                  eyebrow={t("picks.shortlist", "The shortlist")}
                  title={sortMode === "affordability" ? t("picks.lowestCashDown", "Lowest cash down") : t("picks.ranked", "Ranked picks")}
                  className="mb-8"
                  actions={<Badge variant="neutral" className="num">{t("picks.more", "{n} more", { n: rest.length })}</Badge>}
                />
                <m.div
                  inherit={false}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, amount: 0.05 }}
                  variants={listStagger}
                  className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                >
                  {rest.map((listing, idx) => {
                    const score = Number(listing.deal_score || 0);
                    const pct = topScore > 0 ? Math.min(100, Math.round((score / topScore) * 100)) : 0;
                    const cashDown = minCashDownForPrice(Number(listing.price_lkr || 0));
                    return (
                      <m.article
                        key={listing.id}
                        // Stagger the first 8; the rest arrive together.
                        variants={idx < 8 ? fadeUp : lateFade}
                        {...(motionStill ? {} : canHoverLift ? { ...hoverLift, whileTap: press.whileTap } : { whileTap: press.whileTap })}
                        // whileTap makes Motion add tabindex="0"; keep the card out of the tab order (its links are the stops).
                        tabIndex={-1}
                        className={cn(
                          cardVariants({ variant: "media", padding: "none" }),
                          "group flex flex-col transition-[border-color,box-shadow] duration-medium ease-decelerate hover:border-primary/30 hover:shadow-e2",
                        )}
                      >
                        <Link to={`/listing/${listing.id}`} tabIndex={-1} aria-hidden className="listing-card-photo relative block aspect-[16/10] overflow-hidden bg-surface-2 no-underline">
                          <VehicleThumbnail src={pickVehicleImageUrl([listing.thumbnail_url, ...(Array.isArray(listing.images) ? listing.images : [])], [listing.url, listing.detail_url, listing.external_url])} listingId={listing.id} alt={`${listing.make} ${listing.model}`} className="h-full w-full object-cover" />
                          {/* Over the photo: dark chip regardless of theme. */}
                          <span className="num absolute left-3 top-3 inline-flex h-6 items-center rounded-full bg-black/60 px-2.5 text-caption font-semibold text-white">{String(idx + 2).padStart(2, "0")}</span>
                        </Link>
                        <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate text-footnote font-medium text-label-2">{listing.source}</span>
                            {score > 0 ? <DealScoreExplainer listing={listing} score={score} t={t} /> : null}
                          </div>
                          <Link to={`/listing/${listing.id}`} className="block no-underline">
                            <h3 className="truncate text-callout font-semibold text-foreground transition-colors duration-short group-hover:text-primary">{listing.make} {listing.model}</h3>
                            <p className="num mt-0.5 text-footnote text-label-2">{listing.year || t("common.na", "N/A")} · {listing.district || "LK"}</p>
                          </Link>
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="num text-callout font-semibold text-foreground">{formatPrice(Number(listing.price_lkr || 0))}</span>
                            {sortMode === "affordability" && cashDown != null ? (
                              <span className="num text-footnote font-semibold text-primary">{t("picks.down", "{price} down", { price: formatPrice(cashDown) })}</span>
                            ) : (
                              score > 0 ? <span className="num text-footnote font-semibold text-deal-good-text">+{score.toFixed(0)}</span> : null
                            )}
                          </div>
                          {pct > 0 ? (
                            <div className="mt-auto h-1.5 overflow-hidden rounded-full bg-foreground/10">
                              <div className={cn("h-full rounded-full", dealMeter(score))} style={{ width: `${pct}%` }} />
                            </div>
                          ) : null}
                        </div>
                      </m.article>
                    );
                  })}
                </m.div>
              </div>
            )}
          </>
        )}

        {!fullAccess && !loading && !error && (hiddenPickCount > 0 || picks.length > 0) && (
          <UpgradePrompt
            title={t("plan.picksTitle", freePlanCopy.picksTitle)}
            body={t("plan.picksBody", freePlanCopy.picksBody)}
          />
        )}
      </PageBody>
    </PageCanvas>
  );
}
