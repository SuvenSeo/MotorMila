import { useEffect, useMemo, useState } from "react";
import { VERIFY_BELOW_PCT } from "@/lib/priceVerdict";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { m } from "motion/react";
import { cleanDistrict, isPlausiblePriceDrop } from "@/lib/dataSanity";
import { ArrowRight, Lock, Star, TrendingDown } from "lucide-react";
import { getListings, getPriceDrops, formatPrice } from "@/services/api";
import type { CarListing, FilterState, PriceDropItem } from "@/types/car";

import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Card, cardVariants } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { isReasonableListingPrice } from "@/lib/formatting";
import { sortListingsByAffordability } from "@/lib/cashToOwn";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { CineHeader } from "@/components/CineHeader";
import { CineSection } from "@/components/CineSection";
import { visuals } from "@/lib/visualAssets";
import "@/styles/cinematic-pages.css";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { duration, fadeUp, listStagger } from "@/lib/motion";
import type { Variants } from "motion/react";
import { useAuth } from "@/lib/authContext";
import { useAppPreferences } from "@/lib/appPreferences";
import {
  FREE_BEST_PICKS_LIMIT,
  FREE_PRICE_DROPS_LIMIT,
  freePlanCopy,
  hasFullPlatformAccess,
} from "@/lib/planLimits";
import { BestPickCard, BestPickHero } from "@/components/listing/BestPickCard";


const PICKS_PAGES = 4;
const MIN_DEAL_SCORE = 8;

export type BestPicksSortMode = "deal_score" | "affordability";

const SORT_MODES: readonly BestPicksSortMode[] = ["deal_score", "affordability"];

function isSortMode(value: string | null): value is BestPicksSortMode {
  return value != null && (SORT_MODES as readonly string[]).includes(value);
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
            <Skeleton shape="text" className="h-10" />
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
                <Skeleton shape="text" className="h-5 w-2/3" />
                <Skeleton shape="text" className="h-3 w-40" />
                <div className="flex justify-between">
                  <Skeleton shape="text" className="h-6 w-28" />
                  <Skeleton shape="text" className="h-3 w-12" />
                </div>
                <Skeleton shape="text" className="h-10" />
                <Skeleton shape="text" className="h-3 w-32" />
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
  const [searchParams, setSearchParams] = useSearchParams();
  const defaultSortMode: BestPicksSortMode = fullAccess ? "deal_score" : "affordability";
  const requestedSort = searchParams.get("sort");
  const sortMode: BestPicksSortMode =
    isSortMode(requestedSort) && (fullAccess || requestedSort === "affordability") ? requestedSort : defaultSortMode;
  const setSortMode = (next: BestPicksSortMode) => {
    if (!fullAccess && next === "deal_score") return;
    const params = new URLSearchParams(searchParams);
    if (next === defaultSortMode) params.delete("sort");
    else params.set("sort", next);
    setSearchParams(params, { replace: true });
  };

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
          ? // ≥ 35 % below is the verdict's "verify first" bait shape, never a best pick.
            candidates.filter((l) => Number(l.deal_score || 0) >= MIN_DEAL_SCORE && Number(l.deal_score) < VERIFY_BELOW_PCT)
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
  const [featured, ...rest] = ranked;
  const rankCaption =
    sortMode === "affordability"
      ? t("picks.rankAfford", "ranked by min cash down (CBSL LTV)")
      : t("picks.rankDeal", "ranked by deal strength");
  const hiddenPickCount = fullAccess ? 0 : Math.max(0, picks.length - FREE_BEST_PICKS_LIMIT);
  // The week's biggest real cut: the largest plausible drop in the feed. Cuts
  // of 35 %+ are the verdict's "verify first" shape, so they only lead when
  // nothing smaller exists (they stay in the cuts list either way).
  const biggestCut = useMemo(() => {
    const largest = (items: PriceDropItem[]) =>
      items.reduce<PriceDropItem | null>((best, d) => (!best || d.drop_pct > best.drop_pct ? d : best), null);
    return largest(drops.filter((d) => d.drop_pct < VERIFY_BELOW_PCT)) ?? largest(drops);
  }, [drops]);
  const sortControl = (
    <SegmentedControl
      value={sortMode}
      onValueChange={(v: BestPicksSortMode) => setSortMode(v)}
      aria-label={t("picks.sortAria", "Sort best picks")}
      className="w-full sm:w-72"
      options={[
        {
          value: "deal_score",
          label: fullAccess ? (
            t("picks.sortDealScore", "Deal score")
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Lock aria-hidden className="h-3.5 w-3.5" />
              {t("picks.sortDealScore", "Deal score")}
            </span>
          ),
          disabled: !fullAccess,
          title: !fullAccess
            ? t("picks.dealScoreProHint", "Deal score sorting unlocks with Pro")
            : undefined,
        },
        { value: "affordability", label: t("picks.sortAffordability", "Affordability") },
      ]}
    />
  );

  return (
    <PageCanvas ambient="none">
      <CineHeader
        eyebrow={t("picks.eyebrow", "Best picks")}
        lead={t("picks.cine.lead", "This week's")}
        accent={t("picks.cine.accent", "best deals.")}
        body={loading
          ? t("shell.picks.loading", "Finding the best-priced listings…")
          : timedOut || error
            ? t("shell.picks.descUnavailable", "Vehicles priced clearly below similar ads.")
            : fullAccess
              ? t("shell.picks.descPro", "{n} vehicles priced well below similar ads, {rank}.", { n: ranked.length, rank: rankCaption })
              : t("shell.picks.descFree", "{n} recent listings, smallest down payment first. Deal scores are coming with Pro.", { n: ranked.length })}
        image={visuals.pageHomeHeroDusk}
        imagePosition="60% 55%"
      >
        {/* Hero insight: the biggest real asking-price cut in the last 7 days. */}
        <div className="min-h-[5.5rem]" aria-live="polite">
          {!dropsLoaded ? (
            <div className="space-y-3" aria-hidden>
              <Skeleton shape="text" className="h-3 w-40 bg-foreground/10" />
              <Skeleton shape="text" className="h-10 w-56 bg-foreground/10" />
            </div>
          ) : biggestCut ? (
            <Link to={`/listing/${biggestCut.listing.id}`} className="group block max-w-3xl text-white no-underline">
              <p className="cine-eyebrow text-white/60">{t("picks.cine.cutKicker", "Biggest cut this week")}</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-6">
                <span className="cine-display shrink-0 text-[clamp(2rem,1.5rem+2vw,3rem)] leading-none tabular-nums text-white">
                  −{biggestCut.drop_pct.toFixed(1)}%
                </span>
                <span className="min-w-0 text-body leading-snug text-white/85 sm:pb-1">
                  <span className="font-semibold text-white transition-colors duration-short group-hover:text-[hsl(213_100%_75%)]">
                    {biggestCut.listing.make} {biggestCut.listing.model}{biggestCut.listing.year ? ` ${biggestCut.listing.year}` : ""}
                  </span>{" "}
                  <span className="num whitespace-nowrap text-white/60 line-through">{formatPrice(biggestCut.previous_price_lkr)}</span>{" "}
                  <ArrowRight aria-hidden className="inline h-3.5 w-3.5 text-white/60" />{" "}
                  <span className="num whitespace-nowrap font-semibold text-white">{formatPrice(biggestCut.new_price_lkr)}</span>
                </span>
              </div>
            </Link>
          ) : (
            <p className="max-w-xl text-footnote text-white/65">
              {t("shell.picks.cutsEmpty", "No price cuts spotted in the last 7 days. They show up here when a seller lowers an asking price.")}
            </p>
          )}
        </div>
      </CineHeader>

      <PageBody className="space-y-12 pb-16 pt-8 lg:space-y-16 lg:pt-12">
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
            <div className="space-y-4">
            {picks.length > 0 ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="cine-eyebrow text-label-2">{t("picks.cine.topPick", "Top pick")}</p>
                {sortControl}
              </div>
            ) : null}
            {/* Featured — the one hero pick, at 2× weight */}
            {featured ? <BestPickHero listing={featured} showCashDown={sortMode === "affordability"} /> : null}
            </div>

            {/* Ranked grid — calm, uniform tiles after the one hero */}
            {rest.length > 0 && (
              <CineSection
                index="01"
                title={sortMode === "affordability" ? t("picks.lowestCashDown", "Lowest cash down") : t("picks.ranked", "Ranked picks")}
                body={t("picks.shortlist", "The shortlist")}
                actions={<Badge variant="neutral" className="num">{t("picks.more", "{n} more", { n: rest.length })}</Badge>}
              >
                <m.div
                  inherit={false}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, amount: 0.05 }}
                  variants={listStagger}
                  className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                >
                  {rest.map((listing, idx) => (
                    <BestPickCard
                      key={listing.id}
                      listing={listing}
                      rank={idx + 2}
                      showCashDown={sortMode === "affordability"}
                      // Stagger the first 8; the rest arrive together.
                      variants={idx < 8 ? fadeUp : lateFade}
                    />
                  ))}
                </m.div>
              </CineSection>
            )}
          </>
        )}

        {/* Biggest cuts this week — powered by per-listing price history */}
        <CineSection
          index={rest.length > 0 && !loading && !error && !timedOut ? "02" : "01"}
          id="picks-cuts-heading"
          title={t("picks.cutsTitle", "Biggest cuts this week")}
          body={t("shell.picks.cutsSubtitle", "Sellers who lowered their asking price in the last 7 days")}
        >
          {!dropsLoaded ? (
            <div className="space-y-2" role="status" aria-label={t("picks.cutsLoading", "Loading price cuts")}>
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} shape="row" className="h-14 w-full" />
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
            <ul className="content-in grid border-t border-border sm:grid-cols-2 sm:gap-x-8">
              {drops.map((drop) => (
                <li key={drop.listing.id} className="border-b border-border">
                  <Link to={`/listing/${drop.listing.id}`} className="cine-row group items-center">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body font-semibold text-foreground transition-colors duration-short group-hover:text-primary">
                        {drop.listing.make} {drop.listing.model}{drop.listing.year ? ` ${drop.listing.year}` : ""}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-footnote text-label-2">
                        <span className="num line-through">{formatPrice(drop.previous_price_lkr)}</span>
                        <span className="num font-semibold text-foreground">{formatPrice(drop.new_price_lkr)}</span>
                        <span>· {cleanDistrict(drop.listing.district) || drop.listing.source}</span>
                      </span>
                    </span>
                    <Badge variant="deal-good" className="num shrink-0">−{drop.drop_pct.toFixed(1)}%</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CineSection>

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
