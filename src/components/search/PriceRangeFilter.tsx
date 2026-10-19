import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { FilterState } from "@/types/car";
import { getListingPriceSample, getListings } from "@/services/api";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { useAppPreferences } from "@/lib/appPreferences";
import { formatLkrCompact, groupThousands } from "@/lib/price";
import { formatPriceInputDisplay, parsePriceInput } from "@/lib/priceParse";
import {
  PRICE_STEP_LAST_INDEX,
  PRICE_STEP_MAX,
  PRICE_STEP_MIN,
  buildPriceHistogram,
  priceToStepIndex,
  stepIndexToPrice,
} from "@/lib/priceSteps";
import { QUERY_STALE } from "@/lib/queryPolicy";
import { cn } from "@/lib/utils";

/** Local-step presets (lakhs first, Mn above 100 L). */
const PRESETS: Array<{ key: string; fallback: string; min?: number; max?: number }> = [
  { key: "search.presetUnder30L", fallback: "Under 30 L", max: 3_000_000 },
  { key: "search.preset30to50L", fallback: "30–50 L", min: 3_000_000, max: 5_000_000 },
  { key: "search.preset50to75L", fallback: "50–75 L", min: 5_000_000, max: 7_500_000 },
  { key: "search.preset75to100L", fallback: "75–100 L", min: 7_500_000, max: 10_000_000 },
  { key: "search.preset10MnPlus", fallback: "10 Mn+", min: 10_000_000 },
];

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

function inputText(value: number | undefined): string {
  return value ? groupThousands(value) : "";
}

export interface PriceRangeFilterProps {
  filters: FilterState;
  /** Commit a new range; undefined means "no bound". */
  onCommit: (min: number | undefined, max: number | undefined) => void;
  /** Larger touch targets for the mobile drawer. */
  touch?: boolean;
}

/**
 * Price filter: mini histogram of prices in the current results (a sample of
 * up to 100 recent matches), a lakh-stepped range slider, a live count while
 * dragging, and text boxes that accept "85L", "8.5Mn", "Rs 7,250,000".
 */
export function PriceRangeFilter({ filters, onCommit, touch = false }: PriceRangeFilterProps) {
  const { t } = useAppPreferences();
  const [range, setRange] = useState<[number, number]>(() => [
    priceToStepIndex(filters.price_min, "min"),
    priceToStepIndex(filters.price_max, "max"),
  ]);
  const [minText, setMinText] = useState(inputText(filters.price_min));
  const [maxText, setMaxText] = useState(inputText(filters.price_max));
  const [inputError, setInputError] = useState<string | null>(null);
  // Raw draft bounds: typed values are exact, slider values snap to steps.
  const [draft, setDraft] = useState<{ min?: number; max?: number }>({ min: filters.price_min, max: filters.price_max });

  useEffect(() => {
    setRange([priceToStepIndex(filters.price_min, "min"), priceToStepIndex(filters.price_max, "max")]);
    setMinText(inputText(filters.price_min));
    setMaxText(inputText(filters.price_max));
    setDraft({ min: filters.price_min, max: filters.price_max });
    setInputError(null);
  }, [filters.price_min, filters.price_max]);

  // Histogram sample: every filter except price/sort/page.
  const sampleKey = useMemo(
    () => ({ ...filters, price_min: undefined, price_max: undefined, page: 1, sort: undefined }),
    [filters],
  );
  const sampleQuery = useQuery({
    queryKey: ["listing-price-sample", sampleKey],
    queryFn: () => getListingPriceSample({ ...filters, page: 1 }),
    staleTime: QUERY_STALE.listings,
    placeholderData: keepPreviousData,
  });
  const histogram = useMemo(() => buildPriceHistogram(sampleQuery.data?.prices ?? []), [sampleQuery.data]);
  const histMax = Math.max(1, ...histogram);
  const sampleSize = sampleQuery.data?.prices.length ?? 0;

  // Live result count for the draft range (debounced; shares the feed's cache key).
  const draftFilters = useMemo<FilterState>(
    () => ({ ...filters, price_min: draft.min, price_max: draft.max, page: 1 }),
    [draft.max, draft.min, filters],
  );
  const debouncedDraft = useDebounced(draftFilters, 300);
  const countQuery = useQuery({
    queryKey: ["listings", debouncedDraft],
    queryFn: () => getListings(debouncedDraft),
    staleTime: QUERY_STALE.listings,
    placeholderData: keepPreviousData,
  });
  const liveCount = countQuery.data?.total;

  const commit = (min: number | undefined, max: number | undefined) => {
    let lo = min;
    let hi = max;
    if (lo !== undefined && hi !== undefined && lo > hi) [lo, hi] = [hi, lo];
    if (lo !== undefined && lo <= PRICE_STEP_MIN) lo = undefined;
    if (hi !== undefined && hi >= PRICE_STEP_MAX) hi = undefined;
    setDraft({ min: lo, max: hi });
    onCommit(lo, hi);
  };

  const commitInputs = () => {
    const min = minText.trim() ? parsePriceInput(minText) : undefined;
    const max = maxText.trim() ? parsePriceInput(maxText) : undefined;
    if (min === null || max === null) {
      setInputError(t("search.priceInputError", "Try 85L, 8.5Mn or 7,250,000"));
      return;
    }
    setInputError(null);
    setMinText(inputText(min));
    setMaxText(inputText(max));
    if (min === filters.price_min && max === filters.price_max) return;
    commit(min, max);
  };

  const inputClass = cn(
    "num rounded-full border-transparent bg-surface/70 text-base text-foreground md:text-sm",
    touch ? "h-11" : "h-9",
  );
  const loLabel = draft.min ? formatLkrCompact(draft.min) : t("search.anyMin", "No min");
  const hiLabel = draft.max ? formatLkrCompact(draft.max) : t("search.anyMax", "No max");

  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="num text-caption font-medium text-foreground">
          {loLabel} – {hiLabel}
        </p>
        <p className="num text-caption text-muted-foreground" aria-live="polite">
          {liveCount === undefined
            ? "\u00a0"
            : t("search.resultsInRange", "{n} listings", { n: liveCount.toLocaleString() })}
        </p>
      </div>

      {sampleSize >= 8 ? (
        <div aria-hidden className="flex h-10 items-end gap-px px-2.5" data-testid="price-histogram">
          {histogram.map((count, i) => {
            const inRange = i >= range[0] && i < Math.max(range[1], range[0] + 1);
            return (
              <div
                key={i}
                className={cn("flex-1 rounded-t-sm", inRange ? "bg-primary/55" : "bg-muted-foreground/20")}
                style={{ height: `${count === 0 ? 0 : Math.max(8, (count / histMax) * 100)}%` }}
              />
            );
          })}
        </div>
      ) : null}

      <Slider
        thumbLabels={[t("filter.minPriceSlider", "Minimum price slider"), t("filter.maxPriceSlider", "Maximum price slider")]}
        min={0}
        max={PRICE_STEP_LAST_INDEX}
        step={1}
        minStepsBetweenThumbs={1}
        value={range}
        onValueChange={(value) => {
          const next: [number, number] = [value[0] ?? 0, value[1] ?? PRICE_STEP_LAST_INDEX];
          setRange(next);
          const lo = next[0] === 0 ? undefined : stepIndexToPrice(next[0]);
          const hi = next[1] === PRICE_STEP_LAST_INDEX ? undefined : stepIndexToPrice(next[1]);
          setDraft({ min: lo, max: hi });
          setMinText(inputText(lo));
          setMaxText(inputText(hi));
        }}
        onValueCommit={(value) => {
          const lo = (value[0] ?? 0) === 0 ? undefined : stepIndexToPrice(value[0]);
          const hi = (value[1] ?? PRICE_STEP_LAST_INDEX) === PRICE_STEP_LAST_INDEX ? undefined : stepIndexToPrice(value[1]);
          commit(lo, hi);
        }}
        className="py-1 [&>span:first-child]:h-2"
      />

      {sampleSize >= 8 ? (
        <p className="text-[11px] text-muted-foreground">
          {t("search.histogramNote", "Bars: asking prices of {n} recent matches", { n: sampleSize })}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("filter.pricePresetsAria", "Price range presets")}>
        {PRESETS.map((preset) => {
          const active = filters.price_min === preset.min && filters.price_max === preset.max;
          return (
            <button
              key={preset.key}
              type="button"
              aria-pressed={active}
              onClick={() => (active ? commit(undefined, undefined) : commit(preset.min, preset.max))}
              className={cn(
                "rounded-full border px-3 text-caption font-medium transition-colors active:scale-[0.97]",
                touch ? "min-h-11 py-2" : "py-1",
                active
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-transparent bg-surface/70 text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {t(preset.key, preset.fallback)}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Input
          value={minText}
          onChange={(event) => {
            setMinText(formatPriceInputDisplay(event.target.value));
            setInputError(null);
          }}
          onBlur={commitInputs}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitInputs();
            }
          }}
          inputMode="text"
          autoComplete="off"
          placeholder={t("search.minPricePlaceholder", "Min e.g. 50L")}
          aria-label={t("filter.minPriceAria", "Minimum price")}
          aria-invalid={Boolean(inputError)}
          className={inputClass}
        />
        <Input
          value={maxText}
          onChange={(event) => {
            setMaxText(formatPriceInputDisplay(event.target.value));
            setInputError(null);
          }}
          onBlur={commitInputs}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitInputs();
            }
          }}
          inputMode="text"
          autoComplete="off"
          placeholder={t("search.maxPricePlaceholder", "Max e.g. 8.5Mn")}
          aria-label={t("filter.maxPriceAria", "Maximum price")}
          aria-invalid={Boolean(inputError)}
          className={inputClass}
        />
      </div>
      {inputError ? (
        <p role="alert" className="text-[11px] font-medium text-destructive">
          {inputError}
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">{t("search.priceInputHint", "Type 85L, 8.5Mn or Rs 7,250,000")}</p>
      )}
    </div>
  );
}
