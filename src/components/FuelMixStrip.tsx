import { useQuery } from "@tanstack/react-query";
import { Zap } from "lucide-react";
import { getFuelMix, getHybridBands, formatPrice } from "@/services/api";
import type { FuelMixBucket, HybridBand } from "@/types/car";

const FUEL_COLORS: Record<string, { bar: string; badge: string; label: string }> = {
  petrol:   { bar: "bg-amber-400",    badge: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300",       label: "Petrol" },
  hybrid:   { bar: "bg-emerald-400",  badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300", label: "Hybrid" },
  electric: { bar: "bg-sky-400",      badge: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-300",             label: "Electric" },
  diesel:   { bar: "bg-slate-400",    badge: "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:border-slate-400/30 dark:bg-slate-400/10 dark:text-slate-300",  label: "Diesel" },
  other:    { bar: "bg-zinc-500",     badge: "border-zinc-500/30 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",                                                     label: "Other" },
};

function FuelBar({ buckets, total }: { buckets: FuelMixBucket[]; total: number }) {
  if (total === 0) return null;
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full" role="img" aria-label="Fuel type distribution bar">
      {buckets
        .filter((b) => b.count > 0)
        .map((b) => {
          const colors = FUEL_COLORS[b.fuel_type] ?? FUEL_COLORS.other;
          return (
            <div
              key={b.fuel_type}
              className={colors.bar}
              style={{ width: `${b.pct}%` }}
              title={`${colors.label}: ${b.pct}%`}
            />
          );
        })}
    </div>
  );
}

function FuelBadge({ bucket }: { bucket: FuelMixBucket }) {
  const colors = FUEL_COLORS[bucket.fuel_type] ?? FUEL_COLORS.other;
  if (bucket.count === 0) return null;
  return (
    <div className={`flex items-center gap-1.5 rounded-2xl border px-2.5 py-1.5 transition-colors ${colors.badge}`}>
      <span className="text-[11px] font-semibold">{colors.label}</span>
      <span className="num text-[10px] font-bold opacity-80">{bucket.pct}%</span>
      <span className="num text-[10px] opacity-60">({bucket.count.toLocaleString()})</span>
    </div>
  );
}

function HybridBandRow({ band, maxCount }: { band: HybridBand; maxCount: number }) {
  const widthPct = maxCount > 0 ? Math.round((band.count / maxCount) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-[11px] font-semibold text-foreground">{band.label}</span>
      <div className="relative h-5 flex-1 overflow-hidden rounded-full bg-emerald-500/10">
        <div
          className="h-full rounded-full bg-emerald-500/30 transition-all duration-500 ease-apple"
          style={{ width: `${widthPct}%` }}
        />
        <span className="absolute inset-0 flex items-center pl-2 num text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
          {band.count.toLocaleString()} listings
        </span>
      </div>
      <span className="w-28 shrink-0 text-right num text-[11px] text-muted-foreground">
        {band.median_price_lkr != null ? formatPrice(band.median_price_lkr) : "—"}
      </span>
    </div>
  );
}

export function FuelMixStrip() {
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
      className="rounded-2xl border border-border bg-surface p-5 shadow-soft transition-shadow duration-300 hover:shadow-soft-lg sm:p-6"
      aria-label="EV and hybrid market share"
    >
      <div className="mb-5 flex items-center gap-2">
        <Zap className="h-4 w-4 text-emerald-600/80 dark:text-emerald-400/80" />
        <div>
          <p className="text-[12px] font-medium text-muted-foreground">
            Fuel mix
          </p>
          <h2 className="text-sm font-semibold text-foreground">
            EV &amp; hybrid share tracker
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
              <FuelBar buckets={fuelMix.buckets} total={fuelMix.total} />
              <div className="flex flex-wrap gap-2">
                {fuelMix.buckets.map((b) => (
                  <FuelBadge key={b.fuel_type} bucket={b} />
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground num">
                {fuelMix.total.toLocaleString()} total listings
              </p>
            </>
          )}

          {fuelMix && fuelMix.total > 0 && !mixMeaningful && (
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Fuel-type classification is still in progress — only{" "}
              {Math.round(100 - otherPct)}% of listings are classified so far, so
              a mix chart would mislead. Hybrid bands below use verified data.
            </p>
          )}

          {hybridBands && hybridBands.total_hybrids > 0 && (
            <div className="mt-2 space-y-2 border-t border-border pt-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[12px] font-medium text-muted-foreground">
                  Hybrid engine bands
                </p>
                <p className="text-[10px] text-muted-foreground num">
                  {hybridBands.total_hybrids.toLocaleString()} hybrids
                </p>
              </div>
              <div className="mb-1 flex items-center gap-3">
                <span className="w-28 shrink-0 text-[10px] text-muted-foreground">Band</span>
                <span className="flex-1 text-[10px] text-muted-foreground">Listings</span>
                <span className="w-28 shrink-0 text-right text-[10px] text-muted-foreground">
                  Median price
                </span>
              </div>
              {hybridBands.bands.map((band) => (
                <HybridBandRow key={band.label} band={band} maxCount={maxBandCount} />
              ))}
            </div>
          )}

          {!fuelMix?.total && !hybridBands?.total_hybrids && (
            <p className="text-sm text-muted-foreground">
              Fuel-type data will appear here once listings are classified.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
