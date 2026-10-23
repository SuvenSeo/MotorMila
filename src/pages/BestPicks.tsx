import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { m } from "motion/react";
import { cleanDistrict, isPlausiblePriceDrop } from "@/lib/dataSanity";
import { ExternalLink, SearchX, Star, TrendingDown } from "lucide-react";
import { getListings, getPriceDrops, formatPrice } from "@/services/api";
import type { CarListing, FilterState, PriceDropItem } from "@/types/car";
import { VehicleThumbnail } from "@/components/VehicleThumbnail";

import { EmptyState } from "@/components/EmptyState";
import { SectionHeader } from "@/components/SectionHeader";
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
import { setSpotlightVars, CardSpotlightGlow } from "@/components/ui/CardSpotlight";
import { visuals } from "@/lib/visualAssets";

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

function dealBandChip(score: number): string {
  const b = dealBand(score);
  if (b === "elite") return "border-deal-good/25 bg-deal-good/10 text-deal-good-text";
  if (b === "strong") return "border-deal-good/20 bg-deal-good/[0.07] text-deal-good-text";
  return "border-primary/20 bg-primary/10 text-primary-bright";
}

function dealMeter(score: number): string {
  return dealBand(score) === "watch" ? "bg-primary/60" : "bg-deal-good/60";
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
      triggerClassName={`inline-flex items-center rounded-full border px-2 py-0.5 text-caption font-bold ${dealBandChip(score)}`}
      trigger={
        <>
          <Star className="mr-1 inline h-3 w-3 text-deal-good-text" aria-hidden />
          {dealBandLabel(score, t)}
        </>
      }
    >
      <p className="text-caption font-semibold uppercase tracking-caps text-muted-foreground">
        {t("picks.scoreEyebrow", "Deal score")}
      </p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="num text-title1 font-bold tracking-tight text-foreground">+{score.toFixed(0)}</span>
        <span className={`rounded-full border px-2 py-0.5 text-caption font-bold ${dealBandChip(score)}`}>
          {dealBandLabel(score, t)}
        </span>
      </div>
      <p className="mt-1 text-caption font-medium text-muted-foreground">
        {listing.make} {listing.model}{listing.year ? ` · ${listing.year}` : ""}
      </p>
      <p className="mt-4 text-footnote leading-relaxed text-muted-foreground">
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
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${active ? "border-deal-good/30 bg-deal-good/[0.07]" : "border-border bg-surface"}`}
            >
              <span className={`num w-12 shrink-0 text-caption font-bold ${active ? "text-deal-good-text" : "text-muted-foreground"}`}>
                {b.range}
              </span>
              <div>
                <p className="text-caption font-semibold text-foreground">
                  {b.key === "elite" ? t("picks.bandElite", "Elite") : b.key === "strong" ? t("picks.bandStrong", "Strong") : t("picks.bandWatch", "Watch")}
                </p>
                <p className="text-caption text-muted-foreground">{b.blurb}</p>
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
  const bar = "skeleton-shimmer rounded-full";
  return (
    <div className="space-y-14 lg:space-y-20" aria-hidden>
      <div className="grid overflow-hidden rounded-2xl border border-border bg-card lg:grid-cols-[1.1fr_1fr]">
        <div className="skeleton-shimmer aspect-[16/10] lg:aspect-auto lg:min-h-[320px]" />
        <div className="flex flex-col justify-between gap-6 p-6 sm:p-8">
          <div className="space-y-4">
            <div className={`${bar} h-3 w-24`} />
            <div className={`${bar} h-9 w-3/4`} />
            <div className={`${bar} h-3 w-32`} />
            <div className="flex items-baseline justify-between border-t border-border pt-4">
              <div className={`${bar} h-8 w-40`} />
              <div className={`${bar} h-3 w-16`} />
            </div>
            <div className={`${bar} h-1 w-full`} />
          </div>
          <div className={`${bar} h-11 w-full`} />
        </div>
      </div>
      <div>
        <div className="mb-8 space-y-2">
          <div className={`${bar} h-3 w-24`} />
          <div className={`${bar} h-7 w-48`} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
              <div className="skeleton-shimmer aspect-[16/10]" />
              <div className="flex flex-col gap-3 p-4">
                <div className={`${bar} h-3 w-20`} />
                <div className={`${bar} h-4 w-2/3`} />
                <div className="flex justify-between">
                  <div className={`${bar} h-4 w-24`} />
                  <div className={`${bar} h-3 w-8`} />
                </div>
                <div className={`${bar} h-1 w-full`} />
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
      ? "ranked by min cash down (CBSL LTV)"
      : "ranked by deal strength";
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
        media={visuals.altCategorySuvWhite}
        mediaPosition="center 40%"
        mediaTone="light"
        highlights={
          loading || timedOut || error
            ? undefined
            : [{ label: t("shell.picks.hlCount", "Listings"), value: String(ranked.length), hint: t("shell.picks.hlCountHint", "In this shortlist") }]
        }
      >
        {!loading && !error && !timedOut && picks.length > 0 && (
          <div className="mt-8 flex flex-wrap gap-2.5" role="group" aria-label={t("picks.sortAria", "Sort best picks")}>
              <button
                type="button"
                onClick={() => setSortMode("deal_score")}
                aria-pressed={sortMode === "deal_score"}
                className={`rounded-full border px-4 py-2 text-caption font-semibold transition-ui active:scale-[0.97] ${
                  sortMode === "deal_score"
                    ? "border-primary/40 bg-primary/10 text-primary-bright shadow-soft"
                    : "border-border bg-card text-muted-foreground hover:bg-surface hover:text-foreground"
                }`}
              >
                {t("picks.sortDealScore", "Deal score")}
              </button>
              <button
                type="button"
                onClick={() => setSortMode("affordability")}
                aria-pressed={sortMode === "affordability"}
                className={`rounded-full border px-4 py-2 text-caption font-semibold transition-ui active:scale-[0.97] ${
                  sortMode === "affordability"
                    ? "border-primary/40 bg-primary/10 text-primary-bright shadow-soft"
                    : "border-border bg-card text-muted-foreground hover:bg-surface hover:text-foreground"
                }`}
              >
                {t("picks.sortAffordability", "Affordability")}
              </button>
            </div>
          )}
      </PageHero>

      <PageBody className="space-y-14 lg:space-y-20">
        {/* Biggest cuts this week — powered by per-listing price history */}
        <m.section initial="hidden" animate="show" variants={revealItem} className="rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6">
            <div className="flex items-center gap-2.5 border-b border-border pb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-2xl border border-deal-good/25 bg-deal-good/10">
                <TrendingDown className="h-4 w-4 text-deal-good-text" aria-hidden />
              </div>
              <div>
                <h2 className="text-body font-bold tracking-tight text-foreground">{t("picks.cutsTitle", "Biggest cuts this week")}</h2>
                <p className="text-caption text-muted-foreground font-semibold">{t("shell.picks.cutsSubtitle", "Sellers who lowered their asking price in the last 7 days")}</p>
              </div>
            </div>
            {!dropsLoaded ? (
              <div className="grid gap-2.5 pt-4 sm:grid-cols-2 lg:grid-cols-4" role="status" aria-label={t("picks.cutsLoading", "Loading price cuts")}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="skeleton-shimmer h-24 rounded-2xl border border-border" aria-hidden="true" />
                ))}
              </div>
            ) : drops.length === 0 ? (
              <p className="pt-4 text-footnote text-muted-foreground font-medium">
                {t("shell.picks.cutsEmpty", "No price cuts spotted in the last 7 days. They show up here when a seller lowers an asking price.")}
              </p>
            ) : (
              <ul className="grid gap-2.5 pt-4 sm:grid-cols-2 lg:grid-cols-4">
                {drops.map((drop) => (
                  <li key={drop.listing.id}>
                  <Link
                    to={`/listing/${drop.listing.id}`}
                    className="group block h-full rounded-xl border border-border bg-surface p-3.5 no-underline transition-ui hover:border-deal-good/30 hover:bg-card hover:shadow-soft"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-caption font-bold text-foreground group-hover:text-deal-good-text dark:group-hover:text-deal-good-text transition-colors">
                        {drop.listing.make} {drop.listing.model}{drop.listing.year ? ` ${drop.listing.year}` : ""}
                      </span>
                      <span className="shrink-0 rounded-full border border-deal-good/25 bg-deal-good/10 px-1.5 py-0.5 text-caption font-bold text-deal-good-text num">
                        −{drop.drop_pct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-caption font-semibold text-muted-foreground line-through num">{formatPrice(drop.previous_price_lkr)}</span>
                      <span className="text-footnote font-bold text-foreground num">{formatPrice(drop.new_price_lkr)}</span>
                    </div>
                    <p className="mt-1 text-caption font-semibold text-muted-foreground">
                      {cleanDistrict(drop.listing.district) || drop.listing.source}
                    </p>
                  </Link>
                  </li>
                ))}
              </ul>
            )}
          </m.section>

        {loading ? (
          <div role="status" aria-live="polite">
            <p className="mb-3 text-footnote font-medium text-muted-foreground">{t("shell.picks.loading", "Finding the best-priced listings…")}</p>
            <PicksSkeleton />
          </div>
        ) : timedOut ? (
          <m.div variants={revealItem}>
            <EmptyState
              headline={t("shell.picks.timeoutTitle", "This is taking longer than usual")}
              body={t("shell.picks.timeoutBody", "We couldn't load deal picks just now. Try again, or browse all listings.")}
              actionLabel={t("shell.picks.retry", "Try again")}
              onAction={() => setReloadKey((k) => k + 1)}
              hint={
                <Link to="/#market" className="underline underline-offset-2 hover:text-foreground">
                  {t("shell.picks.browse", "Browse all listings")}
                </Link>
              }
            />
          </m.div>
        ) : error ? (
          <m.div variants={revealItem} className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border py-16 text-center">
            <SearchX className="h-5 w-5 text-muted-foreground" aria-hidden />
            <p className="text-footnote text-muted-foreground font-medium">{error}</p>
            <Link to="/#market" className="rounded-full border border-border bg-card px-4 py-2 text-caption font-bold text-foreground no-underline transition-ui hover:bg-surface active:scale-[0.97]">{t("common.openInventory", "Open inventory")}</Link>
          </m.div>
        ) : ranked.length === 0 ? (
          <m.div variants={revealItem}>
            <EmptyState
              headline={t("shell.picks.emptyTitle", "No standout deals right now")}
              body={t("shell.picks.emptyBody", "We only list vehicles priced clearly below similar ads. Check back after the next update, or browse everything.")}
              actionLabel={t("shell.picks.browse", "Browse all listings")}
              onAction={() => navigate("/#market")}
            />
          </m.div>
        ) : (
          <>
            {/* Featured — the one hero pick, at 2× weight */}
            {featured && (() => {
              const score = Number(featured.deal_score || 0);
              const pct = topScore > 0 ? Math.min(100, Math.round((score / topScore) * 100)) : 0;
              const cashDown = minCashDownForPrice(Number(featured.price_lkr || 0));
              return (
                <m.article variants={revealItem} className="group relative grid overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-ui duration-medium hover:border-primary/30 hover:shadow-soft-lg lg:grid-cols-[1.1fr_1fr]" onMouseMove={setSpotlightVars}>
                  <CardSpotlightGlow />
                  <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-primary/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-30 pointer-events-none" aria-hidden />
                  <Link to={`/listing/${featured.id}`} className="block aspect-[16/10] overflow-hidden bg-muted no-underline transition-transform duration-short active:scale-[0.99] lg:aspect-auto lg:min-h-[320px]">
                    <VehicleThumbnail src={pickVehicleImageUrl([featured.thumbnail_url, ...(Array.isArray(featured.images) ? featured.images : [])], [featured.url, featured.detail_url, featured.external_url])} listingId={featured.id} alt={`${featured.make} ${featured.model}`} className="h-full w-full object-cover transition-transform duration-long group-hover:scale-[1.02]" />
                  </Link>
                  <div className="flex flex-col justify-between gap-6 p-6 sm:p-8">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-caption font-semibold text-muted-foreground">{featured.source}</span>
                        <DealScoreExplainer listing={featured} score={score} t={t} />
                      </div>
                      <Link to={`/listing/${featured.id}`} className="block no-underline">
                        <h2 className="font-display text-title1 font-bold tracking-tight text-foreground sm:text-title1 group-hover:text-primary transition-colors">{featured.make} {featured.model}</h2>
                        <p className="mt-1.5 text-caption text-muted-foreground font-medium">{featured.year || t("common.na", "N/A")} · {featured.district || "LK"}</p>
                      </Link>
                      <div className="flex items-baseline justify-between border-t border-border pt-4">
                        <p className="num text-title1 font-bold tracking-tight text-foreground">{formatPrice(Number(featured.price_lkr || 0))}</p>
                        {sortMode === "affordability" && cashDown != null ? (
                          <p className="num text-caption font-bold text-primary-bright">{t("picks.down", "{price} down", { price: formatPrice(cashDown) })}</p>
                        ) : (
                          <p className="num text-caption font-bold text-deal-good-text">{t("picks.deal", "+{score} deal", { score: score.toFixed(0) })}</p>
                        )}
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-foreground/[0.08]">
                        <div className={`h-full rounded-full ${dealMeter(score)}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Link to={`/listing/${featured.id}`} className="flex h-11 flex-1 items-center justify-center rounded-full bg-primary text-caption font-semibold text-primary-foreground no-underline shadow-soft transition-ui hover:bg-primary/95 active:scale-[0.97]">{t("picks.openDetail", "Open detail")}</Link>
                      {featured.external_url && (
                        <a href={featured.external_url} target="_blank" rel="noopener noreferrer" className="flex h-11 items-center gap-1 rounded-full border border-border bg-card px-4 text-caption font-semibold text-muted-foreground no-underline transition-ui hover:text-foreground hover:bg-surface active:scale-[0.97]">
                          {t("common.source", "Source")} <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
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
                  actions={<span className="text-caption font-bold text-muted-foreground num">{t("picks.more", "{n} more", { n: rest.length })}</span>}
                />
                <m.div
                  inherit={false}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, amount: 0.05 }}
                  variants={listStagger}
                  className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
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
                        className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-[border-color,box-shadow] duration-medium hover:border-primary/30 hover:shadow-soft-lg"
                        onMouseMove={setSpotlightVars}
                      >
                        <CardSpotlightGlow />
                        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-primary/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-30 pointer-events-none" aria-hidden />
                        <Link to={`/listing/${listing.id}`} className="relative block aspect-[16/10] overflow-hidden bg-muted no-underline transition-transform duration-short active:scale-[0.98]">
                          <VehicleThumbnail src={pickVehicleImageUrl([listing.thumbnail_url, ...(Array.isArray(listing.images) ? listing.images : [])], [listing.url, listing.detail_url, listing.external_url])} listingId={listing.id} alt={`${listing.make} ${listing.model}`} className="h-full w-full object-cover transition-transform duration-long group-hover:scale-[1.02]" />
                          <span className="absolute left-2 top-2 rounded-full border border-border bg-black/60 px-1.5 py-0.5 text-caption font-bold text-white num">{String(idx + 2).padStart(2, "0")}</span>
                        </Link>
                        <div className="flex flex-1 flex-col gap-3 p-4">
                          <div className="flex items-center justify-between">
                            <span className="text-caption font-semibold text-muted-foreground">{listing.source}</span>
                            <DealScoreExplainer listing={listing} score={score} t={t} />
                          </div>
                          <Link to={`/listing/${listing.id}`} className="block no-underline">
                            <h3 className="font-display text-body font-semibold tracking-tight text-foreground group-hover:text-primary transition-colors truncate">{listing.make} {listing.model}</h3>
                            <p className="mt-0.5 text-caption text-muted-foreground font-medium">{listing.year || t("common.na", "N/A")} · {listing.district || "LK"}</p>
                          </Link>
                          <div className="flex items-baseline justify-between">
                            <span className="num text-body font-bold text-foreground">{formatPrice(Number(listing.price_lkr || 0))}</span>
                            {sortMode === "affordability" && cashDown != null ? (
                              <span className="num text-caption font-bold text-primary-bright">{t("picks.down", "{price} down", { price: formatPrice(cashDown) })}</span>
                            ) : (
                              <span className="num text-caption font-bold text-deal-good-text">+{score.toFixed(0)}</span>
                            )}
                          </div>
                          <div className="mt-auto h-1 overflow-hidden rounded-full bg-foreground/[0.08]">
                            <div className={`h-full rounded-full ${dealMeter(score)}`} style={{ width: `${pct}%` }} />
                          </div>
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
