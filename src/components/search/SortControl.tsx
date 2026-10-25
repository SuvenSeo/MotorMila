import { useMemo } from "react";
import { ArrowDownUp } from "lucide-react";
import type { SortOption } from "@/types/car";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppPreferences } from "@/lib/appPreferences";
import { cn } from "@/lib/utils";

const SORTS: Array<{ value: SortOption; key: string; fallback: string; needsPrice?: boolean; pro?: boolean }> = [
  { value: "best_match", key: "search.sortBestMatch", fallback: "Best match" },
  { value: "newest", key: "filter.sortNewest", fallback: "Newest" },
  { value: "oldest", key: "filter.sortOldest", fallback: "Oldest" },
  { value: "price_asc", key: "search.sortPriceLow", fallback: "Price: low to high", needsPrice: true },
  { value: "price_desc", key: "search.sortPriceHigh", fallback: "Price: high to low", needsPrice: true },
  { value: "mileage_asc", key: "filter.sortLowMileage", fallback: "Low mileage" },
  { value: "deal_score", key: "filter.sortBestDeal", fallback: "Best deal", needsPrice: true, pro: true },
];

export interface SortControlProps {
  value: SortOption;
  onChange: (sort: SortOption) => void;
  /** "No price" inventory mode: price-based sorts make no sense. */
  priceUnavailable?: boolean;
  /** Deal-score sort is a Pro signal; hidden otherwise. */
  fullAccess?: boolean;
  className?: string;
}

/** Results-header sort picker. "Best match" ranks priced, photographed listings first — not paid placement. */
export function SortControl({ value, onChange, priceUnavailable = false, fullAccess = false, className }: SortControlProps) {
  const { t } = useAppPreferences();
  const options = useMemo(
    () =>
      SORTS.filter((o) => !(priceUnavailable && o.needsPrice) && !(o.pro && !fullAccess)).map((o) => ({
        value: o.value,
        label: t(o.key, o.fallback),
      })),
    [fullAccess, priceUnavailable, t],
  );
  const current = options.some((o) => o.value === value) ? value : "best_match";

  return (
    <Select value={current} onValueChange={(v) => onChange(v as SortOption)}>
      <SelectTrigger
        aria-label={t("filter.sortAria", "Sort listings")}
        title={current === "best_match" ? t("search.bestMatchHint", "Priced listings with photos first, then newest. Never paid placement.") : undefined}
        className={cn(
          "h-11 w-auto min-w-44 gap-2 rounded-full bg-surface-1 px-4 text-footnote font-semibold sm:h-9",
          className,
        )}
      >
        <ArrowDownUp aria-hidden className="h-4 w-4 shrink-0 text-label-2" />
        <span className="sr-only">{t("filter.sort", "Sort")}: </span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
