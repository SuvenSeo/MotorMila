import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ExternalLink, SearchX, Star, TrendingDown } from "lucide-react";
import { getListings, getPriceDrops, formatPrice } from "@/services/api";
import type { CarListing, FilterState, PriceDropItem } from "@/types/car";
import { VehicleThumbnail } from "@/components/VehicleThumbnail";
import { CardSkeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { SectionHeader } from "@/components/SectionHeader";
import { pickVehicleImageUrl } from "@/lib/listingImage";
import { isReasonableListingPrice } from "@/lib/formatting";
import { minCashDownForPrice, sortListingsByAffordability } from "@/lib/cashToOwn";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { PageHero } from "@/components/PageHero";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { revealContainer, revealItem } from "@/lib/motion";
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
import { InfiniteMovingCards } from "@/components/ui/InfiniteMovingCards";

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
  if (b === "elite") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (b === "strong") return "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-700 dark:text-emerald-300";
  return "border-primary/20 bg-primary/10 text-primary-bright";
}

function dealMeter(score: number): string {
  return dealBand(score) === "watch" ? "bg-primary/60" : "bg-emerald-500/60";
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
      triggerClassName={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${dealBandChip(score)}`}
      trigger={
        <>
          <Star className="mr-1 inline h-3 w-3 text-emerald-600 dark:text-emerald-400" aria-hidden />
          {dealBandLabel(score, t)}
        </>
      }
    >
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {t("picks.scoreEyebrow", "Deal score")}
      </p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="num text-4xl font-bold tracking-tight text-foreground">+{score.toFixed(0)}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${dealBandChip(score)}`}>
          {dealBandLabel(score, t)}
        </span>
      </div>
      <p className="mt-1 text-[12px] font-medium text-muted-foreground">
        {listing.make} {listing.model}{listing.year ? ` · ${listing.year}` : ""}
      </p>
      <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
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
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${active ? "border-emerald-500/30 bg-emerald-500/[0.07]" : "border-border bg-surface"}`}
            >
              <span className={`num w-12 shrink-0 text-[12px] font-bold ${active ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}`}>
                {b.range}
              </span>
              <div>
                <p className="text-[12px] font-semibold text-foreground">
                  {b.key === "elite" ? t("picks.bandElite", "Elite") : b.key === "strong" ? t("picks.bandStrong", "Strong") : t("picks.bandWatch", "Watch")}
                </p>
                <p className="text-[11px] text-muted-foreground">{b.blurb}</p>
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

export default function BestPicks() {
  const { t } = useAppPreferences();
  const { hasProAccess, isAdmin } = useAuth();
  const fullAccess = hasFullPlatformAccess({ hasProAccess, isAdmin });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [picks, setPicks] = useState<CarListing[]>([]);
  const [drops, setDrops] = useState<PriceDropItem[]>([]);
  const [dropsLoaded, setDropsLoaded] = useState(false);
  const [sortMode, setSortMode] = useState<BestPicksSortMode>(() =>
    fullAccess ? "deal_score" : "affordability",
  );

  useEffect(() => {
    let cancelled = false;
    getPriceDrops(7, fullAccess ? 8 : FREE_PRICE_DROPS_LIMIT)
      .then((items) => { if (!cancelled) setDrops(items); })
      .catch(() => { /* feed is additive — page works without it */ })
      .finally(() => { if (!cancelled) setDropsLoaded(true); });
    return () => { cancelled = true; };
  }, [fullAccess]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
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
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fullAccess, t]);

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
        title={<>{t("picks.title", "Deal-score picks.")}</>}
        description={loading ? t("picks.scanning", "Scanning inventory...") : fullAccess
          ? `${ranked.length} vehicles scored ${MIN_DEAL_SCORE}+ from ${PICKS_PAGES} pages, ${rankCaption}.`
          : `${ranked.length} free teaser picks scored ${MIN_DEAL_SCORE}+ — upgrade for the full board.`}
        media={visuals.altCategorySuvWhite}
        mediaPosition="center 40%"
        mediaTone="light"
        highlights={[
          { label: "Min score", value: `${MIN_DEAL_SCORE}+`, hint: "Strict deal-score floor" },
          { label: "Inventory", value: loading ? "…" : String(ranked.length), hint: fullAccess ? "Vehicles in this shortlist" : "Free teaser shortlist" },
          { label: "Sort modes", value: "2", hint: "Deal score or affordability" },
        ]}
      >
        {!loading && !error && picks.length > 0 && (
          <div className="mt-8 flex flex-wrap gap-2.5" role="group" aria-label={t("picks.sortAria", "Sort best picks")}>
              <button
                type="button"
                onClick={() => setSortMode("deal_score")}
                aria-pressed={sortMode === "deal_score"}
                className={`rounded-full border px-4 py-2 text-[12px] font-semibold transition-all active:scale-[0.97] ${
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
                className={`rounded-full border px-4 py-2 text-[12px] font-semibold transition-all active:scale-[0.97] ${
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
        <motion.section initial="hidden" animate="show" variants={revealItem} className="rounded-2xl border border-border bg-card p-5 shadow-soft backdrop-blur-md sm:p-6">
            <div className="flex items-center gap-2.5 border-b border-border pb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10">
                <TrendingDown className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
              </div>
              <div>
                <h2 className="text-[15px] font-bold tracking-tight text-foreground">{t("picks.cutsTitle", "Biggest cuts this week")}</h2>
                <p className="text-[11px] text-muted-foreground font-semibold">{t("picks.cutsSubtitle", "Sellers who moved their asking price down — tracked scan-over-scan")}</p>
              </div>
            </div>
            {!dropsLoaded ? (
              <div className="grid gap-2.5 pt-4 sm:grid-cols-2 lg:grid-cols-4" role="status" aria-label={t("picks.cutsLoading", "Loading price cuts")}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="skeleton-shimmer h-24 rounded-2xl border border-border" aria-hidden="true" />
                ))}
              </div>
            ) : drops.length === 0 ? (
              <p className="pt-4 text-[13px] text-muted-foreground font-medium">
                {t("picks.cutsEmpty", "No cuts recorded in the last 7 days yet — price tracking is scan-over-scan, so drops appear here as our daily scans catch sellers moving their asking prices.")}
              </p>
            ) : (
              <InfiniteMovingCards
                items={drops}
                keyOf={(drop) => drop.listing.id}
                direction="left"
                speed="normal"
                pauseOnHover
                className="pt-3"
                renderItem={(drop) => (
                  <Link
                    to={`/listing/${drop.listing.id}`}
                    className="group block h-full rounded-xl border border-border bg-surface p-3.5 no-underline transition-all hover:border-emerald-500/30 hover:bg-card hover:shadow-soft"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[12px] font-bold text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                        {drop.listing.make} {drop.listing.model}{drop.listing.year ? ` ${drop.listing.year}` : ""}
                      </span>
                      <span className="shrink-0 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 num">
                        −{drop.drop_pct}%
                      </span>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-[11px] font-semibold text-muted-foreground line-through num">{formatPrice(drop.previous_price_lkr)}</span>
                      <span className="text-[13px] font-bold text-foreground num">{formatPrice(drop.new_price_lkr)}</span>
                    </div>
                    <p className="mt-1 text-[10px] font-semibold text-muted-foreground">
                      {drop.listing.district || drop.listing.source}
                    </p>
                  </Link>
                )}
              />
            )}
          </motion.section>

        {loading ? (
          <CardSkeleton />
        ) : error ? (
          <motion.div variants={revealItem} className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border py-16 text-center">
            <SearchX className="h-5 w-5 text-muted-foreground" aria-hidden />
            <p className="text-[13px] text-muted-foreground font-medium">{error}</p>
            <Link to="/#market" className="rounded-full border border-border bg-card px-4 py-2 text-[11px] font-bold text-foreground no-underline transition-all hover:bg-surface active:scale-[0.97]">{t("common.openInventory", "Open inventory")}</Link>
          </motion.div>
        ) : ranked.length === 0 ? (
          <motion.div variants={revealItem}>
            <EmptyState
              headline={t("picks.empty", "No vehicles meet the deal-score gate right now.")}
              body={t("picks.emptyHint", "Try clearing the sort, or seed local demo inventory to preview this board.")}
              actionLabel={t("picks.clearFilters", "Clear filters")}
              onAction={() => setSortMode("deal_score")}
              hint={
                <span>
                  {t("picks.loadDemoHint", "Load demo:")}{" "}
                  <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[10px]">python scripts/seed-demo.py --demo</code>{" "}
                  ·{" "}
                  <Link to="/#market" className="underline underline-offset-2 hover:text-foreground">
                    {t("common.browseInventory", "Browse inventory")}
                  </Link>
                </span>
              }
            />
          </motion.div>
        ) : (
          <>
            {/* Featured — the one hero pick, at 2× weight */}
            {featured && (() => {
              const score = Number(featured.deal_score || 0);
              const pct = topScore > 0 ? Math.min(100, Math.round((score / topScore) * 100)) : 0;
              const cashDown = minCashDownForPrice(Number(featured.price_lkr || 0));
              return (
                <motion.article variants={revealItem} className="group relative grid overflow-hidden rounded-2xl border border-border bg-card shadow-soft backdrop-blur-md transition-all duration-300 hover:border-primary/30 hover:shadow-soft-lg lg:grid-cols-[1.1fr_1fr]" onMouseMove={setSpotlightVars}>
                  <CardSpotlightGlow />
                  <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-primary/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-30 pointer-events-none" aria-hidden />
                  <Link to={`/listing/${featured.id}`} className="block aspect-[16/10] overflow-hidden bg-muted no-underline transition-transform duration-200 active:scale-[0.99] lg:aspect-auto lg:min-h-[320px]">
                    <VehicleThumbnail src={pickVehicleImageUrl([featured.thumbnail_url, ...(Array.isArray(featured.images) ? featured.images : [])], [featured.url, featured.detail_url, featured.external_url])} listingId={featured.id} alt={`${featured.make} ${featured.model}`} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
                  </Link>
                  <div className="flex flex-col justify-between gap-6 p-6 sm:p-8">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-semibold text-muted-foreground">{featured.source}</span>
                        <DealScoreExplainer listing={featured} score={score} t={t} />
                      </div>
                      <Link to={`/listing/${featured.id}`} className="block no-underline">
                        <h2 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl group-hover:text-primary transition-colors">{featured.make} {featured.model}</h2>
                        <p className="mt-1.5 text-[12px] text-muted-foreground font-medium">{featured.year || t("common.na", "N/A")} · {featured.district || "LK"}</p>
                      </Link>
                      <div className="flex items-baseline justify-between border-t border-border pt-4">
                        <p className="num text-3xl font-bold tracking-tight text-foreground">{formatPrice(Number(featured.price_lkr || 0))}</p>
                        {sortMode === "affordability" && cashDown != null ? (
                          <p className="num text-[12px] font-bold text-primary-bright">{t("picks.down", "{price} down", { price: formatPrice(cashDown) })}</p>
                        ) : (
                          <p className="num text-[12px] font-bold text-emerald-600 dark:text-emerald-400">{t("picks.deal", "+{score} deal", { score: score.toFixed(0) })}</p>
                        )}
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-foreground/[0.08]">
                        <div className={`h-full rounded-full ${dealMeter(score)}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Link to={`/listing/${featured.id}`} className="flex h-11 flex-1 items-center justify-center rounded-full bg-primary text-[12px] font-semibold text-primary-foreground no-underline shadow-soft transition-all hover:bg-primary/95 active:scale-[0.97]">{t("picks.openDetail", "Open detail")}</Link>
                      {featured.external_url && (
                        <a href={featured.external_url} target="_blank" rel="noopener noreferrer" className="flex h-11 items-center gap-1 rounded-full border border-border bg-card px-4 text-[11px] font-semibold text-muted-foreground no-underline transition-all hover:text-foreground hover:bg-surface active:scale-[0.97]">
                          {t("common.source", "Source")} <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                      )}
                    </div>
                  </div>
                </motion.article>
              );
            })()}

            {/* Ranked grid — calm, uniform tiles after the one hero */}
            {rest.length > 0 && (
              <div>
                <SectionHeader
                  eyebrow={t("picks.shortlist", "The shortlist")}
                  title={sortMode === "affordability" ? t("picks.lowestCashDown", "Lowest cash down") : t("picks.ranked", "Ranked picks")}
                  className="mb-8"
                  actions={<span className="text-[11px] font-bold text-muted-foreground num">{t("picks.more", "{n} more", { n: rest.length })}</span>}
                />
                <motion.div variants={revealContainer} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {rest.map((listing, idx) => {
                    const score = Number(listing.deal_score || 0);
                    const pct = topScore > 0 ? Math.min(100, Math.round((score / topScore) * 100)) : 0;
                    const cashDown = minCashDownForPrice(Number(listing.price_lkr || 0));
                    return (
                      <motion.article key={listing.id} variants={revealItem} className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-soft-lg" onMouseMove={setSpotlightVars}>
                        <CardSpotlightGlow />
                        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-primary/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-30 pointer-events-none" aria-hidden />
                        <Link to={`/listing/${listing.id}`} className="relative block aspect-[16/10] overflow-hidden bg-muted no-underline transition-transform duration-200 active:scale-[0.98]">
                          <VehicleThumbnail src={pickVehicleImageUrl([listing.thumbnail_url, ...(Array.isArray(listing.images) ? listing.images : [])], [listing.url, listing.detail_url, listing.external_url])} listingId={listing.id} alt={`${listing.make} ${listing.model}`} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
                          <span className="absolute left-2 top-2 rounded-full border border-white/20 bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white num backdrop-blur-sm">{String(idx + 2).padStart(2, "0")}</span>
                        </Link>
                        <div className="flex flex-1 flex-col gap-3 p-4">
                          <div className="flex items-center justify-between">
                            <span className="text-[12px] font-semibold text-muted-foreground">{listing.source}</span>
                            <DealScoreExplainer listing={listing} score={score} t={t} />
                          </div>
                          <Link to={`/listing/${listing.id}`} className="block no-underline">
                            <h3 className="font-display text-[15px] font-semibold tracking-tight text-foreground group-hover:text-primary transition-colors truncate">{listing.make} {listing.model}</h3>
                            <p className="mt-0.5 text-[10px] text-muted-foreground font-medium">{listing.year || t("common.na", "N/A")} · {listing.district || "LK"}</p>
                          </Link>
                          <div className="flex items-baseline justify-between">
                            <span className="num text-base font-bold text-foreground">{formatPrice(Number(listing.price_lkr || 0))}</span>
                            {sortMode === "affordability" && cashDown != null ? (
                              <span className="num text-[10px] font-bold text-primary-bright">{t("picks.down", "{price} down", { price: formatPrice(cashDown) })}</span>
                            ) : (
                              <span className="num text-[10px] font-bold text-emerald-600 dark:text-emerald-400">+{score.toFixed(0)}</span>
                            )}
                          </div>
                          <div className="mt-auto h-1 overflow-hidden rounded-full bg-foreground/[0.08]">
                            <div className={`h-full rounded-full ${dealMeter(score)}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </motion.article>
                    );
                  })}
                </motion.div>
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
