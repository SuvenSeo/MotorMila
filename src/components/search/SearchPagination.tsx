import { ChevronLeft, ChevronRight } from "lucide-react";
import { m } from "motion/react";
import { useAppPreferences } from "@/lib/appPreferences";
import { cn } from "@/lib/utils";
import { paginationItems } from "@/lib/searchSuggestions";
import { Button } from "@/components/ui/button";
import { spring, useReducedMotionOrLowData } from "@/lib/motion";

export interface SearchPaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

/** Results pages: range caption + prev / numbered / next (kit Buttons). The current page carries a pill that slides between numbers. */
export function SearchPagination({ page, totalPages, total, pageSize, onPageChange }: SearchPaginationProps) {
  const { t } = useAppPreferences();
  const calm = useReducedMotionOrLowData();
  if (totalPages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const square = "h-11 min-w-11 px-0 sm:h-9 sm:min-w-9";

  return (
    <nav
      aria-label={t("search.paginationAria", "Results pages")}
      className="mt-10 flex flex-col items-center gap-3 border-t border-separator pt-6 sm:flex-row sm:justify-between"
    >
      <p className="num text-footnote text-label-2">
        {t("search.showingRange", "{from}–{to} of {total}", {
          from: from.toLocaleString(),
          to: to.toLocaleString(),
          total: total.toLocaleString(),
        })}
      </p>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label={t("search.prevPage", "Previous page")}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className={square}
        >
          <ChevronLeft aria-hidden />
        </Button>
        {paginationItems(page, totalPages).map((item, i) =>
          item === "gap" ? (
            <span key={`gap-${i}`} aria-hidden className="hidden px-1 text-label-2 sm:inline">
              …
            </span>
          ) : (
            <Button
              key={item}
              type="button"
              variant="ghost"
              aria-current={item === page ? "page" : undefined}
              aria-label={t("search.pageN", "Page {n}", { n: item })}
              onClick={() => onPageChange(item)}
              className={cn(
                square,
                "num relative px-2 font-semibold",
                item === page ? "text-primary-foreground hover:bg-transparent hover:text-primary-foreground" : "hidden text-label-2 sm:inline-flex",
              )}
            >
              {item === page ? (
                <m.span
                  layoutId="search-page-pill"
                  aria-hidden
                  className="absolute inset-0 rounded-full bg-primary shadow-e1"
                  transition={calm ? { duration: 0 } : spring.snappy}
                />
              ) : null}
              <span className="relative">{item}</span>
            </Button>
          ),
        )}
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label={t("search.nextPage", "Next page")}
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className={square}
        >
          <ChevronRight aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
