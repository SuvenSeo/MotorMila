import { useCallback, useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { FilterState } from "@/types/car";
import { getListings } from "@/services/api";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FilterPanel } from "@/components/FilterSidebar";
import { useAppPreferences } from "@/lib/appPreferences";
import { QUERY_STALE } from "@/lib/queryPolicy";
import { EMPTY_FILTERS } from "@/lib/searchUrlState";

export interface MobileFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/**
 * Mobile filter drawer: the full filter set (same panel as the desktop
 * sidebar) edited as a draft, with a sticky "Show N results" button that
 * counts the draft live. Nothing touches the URL until the user applies, so
 * one apply = one Back step.
 */
export function MobileFilterSheet({ open, onOpenChange, filters, onFiltersChange }: MobileFilterSheetProps) {
  const { t } = useAppPreferences();
  const [draft, setDraft] = useState<FilterState>(filters);

  useEffect(() => {
    if (open) setDraft(filters);
  }, [open, filters]);

  const debouncedDraft = useDebounced({ ...draft, page: 1 }, 250);
  const countQuery = useQuery({
    queryKey: ["listings", debouncedDraft],
    queryFn: () => getListings(debouncedDraft),
    enabled: open,
    staleTime: QUERY_STALE.listings,
    placeholderData: keepPreviousData,
  });
  const count = countQuery.data?.total;

  const apply = useCallback(() => {
    onFiltersChange({ ...draft, page: 1 });
    onOpenChange(false);
  }, [draft, onFiltersChange, onOpenChange]);

  const clear = useCallback(() => setDraft({ ...EMPTY_FILTERS }), []);

  const showLabel =
    count === undefined
      ? t("search.showResults", "Show results")
      : count === 0
        ? t("search.showNoResults", "No matches — adjust filters")
        : t("search.showNResults", "Show {n} results", { n: count.toLocaleString() });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex h-[92dvh] max-h-[92dvh] flex-col gap-0 rounded-t-2xl border-t border-border bg-card p-0 text-foreground"
      >
        <SheetHeader className="flex-row items-center justify-between space-y-0 border-b border-border px-5 py-3">
          <SheetTitle className="text-base font-semibold text-foreground">{t("filter.title", "Filters")}</SheetTitle>
          <SheetDescription className="sr-only">
            {t("search.drawerDescription", "Refine listings, then show results.")}
          </SheetDescription>
          <button
            type="button"
            onClick={clear}
            className="mr-8 min-h-11 rounded-full px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            aria-label={t("filter.clearAllAria", "Clear all filters")}
          >
            {t("common.clearAll", "Clear all")}
          </button>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <FilterPanel filters={draft} onFiltersChange={setDraft} touch />
        </div>

        <div
          className="sticky bottom-0 z-10 border-t border-border bg-card/95 px-5 pt-3 backdrop-blur-md"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            onClick={apply}
            aria-live="polite"
            className="num min-h-12 w-full rounded-xl bg-primary py-3 text-[14px] font-bold text-primary-foreground shadow-soft transition-colors hover:bg-primary/95 active:scale-[0.99]"
          >
            {showLabel}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
