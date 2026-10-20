import { memo, useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  BadgeCheck,
  ClipboardList,
  Fuel,
  Gauge,
  MapPin,
  Scale,
  Settings2,
  Sparkles,
  Trophy,
  Wallet,
} from "lucide-react";
import { CarListing } from "@/types/car";
import { formatPrice } from "@/services/api";
import { ConditionBadge } from "./ConditionBadge";
import { DealScoreBadge } from "./DealScoreBadge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getListingDealLabel, getListingImageUrl } from "@/lib/listing-card-meta";
import { isReasonableListingPrice } from "@/lib/formatting";
import { VehicleThumbnail } from "@/components/VehicleThumbnail";
import { AtmosphericImage } from "@/components/AtmosphericImage";
import { visuals } from "@/lib/visualAssets";
import { cn } from "@/lib/utils";

interface ComparisonModalProps {
  listings: CarListing[];
  open: boolean;
  onClose: () => void;
}

type ComparisonRow = {
  key: string;
  label: string;
  group: "value" | "specs" | "listing";
  render: (listing: CarListing) => ReactNode;
  value?: (listing: CarListing) => number | null;
  better?: "higher" | "lower";
};

type ComparisonListing = CarListing & {
  mileage?: number | null;
  mileage_km?: number | null;
  engine_cc?: number | null;
  engine_capacity?: number | null;
};

const GROUP_META: Record<
  ComparisonRow["group"],
  { label: string; hint: string; icon: typeof Wallet }
> = {
  value: { label: "Value", hint: "Price signal and deal strength", icon: Wallet },
  specs: { label: "Specs", hint: "Mechanical and body details", icon: Settings2 },
  listing: { label: "Listing", hint: "Source and market presence", icon: ClipboardList },
};

function toNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function formatToken(value: string | undefined): string {
  if (!value) return "—";
  return value
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function getMileageKm(listing: CarListing): number | null {
  const candidate = listing as ComparisonListing;
  return toNumber(candidate.mileage_km ?? candidate.mileage);
}

function getEngineCc(listing: CarListing): number | null {
  const candidate = listing as ComparisonListing;
  return toNumber(candidate.engine_cc ?? candidate.engine_capacity);
}

function listingAgeLabel(listing: CarListing): string {
  const base = listing.first_seen_at || listing.scraped_at;
  if (!base) return "Unknown";
  const ts = new Date(base).getTime();
  if (!Number.isFinite(ts)) return "Unknown";

  const days = Math.max(0, Math.round((Date.now() - ts) / 86_400_000));
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function formatMileageCompact(mileage: number | null): string {
  if (mileage === null) return "—";
  if (mileage >= 1000) {
    const compact = (mileage / 1000).toFixed(mileage >= 100_000 ? 0 : 1).replace(/\.0$/, "");
    return `${compact}k km`;
  }
  return `${mileage.toLocaleString()} km`;
}

export const ComparisonModal = memo(function ComparisonModal({ listings, open, onClose }: ComparisonModalProps) {
  const rows = useMemo<ComparisonRow[]>(
    () => [
      {
        key: "price",
        label: "Price",
        group: "value",
        render: (listing) => {
          const price = toNumber(listing.price_lkr);
          if (!isReasonableListingPrice(price)) {
            return <span className="text-muted-foreground">Unavailable</span>;
          }
          return <span className="font-semibold tabular-nums text-foreground">{formatPrice(price)}</span>;
        },
        value: (listing) => {
          const price = toNumber(listing.price_lkr);
          return isReasonableListingPrice(price) ? price : null;
        },
        better: "lower",
      },
      {
        key: "deal_score",
        label: "Deal score",
        group: "value",
        render: (listing) => {
          if (listing.deal_score === null || listing.deal_score === undefined) {
            return <span className="text-muted-foreground">—</span>;
          }
          const score = Number(listing.deal_score);
          return (
            <span className="inline-flex flex-wrap items-center gap-2">
              <DealScoreBadge score={score} />
              <span className="text-[11px] font-medium text-muted-foreground">{getListingDealLabel(score)}</span>
            </span>
          );
        },
        value: (listing) => toNumber(listing.deal_score),
        better: "higher",
      },
      {
        key: "market_median",
        label: "vs market",
        group: "value",
        render: (listing) => {
          const price = toNumber(listing.price_lkr);
          const median = toNumber(listing.market_median_lkr);
          if (!isReasonableListingPrice(price) || median === null || median <= 0) {
            return <span className="text-muted-foreground">—</span>;
          }
          const delta = ((price! - median) / median) * 100;
          const below = delta < -0.5;
          const above = delta > 0.5;
          return (
            <span
              className={cn(
                "tabular-nums font-semibold",
                below && "text-emerald-600 dark:text-emerald-400",
                above && "text-rose-600 dark:text-rose-400",
                !below && !above && "text-muted-foreground",
              )}
            >
              {below ? "" : above ? "+" : ""}
              {delta.toFixed(1)}%
            </span>
          );
        },
        value: (listing) => {
          const price = toNumber(listing.price_lkr);
          const median = toNumber(listing.market_median_lkr);
          if (!isReasonableListingPrice(price) || median === null || median <= 0) return null;
          return ((price! - median) / median) * 100;
        },
        better: "lower",
      },
      {
        key: "year",
        label: "Year",
        group: "specs",
        render: (listing) => <span className="tabular-nums">{listing.year || "—"}</span>,
        value: (listing) => toNumber(listing.year),
        better: "higher",
      },
      {
        key: "mileage",
        label: "Mileage",
        group: "specs",
        render: (listing) => {
          const mileage = getMileageKm(listing);
          return <span className="tabular-nums">{mileage ? `${mileage.toLocaleString()} km` : "—"}</span>;
        },
        value: getMileageKm,
        better: "lower",
      },
      {
        key: "condition",
        label: "Condition",
        group: "specs",
        render: (listing) => <ConditionBadge condition={listing.condition} className="!text-[10px]" />,
      },
      {
        key: "body",
        label: "Body",
        group: "specs",
        render: (listing) => formatToken(listing.body_type),
      },
      {
        key: "transmission",
        label: "Transmission",
        group: "specs",
        render: (listing) => formatToken(listing.transmission),
      },
      {
        key: "fuel",
        label: "Fuel",
        group: "specs",
        render: (listing) => formatToken(listing.fuel_type),
      },
      {
        key: "engine",
        label: "Engine",
        group: "specs",
        render: (listing) => {
          const engine = getEngineCc(listing);
          return <span className="tabular-nums">{engine ? `${engine.toLocaleString()} cc` : "—"}</span>;
        },
        value: getEngineCc,
        better: "higher",
      },
      {
        key: "district",
        label: "District",
        group: "listing",
        render: (listing) => listing.district || "—",
      },
      {
        key: "source",
        label: "Source",
        group: "listing",
        render: (listing) => formatToken(listing.source),
      },
      {
        key: "listed",
        label: "First seen",
        group: "listing",
        render: (listing) => listingAgeLabel(listing),
      },
    ],
    [],
  );

  const rowGroups = useMemo(() => {
    const order: ComparisonRow["group"][] = ["value", "specs", "listing"];
    return order.map((group) => ({
      group,
      ...GROUP_META[group],
      rows: rows.filter((row) => row.group === group),
    }));
  }, [rows]);

  const bestByRow = useMemo(() => {
    const next = new Map<string, number>();

    rows.forEach((row) => {
      if (!row.value || !row.better) return;

      const values = listings.map((listing, index) => ({ index, value: row.value ? row.value(listing) : null }));
      const finite = values.filter((item) => item.value !== null) as Array<{ index: number; value: number }>;
      if (finite.length < 2) return;

      const best =
        row.better === "lower"
          ? finite.reduce((acc, item) => (item.value < acc.value ? item : acc))
          : finite.reduce((acc, item) => (item.value > acc.value ? item : acc));

      const ties = finite.filter((item) => item.value === best.value);
      if (ties.length === 1) next.set(row.key, best.index);
    });

    return next;
  }, [listings, rows]);

  const bestDealListing = useMemo(
    () =>
      [...listings]
        .filter((listing) => toNumber(listing.deal_score) !== null)
        .sort((a, b) => Number(b.deal_score || 0) - Number(a.deal_score || 0))[0] ?? null,
    [listings],
  );

  const lowestPriceListing = useMemo(
    () =>
      [...listings]
        .filter((listing) => isReasonableListingPrice(toNumber(listing.price_lkr)))
        .sort((a, b) => Number(a.price_lkr || 0) - Number(b.price_lkr || 0))[0] ?? null,
    [listings],
  );

  const lowestMileageListing = useMemo(
    () =>
      [...listings]
        .map((listing) => ({ listing, mileage: getMileageKm(listing) }))
        .filter((item) => item.mileage !== null && item.mileage! >= 0)
        .sort((a, b) => Number(a.mileage) - Number(b.mileage))[0]?.listing ?? null,
    [listings],
  );

  const priceSpreadLabel = useMemo(() => {
    const prices = listings
      .map((listing) => Number(listing.price_lkr))
      .filter((price) => isReasonableListingPrice(price));
    if (prices.length < 2) return null;
    return formatPrice(Math.max(...prices) - Math.min(...prices));
  }, [listings]);

  const columnTemplate = useMemo(
    () => `minmax(7.25rem, 9rem) repeat(${listings.length}, minmax(11.5rem, 1fr))`,
    [listings.length],
  );

  if (listings.length === 0) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className="flex max-h-[min(92vh,900px)] w-[min(96vw,1120px)] max-w-[1120px] flex-col gap-0 overflow-hidden border-border bg-card p-0 text-foreground sm:rounded-2xl">
        <DialogHeader className="relative shrink-0 overflow-hidden border-b border-border px-5 pb-4 pt-5 text-left md:px-6 md:pt-6">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <AtmosphericImage
              src={visuals.pageCompareHero.src}
              srcSm={visuals.pageCompareHero.srcSm}
              className="h-full w-full object-cover object-[center_40%] opacity-30"
              sizes="1120px"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-card via-card/92 to-card/75" />
          </div>
          <div className="relative flex flex-col gap-4 pr-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 tech-label text-primary-bright">
                  <Scale className="h-3 w-3" />
                  Side-by-side
                </div>
                <DialogTitle className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-[1.75rem]">
                  Compare vehicles
                </DialogTitle>
                <DialogDescription className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                  Leaders highlight the stronger number on each row. Open a listing when you&apos;ve picked a lane.
                </DialogDescription>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-border bg-surface/80 px-3 py-1.5 text-[11px] font-semibold tabular-nums text-foreground backdrop-blur-sm">
                  {listings.length} vehicles
                </span>
                {priceSpreadLabel ? (
                  <span className="rounded-full border border-border bg-surface/80 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground backdrop-blur-sm">
                    Spread <span className="tabular-nums text-foreground">{priceSpreadLabel}</span>
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {bestDealListing ? (
                <VerdictChip
                  icon={<Trophy className="h-3 w-3" />}
                  label="Best deal"
                  value={`${bestDealListing.make} ${bestDealListing.model}`}
                  tone="primary"
                />
              ) : null}
              {lowestPriceListing ? (
                <VerdictChip
                  icon={<Sparkles className="h-3 w-3" />}
                  label="Lowest ask"
                  value={`${lowestPriceListing.make} ${lowestPriceListing.model}`}
                  tone="neutral"
                />
              ) : null}
              {lowestMileageListing ? (
                <VerdictChip
                  icon={<Gauge className="h-3 w-3" />}
                  label="Lowest km"
                  value={`${lowestMileageListing.make} ${lowestMileageListing.model}`}
                  tone="neutral"
                />
              ) : null}
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto">
          <div className="min-w-[760px] px-4 pb-6 pt-4 md:px-5">
            {/* Sticky vehicle headers — card columns, no spreadsheet lines */}
            <div
              className="sticky top-0 z-20 -mx-1 grid gap-3 bg-gradient-to-b from-card via-card to-card/90 px-1 pb-4 pt-1 backdrop-blur-xl"
              style={{ gridTemplateColumns: columnTemplate }}
            >
              <div className="flex items-end pb-2">
                <p className="tech-label text-muted-foreground">Vehicle</p>
              </div>
              {listings.map((listing, index) => {
                const image = getListingImageUrl(listing);
                const mileage = getMileageKm(listing);
                const isBestDeal = bestDealListing?.id === listing.id;
                const isLowestPrice = lowestPriceListing?.id === listing.id;
                const price = toNumber(listing.price_lkr);
                const hasPrice = isReasonableListingPrice(price);

                return (
                  <motion.div
                    key={listing.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05, duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    className={cn(
                      "relative overflow-hidden rounded-2xl border bg-surface/60 shadow-soft",
                      isBestDeal ? "border-primary/35 ring-1 ring-primary/15" : "border-border",
                    )}
                  >
                    {isBestDeal ? (
                      <div className="absolute inset-x-0 top-0 z-10 h-0.5 bg-gradient-to-r from-primary/80 via-primary to-primary/40" />
                    ) : null}

                    <div className="flex h-full flex-col gap-3 p-3">
                      <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-muted">
                        <VehicleThumbnail
                          src={image}
                          listingId={listing.id}
                          alt={`${listing.make} ${listing.model}`}
                          className="h-full w-full object-cover"
                          placeholderClassName="flex h-full w-full items-center justify-center bg-muted text-[10px] font-medium text-muted-foreground"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
                        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
                          {isBestDeal ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-zinc-950/80 px-1.5 py-0.5 text-[11px] font-medium text-emerald-300 backdrop-blur-md">
                              <BadgeCheck className="h-2.5 w-2.5" />
                              Best deal
                            </span>
                          ) : null}
                          {isLowestPrice && !isBestDeal ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-zinc-950/80 px-1.5 py-0.5 text-[11px] font-medium text-zinc-100 backdrop-blur-md">
                              Lowest
                            </span>
                          ) : null}
                        </div>
                        <div className="absolute bottom-2 left-2 right-2">
                          {hasPrice ? (
                            <p className="truncate text-base font-bold tabular-nums leading-none text-white drop-shadow-sm">
                              {formatPrice(price)}
                            </p>
                          ) : (
                            <p className="text-[12px] font-medium text-white/80">
                              Price N/A
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="min-w-0 space-y-2">
                        <div>
                          <p className="truncate font-display text-[15px] font-semibold tracking-tight text-foreground">
                            {listing.make} {listing.model}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] font-medium text-muted-foreground">
                            {listing.year || "Year —"}
                            {listing.variant ? ` · ${listing.variant}` : ""}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-1.5 text-[10px] font-medium text-muted-foreground">
                          <span className="inline-flex items-center gap-1 rounded-full bg-card/80 px-1.5 py-0.5">
                            <Gauge className="h-2.5 w-2.5" />
                            {formatMileageCompact(mileage)}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-card/80 px-1.5 py-0.5">
                            <Fuel className="h-2.5 w-2.5" />
                            {formatToken(listing.fuel_type)}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-card/80 px-1.5 py-0.5">
                            <MapPin className="h-2.5 w-2.5" />
                            {listing.district || "—"}
                          </span>
                        </div>

                        <Link
                          to={`/listing/${listing.id}`}
                          className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-card text-[11px] font-semibold text-foreground no-underline transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary-bright"
                        >
                          Open listing
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Metric panels — tiles, not spreadsheet cells */}
            <div className="mt-2 space-y-4">
              {rowGroups.map((section, sectionIndex) => {
                const Icon = section.icon;
                return (
                  <motion.section
                    key={section.group}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + sectionIndex * 0.06, duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden rounded-2xl border border-border bg-surface/40 shadow-soft"
                  >
                    <div className="flex items-start justify-between gap-3 border-b border-border/70 px-4 py-3.5 md:px-5">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary-bright">
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <h3 className="font-display text-[15px] font-semibold tracking-tight text-foreground">
                            {section.label}
                          </h3>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{section.hint}</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 p-3 md:p-4">
                      {section.rows.map((row) => (
                        <div
                          key={row.key}
                          className="grid items-center gap-3"
                          style={{ gridTemplateColumns: columnTemplate }}
                        >
                          <div className="min-w-0 pr-1">
                            <p className="text-[12px] font-medium text-muted-foreground">
                              {row.label}
                            </p>
                          </div>

                          {listings.map((listing, index) => {
                            const isBest = bestByRow.get(row.key) === index;
                            return (
                              <div
                                key={`${row.key}-${listing.id}`}
                                className={cn(
                                  "relative min-h-[3.25rem] rounded-xl border px-3 py-2.5 text-sm transition-colors",
                                  isBest
                                    ? "border-primary/30 bg-primary/10 shadow-[inset_0_1px_0_0_hsl(var(--primary)/0.18)]"
                                    : "border-border/70 bg-card/70 text-foreground",
                                )}
                              >
                                <div className="flex h-full min-w-0 items-center justify-between gap-2">
                                  <span className="min-w-0 truncate font-medium">{row.render(listing)}</span>
                                  {isBest ? (
                                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/25 bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary-bright">
                                      <Trophy className="h-2.5 w-2.5" />
                                      Best
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </motion.section>
                );
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});

ComparisonModal.displayName = "ComparisonModal";

function VerdictChip({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: "primary" | "neutral";
}) {
  return (
    <div
      className={cn(
        "inline-flex max-w-full items-center gap-2 rounded-full border px-2.5 py-1.5",
        tone === "primary"
          ? "border-primary/25 bg-primary/10 text-primary-bright"
          : "border-border bg-surface/90 text-muted-foreground",
      )}
    >
      <span className="shrink-0 opacity-80">{icon}</span>
      <span className="shrink-0 text-[12px] font-medium">{label}</span>
      <span className="truncate text-[12px] font-semibold text-foreground">{value}</span>
    </div>
  );
}
