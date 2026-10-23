import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAppPreferences } from "@/lib/appPreferences";
import { cn } from "@/lib/utils";
import { paginationItems } from "@/lib/searchSuggestions";

export interface SearchPaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export function SearchPagination({ page, totalPages, total, pageSize, onPageChange }: SearchPaginationProps) {
  const { t } = useAppPreferences();
  if (totalPages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const btn =
    "flex h-11 min-w-11 items-center justify-center rounded-full border border-border px-2 text-footnote font-medium text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-30 sm:h-9 sm:min-w-9";

  return (
    <nav
      aria-label={t("search.paginationAria", "Results pages")}
      className="mt-8 flex flex-col items-center gap-3 border-t border-border pt-6 sm:flex-row sm:justify-between"
    >
      <p className="text-caption text-muted-foreground">
        {t("search.showingRange", "{from}–{to} of {total}", {
          from: from.toLocaleString(),
          to: to.toLocaleString(),
          total: total.toLocaleString(),
        })}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={t("search.prevPage", "Previous page")}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className={btn}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {paginationItems(page, totalPages).map((item, i) =>
          item === "gap" ? (
            <span key={`gap-${i}`} aria-hidden className="hidden px-1 text-muted-foreground sm:inline">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              aria-current={item === page ? "page" : undefined}
              aria-label={t("search.pageN", "Page {n}", { n: item })}
              onClick={() => onPageChange(item)}
              className={cn(btn, "num", item === page ? "border-primary/40 bg-primary/10 font-semibold text-primary-bright" : "hidden sm:flex")}
            >
              {item}
            </button>
          ),
        )}
        <button
          type="button"
          aria-label={t("search.nextPage", "Next page")}
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className={btn}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}
