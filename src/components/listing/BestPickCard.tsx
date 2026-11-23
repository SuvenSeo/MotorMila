import { ExternalLink, ImageOff, MapPin, Star } from "lucide-react";
import { Link } from "react-router-dom";
import { m, type Variants } from "motion/react";
import type { CarListing } from "@/types/car";
import { formatPrice } from "@/services/api";
import { getListingDaysOnMarketLabel, getListingImageUrl } from "@/lib/listing-card-meta";
import { isReasonableListingPrice } from "@/lib/formatting";
import { plausibleEngineCc } from "@/lib/engineCapacity";
import { silhouetteFor } from "@/lib/vehicleSilhouette";
import { vehicleTokenLabel } from "@/lib/vehicleTokens";
import { formatSourceName } from "@/lib/sourceAttribution";
import { fmvSummaryFromVerdict } from "@/lib/fmv";
import { listingRowVerdict } from "@/lib/priceVerdict";
import { minCashDownForPrice } from "@/lib/cashToOwn";
import { VehicleThumbnail } from "@/components/VehicleThumbnail";
import { Button } from "@/components/ui/button";
import { MorphingDialog } from "@/components/ui/MorphingDialog";
import { cardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useAppPreferences } from "@/lib/appPreferences";
import { fadeUp, hoverLift, press, useReducedMotionOrLowData } from "@/lib/motion";
import { useCanHover } from "@/components/listing/listingMotion";
import { ListingPriceComparison } from "@/components/listing/ListingPriceComparison";
import "@/styles/cinematic-pages.css";

type Translate = (key: string, fallback?: string, vars?: Record<string, string | number>) => string;
type PickBand = "elite" | "strong" | "watch";

const BAND_CHIP: Record<PickBand, string> = {
  elite: "border-deal-great bg-deal-great text-deal-great-foreground",
  strong: "border-deal-good bg-deal-good text-deal-good-foreground",
  watch: "border-transparent bg-primary text-primary-foreground",
};

const BANDS: { key: PickBand; range: string; label: [string, string]; blurb: [string, string] }[] = [
  {
    key: "elite",
    range: "15+",
    label: ["picks.bandElite", "Elite"],
    blurb: ["picks.bandEliteBlurb", "Priced far below the lane median — the sharpest deals."],
  },
  {
    key: "strong",
    range: "10–14",
    label: ["picks.bandStrong", "Strong"],
    blurb: ["picks.bandStrongBlurb", "Clearly under median — strong value."],
  },
  {
    key: "watch",
    range: "< 10",
    label: ["picks.bandWatch", "Watch"],
    blurb: ["picks.bandWatchBlurb", "Near or above median — worth watching, not chasing."],
  },
];

function dealBand(score: number): PickBand {
  if (score >= 15) return "elite";
  if (score >= 10) return "strong";
  return "watch";
}

function formatMileage(value: number | null | undefined): string | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const km = Number(value);
  if (!Number.isFinite(km) || km < 0) return null;
  if (km >= 1000) return `${(km / 1000).toFixed(km >= 100000 ? 0 : 1).replace(/\.0$/, "")}k km`;
  return `${km} km`;
}

/**
 * Deal-band chip that morphs into the score explainer. Solid deal fill in the
 * same palette as the cards, so it reads on any photo.
 */
function DealScoreExplainer({ listing, score, size = "sm" }: { listing: CarListing; score: number; size?: "sm" | "md" }) {
  const { t } = useAppPreferences();
  const band = dealBand(score);
  const meta = BANDS.find((b) => b.key === band) ?? BANDS[2];
  return (
    <MorphingDialog
      ariaLabel={t("picks.scoreDialogLabel", "Deal score explained")}
      triggerRadius={14}
      triggerClassName={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold shadow-e1 transition-transform duration-short ease-standard active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        size === "md" ? "h-8 px-3" : "h-7 px-2.5",
        BAND_CHIP[band],
      )}
      trigger={
        <>
          <Star aria-hidden className={size === "md" ? "h-3.5 w-3.5" : "h-3 w-3"} />
          <span className="num font-display text-footnote font-semibold leading-none">+{score.toFixed(0)}</span>
          <span className="text-caption font-semibold uppercase tracking-caps">{t(meta.label[0], meta.label[1])}</span>
        </>
      }
    >
      <p className="text-caption font-semibold uppercase tracking-caps text-label-2">{t("picks.scoreEyebrow", "Deal score")}</p>
      <div className="mt-2 flex items-center gap-2">
        <span className="num font-display text-title1 font-semibold text-foreground">+{score.toFixed(0)}</span>
        <span className={cn("num inline-flex h-6 items-center rounded-full border px-2.5 text-caption font-semibold", BAND_CHIP[band])}>
          {t(meta.label[0], meta.label[1])}
        </span>
      </div>
      <p className="mt-1 text-footnote text-label-2">
        {listing.make} {listing.model}
        {listing.year ? ` · ${listing.year}` : ""}
      </p>
      <p className="mt-4 text-body text-label-2">
        {t(
          "picks.scoreBody",
          "The score compares this listing against the live market median for its lane. Higher means further below median — more deal for the money.",
        )}
      </p>
      <ul className="mt-4 space-y-2">
        {BANDS.map((b) => {
          const active = b.key === band;
          return (
            <li
              key={b.key}
              className={cn("flex items-center gap-3 rounded-control border px-3 py-2.5", active ? "border-deal-good/30 bg-deal-good/10" : "border-border/60 bg-surface-2")}
            >
              <span className={cn("num w-12 shrink-0 text-footnote font-semibold", active ? "text-deal-good-text" : "text-label-2")}>{b.range}</span>
              <div>
                <p className="text-footnote font-semibold text-foreground">{t(b.label[0], b.label[1])}</p>
                <p className="text-caption text-label-2">{t(b.blurb[0], b.blurb[1])}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </MorphingDialog>
  );
}

/** The shared view of one pick: price, verdict, typical asking and market position. */
function pickView(listing: CarListing, t: Translate) {
  const asking = Number(listing.price_lkr || 0);
  const hasPrice = isReasonableListingPrice(asking);
  const median = Number(listing.market_median_lkr);
  const hasMedian = Number.isFinite(median) && median > 0;
  const verdict = listingRowVerdict({ ...listing, price_lkr: hasPrice ? asking : null, market_median_lkr: hasMedian ? median : null });
  const fmv = hasPrice ? fmvSummaryFromVerdict(asking, verdict, t) : null;
  const engineCc = plausibleEngineCc(listing.engine_cc, listing.year);
  const specs = [
    vehicleTokenLabel("transmission", listing.transmission, t),
    formatMileage(listing.mileage_km),
    vehicleTokenLabel("fuel", listing.fuel_type, t),
    engineCc ? `${Math.round(engineCc).toLocaleString()} cc` : null,
  ].filter((spec): spec is string => Boolean(spec));
  return {
    hasPrice,
    asking,
    fmv,
    specs,
    sourceName: formatSourceName(listing.source) || listing.source,
    district: listing.district || "LK",
    daysLabel: getListingDaysOnMarketLabel(listing.first_seen_at || listing.scraped_at, t),
  };
}

function NoPhotoCaption({ sourceName }: { sourceName: string }) {
  const { t } = useAppPreferences();
  return (
    <p className="cine-card__nophoto">
      <ImageOff aria-hidden className="h-3.5 w-3.5" />
      {t("listingCard.noPhoto", "No photo · see it on {source}", { source: sourceName })}
    </p>
  );
}

function PickSpecRail({ specs, className }: { specs: string[]; className?: string }) {
  if (specs.length === 0) return null;
  return (
    <p className={cn("cine-card__specs num text-footnote text-label-2", className)}>
      {specs.map((spec) => (
        <span key={spec}>{spec}</span>
      ))}
    </p>
  );
}

function RankChip({ rank }: { rank: number }) {
  return (
    <span className="num inline-flex h-6 items-center rounded-full border border-transparent bg-black/55 px-2.5 text-caption font-semibold text-white backdrop-blur-md">
      {String(rank).padStart(2, "0")}
    </span>
  );
}

function PickPhoto({ listing, sourceName, priority }: { listing: CarListing; sourceName: string; priority?: boolean }) {
  return (
    <div className="listing-card-photo relative aspect-[16/10] overflow-hidden bg-surface-2">
      <Link to={`/listing/${listing.id}`} tabIndex={-1} aria-hidden className="block h-full w-full no-underline">
        <VehicleThumbnail
          src={getListingImageUrl(listing)}
          listingId={listing.id}
          alt={`${listing.make} ${listing.model}`}
          silhouette={silhouetteFor({ vehicle_category: listing.vehicle_category, body_type: listing.body_type, title: listing.title })}
          source={listing.source}
          priority={priority}
          className="h-full w-full object-cover transition-transform duration-long ease-decelerate motion-safe:group-hover:scale-[1.03]"
        />
      </Link>
      <NoPhotoCaption sourceName={sourceName} />
    </div>
  );
}

export interface BestPickCardProps {
  listing: CarListing;
  /** 1-based position on the board; the hero is 1. */
  rank: number;
  showCashDown: boolean;
  variants?: Variants;
}

/** One pick on the board: photo, verdict chip, name, spec rail, price, typical asking. */
export function BestPickCard({ listing, rank, showCashDown, variants }: BestPickCardProps) {
  const { t } = useAppPreferences();
  const canHover = useCanHover();
  const calm = useReducedMotionOrLowData();
  const view = pickView(listing, t);
  const score = Number(listing.deal_score || 0);
  const down = showCashDown ? minCashDownForPrice(view.asking) : null;

  return (
    <m.article
      variants={variants}
      {...(calm ? {} : canHover ? { ...hoverLift, whileTap: press.whileTap } : { whileTap: press.whileTap })}
      tabIndex={-1}
      className={cn(
        cardVariants({ variant: "media", padding: "none" }),
        "group flex h-full flex-col transition-[border-color,box-shadow] duration-medium ease-decelerate hover:border-primary/30 hover:shadow-e2",
      )}
    >
      <PickPhoto listing={listing} sourceName={view.sourceName} />

      <div className="pointer-events-none relative z-10 -mt-6 flex items-start justify-between gap-2 px-3">
        <RankChip rank={rank} />
        {score > 0 ? (
          <span className="pointer-events-auto">
            <DealScoreExplainer listing={listing} score={score} />
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4 pt-2.5 sm:p-5 sm:pt-2.5">
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <Link to={`/listing/${listing.id}`} className="min-w-0 no-underline">
              <h3 className="truncate font-display text-callout font-semibold tracking-tight text-foreground transition-colors duration-short group-hover:text-primary">
                {listing.make} {listing.model}
              </h3>
            </Link>
            {listing.year ? <span className="num shrink-0 text-footnote font-semibold text-label-2">{listing.year}</span> : null}
          </div>
          <PickSpecRail specs={view.specs} className="mt-1.5" />
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="cine-card__price num text-title2 leading-none text-foreground">
            {view.hasPrice ? formatPrice(view.asking) : t("listingCard.priceUnavailable", "Price unavailable")}
          </p>
          {down != null ? (
            <p className="num shrink-0 text-footnote font-semibold text-primary">{t("picks.down", "{price} down", { price: formatPrice(down) })}</p>
          ) : null}
        </div>

        {view.fmv ? <ListingPriceComparison fmv={view.fmv} /> : null}

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-separator pt-3 text-caption text-label-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <MapPin aria-hidden className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate text-foreground">{view.district}</span>
            <span aria-hidden>·</span>
            <span className="truncate">{view.sourceName}</span>
          </span>
          {view.daysLabel ? <span className="num shrink-0">{view.daysLabel}</span> : null}
        </div>
      </div>
    </m.article>
  );
}

export interface BestPickHeroProps {
  listing: CarListing;
  showCashDown: boolean;
}

/** The featured pick: 2× weight in the same vocabulary, with its source action. */
export function BestPickHero({ listing, showCashDown }: BestPickHeroProps) {
  const { t } = useAppPreferences();
  const view = pickView(listing, t);
  const score = Number(listing.deal_score || 0);
  const down = showCashDown ? minCashDownForPrice(view.asking) : null;

  return (
    <m.article
      initial="hidden"
      animate="show"
      variants={fadeUp}
      className={cn(
        cardVariants({ variant: "media", padding: "none" }),
        "group content-in grid grid-cols-1 transition-[border-color,box-shadow] duration-medium ease-decelerate hover:border-primary/30 hover:shadow-e2 lg:grid-cols-[1.1fr_1fr]",
      )}
    >
      <div className="relative bg-surface-2 lg:h-full">
        <div className="listing-card-photo relative aspect-[16/10] overflow-hidden lg:h-full lg:aspect-auto lg:min-h-80">
          <Link to={`/listing/${listing.id}`} tabIndex={-1} aria-hidden className="block h-full w-full no-underline">
            <VehicleThumbnail
              src={getListingImageUrl(listing)}
              listingId={listing.id}
              alt={`${listing.make} ${listing.model}`}
              silhouette={silhouetteFor({ vehicle_category: listing.vehicle_category, body_type: listing.body_type, title: listing.title })}
              source={listing.source}
              priority
              className="h-full w-full object-cover transition-transform duration-long ease-decelerate motion-safe:group-hover:scale-[1.02]"
            />
          </Link>
          <NoPhotoCaption sourceName={view.sourceName} />
        </div>
        <div className="pointer-events-none absolute left-4 top-4 z-10 sm:left-5 sm:top-5">
          <RankChip rank={1} />
        </div>
      </div>

      <div className="flex flex-col justify-between gap-6 p-6 sm:p-8">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <span className="truncate text-caption font-semibold uppercase tracking-caps text-label-2">{view.sourceName}</span>
            {score > 0 ? <DealScoreExplainer listing={listing} score={score} size="md" /> : null}
          </div>
          <Link to={`/listing/${listing.id}`} className="block no-underline">
            <h2 className="cine-display text-[clamp(1.75rem,1.4rem+1.2vw,2.5rem)] text-foreground transition-colors duration-short group-hover:text-primary">
              {listing.make} {listing.model}
            </h2>
            <PickSpecRail
              specs={[listing.year ? String(listing.year) : null, view.district, ...view.specs].filter((spec): spec is string => Boolean(spec))}
              className="mt-2"
            />
          </Link>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-separator pt-4">
            <p className="cine-card__price num text-title1 leading-none text-foreground">
              {view.hasPrice ? formatPrice(view.asking) : t("listingCard.priceUnavailable", "Price unavailable")}
            </p>
            {down != null ? (
              <p className="num text-footnote font-semibold text-primary">{t("picks.down", "{price} down", { price: formatPrice(down) })}</p>
            ) : null}
          </div>
          {view.fmv ? <ListingPriceComparison fmv={view.fmv} /> : null}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-label-2">
            <span className="flex items-center gap-1.5">
              <MapPin aria-hidden className="h-3.5 w-3.5" />
              {view.district}
            </span>
            <span aria-hidden>·</span>
            <span>{view.sourceName}</span>
            {view.daysLabel ? <span className="num">{view.daysLabel}</span> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="lg" className="min-w-0 flex-1">
            <Link to={`/listing/${listing.id}`} className="no-underline">
              {t("picks.openDetail", "Open detail")}
            </Link>
          </Button>
          {listing.external_url ? (
            <Button asChild variant="secondary" size="lg">
              <a href={listing.external_url} target="_blank" rel="noopener noreferrer" className="no-underline">
                {t("common.source", "Source")} <ExternalLink aria-hidden />
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </m.article>
  );
}
