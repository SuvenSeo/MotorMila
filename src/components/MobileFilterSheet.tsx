import { useCallback, useEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue, type PanInfo } from "motion/react";
import { duration, ease, spring, useReducedMotionOrLowData } from "@/lib/motion";
import { FlowNumber } from "@/components/motion/FlowNumber";
import { cn } from "@/lib/utils";
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

  // ── Drag-to-dismiss: pull the grab bar / header down; release past 120px
  // (or flick) to close, otherwise spring back. Transform-only.
  const still = useReducedMotionOrLowData();
  const contentRef = useRef<HTMLDivElement>(null);
  const dragY = useMotionValue(0);
  const [dragClosed, setDragClosed] = useState(false);
  useEffect(
    () =>
      dragY.on("change", (v) => {
        if (contentRef.current) contentRef.current.style.transform = v ? `translateY(${v}px)` : "";
      }),
    [dragY],
  );
  useEffect(() => {
    if (open) {
      setDragClosed(false);
      dragY.jump(0);
    }
  }, [open, dragY]);
  const onPan = useCallback((_e: PointerEvent, info: PanInfo) => {
    // Rubber-band upward, follow the finger downward.
    const y = info.offset.y;
    dragY.set(y > 0 ? y : y * 0.15);
  }, [dragY]);
  const onPanEnd = useCallback((_e: PointerEvent, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) {
      const h = contentRef.current?.offsetHeight ?? window.innerHeight;
      setDragClosed(true);
      void animate(dragY, h, { duration: duration.medium, ease: ease.accelerate }).then(() => onOpenChange(false));
    } else {
      void animate(dragY, 0, spring.snappy);
    }
  }, [dragY, onOpenChange]);
  const panProps = still ? {} : { onPan, onPanEnd };

  const showLabel =
    count === undefined
      ? t("search.showResults", "Show results")
      : count === 0
        ? t("search.showNoResults", "No matches — adjust filters")
        : t("search.showNResults", "Show {n} results", { n: count.toLocaleString() });
  // Same sentence, with the number rolling (number-flow) between counts.
  const SENTINEL = "\u0000";
  const [showBefore, showAfter] =
    count !== undefined && count > 0
      ? t("search.showNResults", "Show {n} results", { n: SENTINEL }).split(SENTINEL)
      : [null, null];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        ref={contentRef}
        side="bottom"
        className={cn(
          "flex h-[92dvh] max-h-[92dvh] flex-col gap-0 rounded-t-2xl border-t border-border bg-card p-0 text-foreground",
          // Already slid off by the drag: skip the primitive's own exit slide.
          dragClosed && "data-[state=closed]:animate-none data-[state=closed]:duration-0",
        )}
      >
        {/* Grab bar — drag handle (pan gesture; motion.* for the pan feature). */}
        <motion.div
          {...panProps}
          aria-hidden
          className="flex shrink-0 cursor-grab touch-none justify-center pb-1 pt-2.5 active:cursor-grabbing"
        >
          <span className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </motion.div>
        <SheetHeader className="flex-row items-center justify-between space-y-0 border-b border-border px-5 pb-3 pt-1">
          <SheetTitle className="text-body font-semibold text-foreground">{t("filter.title", "Filters")}</SheetTitle>
          <SheetDescription className="sr-only">
            {t("search.drawerDescription", "Refine listings, then show results.")}
          </SheetDescription>
          <button
            type="button"
            onClick={clear}
            className="mr-8 min-h-11 rounded-full px-3 text-footnote font-medium text-muted-foreground transition-colors hover:text-foreground"
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
            aria-label={showLabel}
            className="num min-h-12 w-full rounded-xl bg-primary py-3 text-body font-bold text-primary-foreground shadow-soft transition-colors hover:bg-primary/95 active:scale-[0.99]"
          >
            {showBefore !== null && count !== undefined ? (
              <span aria-hidden>
                {showBefore}
                <FlowNumber value={count} label={count.toLocaleString()} />
                {showAfter}
              </span>
            ) : (
              showLabel
            )}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
