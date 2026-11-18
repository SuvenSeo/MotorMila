import { useMemo, useState } from "react";
import { ArrowRight, TrendingDown, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/services/api";
import type { TrendingModelInsight } from "@/types/car";

type BenchmarkProfile = {
  id: string;
  tab: string;
  make: string;
  model: string;
  subtitle: string;
  fallbackAds: number;
  fallbackMedianLkr: number;
  goodTargetFactor: number;
  bars: number[];
  greatIdx: number;
  midIdx: number;
  sources: { name: string; share: number }[];
};

const BENCHMARK_PROFILES: BenchmarkProfile[] = [
  {
    id: "aqua",
    tab: "Aqua",
    make: "Toyota",
    model: "Aqua",
    subtitle: "Toyota Aqua · Hybrid Hatchback",
    fallbackAds: 1842,
    fallbackMedianLkr: 8_750_000,
    goodTargetFactor: 0.92,
    bars: [18, 34, 62, 86, 100, 74, 44, 22, 12],
    greatIdx: 2,
    midIdx: 4,
    sources: [
      { name: "ikman", share: 0.49 },
      { name: "Riyasewana", share: 0.34 },
      { name: "AutoLanka", share: 0.11 },
      { name: "Others", share: 0.06 },
    ],
  },
  {
    id: "vezel",
    tab: "Vezel",
    make: "Honda",
    model: "Vezel",
    subtitle: "Honda Vezel · Hybrid Compact SUV",
    fallbackAds: 1859,
    fallbackMedianLkr: 17_498_000,
    goodTargetFactor: 0.91,
    bars: [12, 26, 52, 79, 100, 90, 58, 29, 14],
    greatIdx: 2,
    midIdx: 4,
    sources: [
      { name: "ikman", share: 0.52 },
      { name: "Riyasewana", share: 0.28 },
      { name: "AutoDirect", share: 0.12 },
      { name: "Others", share: 0.08 },
    ],
  },
  {
    id: "wagonr",
    tab: "Wagon R",
    make: "Suzuki",
    model: "Wagon",
    subtitle: "Suzuki Wagon R · Kei Hybrid",
    fallbackAds: 1922,
    fallbackMedianLkr: 7_608_000,
    goodTargetFactor: 0.91,
    bars: [20, 42, 74, 96, 100, 68, 36, 18, 9],
    greatIdx: 2,
    midIdx: 4,
    sources: [
      { name: "ikman", share: 0.50 },
      { name: "Riyasewana", share: 0.35 },
      { name: "Patpat", share: 0.09 },
      { name: "Others", share: 0.06 },
    ],
  },
  {
    id: "raize",
    tab: "Raize",
    make: "Toyota",
    model: "Raize",
    subtitle: "Toyota Raize · Subcompact SUV",
    fallbackAds: 1575,
    fallbackMedianLkr: 13_782_000,
    goodTargetFactor: 0.92,
    bars: [14, 30, 58, 84, 100, 76, 46, 20, 10],
    greatIdx: 2,
    midIdx: 4,
    sources: [
      { name: "ikman", share: 0.48 },
      { name: "SaleMe", share: 0.24 },
      { name: "Riyasewana", share: 0.18 },
      { name: "Others", share: 0.10 },
    ],
  },
  {
    id: "bajaj",
    tab: "Bajaj RE",
    make: "Bajaj",
    model: "RE",
    subtitle: "Bajaj RE · Islandwide Three-Wheeler",
    fallbackAds: 1942,
    fallbackMedianLkr: 1_080_000,
    goodTargetFactor: 0.87,
    bars: [24, 51, 86, 100, 84, 54, 29, 15, 7],
    greatIdx: 2,
    midIdx: 3,
    sources: [
      { name: "ikman", share: 0.47 },
      { name: "Riyasewana", share: 0.41 },
      { name: "Patpat", share: 0.07 },
      { name: "Others", share: 0.05 },
    ],
  },
];

function formatMillionsShort(lkr: number): string {
  if (!Number.isFinite(lkr) || lkr <= 0) return "—";
  if (lkr >= 1_000_000) return `${(lkr / 1_000_000).toFixed(1)}M`;
  return `${Math.round(lkr / 1_000)}K`;
}

type EvidenceHeroPanelProps = {
  trendingModels: TrendingModelInsight[];
  onFocusModel: (make: string, model?: string) => void;
};

export function EvidenceHeroPanel({ trendingModels, onFocusModel }: EvidenceHeroPanelProps) {
  const [selectedId, setSelectedId] = useState<string>("aqua");

  const active = useMemo(() => {
    const profile = BENCHMARK_PROFILES.find((p) => p.id === selectedId) ?? BENCHMARK_PROFILES[0];
    const liveMatch = trendingModels.find(
      (m) =>
        m.make.toLowerCase() === profile.make.toLowerCase() &&
        m.model.toLowerCase().includes(profile.model.toLowerCase()),
    );

    const ads = liveMatch?.listing_count && liveMatch.listing_count > 0 ? liveMatch.listing_count : profile.fallbackAds;
    const medianLkr = liveMatch?.avg_price_lkr && liveMatch.avg_price_lkr > 0 ? liveMatch.avg_price_lkr : profile.fallbackMedianLkr;
    const goodDealLkr = Math.round(medianLkr * profile.goodTargetFactor);
    const bandLow = Math.round(medianLkr * 0.88);
    const bandHigh = Math.round(medianLkr * 1.12);
    const movement = liveMatch?.movement_pct ?? null;

    const bucketFactors = [0.78, 0.85, profile.goodTargetFactor, 0.96, 1.0, 1.05, 1.11, 1.18, 1.26];
    const bucketLabels = bucketFactors.map((f) => formatMillionsShort(medianLkr * f));

    return {
      ...profile,
      ads,
      medianLkr,
      goodDealLkr,
      bandLow,
      bandHigh,
      movement,
      bucketLabels,
      filterModel: liveMatch?.model || profile.model,
    };
  }, [selectedId, trendingModels]);

  return (
    <div className="rounded-card border border-border bg-surface-1 p-5 shadow-e3 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="text-caption font-semibold uppercase tracking-caps text-label-2">
            Live Valuation Proof
          </p>
          <h2 className="mt-1 font-display text-title3 font-semibold text-foreground">
            {active.subtitle}
          </h2>
        </div>
        {active.movement !== null ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-caption font-semibold num",
              active.movement <= 0
                ? "border-deal-good/30 bg-deal-good/10 text-deal-good-text"
                : "border-deal-fair/30 bg-deal-fair/10 text-deal-fair-text",
            )}
          >
            {active.movement <= 0 ? (
              <TrendingDown className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <TrendingUp className="h-3.5 w-3.5" aria-hidden />
            )}
            {active.movement > 0 ? `+${active.movement.toFixed(1)}%` : `${active.movement.toFixed(1)}%`} 30d
          </span>
        ) : (
          <span className="rounded-full border border-deal-good/30 bg-deal-good/10 px-2.5 py-1 text-caption font-semibold text-deal-good-text">
            {Math.round((1 - active.goodTargetFactor) * 100)}% below ask target
          </span>
        )}
      </div>

      {/* Model selector pills */}
      <div className="mt-3.5 flex flex-wrap gap-1.5" role="group" aria-label="Benchmark vehicle presets">
        {BENCHMARK_PROFILES.map((p) => {
          const isOn = p.id === active.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedId(p.id)}
              aria-pressed={isOn}
              className={cn(
                "rounded-control px-3 py-1.5 text-caption font-semibold transition-colors",
                isOn
                  ? "bg-primary text-primary-foreground shadow-e1"
                  : "bg-surface-2 text-label-2 hover:text-foreground",
              )}
            >
              {p.tab}
            </button>
          );
        })}
      </div>

      {/* Key pricing summary */}
      <div className="mt-4 grid grid-cols-3 gap-3 rounded-card border border-border bg-surface-2/60 p-3.5">
        <div className="min-w-0">
          <p className="text-caption text-label-2">Typical ask</p>
          <p className="num mt-0.5 truncate text-body font-semibold text-foreground sm:text-callout">
            {formatPrice(active.medianLkr)}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-caption text-label-2">Good deal &le;</p>
          <p className="num mt-0.5 truncate text-body font-semibold text-deal-good-text sm:text-callout">
            {formatPrice(active.goodDealLkr)}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-caption text-label-2">Comps</p>
          <p className="num mt-0.5 text-body font-semibold text-foreground sm:text-callout">
            {active.ads.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Asking price histogram */}
      <div className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-caption text-label-2">
          <span>Asking price spread</span>
          <span className="num">
            Fair band:{" "}
            <strong className="font-semibold text-foreground">
              {formatMillionsShort(active.bandLow)} – {formatMillionsShort(active.bandHigh)}
            </strong>
          </span>
        </div>
        <div className="mt-3 flex h-28 items-end gap-1.5" aria-hidden>
          {active.bars.map((height, idx) => {
            const isGreat = idx <= active.greatIdx;
            const isMid = idx === active.midIdx;
            return (
              <div key={`${active.id}-${idx}`} className="flex flex-1 flex-col items-center gap-1.5">
                <div
                  className={cn(
                    "w-full rounded-t-control transition-ui duration-medium",
                    isGreat
                      ? "bg-deal-good"
                      : isMid
                        ? "bg-primary"
                        : "bg-foreground/15",
                  )}
                  style={{ height: `${height}%` }}
                />
                <span className="num text-caption text-label-3">
                  {idx % 2 === 0 ? active.bucketLabels[idx] : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sources + real filter actions */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3.5">
        <div className="flex flex-wrap gap-1.5">
          {active.sources.map((s) => (
            <span
              key={s.name}
              className="num rounded-control bg-surface-2 px-2 py-0.5 text-caption text-label-2"
            >
              {s.name}:{" "}
              <strong className="font-semibold text-foreground">
                {Math.round(active.ads * s.share).toLocaleString()}
              </strong>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/how-we-price"
            className="text-caption font-semibold text-primary no-underline hover:underline"
          >
            How we price
          </Link>
          <button
            type="button"
            onClick={() => onFocusModel(active.make, active.filterModel)}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-caption font-semibold text-primary transition-colors hover:bg-primary/20"
          >
            Filter {active.tab} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
