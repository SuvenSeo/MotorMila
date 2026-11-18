import { m, motion } from "motion/react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice, type ListingSearchSuggestion } from "@/services/api";
import { isReasonableListingPrice } from "@/lib/formatting";
import { press, spring } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { FilterState } from "@/types/car";

export type HeroPopularScan = {
  readonly label: string;
  readonly make: string;
  readonly model: string;
};

export type HeroCategoryItem = {
  readonly value: string;
  readonly labelKey: string;
  readonly fallback: string;
};

type HeroSearchBarProps = {
  tone: "dark" | "light";
  heroSearch: string;
  setHeroSearch: (val: string) => void;
  heroSuggestions: ListingSearchSuggestion[];
  setHeroSuggestions: (val: ListingSearchSuggestion[]) => void;
  heroSuggestionsOpen: boolean;
  setHeroSuggestionsOpen: (val: boolean) => void;
  heroFocused: boolean;
  setHeroFocused: (val: boolean) => void;
  heroSuggestionsLoading: boolean;
  heroActiveIdx: number;
  setHeroActiveIdx: React.Dispatch<React.SetStateAction<number>>;
  heroSearchMessage: string | null;
  setHeroSearchMessage: (val: string | null) => void;
  filters: FilterState;
  motionStill: boolean;
  popularScans: readonly HeroPopularScan[];
  categories: readonly HeroCategoryItem[];
  applyHeroSuggestion: (s: ListingSearchSuggestion) => void;
  runHeroSearch: () => void;
  focusModel: (make: string, model?: string) => void;
  browseCategory: (cat: string) => void;
  t: (key: string, fallback?: string) => string;
  compact?: boolean;
};

export function HeroSearchBar({
  tone,
  heroSearch,
  setHeroSearch,
  heroSuggestions,
  setHeroSuggestions,
  heroSuggestionsOpen,
  setHeroSuggestionsOpen,
  heroFocused,
  setHeroFocused,
  heroSuggestionsLoading,
  heroActiveIdx,
  setHeroActiveIdx,
  heroSearchMessage,
  setHeroSearchMessage,
  filters,
  motionStill,
  popularScans,
  categories,
  applyHeroSuggestion,
  runHeroSearch,
  focusModel,
  browseCategory,
  t,
  compact = false,
}: HeroSearchBarProps) {
  const heroQuery = heroSearch.trim();
  const showHeroPopular = heroSuggestionsOpen && heroQuery.length === 0;
  const showHeroSuggestions = (heroSuggestionsOpen || heroSuggestionsLoading) && heroQuery.length > 0;
  const isDark = tone === "dark";

  return (
    <div className={cn("w-full max-w-xl", compact ? "mt-5" : "mt-7")}>
      <div className="relative">
        <m.div
          animate={{ scale: heroFocused && !motionStill ? 1.01 : 1 }}
          transition={spring.smooth}
          className={cn(
            "mm-hero-search",
            isDark ? "mm-hero-search--dark" : "mm-hero-search--light",
          )}
        >
          <div className="flex items-center gap-2 p-1.5">
            <Search
              aria-hidden
              className={cn(
                "ml-3 h-5 w-5 shrink-0",
                isDark ? "text-label-2" : "text-muted-foreground",
              )}
            />
            <label htmlFor="hero-search" className="sr-only">
              {t("common.search", "Search")} vehicles
            </label>
            <input
              id="hero-search"
              value={heroSearch}
              onChange={(e) => {
                setHeroSearch(e.target.value);
                setHeroSuggestions([]);
                setHeroSearchMessage(null);
                setHeroActiveIdx(-1);
              }}
              onFocus={() => {
                setHeroSuggestionsOpen(true);
                setHeroFocused(true);
              }}
              onBlur={() => {
                setHeroFocused(false);
                window.setTimeout(() => {
                  setHeroSuggestionsOpen(false);
                  setHeroActiveIdx(-1);
                }, 120);
              }}
              onKeyDown={(e) => {
                if (showHeroPopular) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setHeroActiveIdx((i) => (i + 1) % popularScans.length);
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setHeroActiveIdx((i) => (i <= 0 ? popularScans.length - 1 : i - 1));
                  } else if (e.key === "Escape") {
                    setHeroSuggestionsOpen(false);
                    setHeroActiveIdx(-1);
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    const pick = heroActiveIdx >= 0 ? popularScans[heroActiveIdx] : null;
                    if (pick) {
                      setHeroSearch(pick.label);
                      setHeroSuggestionsOpen(false);
                      focusModel(pick.make, pick.model);
                    } else {
                      runHeroSearch();
                    }
                  }
                  return;
                }
                if (e.key === "ArrowDown" && heroSuggestions.length) {
                  e.preventDefault();
                  setHeroSuggestionsOpen(true);
                  setHeroActiveIdx((i) => (i + 1) % heroSuggestions.length);
                } else if (e.key === "ArrowUp" && heroSuggestions.length) {
                  e.preventDefault();
                  setHeroActiveIdx((i) => (i <= 0 ? heroSuggestions.length - 1 : i - 1));
                } else if (e.key === "Escape") {
                  setHeroSuggestionsOpen(false);
                  setHeroActiveIdx(-1);
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  if (heroActiveIdx >= 0 && heroSuggestions[heroActiveIdx]) {
                    applyHeroSuggestion(heroSuggestions[heroActiveIdx]);
                  } else {
                    runHeroSearch();
                  }
                }
              }}
              placeholder="Aqua, Vezel, Wagon R, Colombo…"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="none"
              role="combobox"
              aria-expanded={showHeroSuggestions || showHeroPopular}
              aria-controls="hero-suggestions"
              aria-autocomplete="list"
              aria-activedescendant={heroActiveIdx >= 0 ? `hero-suggestion-${heroActiveIdx}` : undefined}
              type="search"
              enterKeyHint="search"
              className="h-12 min-w-0 flex-1 bg-transparent text-body font-semibold text-foreground outline-none placeholder:text-label-3 [&::-webkit-search-cancel-button]:hidden"
            />
            <Button type="button" onClick={runHeroSearch} size="md" className="h-11 rounded-full px-5 text-footnote font-semibold">
              {t("common.search", "Search")}
            </Button>
          </div>
        </m.div>

        {showHeroPopular ? (
          <div
            id="hero-suggestions"
            role="listbox"
            className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-card border border-border bg-popover p-1.5 shadow-e3"
          >
            <p className="px-3 py-2 text-caption font-semibold text-muted-foreground">
              {t("home.popular", "Popular")}
            </p>
            {popularScans.map((item, idx) => (
              <button
                key={item.label}
                type="button"
                role="option"
                id={`hero-suggestion-${idx}`}
                aria-selected={idx === heroActiveIdx}
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setHeroSearch(item.label);
                  setHeroSuggestionsOpen(false);
                  focusModel(item.make, item.model);
                }}
                className={cn(
                  "w-full rounded-control px-3 py-2.5 text-left text-footnote font-medium text-popover-foreground transition-colors hover:bg-surface",
                  idx === heroActiveIdx && "bg-surface",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}

        {showHeroSuggestions ? (
          <div
            id="hero-suggestions"
            role="listbox"
            className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-card border border-border bg-popover p-1.5 shadow-e3"
          >
            {heroSuggestionsLoading ? (
              <p className="px-3 py-2 text-caption text-muted-foreground">{t("common.searching", "Searching...")}</p>
            ) : heroSuggestions.length ? (
              <div className="max-h-60 overflow-y-auto">
                {heroSuggestions.map((s, idx) => (
                  <button
                    key={`${s.id}-${s.make}-${s.model}`}
                    type="button"
                    role="option"
                    id={`hero-suggestion-${idx}`}
                    tabIndex={-1}
                    aria-selected={idx === heroActiveIdx}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyHeroSuggestion(s)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-control px-3 py-2.5 text-left transition-colors hover:bg-surface",
                      idx === heroActiveIdx && "bg-surface",
                    )}
                  >
                    <span className="text-footnote font-medium text-popover-foreground">
                      {s.make} {s.model} {s.year}
                    </span>
                    <span className="num text-caption font-semibold text-primary">
                      {isReasonableListingPrice(Number(s.price_lkr)) ? formatPrice(s.price_lkr || null) : "—"}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="px-3 py-2 text-caption text-muted-foreground">{t("home.noMatches", "No matches.")}</p>
            )}
          </div>
        ) : null}
      </div>

      {heroSearchMessage ? (
        <p className="mt-2 text-caption font-medium text-primary">{heroSearchMessage}</p>
      ) : null}

      <nav
        aria-label={t("shell.home.categories", "Browse by type")}
        className="mt-4 flex flex-wrap gap-2"
      >
        {categories.map((cat) => {
          const active = (filters.vehicle_category || "cars") === cat.value;
          return (
            <m.button
              key={cat.value}
              type="button"
              onClick={() => browseCategory(cat.value)}
              aria-pressed={active}
              {...(motionStill ? {} : press)}
              className={cn(
                "tap-44 relative isolate inline-flex min-h-10 items-center rounded-full border px-4 text-footnote font-semibold transition-colors",
                active
                  ? "border-transparent text-primary-foreground"
                  : "border-border bg-surface-1/75 text-foreground hover:bg-surface-2",
              )}
            >
              {active ? (
                <motion.span
                  aria-hidden
                  layoutId="home-category-pill-redesign"
                  transition={motionStill ? { duration: 0 } : spring.snappy}
                  className="absolute inset-0 -z-10 rounded-full bg-primary shadow-e1"
                />
              ) : null}
              {t(cat.labelKey, cat.fallback)}
            </m.button>
          );
        })}
      </nav>
    </div>
  );
}
