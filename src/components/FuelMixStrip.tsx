import { useQuery } from "@tanstack/react-query";
import { Zap } from "lucide-react";
import { getFuelMix, getHybridBands, formatPrice } from "@/services/api";
import type { FuelMixBucket, HybridBand } from "@/types/car";
import { useAppPreferences } from "@/lib/appPreferences";
import type { TranslateFn } from "@/lib/translate";

const FUEL_COLORS: Record<string, { bar: string; badge: string; label: readonly [string, string] }> = {
  petrol:   { bar: "bg-deal-caution",    badge: "border-deal-caution/30 bg-deal-caution/10 text-deal-caution-text dark:border-deal-caution/30 dark:bg-deal-caution/10 dark:text-deal-caution-text",       label: ["fuel.petrol", "Petrol"] },
  hybrid:   { bar: "bg-deal-good",  badge: "border-deal-good/30 bg-deal-good/10 text-deal-good-text dark:border-deal-good/30 dark:bg-deal-good/10 dark:text-deal-good-text", label: ["fuel.hybrid", "Hybrid"] },
  electric: { bar: "bg-primary",      badge: "border-primary/30 bg-primary/10 text-primary dark:border-primary/30 dark:bg-primary/10 dark:text-primary",             label: ["fuel.electric", "Electric"] },
  diesel:   { bar: "bg-muted-foreground",    badge: "border-border bg-muted-foreground/10 text-foreground dark:border-border dark:bg-muted-foreground/10 dark:text-muted-foreground",  label: ["fuel.diesel", "Diesel"] },
  other:    { bar: "bg-muted-foreground",     badge: "border-border bg-muted-foreground/10 text-foreground dark:text-muted-foreground",                                                     label: ["fuelMix.other", "Other"] },
};

function FuelBar({ buckets, total, t }: { buckets: FuelMixBucket[]; total: number; t: TranslateFn }) {
  if (total === 0) return null;
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full" role="img" aria-label={t("fuelMix.barAria", "Fuel type distribution bar")}>
      {buckets
        .filter((b) => b.count > 0)
        .map((b) => {
          const colors = FUEL_COLORS[b.fuel_type] ?? FUEL_COLORS.other;
          return (
            <div
              key={b.fuel_type}
              className={colors.bar}
              style={{ width: `${b.pct}%` }}
              title={`${t(...colors.label)}: ${b.pct}%`}
            />
          );
        })}
    </div>
  );
}

function FuelBadge({ bucket, t }: { bucket: FuelMixBucket; t: TranslateFn }) {
  const colors = FUEL_COLORS[bucket.fuel_type] ?? FUEL_COLORS.other;
  if (bucket.count === 0) return null;
  return (
    <div className={`flex items-center gap-1.5 rounded-2xl border px-2.5 py-1.5 transition-colors ${colors.badge}`}>
      <span className="text-caption font-semibold">{t(...colors.label)}</span>
      <span className="num text-caption font-bold opacity-80">{bucket.pct}%</span>
      <span className="num text-caption opacity-60">({bucket.count.toLocaleString()})</span>
    </div>
  );
}

function HybridBandRow({ band, maxCount, t }: { band: HybridBand; maxCount: number; t: TranslateFn }) {
  const widthPct = maxCount > 0 ? Math.round((band.count / maxCount) * 100) : 0;
  // Phone: band + median on one line, the bar full width below it, so the
  // "N listings" label never has to squeeze between two fixed columns.
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 sm:flex sm:gap-3">
      <span className="text-caption font-semibold text-foreground sm:w-28 sm:shrink-0">{band.label}</span>
      <span className="text-right num text-caption text-muted-foreground sm:order-last sm:w-28 sm:shrink-0">
        {band.median_price_lkr != null ? formatPrice(band.median_price_lkr) : "—"}
      </span>
      <div className="relative col-span-2 h-5 min-w-0 overflow-hidden rounded-full bg-deal-good/10 sm:flex-1">
        <div
          className="h-full rounded-full bg-deal-good/30 transition-ui duration-long ease-decelerate"
          style={{ width: `${widthPct}%` }}
        />
        <span className="absolute inset-0 flex items-center whitespace-nowrap pl-2 num text-caption font-semibold text-deal-good-text">
          {t("fuelMix.bandListings", "{n} listings", { n: band.count.toLocaleString() })}
        </span>
      </div>
    </div>
  );
}

export function FuelMixStrip() {
  const { t } = useAppPreferences();
  const fuelMixQuery = useQuery({
    queryKey: ["fuel-mix"],
    queryFn: getFuelMix,
    staleTime: 10 * 60_000,
    retry: 1,
  });

  const hybridBandsQuery = useQuery({
    queryKey: ["hybrid-bands"],
    queryFn: getHybridBands,
    staleTime: 10 * 60_000,
    retry: 1,
  });

  if (fuelMixQuery.isError && hybridBandsQuery.isError) return null;

  const isLoading = fuelMixQuery.isPending || hybridBandsQuery.isPending;
  const fuelMix = fuelMixQuery.data;
  const hybridBands = hybridBandsQuery.data;
  const maxBandCount = hybridBands
    ? Math.max(...hybridBands.bands.map((b) => b.count), 1)
    : 1;
  // When the unclassified ("other") share dominates, the mix bar is
  // meaningless — show an honest "classification in progress" note instead of
  // a 95% "Other" bar. Hybrid bands are real data and stay visible.
  const otherBucket = fuelMix?.buckets.find((b) => b.fuel_type === "other");
  const otherPct = otherBucket && fuelMix && fuelMix.total > 0
    ? (otherBucket.count / fuelMix.total) * 100
    : 0;
  const mixMeaningful = !fuelMix || fuelMix.total === 0 || otherPct <= 70;

  return (
    <section
      className="rounded-2xl border border-border bg-surface p-5 shadow-soft transition-shadow duration-medium hover:shadow-soft-lg sm:p-6"
      aria-label={t("fuelMix.aria", "EV and hybrid market share")}
    >
      <div className="mb-5 flex items-center gap-2">
        <Zap className="h-4 w-4 text-deal-good-text/80" />
        <div>
          <p className="text-caption font-medium text-muted-foreground">
            {t("fuelMix.eyebrow", "Fuel mix")}
          </p>
          <h2 className="text-footnote font-semibold text-foreground">
            {t("fuelMix.title", "EV & hybrid share tracker")}
          </h2>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <div className="h-2.5 animate-pulse rounded-full bg-border" />
          <div className="flex gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-7 w-20 animate-pulse rounded-2xl bg-border" />
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {fuelMix && fuelMix.total > 0 && mixMeaningful && (
            <>
              <FuelBar buckets={fuelMix.buckets} total={fuelMix.total} t={t} />
              <div className="flex flex-wrap gap-2">
                {fuelMix.buckets.map((b) => (
                  <FuelBadge key={b.fuel_type} bucket={b} t={t} />
                ))}
              </div>
              <p className="text-caption text-muted-foreground num">
                {t("fuelMix.totalListings", "{n} total listings", { n: fuelMix.total.toLocaleString() })}
              </p>
            </>
          )}

          {fuelMix && fuelMix.total > 0 && !mixMeaningful && (
            <p className="text-caption leading-relaxed text-muted-foreground">
              {t(
                "fuelMix.classifying",
                "Fuel-type classification is still in progress — only {pct}% of listings are classified so far, so a mix chart would mislead. Hybrid bands below use verified data.",
                { pct: Math.round(100 - otherPct) },
              )}
            </p>
          )}

          {hybridBands && hybridBands.total_hybrids > 0 && (
            <div className="mt-2 space-y-2 border-t border-border pt-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-caption font-medium text-muted-foreground">
                  {t("fuelMix.hybridBands", "Hybrid engine bands")}
                </p>
                <p className="text-caption text-muted-foreground num">
                  {t("fuelMix.hybridsCount", "{n} hybrids", { n: hybridBands.total_hybrids.toLocaleString() })}
                </p>
              </div>
              <div className="mb-1 grid grid-cols-[1fr_auto] items-center gap-x-3 sm:flex sm:gap-3">
                <span className="text-caption text-muted-foreground sm:w-28 sm:shrink-0">{t("fuelMix.band", "Band")}</span>
                <span className="hidden flex-1 text-caption text-muted-foreground sm:block">{t("fuelMix.listings", "Listings")}</span>
                <span className="text-right text-caption text-muted-foreground sm:w-28 sm:shrink-0">
                  {t("fuelMix.medianPrice", "Median price")}
                </span>
              </div>
              {hybridBands.bands.map((band) => (
                <HybridBandRow key={band.label} band={band} maxCount={maxBandCount} t={t} />
              ))}
            </div>
          )}

          {!fuelMix?.total && !hybridBands?.total_hybrids && (
            <p className="text-footnote text-muted-foreground">
              {t("fuelMix.empty", "Fuel-type data will appear here once listings are classified.")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
