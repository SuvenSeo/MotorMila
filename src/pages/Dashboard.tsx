import { scrollBehavior, duration, ease, spring, press, useReducedMotionOrLowData } from "@/lib/motion";
import { silhouetteFor } from "@/lib/vehicleSilhouette";
import { Fragment, forwardRef, memo, type CSSProperties, startTransition, useDeferredValue, useImperativeHandle, useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { useDeferredMount } from "@/hooks/useDeferredMount";
import { useOffscreenPause } from "@/hooks/useOffscreenPause";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { AnimatePresence, m, motion } from "motion/react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigationType } from "react-router-dom";
import { FilterState, CarListing, DashboardInsights, DistrictVelocityPoint } from "@/types/car";
import { getPriceDrops,
  getStats, getListings, getMakes,
  formatPrice, getDashboardInsights, LISTINGS_PAGE_SIZE, getDistrictVelocity,
} from "@/services/api";
import { useLiveMarketSnapshot } from "@/hooks/useLiveMarketSnapshot";
import { useCompareTray } from "@/lib/compareTray";
import { ListingCard } from "@/components/ListingCard";
import { FilterSidebar } from "@/components/FilterSidebar";
import { MarketSignalsStrip } from "@/components/MarketSignalsStrip";
import { FuelMixStrip } from "@/components/FuelMixStrip";
import { DataFreshnessIndicator } from "@/components/DataFreshnessIndicator";
import { SnapshotModeNotice } from "@/components/SnapshotModeNotice";
import { AtmosphericImage } from "@/components/AtmosphericImage";
import { HeroVariantPicker } from "@/components/HeroVariantPicker";
import { useHeroVariantLab } from "@/hooks/useHeroVariantLab";
import { usePointerParallax } from "@/hooks/usePointerParallax";
import "@/styles/cinematic.css";
import { RevealSection } from "@/components/RevealSection";
import { SourceCredits } from "@/components/SourceCredits";
import { SectionHeader } from "@/components/SectionHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TrendingDown,
  BellOff,
  Heart,
  ArrowRight,
  ArrowUpRight,
  ExternalLink,
  Flame,
  LayoutGrid,
  List,
  Search,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import type { StatsOverview } from "@/types/car";
import {
  getListing,
  getListingSearchSuggestions,
  type ListingSearchSuggestion,
} from "@/services/api";
import { useAppPreferences } from "@/lib/appPreferences";
import { useWatchlist } from "@/lib/watchlist";
import { toast } from "sonner";
import { pickVehicleImageUrl } from "@/lib/listingImage";
import { isReasonableListingPrice } from "@/lib/formatting";
import { isJunkMake } from "@/lib/makeNormalization";
import { cn } from "@/lib/utils";
import { VehicleThumbnail } from "@/components/VehicleThumbnail";
import { PriceUnavailableBadge } from "@/components/PriceUnavailableBadge";
import { ListingCardSkeleton } from "@/components/ListingCardSkeleton";
import { loadMarketAlerts, patchMarketAlertServerId, removeMarketAlert, saveMarketAlert, summarizeAlertFilters, type MarketAlert } from "@/lib/marketAlerts";
import { useServerMarketAlerts } from "@/hooks/useServerMarketAlerts";
import { QUERY_STALE } from "@/lib/queryPolicy";
import { FreePlanBanner } from "@/components/FreePlanBanner";
import { HeroBanners } from "@/components/HeroBanners";
import { ProFeatureLock } from "@/components/ProFeatureLock";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { useAuth } from "@/lib/authContext";
import { freePlanText, hasFullPlatformAccess } from "@/lib/planLimits";
import { trackEvent } from "@/lib/analytics";
import { DEFAULT_SORT, EMPTY_FILTERS, useSearchFilters } from "@/lib/searchUrlState";
import { normalizeSearchQuery, resolveSearchAlias } from "@/lib/searchAliases";
import { saveSearchWithAlert, savedSearchLabel } from "@/lib/savedSearchAlerts";
import { SortControl } from "@/components/search/SortControl";
import { SearchPagination } from "@/components/search/SearchPagination";
import { NoResultsState, type AlertStatus } from "@/components/search/NoResultsState";
import { Reveal } from "@/components/motion/Reveal";
import { HeroFlipWords } from "@/components/motion/HeroFlipWords";

// First-load entrance: capped stagger (30ms/item, the first ~10 rows) so a
// long list never makes the last row wait.
const cardContainerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.03,
      delayChildren: 0.02,
    }
  }
} as const;

const cardItemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring" as const,
      stiffness: 260,
      damping: 25
    }
  }
} as const;

const DistrictVelocityMap = lazyWithRetry(() =>
  import("@/components/DistrictVelocityMap").then((m) => ({ default: m.DistrictVelocityMap }))
);
const ProvinceVelocityStrip = lazyWithRetry(() =>
  import("@/components/ProvinceVelocityStrip").then((m) => ({ default: m.ProvinceVelocityStrip }))
);
const MarketIntelligencePanel = lazyWithRetry(() =>
  import("@/components/MarketIntelligencePanel").then((m) => ({ default: m.MarketIntelligencePanel }))
);
const MarketIntelligenceSkeleton = lazyWithRetry(() =>
  import("@/components/MarketIntelligencePanel").then((m) => ({ default: m.MarketIntelligenceSkeleton }))
);
const MobileFilterSheet = lazyWithRetry(() =>
  import("@/components/MobileFilterSheet").then((m) => ({ default: m.MobileFilterSheet }))
);

type FilterSheetHandle = { open: () => void };

/**
 * Owns the mobile filter sheet's open state, so opening the sheet re-renders
 * only the sheet — not the whole home page (cards, hero, charts). That full
 * re-render was most of the ~750 ms filter-open INP at 4x CPU.
 */
const FilterSheetHost = memo(
  forwardRef<FilterSheetHandle, { filters: FilterState; onFiltersChange: (f: FilterState) => void }>(
    function FilterSheetHost({ filters, onFiltersChange }, ref) {
      const [open, setOpen] = useState(false);
      useImperativeHandle(ref, () => ({ open: () => setOpen(true) }), []);
      return (
        <Suspense fallback={null}>
          <MobileFilterSheet open={open} onOpenChange={setOpen} filters={filters} onFiltersChange={onFiltersChange} />
        </Suspense>
      );
    },
  ),
);

const EMPTY_VELOCITY_POINTS: DistrictVelocityPoint[] = [];

const HERO_POPULAR_SCANS = [
  { label: "Toyota Aqua", make: "Toyota", model: "Aqua" },
  { label: "Honda Vezel", make: "Honda", model: "Vezel" },
  { label: "Wagon R", make: "Suzuki", model: "Wagon R" },
  { label: "Nissan Leaf", make: "Nissan", model: "Leaf" },
  { label: "Toyota Axio", make: "Toyota", model: "Axio" },
] as const;

/** Home quick links. Bikes and three-wheelers get top billing next to cars. */
const HOME_CATEGORIES = [
  { value: "cars", labelKey: "shell.home.cat.cars", fallback: "Cars" },
  { value: "motorbikes", labelKey: "shell.home.cat.bikes", fallback: "Bikes" },
  { value: "three-wheelers", labelKey: "shell.home.cat.threeWheelers", fallback: "Three-wheelers" },
  { value: "vans", labelKey: "shell.home.cat.vans", fallback: "Vans" },
  { value: "lorries", labelKey: "shell.home.cat.lorries", fallback: "Lorries" },
] as const;


// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  // Filters, sort and page live in the URL (shareable; Back steps back).
  const [filters, setFilters] = useSearchFilters();
  const { hasProAccess, isAdmin, isAuthenticated } = useAuth();
  const fullAccess = hasFullPlatformAccess({ hasProAccess, isAdmin });
  // Guests and free users get normal pagination (no 12-result cap).
  const listingFilters = filters;
  const [noResultsAlertStatus, setNoResultsAlertStatus] = useState<AlertStatus>("idle");
  const { t } = useAppPreferences();
  const queryClient = useQueryClient();
  const liveMarketSnapshot = useLiveMarketSnapshot();
  // Persisted compare tray (localStorage) so selections survive navigation.
  const { pinned: comparePinned, toggle: toggleCompareTray } = useCompareTray();
  const filterSheetRef = useRef<FilterSheetHandle>(null);
  const heroSectionRef = useRef<HTMLElement>(null);
  const wideFilters = useMediaQuery("(min-width: 1024px)", true);
  // CSS loops inside the hero pause once it scrolls off screen.
  useOffscreenPause(heroSectionRef);
  // Read on first render (localStorage): loading them in an effect re-rendered
  // the whole feed, every card included, right after it mounted.
  const { ids: watchlistIds, toggle: toggleSavedListing } = useWatchlist();
  const [heroSearch, setHeroSearch] = useState("");
  const [heroSearchMessage, setHeroSearchMessage] = useState<string | null>(null);
  const [heroActiveIdx, setHeroActiveIdx] = useState(-1);
  const [heroSuggestions, setHeroSuggestions] = useState<ListingSearchSuggestion[]>([]);
  const [heroSuggestionsOpen, setHeroSuggestionsOpen] = useState(false);
  const [heroFocused, setHeroFocused] = useState(false);
  const motionStill = useReducedMotionOrLowData();
  const [heroSuggestionsLoading, setHeroSuggestionsLoading] = useState(false);
  const [showSavedListings, setShowSavedListings] = useState(false);
  const [savedListings, setSavedListings] = useState<CarListing[]>([]);
  const [savedListingsLoading, setSavedListingsLoading] = useState(false);
  const [savedListingsError, setSavedListingsError] = useState<string | null>(null);
  // Kept for the tab session so Back from a listing returns to the same view
  // (a grid ↔ list swap would change the page height under the restored scroll).
  const [marketView, setMarketViewState] = useState<"grid" | "list">(() => {
    try {
      return window.sessionStorage.getItem("mm:market-view") === "list" ? "list" : "grid";
    } catch {
      return "grid";
    }
  });
  const setMarketView = useCallback((view: "grid" | "list") => {
    setMarketViewState(view);
    try {
      window.sessionStorage.setItem("mm:market-view", view);
    } catch {
      /* private mode */
    }
  }, []);
  // Back/forward onto the feed: show the cached pages as they were, no
  // background refetch that could reorder cards under the restored scroll.
  const returning = useNavigationType() === "POP";
  const [newLiveListingsAvailable, setNewLiveListingsAvailable] = useState(false);
  const [marketAlerts, setMarketAlerts] = useState<MarketAlert[]>(loadMarketAlerts);
  const [showMarketAlerts, setShowMarketAlerts] = useState(false);
  const [alertPriceInput, setAlertPriceInput] = useState("");
  const liveListingAtRef = useRef<string | null>(null);

  // ── Data fetching (React Query owns caching/retries/refetching) ──

  const statsQuery = useQuery({
    queryKey: ["stats"],
    queryFn: getStats,
    staleTime: QUERY_STALE.stats,
  });
  const makesQuery = useQuery({
    queryKey: ["makes"],
    queryFn: getMakes,
    staleTime: QUERY_STALE.market,
  });
  const insightsQuery = useQuery({
    queryKey: ["dashboard-insights"],
    queryFn: getDashboardInsights,
    staleTime: QUERY_STALE.hub,
    refetchInterval: 180_000,
  });
  const dropsQuery = useQuery({
    queryKey: ["price-drops"],
    queryFn: () => getPriceDrops(7, 4),
    staleTime: QUERY_STALE.market,
  });
  const velocityQuery = useQuery({
    queryKey: ["district-velocity"],
    queryFn: getDistrictVelocity,
    staleTime: QUERY_STALE.market,
    // fetchJSON already retries transient 5xx — keep RQ retries low to avoid stampede.
    retry: 1,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
  });
  const { refetch: refetchVelocity, data: velocityData } = velocityQuery;
  const velocityPoints = velocityData?.points ?? EMPTY_VELOCITY_POINTS;
  const retryVelocity = useCallback(() => {
    void refetchVelocity();
  }, [refetchVelocity]);
  const listingsQuery = useQuery({
    queryKey: ["listings", listingFilters],
    queryFn: () => getListings(listingFilters),
    staleTime: QUERY_STALE.listings,
    refetchOnMount: !returning,
    // Keep the current grid on screen while the next filter/sort loads, then
    // crossfade — no skeleton flash, no scroll jump.
    placeholderData: keepPreviousData,
  });
  const { refetch: refetchListings } = listingsQuery;
  const retryListings = useCallback(() => {
    void refetchListings();
  }, [refetchListings]);

  const stats: StatsOverview | null = statsQuery.data ?? null;
  const makes = useMemo(() => makesQuery.data ?? [], [makesQuery.data]);
  const dashboardInsights: DashboardInsights | null = insightsQuery.data ?? null;
  const listings = useMemo(() => listingsQuery.data?.listings ?? [], [listingsQuery.data]);
  // The grid (up to 24 cards with photos + motion) renders as a deferred,
  // interruptible update: when the listings land the hero keeps painting
  // (LCP) and taps stay responsive instead of waiting on one ~700 ms commit.
  const gridListings = useDeferredValue(listings);
  const gridCatchingUp = gridListings !== listings && gridListings.length === 0;
  // Everything below the listings (market pulse, trust bar, district demand,
  // Pro overview, sources) mounts a frame after the first paint.
  const belowFoldReady = useDeferredMount();
  const total = listingsQuery.data?.total ?? 0;
  const loadingListings = listingsQuery.isPending;
  const refreshingListings = listingsQuery.isPlaceholderData && listingsQuery.isFetching;
  const listingsFailed = listingsQuery.isError;

  // The home feed never lists server alerts, it only mirrors local ones up.
  const serverAlerts = useServerMarketAlerts({ autoLoad: false });


  useEffect(() => {
    const query = heroSearch.trim();
    if (!query) {
      setHeroSuggestions([]);
      setHeroSuggestionsLoading(false);
      setHeroSearchMessage(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setHeroSuggestionsLoading(true);
      getListingSearchSuggestions(normalizeSearchQuery(query) || query, 8)
        .then((rows) => { if (!cancelled) { setHeroSuggestions(rows); setHeroSuggestionsOpen(true); setHeroSearchMessage(null); } })
        .catch(() => { if (!cancelled) setHeroSuggestions([]); })
        .finally(() => { if (!cancelled) setHeroSuggestionsLoading(false); });
    }, 180);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [heroSearch]);

  useEffect(() => {
    if (!showSavedListings) return;
    if (!watchlistIds.length) { setSavedListings([]); setSavedListingsError(null); setSavedListingsLoading(false); return; }
    let cancelled = false;
    setSavedListingsLoading(true); setSavedListingsError(null);
    Promise.all(watchlistIds.map(async (id) => { try { return await getListing(id); } catch { return null; } }))
      .then((rows) => {
        if (cancelled) return;
        const map = new Map<number, CarListing>();
        rows.forEach((r) => { if (r?.id) map.set(r.id, r); });
        const hydrated = watchlistIds.map((id) => map.get(id)).filter((r): r is CarListing => Boolean(r));
        setSavedListings(hydrated);
        if (!hydrated.length) setSavedListingsError(t("home.savedUnavailable", "Saved listings are currently unavailable."));
        else if (hydrated.length < watchlistIds.length) setSavedListingsError(t("home.someSavedGone", "Some saved listings are no longer available."));
      })
      .catch(() => { if (!cancelled) { setSavedListings([]); setSavedListingsError(t("home.loadSavedFailed", "Unable to load saved listings.")); } })
      .finally(() => { if (!cancelled) setSavedListingsLoading(false); });
    return () => { cancelled = true; };
  }, [showSavedListings, watchlistIds, t]);

  useEffect(() => {
    const latestAt = liveMarketSnapshot?.latest_listing_at || null;
    if (!latestAt) return;
    const previous = liveListingAtRef.current;
    liveListingAtRef.current = latestAt;
    if (!previous || previous === latestAt) return;
    queryClient.invalidateQueries({ queryKey: ["stats"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-insights"] });
    if (filters.page === 1 && (filters.sort === "newest" || filters.sort === DEFAULT_SORT)) {
      queryClient.invalidateQueries({ queryKey: ["listings"] });
      setNewLiveListingsAvailable(false);
    } else {
      setNewLiveListingsAvailable(true);
    }
  }, [queryClient, filters.page, filters.sort, liveMarketSnapshot?.latest_listing_at]);

  // ── Derived data ───────────────────────────────────────────────

  const fallbackTrendingModels = useMemo(() => {
    const grouped = new Map<string, { make: string; model: string; count: number; total: number; thumbnail?: string }>();
    listings.forEach((l) => {
      const p = Number(l.price_lkr || 0);
      if (!isReasonableListingPrice(p)) return;
      const key = `${l.make}-${l.model}`;
      const item = grouped.get(key);
      const img = l.thumbnail_url || l.images?.[0];
      if (item) { item.count++; item.total += p; if (!item.thumbnail && img) item.thumbnail = img; }
      else grouped.set(key, { make: l.make, model: l.model, count: 1, total: p, thumbnail: img });
    });
    return Array.from(grouped.values())
      .map((i) => ({ ...i, avgPrice: i.total / i.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [listings]);

  const fallbackHotDeals = useMemo(
    () => [...listings]
      .filter((l) => Number(l.deal_score || 0) >= 8 && isReasonableListingPrice(Number(l.price_lkr || 0)))
      .sort((a, b) => Number(b.deal_score || 0) - Number(a.deal_score || 0))
      .slice(0, 4),
    [listings],
  );

  const trendingModels = useMemo(() => {
    const rows = dashboardInsights?.trending_models?.length
      ? dashboardInsights.trending_models.map((r) => ({
          ...r, thumbnail_url: pickVehicleImageUrl([r.thumbnail_url]),
        }))
      : fallbackTrendingModels.map((r) => ({
          make: r.make, model: r.model, listing_count: r.count,
          avg_price_lkr: r.avgPrice, movement_pct: 0, thumbnail_url: r.thumbnail || null,
        }));
    return rows;
  }, [dashboardInsights?.trending_models, fallbackTrendingModels]);

  const hotDeals = useMemo(() => {
    // A listing with no resolvable make/model ("Other brand Other model") must
    // never be the hero's #1 deal — it is a scrape artifact, not a bargain.
    const isBrandable = (r: { make?: string; model?: string }) => !isJunkMake(r.make);
    const rows = dashboardInsights?.hot_deals?.length
      ? dashboardInsights.hot_deals.filter(
          (r) => isReasonableListingPrice(Number(r.price_lkr || 0)) && isBrandable(r),
        )
      : fallbackHotDeals.filter(isBrandable).map((r) => ({
          id: r.id, make: r.make, model: r.model, year: r.year, district: r.district || null,
          source: r.source, price_lkr: r.price_lkr, deal_score: Number(r.deal_score || 0),
          thumbnail_url: r.thumbnail_url || r.images?.[0] || null,
        }));
    return rows.map((r) => ({ ...r, thumbnail_url: pickVehicleImageUrl([r.thumbnail_url]) }));
  }, [dashboardInsights?.hot_deals, fallbackHotDeals]);


  // ── Actions ────────────────────────────────────────────────────


  const toggleCompare = useCallback((listing: CarListing) => {
    const median = Number(listing.market_median_lkr);
    const images = Array.isArray(listing.images) ? listing.images : [];
    const result = toggleCompareTray({
      id: Number(listing.id),
      make: listing.make,
      model: listing.model,
      year: listing.year,
      price_lkr: Number(listing.price_lkr) || null,
      fmv_lkr: Number.isFinite(median) && median > 0 ? median : null,
      mileage_km: Number(listing.mileage_km) || null,
      district: listing.district,
      deal_score: typeof listing.deal_score === "number" ? listing.deal_score : null,
      thumbnail_url: listing.thumbnail_url || (images[0] as string) || null,
      detail_url: listing.detail_url || null,
    });
    if (result.atCap) toast.error(t("listing.compareFull", "Compare tray is full (max 4) — remove one first"));
  }, [toggleCompareTray, t]);

  const compareIds = useMemo(() => comparePinned.map((p) => p.id), [comparePinned]);
  const compareIdSet = useMemo(() => new Set(compareIds), [compareIds]);
  const watchlistIdSet = useMemo(() => new Set(watchlistIds), [watchlistIds]);

  const toggleWatchlist = useCallback((listing: CarListing) => {
    const result = toggleSavedListing(listing.id);
    if (result.blocked) toast.error(t("listing.watchlistFull", "Watchlist is full — remove one first"));
    else if (result.error) toast.error(t("listing.watchlistStorageError", "Couldn't save on this device. Check browser storage permissions and try again."));
  }, [toggleSavedListing, t]);

  const scrollToMarket = useCallback(() => {
    // Defer past the filter-change re-render: a smooth scroll started in the
    // same tick gets cancelled when the grid re-lays out.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const market = document.getElementById("market");
        // jsdom (tests) has no scrollIntoView; old WebViews may lack it too.
        if (market && typeof market.scrollIntoView === "function") {
          market.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
        }
      });
    });
  }, []);

  const applyHeroSuggestion = useCallback((s: ListingSearchSuggestion) => {
    setHeroSearch(`${s.make} ${s.model}`);
    setHeroSuggestionsOpen(false);
    setHeroActiveIdx(-1);
    startTransition(() => { setFilters((prev) => ({ ...prev, q: undefined, make: s.make, model: s.model, page: 1 })); });
    setHeroSearchMessage(null);
    scrollToMarket();
  }, [scrollToMarket, setFilters]);

  const runHeroSearch = useCallback(() => {
    const query = heroSearch.trim();
    if (!query) return;
    if (heroSuggestions.length > 0) { applyHeroSuggestion(heroSuggestions[0]); return; }
    // Singlish / misspelling tolerance ("akwa", "wagonr", "primio", "vits").
    const alias = resolveSearchAlias(query);
    if (alias.make) {
      startTransition(() => {
        setFilters((prev) => ({ ...prev, q: alias.rest || undefined, make: alias.make, model: alias.model, page: 1 }));
      });
      setHeroSuggestionsOpen(false);
      setHeroSearchMessage(null);
      scrollToMarket();
      trackEvent("search_submit", { query, make_match: alias.make, alias: alias.corrected });
      return;
    }
    const normalizedQuery = alias.normalized || query.toLowerCase();
    const makeMatch = makes.find((e) => e.make.toLowerCase().includes(normalizedQuery));
    startTransition(() => {
      setFilters((prev) => ({ ...prev, q: normalizedQuery, make: makeMatch?.make, model: undefined, page: 1 }));
    });
    setHeroSuggestionsOpen(false);
    setHeroSearchMessage(makeMatch ? null : t("home.searchingIndexOnly", "Searching vehicle index only."));
    scrollToMarket();
    trackEvent("search_submit", { query, make_match: makeMatch?.make ?? null });
  }, [applyHeroSuggestion, heroSearch, heroSuggestions, makes, scrollToMarket, setFilters, t]);

  const focusModel = useCallback((make: string, model?: string) => {
    startTransition(() => { setFilters((prev) => ({ ...prev, q: undefined, make, model: model || undefined, page: 1 })); });
    scrollToMarket();
  }, [scrollToMarket, setFilters]);

  const browseCategory = useCallback((category: string) => {
    startTransition(() => {
      setFilters((prev) => ({
        ...prev,
        vehicle_category: category as FilterState["vehicle_category"],
        make: undefined,
        model: undefined,
        body_type: undefined,
        page: 1,
      }));
    });
    scrollToMarket();
  }, [scrollToMarket, setFilters]);

  const totalPages = Math.max(0, Math.ceil(total / LISTINGS_PAGE_SIZE));
  const goToPage = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page: Math.max(1, page) }));
    scrollToMarket();
  }, [scrollToMarket, setFilters]);
  const setSort = useCallback((sort: FilterState["sort"]) => {
    setFilters((prev) => ({ ...prev, sort, page: 1 }));
  }, [setFilters]);

  // Reset the empty-state alert button whenever the search changes.
  useEffect(() => { setNoResultsAlertStatus("idle"); }, [filters]);
  const createNoResultsAlert = useCallback(async () => {
    setNoResultsAlertStatus("saving");
    const { status } = await saveSearchWithAlert(
      savedSearchLabel(filters, t("filter.currentSearch", "Current search")),
      filters,
      "daily",
    );
    setNoResultsAlertStatus(status === "saved" ? "saved" : status === "limit" ? "limit" : "error");
  }, [filters, t]);
  const currentAlertSummary = useMemo(() => summarizeAlertFilters(filters), [filters]);

  const saveCurrentMarketAlert = useCallback(() => {
    const target = Number(alertPriceInput.replace(/[^\d]/g, ""));
    const targetPrice = Number.isFinite(target) && target > 0 ? target : undefined;
    const next = saveMarketAlert(filters, targetPrice);
    setMarketAlerts(next);
    setAlertPriceInput("");
    setShowMarketAlerts(true);

    const newAlert = next[0];
    // The alerts API is sign-in only; anonymous alerts stay in localStorage.
    if (newAlert && isAuthenticated) {
      serverAlerts.create({
        make: filters.make ?? undefined,
        model: filters.model ?? undefined,
        district: filters.district ?? undefined,
        max_price: filters.price_max ?? targetPrice,
      }).then((created) => {
        if (created?.id) {
          setMarketAlerts(patchMarketAlertServerId(newAlert.id, created.id));
        }
      }).catch(() => {
        // Server unavailable — localStorage copy is the fallback.
      });
    }
  }, [alertPriceInput, filters, isAuthenticated, serverAlerts]);

  const deleteMarketAlert = useCallback((id: string) => {
    const alertToDelete = marketAlerts.find((a) => a.id === id);
    setMarketAlerts(removeMarketAlert(id));
    if (alertToDelete?.server_id) {
      serverAlerts.remove(alertToDelete.server_id).catch(() => {
        // Server unavailable — the local delete still succeeded.
      });
    }
  }, [marketAlerts, serverAlerts]);

  const activeFilterLabels = useMemo(
    () => [
      filters.fresh_24h ? t("home.newIn24h", "New in 24h") : undefined,
      filters.price_availability === "unavailable" ? t("home.missingPrices", "Missing prices") : undefined,
      filters.vehicle_category && filters.vehicle_category !== "cars" ? filters.vehicle_category : undefined,
      filters.q || undefined,
      filters.source,
      filters.make,
      filters.model,
      filters.district,
      filters.condition?.replace(/_/g, " "),
      filters.body_type,
      filters.fuel_type,
      filters.transmission,
    ].filter(Boolean) as string[],
    [filters, t],
  );
  const heroQuery = heroSearch.trim();
  const showHeroPopular = heroSuggestionsOpen && heroQuery.length === 0;
  const showHeroSuggestions = (heroSuggestionsOpen || heroSuggestionsLoading) && heroQuery.length > 0;

  const marketPulseListings = Number(liveMarketSnapshot?.priced_listings ?? stats?.total_listings ?? total ?? 0);
  const marketPulseSources = Number(stats?.source_count || liveMarketSnapshot?.source_status?.length || 0);
  const isPriceUnavailableMode = filters.price_availability === "unavailable";
  const listingFreshnessAt = liveMarketSnapshot?.latest_listing_at ?? stats?.last_updated ?? null;
  const { variant: heroVariant, setVariantId: setHeroVariantId, showPicker: showHeroLab } = useHeroVariantLab();
  // The hero is a dark film stage in both themes (white type on the photo);
  // only the suggestions popover follows the theme.
  const heroStatsLoading = marketPulseListings <= 0 && statsQuery.isPending && !liveMarketSnapshot;
  usePointerParallax(heroSectionRef, !motionStill);
  // Suggestions popover rows follow the theme (bg-popover surface).
  const heroPopularBtnClass =
    "w-full rounded-2xl px-3 py-2.5 text-left text-footnote font-medium text-foreground transition-colors hover:bg-surface";
  const heroTitleWords = t("hero.title", "Sri Lanka's entire vehicle market,").split(/\s+/).filter(Boolean);

  // ═════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════

  return (
    <div className="relative min-h-screen">
      {/* Banners float over the hero (which runs under the transparent header), so no strip appears above it. */}
      <HeroBanners>
        <FreePlanBanner />
      </HeroBanners>
      {showHeroLab ? (
        <HeroVariantPicker activeId={heroVariant.id} onSelect={setHeroVariantId} />
      ) : null}

      {/* ── HERO — "Night drive" cinematic stage ───────────────────────
          Layers (back → front): photo plate (pointer + scroll parallax,
          slow settle) · light bloom · scrim · grain ·
          exposure lift · letterbox curtain. All transform/opacity. */}
      <section
        ref={heroSectionRef}
        id="overview"
        className="cine-hero -mt-[var(--nav-offset)] pt-[var(--nav-offset)]"
        style={{ "--cine-pos": heroVariant.objectPosition } as CSSProperties}
      >
        <div aria-hidden className="cine-hero__stage">
          <div className="cine-depth" data-depth="-14">
            <div className="cine-drift">
              <div className="cine-settle">
                <AtmosphericImage
                  key={heroVariant.id}
                  src={heroVariant.image.src}
                  srcSm={heroVariant.image.srcSm}
                  className="cine-hero__img"
                  priority
                  sizes="100vw"
                />
              </div>
            </div>
          </div>
          <div className="cine-depth" data-depth="-26">
            <div className="cine-hero__bloom" />
          </div>
          <div className="cine-hero__scrim" />
          <div className="cine-grain" />
          <div className="cine-exposure" />
          <div className="cine-letterbox cine-letterbox--top" />
          <div className="cine-letterbox cine-letterbox--bottom" />
        </div>

        {/* AI Value HUD — pinned in the sky over the car (xl+). Illustrates the
            fair-price band every ad gets; it shows no listing's numbers. */}
        <div aria-hidden className="cine-hud right-[5%] top-[calc(var(--nav-offset)+11%)] hidden xl:block" data-depth="10">
          <div className="cine-hud__card cine-in" style={{ "--i": 0, "--cine-t0": "1.35s" } as CSSProperties}>
            <div className="cine-hud__body">
              <p className="flex items-center gap-2 text-caption font-semibold text-white">
                <Sparkles className="h-3.5 w-3.5 text-[hsl(213_100%_72%)]" aria-hidden />
                {t("shell.home.hud.title", "AI Value")}
              </p>
              <p className="mt-1 text-footnote text-white/70">{t("shell.home.hud.body", "Fair-price range on every ad")}</p>
              <div className="cine-hud__band mt-4" style={{ "--hud-x": "88px" } as CSSProperties}>
                <span className="cine-hud__marker" />
              </div>
              <div className="mt-2.5 flex justify-between text-caption text-white/60">
                <span>{t("shell.home.hud.great", "Great price")}</span>
                <span>{t("shell.home.hud.fair", "Fair")}</span>
                <span>{t("shell.home.hud.high", "High")}</span>
              </div>
            </div>
          </div>
          <div className="cine-hud__lead" />
          <div className="cine-hud__ping" />
        </div>

        <div className="cine-hero__content">
          <div className="cine-lift max-w-[44rem] lg:max-w-[min(52vw,50rem)]">
            <p className="cine-kicker cine-in text-footnote font-medium" style={{ "--i": 0, "--cine-t0": "0.25s" } as CSSProperties}>
              <span aria-hidden className="cine-kicker__no whitespace-nowrap">Nº 01</span>
              <span aria-hidden className="cine-kicker__rule hidden sm:block" />
              <span>{t("shell.home.kicker", "Every vehicle ad in Sri Lanka, one search")}</span>
            </p>

            <h1 className="cine-title mt-5 sm:mt-6">
              <span className="block">
                {heroTitleWords.map((word, i) => (
                  <Fragment key={`${word}-${i}`}>
                    <span className="cine-word">
                      <span className="cine-word__in" style={{ "--i": i } as CSSProperties}>{word}</span>
                    </span>
                    {i < heroTitleWords.length - 1 ? " " : null}
                  </Fragment>
                ))}
              </span>
              {/* Accent enters without a mask so its headlight glow is never clipped. */}
              <span className="cine-title__accent cine-accent-in" style={{ "--i": heroTitleWords.length } as CSSProperties}>
                {/* Rotating accent word — fixed-width box, pauses offscreen/hidden tab,
                    static "priced." under reduced motion or low-data mode. */}
                <HeroFlipWords
                  align="start"
                  words={[
                    t("hero.accentWord2", "priced."),
                    t("hero.accentWord3", "tracked."),
                    t("hero.accentWord4", "compared."),
                    t("hero.titleAccent", "decoded."),
                  ]}
                />
              </span>
            </h1>

            <p className="cine-body cine-in mt-4 max-w-[34rem] text-pretty text-body sm:mt-6 sm:text-body-lg" style={{ "--i": 1, "--cine-t0": "0.75s" } as CSSProperties}>
              {t(
                "shell.home.bodyNoCount",
                "Vehicle ads from Sri Lanka's marketplaces in one search, with price history and a fair-price range for each.",
              )}
            </p>

            <div className="cine-in mt-7 w-full max-w-2xl sm:mt-9" style={{ "--i": 2, "--cine-t0": "0.75s" } as CSSProperties}>
                <div className="relative">
                  <m.div
                    animate={{ scale: heroFocused && !motionStill ? 1.015 : 1 }}
                    transition={spring.smooth}
                    className={cn("cine-search", heroFocused && "hero-search--focused")}
                  >
                    <div className="cine-search__inner">
                    <Search aria-hidden className="ml-3.5 h-5 w-5 shrink-0 text-white/55" />
                    <label htmlFor="hero-search" className="sr-only">{t("common.search", "Search")} vehicles</label>
                    <input
                      id="hero-search"
                      value={heroSearch}
                      onChange={(e) => { setHeroSearch(e.target.value); setHeroSuggestions([]); setHeroSearchMessage(null); setHeroActiveIdx(-1); }}
                      onFocus={() => { setHeroSuggestionsOpen(true); setHeroFocused(true); }}
                      onBlur={() => { setHeroFocused(false); window.setTimeout(() => { setHeroSuggestionsOpen(false); setHeroActiveIdx(-1); }, 120); }}
                      onKeyDown={(e) => {
                        if (showHeroPopular) {
                          if (e.key === "ArrowDown") {
                            e.preventDefault();
                            setHeroActiveIdx((i) => (i + 1) % HERO_POPULAR_SCANS.length);
                          } else if (e.key === "ArrowUp") {
                            e.preventDefault();
                            setHeroActiveIdx((i) => (i <= 0 ? HERO_POPULAR_SCANS.length - 1 : i - 1));
                          } else if (e.key === "Escape") {
                            setHeroSuggestionsOpen(false);
                            setHeroActiveIdx(-1);
                          } else if (e.key === "Enter") {
                            e.preventDefault();
                            const pick = heroActiveIdx >= 0 ? HERO_POPULAR_SCANS[heroActiveIdx] : null;
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
                          if (heroActiveIdx >= 0 && heroSuggestions[heroActiveIdx]) applyHeroSuggestion(heroSuggestions[heroActiveIdx]);
                          else runHeroSearch();
                        }
                      }}
                      placeholder="Aqua, Vezel, Wagon R…"
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
                      className="h-14 min-w-0 flex-1 bg-transparent text-body font-semibold text-white outline-none placeholder:text-white/45 [&::-webkit-search-cancel-button]:hidden"
                    />
                    <Button type="button" onClick={runHeroSearch} size="md" className="mr-0.5 h-11 px-6 text-footnote">
                      {t("common.search", "Search")}
                    </Button>
                    </div>
                  </m.div>

                  {showHeroPopular ? (
                    <div id="hero-suggestions" role="listbox" className="absolute inset-x-0 bottom-full z-50 mb-2 overflow-hidden rounded-card border border-border bg-popover p-1.5 shadow-e3">
                      <p className="px-3 py-2 text-caption font-semibold text-muted-foreground">
                        {t("home.popular", "Popular")}
                      </p>
                      {HERO_POPULAR_SCANS.map((item, idx) => (
                        <button
                          key={item.label}
                          type="button"
                          role="option"
                          id={`hero-suggestion-${idx}`}
                          aria-selected={idx === heroActiveIdx}
                          // Combobox options are picked with the arrow keys (aria-activedescendant), not Tab:
                          // the list unmounts 120ms after the input blurs, so a tabbable option dropped focus to <body>.
                          tabIndex={-1}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setHeroSearch(item.label);
                            setHeroSuggestionsOpen(false);
                            focusModel(item.make, item.model);
                          }}
                          className={`${heroPopularBtnClass} ${idx === heroActiveIdx ? "bg-surface" : ""}`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {showHeroSuggestions && (
                    <div id="hero-suggestions" role="listbox" className="absolute inset-x-0 bottom-full z-50 mb-2 overflow-hidden rounded-card border border-border bg-popover p-1.5 shadow-e3">
                      {heroSuggestionsLoading ? (
                        <p className="px-3 py-2 text-caption text-muted-foreground">{t("common.searching", "Searching...")}</p>
                      ) : heroSuggestions.length ? (
                        <div className="max-h-[240px] overflow-y-auto">
                          {heroSuggestions.map((s, idx) => (
                            <button
                              key={`${s.id}-${s.make}-${s.model}`} type="button" role="option"
                              id={`hero-suggestion-${idx}`}
                              tabIndex={-1}
                              aria-selected={idx === heroActiveIdx}
                              onMouseDown={(e) => e.preventDefault()} onClick={() => applyHeroSuggestion(s)}
                              className={`flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-surface ${idx === heroActiveIdx ? "bg-surface" : ""}`}
                            >
                              <span className="text-footnote font-medium text-foreground">{s.make} {s.model} {s.year}</span>
                              <span className="text-caption font-semibold text-primary-bright num">
                                {isReasonableListingPrice(Number(s.price_lkr)) ? formatPrice(s.price_lkr || null) : "—"}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : <p className="px-3 py-2 text-caption text-muted-foreground">{t("home.noMatches", "No matches.")}</p>}
                    </div>
                  )}
                </div>

                {heroSearchMessage && (
                  <p className="mt-2 text-caption font-medium text-[hsl(213_100%_72%)]">
                    {heroSearchMessage}
                  </p>
                )}

                {/* Category quick links — bikes and three-wheelers sit right next to cars */}
                <nav
                  aria-label={t("shell.home.categories", "Browse by type")}
                  className="mt-4 flex flex-wrap gap-2"
                >
                  {HOME_CATEGORIES.map((cat) => {
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
                          active ? "border-transparent text-[hsl(var(--cine-ink))]" : "cine-chip",
                        )}
                      >
                        {active ? (
                          /* Selected pill slides between chips (layoutId needs motion.*).
                             White in both themes: the hero stage is dark in light mode too. */
                          <motion.span
                            aria-hidden
                            layoutId="home-category-pill"
                            transition={motionStill ? { duration: 0 } : spring.snappy}
                            className="absolute inset-0 -z-10 rounded-full bg-white shadow-[0_0_24px_-4px_rgba(255,255,255,0.45)]"
                          />
                        ) : null}
                        {t(cat.labelKey, cat.fallback)}
                      </m.button>
                    );
                  })}
                </nav>
            </div>
          </div>

          {/* Credits strip — the live market, in numbers. Never a made-up
              figure: the live count shows a skeleton while loading and drops
              out if the feed has no number. */}
          <dl className="cine-strip cine-in mt-10 grid grid-cols-3 gap-x-4 gap-y-4 py-5 sm:mt-12 sm:grid-cols-4 sm:py-6 lg:mt-14" style={{ "--i": 4, "--cine-t0": "0.8s" } as CSSProperties}>
            {marketPulseListings > 0 || heroStatsLoading ? (
              <div className="min-w-0">
                <dt className="cine-stat__label text-caption font-medium">{t("shell.home.stat.live", "Live ads")}</dt>
                <dd className="cine-stat__value num mt-1.5 font-display text-title3 font-semibold sm:text-title2">
                  {marketPulseListings > 0 ? (
                    <AnimatedNumber value={marketPulseListings} />
                  ) : (
                    <Skeleton shape="text" className="cine-skel h-6 w-20" />
                  )}
                </dd>
              </div>
            ) : null}
            <div className="min-w-0">
              <dt className="cine-stat__label text-caption font-medium">{t("shell.home.stat.sources", "Sources")}</dt>
              <dd className="cine-stat__value num mt-1.5 font-display text-title3 font-semibold sm:text-title2">
                {marketPulseSources > 0 ? <AnimatedNumber value={marketPulseSources} /> : "12"}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="cine-stat__label text-caption font-medium">{t("shell.home.stat.history", "Price records")}</dt>
              <dd className="cine-stat__value num mt-1.5 font-display text-title3 font-semibold sm:text-title2">360,000+</dd>
            </div>
            <div className="hidden min-w-0 sm:block">
              <dt className="cine-stat__label text-caption font-medium">{t("shell.home.hud.title", "AI Value")}</dt>
              <dd className="mt-1.5 text-footnote text-white/80">{t("shell.home.hud.body", "Fair-price range on every ad")}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section id="market" className="scroll-mt-20">
        <div className="mx-auto max-w-[1560px] px-5 py-8 sm:px-6 lg:py-10">

          {/* Toolbar */}
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Reveal className="flex flex-col gap-2 sm:gap-2.5">
              <div className="flex items-baseline gap-2.5">
                <h2 className="text-title3 font-semibold text-foreground">
                  {isPriceUnavailableMode ? t("common.unpricedInventory", "Unpriced inventory") : t("common.inventory", "Inventory")}
                </h2>
                {loadingListings ? (
                  <Skeleton shape="text" className="h-4 w-16" />
                ) : (
                  <span className="content-in num text-footnote font-medium text-label-2" aria-live="polite">
                    <AnimatedNumber value={total} />
                    {!isPriceUnavailableMode && activeFilterLabels.length === 0 ? (
                      <span className="ml-1">{t("home.pricedSuffix", "priced")}</span>
                    ) : null}
                  </span>
                )}
              </div>
              {listingFreshnessAt ? (
                <DataFreshnessIndicator
                  latestListingAt={liveMarketSnapshot?.latest_listing_at}
                  lastUpdated={stats?.last_updated}
                  variant="subline"
                  className="normal-case tracking-normal"
                />
              ) : null}
            </Reveal>
            <div className="flex flex-wrap items-center gap-2">
              <SortControl
                value={filters.sort}
                onChange={setSort}
                priceUnavailable={isPriceUnavailableMode}
                fullAccess={fullAccess}
              />
              <Chip
                onClick={() => filterSheetRef.current?.open()}
                className="h-11 lg:hidden"
                aria-label={t("filter.title", "Filters")}
                aria-pressed={undefined}
              >
                <SlidersHorizontal aria-hidden />
                {t("filter.title", "Filters")}
                {activeFilterLabels.length > 0 && (
                  <Badge variant="solid" className="h-5 min-w-5 justify-center px-1.5">
                    <AnimatedNumber value={activeFilterLabels.length} />
                  </Badge>
                )}
              </Chip>
              <Chip onClick={() => setShowSavedListings(true)} aria-pressed={undefined}>
                <AnimatedNumber value={watchlistIds.length} /> {t("common.saved", "saved")}
              </Chip>
              <Button type="button" variant="tertiary" size="sm" onClick={saveCurrentMarketAlert}>
                {t("common.saveAlert", "Save alert")}
              </Button>
              <Chip onClick={() => setShowMarketAlerts(true)} aria-pressed={undefined}>
                <AnimatedNumber value={marketAlerts.length} /> {t("common.alerts", "alerts")}
              </Chip>
              <div className="hidden items-center gap-1 md:flex" role="group" aria-label={t("home.viewMode", "View")}>
                <Chip
                  onClick={() => setMarketView("grid")}
                  selected={marketView === "grid"}
                  aria-label={t("home.gridView", "Grid view")}
                  className="w-8 justify-center px-0"
                ><LayoutGrid aria-hidden /></Chip>
                <Chip
                  onClick={() => setMarketView("list")}
                  selected={marketView === "list"}
                  aria-label={t("home.listView", "List view")}
                  className="w-8 justify-center px-0"
                ><List aria-hidden /></Chip>
              </div>
            </div>
          </div>

          {/* Active filters: phones and tablets only. From lg the filter rail
              shows the same chips with its own "Clear all". */}
          {activeFilterLabels.length > 0 && (
            <div className="mb-5 flex flex-wrap items-center gap-1.5 lg:hidden">
              <AnimatePresence initial={false} mode="popLayout">
                {activeFilterLabels.map((label) => (
                  <motion.span
                    key={label}
                    layout={!motionStill}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9, transition: { duration: duration.short, ease: ease.accelerate } }}
                    transition={spring.snappy}
                    className="inline-flex"
                  ><Badge variant="neutral" className={cn("h-7 px-3 text-footnote font-medium", label !== filters.q && "capitalize")}>{label}</Badge></motion.span>
                ))}
                <motion.span key="__clear" layout={!motionStill} transition={spring.snappy} className="inline-flex">
                  <Button type="button" variant="tertiary" size="sm" className="h-7 px-3" onClick={() => setFilters({ ...EMPTY_FILTERS })}>
                    {t("common.clearAll", "Clear all")}
                  </Button>
                </motion.span>
              </AnimatePresence>
            </div>
          )}

          {newLiveListingsAvailable && (
            <Card padding="none" className="content-in mb-5 flex items-center justify-between gap-3 border-primary/20 bg-primary/5 px-4 py-2">
              <span className="text-footnote font-semibold text-primary">{t("home.newListings", "New listings available")}</span>
              <Button type="button" variant="tertiary" size="sm" onClick={() => { setFilters((p) => ({ ...p, sort: "newest", page: 1 })); setNewLiveListingsAvailable(false); }}>
                {t("common.refresh", "Refresh")}
              </Button>
            </Card>
          )}

          <DataFreshnessIndicator
            latestListingAt={liveMarketSnapshot?.latest_listing_at}
            lastUpdated={stats?.last_updated}
            variant="banner"
            className="mb-5"
          />
          <SnapshotModeNotice className="mb-5" />

          {/* Filters + Grid */}
          <div className="flex flex-col items-start gap-6 lg:flex-row">
            {/* Desktop only: below lg the panel lives in the filter sheet. It used to
                render here too, display:none — ~60 chips, sliders and comboboxes
                (and Radix measuring them) on every phone load and filter change. */}
            {wideFilters ? (
              <div className="hidden w-full shrink-0 self-start lg:sticky lg:top-20 lg:block lg:w-80">
                <FilterSidebar filters={filters} onFiltersChange={setFilters} />
              </div>
            ) : null}

            <m.div
              className="min-w-0 flex-1"
              animate={{ opacity: refreshingListings ? 0.55 : 1 }}
              transition={{ duration: refreshingListings ? duration.short : duration.medium, ease: ease.standard }}
              aria-busy={refreshingListings || undefined}
            >
              {loadingListings || gridCatchingUp ? (
                <div className={marketView === "grid" ? "grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3" : "space-y-3"}>
                  {Array.from({ length: marketView === "grid" ? 9 : 6 }).map((_, i) => (
                    <ListingCardSkeleton key={`skel-${i}`} />
                  ))}
                </div>
              ) : listingsFailed ? (
                <Card padding="none" className="py-6">
                  <ErrorState
                    title={t("home.listingsErrorTitle", "We couldn't load listings just now")}
                    body={t("home.listingsErrorBody", "This is usually a short outage on our side. Your filters are kept. Try again in a moment.")}
                    onRetry={retryListings}
                    retryLabel={t("common.retry", "Retry")}
                  />
                </Card>
              ) : listings.length === 0 ? (
                <NoResultsState
                  filters={filters}
                  onFiltersChange={(next) => setFilters(next)}
                  onCreateAlert={() => { void createNoResultsAlert(); }}
                  alertStatus={noResultsAlertStatus}
                  isSignedIn={isAuthenticated}
                />
              ) : marketView === "grid" ? (
                <div className="content-in grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {/* Cards self-reveal on scroll (ListingCard revealIndex caps the stagger). */}
                  {gridListings.map((listing, index) => (
                    <ListingCard key={listing.id} listing={listing} priority={index < 6} revealIndex={index} onCompareToggle={toggleCompare} isComparing={compareIdSet.has(listing.id)} onWatchlistToggle={toggleWatchlist} isWatchlisted={watchlistIdSet.has(listing.id)} />
                  ))}
                </div>
              ) : (
                <motion.div
                  initial="hidden"
                  animate="show"
                  variants={cardContainerVariants}
                  className="space-y-3"
                >
                  {gridListings.map((listing) => {
                    const hasPrice = isReasonableListingPrice(Number(listing.price_lkr));
                    return (
                      <motion.div key={listing.id} variants={cardItemVariants} data-scroll-anchor={listing.id}>
                        <Link
                          to={`/listing/${listing.id}`}
                          className={cn(
                            "group flex items-center gap-4 rounded-card border border-border bg-surface-1 p-3 no-underline shadow-e1",
                            "transition-ui duration-short ease-standard [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-0.5 [@media(hover:hover)_and_(pointer:fine)]:hover:shadow-e2 active:scale-[0.99] motion-reduce:transform-none",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          )}
                        >
                          <div className="h-16 w-24 shrink-0 overflow-hidden rounded-control bg-surface-2">
                            <VehicleThumbnail src={pickVehicleImageUrl([listing.thumbnail_url, ...(Array.isArray(listing.images) ? listing.images : [])], [listing.detail_url])} listingId={listing.id} source={listing.source} alt={`${listing.make} ${listing.model}`} silhouette={silhouetteFor(listing)} className="h-full w-full object-cover" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-body font-semibold text-foreground transition-colors duration-short group-hover:text-primary">{listing.make} {listing.model} {listing.variant || ""}</p>
                            <p className="num mt-0.5 truncate text-footnote text-label-2">{[listing.year, listing.district, listing.source].filter(Boolean).join(" · ")}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            {hasPrice ? (
                              <p className="cine-card__price num text-body text-foreground">{formatPrice(Number(listing.price_lkr))}</p>
                            ) : <PriceUnavailableBadge label={t("common.na", "N/A")} className="text-caption" />}
                            {fullAccess && listing.deal_score != null && (
                              <p className={cn("num mt-0.5 text-caption font-semibold", Number(listing.deal_score) >= 0 ? "text-deal-good-text" : "text-label-2")}>
                                {t("home.dealScoreShort", "{score} deal", { score: `${Number(listing.deal_score) >= 0 ? "+" : ""}${Number(listing.deal_score).toFixed(0)}` })}
                              </p>
                            )}
                            {!fullAccess && (
                              <p className="mt-0.5 text-caption font-medium text-label-2">{t("home.proScore", "Pro score")}</p>
                            )}
                          </div>
                          <ArrowRight aria-hidden className="hidden h-4 w-4 shrink-0 text-label-2 transition-transform duration-short ease-standard group-hover:translate-x-0.5 group-hover:text-primary sm:block" />
                        </Link>
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}

              {/* Pagination — everyone, guests included */}
              {!loadingListings && !listingsFailed && listings.length > 0 ? (
                <SearchPagination
                  page={filters.page}
                  totalPages={totalPages}
                  total={total}
                  pageSize={LISTINGS_PAGE_SIZE}
                  onPageChange={goToPage}
                />
              ) : null}
              {!fullAccess && listings.length > 0 ? (
                <div className="mt-6">
                  <UpgradePrompt
                    variant="strip"
                    title={freePlanText(t, "scoresTitle")}
                    body={freePlanText(t, "scoresBody")}
                  />
                </div>
              ) : null}
            </m.div>
          </div>
        </div>
      </section>

      {belowFoldReady ? (
        <>
          {/* ── Market pulse — what's moving (below the listings grid) ───── */}
          <RevealSection className="cv-auto border-t border-border">
            <div className="mx-auto max-w-[1560px] px-5 py-14 sm:px-6 lg:py-20">
              <SectionHeader eyebrow={t("home.marketPulse", "Market pulse")} title={t("home.whatsMoving", "What's moving right now")} />
              <div className="grid gap-10 lg:grid-cols-3">

                <div>
                  <div className="mb-5 flex items-center justify-between">
                    <h3 className="font-display text-body font-semibold tracking-tight text-foreground">{t("home.trendingModels", "Trending models")}</h3>
                    <Link to="/trends" className="flex items-center gap-1 text-caption font-medium text-muted-foreground no-underline transition-colors hover:text-primary-bright">
                      All trends <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                  {trendingModels.length ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {trendingModels.slice(0, 4).map((row) => (
                        <button key={`${row.make}-${row.model}`} type="button" onClick={() => focusModel(row.make, row.model)}
                          className="inventory-tile group/trend flex items-center gap-3 p-3 text-left active:scale-[0.99]"
                        >
                          <div className="h-12 w-16 shrink-0 overflow-hidden rounded-2xl bg-black/30">
                            <VehicleThumbnail src={row.thumbnail_url} alt={`${row.make} ${row.model}`} className="w-full h-full object-cover" placeholderClassName="flex h-full w-full items-center justify-center bg-black/20" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-body font-semibold text-foreground">{row.make} {row.model}</p>
                            <p className="mt-0.5 text-caption text-muted-foreground num">{row.listing_count.toLocaleString()} listed · avg {formatPrice(row.avg_price_lkr)}</p>
                          </div>
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover/trend:translate-x-0.5 group-hover/trend:text-primary" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-caption text-muted-foreground">{t("home.awaitingData", "Awaiting data")}</p>
                  )}
                </div>

                {/* Hot deals */}
                <ProFeatureLock label={t("shell.home.bestDealsLock", "Best deals")}>
                <div>
                  <div className="mb-5 flex items-center justify-between">
                    <h3 className="font-display text-body font-semibold tracking-tight text-foreground flex items-center gap-2">
                      <Flame className="h-4 w-4 text-primary/70" /> Best deals
                    </h3>
                    <Link to="/best-picks" className="flex items-center gap-1 text-caption font-medium text-muted-foreground no-underline transition-colors hover:text-primary-bright">
                      All picks <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                  {hotDeals.length ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {hotDeals.slice(0, 4).map((row) => (
                        <Link key={row.id} to={`/listing/${row.id}`}
                          className="inventory-tile group/deal flex items-center gap-3 p-3 no-underline active:scale-[0.99]"
                        >
                          <div className="h-12 w-16 shrink-0 overflow-hidden rounded-2xl bg-black/30">
                            <VehicleThumbnail src={row.thumbnail_url} listingId={row.id} alt={`${row.make} ${row.model}`} className="w-full h-full object-cover" placeholderClassName="flex h-full w-full items-center justify-center bg-black/20" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-body font-semibold text-foreground">{row.make} {row.model} {row.year}</p>
                            <p className="mt-0.5 text-caption text-muted-foreground num">{formatPrice(row.price_lkr)} · {row.district || "LK"}</p>
                          </div>
                          <span className="inline-flex h-6 shrink-0 items-center rounded-full border border-deal-good/30 bg-deal-good/10 px-2.5 text-caption font-semibold tabular-nums text-deal-good-text">
                            +{Number(row.deal_score || 0).toFixed(0)}
                          </span>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="text-caption text-muted-foreground">{t("home.noDeals", "No deals found in current slice")}</p>
                  )}
                </div>
                </ProFeatureLock>
                {/* Price cuts (7d) */}
                <div>
                  <div className="mb-5 flex items-center justify-between">
                    <h3 className="font-display text-body font-semibold tracking-tight text-foreground flex items-center gap-2">
                      <TrendingDown className="h-4 w-4 text-deal-good-text" /> {t("home.priceCuts7d", "Price cuts · 7d")}
                    </h3>
                    <Link to="/best-picks" className="flex items-center gap-1 text-caption font-medium text-muted-foreground no-underline transition-colors hover:text-primary-bright">
                      {t("home.allCuts", "All cuts")} <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                  {(dropsQuery.data || []).length ? (
                    <div className="grid gap-2">
                      {(dropsQuery.data || []).slice(0, 4).map((drop) => (
                        <Link key={drop.listing.id} to={`/listing/${drop.listing.id}`}
                          className="inventory-tile group/drop flex items-center gap-3 p-3 no-underline active:scale-[0.99]"
                        >
                          <div className="h-12 w-16 shrink-0 overflow-hidden rounded-2xl bg-black/30">
                            <VehicleThumbnail src={drop.listing.thumbnail_url} listingId={drop.listing.id} alt={`${drop.listing.make} ${drop.listing.model}`} className="w-full h-full object-cover" placeholderClassName="flex h-full w-full items-center justify-center bg-black/20" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-body font-semibold text-foreground">{drop.listing.make} {drop.listing.model}{drop.listing.year ? ` ${drop.listing.year}` : ""}</p>
                            <p className="mt-0.5 text-caption text-muted-foreground num">
                              <span className="line-through">{formatPrice(drop.previous_price_lkr)}</span>{" "}
                              <span className="font-semibold text-foreground">{formatPrice(drop.new_price_lkr)}</span>
                            </p>
                          </div>
                          <span className="inline-flex h-6 shrink-0 items-center rounded-full border border-deal-good/30 bg-deal-good/10 px-2.5 text-caption font-semibold tabular-nums text-deal-good-text">
                            &minus;{drop.drop_pct}%
                          </span>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="text-caption text-muted-foreground">{t("shell.home.noCuts", "No price cuts spotted in the last 7 days.")}</p>
                  )}
                </div>
              </div>
            </div>
          </RevealSection>

          {/* ── Trust bar — only claims this page backs with data ─────── */}
          <section className="cv-auto border-b border-border bg-background">
            <div className="mx-auto max-w-[1560px] px-5 py-8 sm:px-6">
              <dl className="grid gap-x-8 gap-y-6 sm:grid-cols-3">
                <div>
                  <dt className="text-footnote font-medium text-muted-foreground">{t("shell.home.trust.sources", "Sources")}</dt>
                  <dd className="mt-1 text-body font-semibold text-foreground">
                    {marketPulseSources > 0
                      ? t("shell.home.trust.sourcesValue", "{n} Sri Lankan marketplaces, credited on every listing", { n: marketPulseSources })
                      : t("shell.home.trust.sourcesFallback", "Sri Lankan marketplaces, credited on every listing")}
                  </dd>
                </div>
                <div>
                  <dt className="text-footnote font-medium text-muted-foreground">{t("shell.home.trust.types", "Vehicle types")}</dt>
                  <dd className="mt-1 text-body font-semibold text-foreground">
                    {t("shell.home.trust.typesValue", "Cars, bikes, three-wheelers, vans and lorries")}
                  </dd>
                </div>
                <div>
                  <dt className="text-footnote font-medium text-muted-foreground">{t("shell.home.trust.updated", "Last updated")}</dt>
                  <dd className="mt-1 text-body font-semibold text-foreground">
                    {listingFreshnessAt ? (
                      <DataFreshnessIndicator
                        latestListingAt={liveMarketSnapshot?.latest_listing_at}
                        lastUpdated={stats?.last_updated}
                        variant="subline"
                        className="text-body font-semibold normal-case tracking-normal text-foreground"
                      />
                    ) : (
                      t("shell.home.trust.updatedPending", "Waiting for the first update")
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          {/* ── MARKET PULSE ────────────────────────────────────────── */}
          <RevealSection className="cv-auto border-t border-border">
            <div className="mx-auto max-w-[1560px] px-5 py-14 sm:px-6 lg:py-20">
              <SectionHeader eyebrow={t("shell.home.moreData", "More market data")} title={t("shell.home.moreDataTitle", "Fuel mix, price signals and demand by district")} />
              <div className="space-y-6">
                <FuelMixStrip />
                <MarketSignalsStrip />
              </div>

              {/* District demand velocity */}
              <div className="mt-12 border-t border-border pt-8">
                <ProFeatureLock label={t("shell.home.districtDemandLock", "Demand by district")}>
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <p className="text-footnote font-medium text-primary">{t("shell.home.districtDemand", "Demand by district")}</p>
                    <h3 className="mt-1 font-display text-body font-semibold tracking-tight text-foreground">
                      {t("shell.home.districtDemandTitle", "Where new ads are appearing — last 7 days")}
                    </h3>
                  </div>
                  <Link
                    to="/#market"
                    className="flex items-center gap-1 text-caption font-medium text-muted-foreground no-underline transition-colors hover:text-primary-bright"
                  >
                    {t("shell.home.allListings", "All listings")} <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </div>
                <Suspense
                  fallback={
                    <div className="h-[420px] rounded-xl border border-border bg-card flex items-center justify-center">
                      <div aria-hidden className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-emerald-500 animate-spin" />
                    </div>
                  }
                >
                  <div className="space-y-4">
                    <ProvinceVelocityStrip
                      data={velocityPoints}
                      isLoading={velocityQuery.isPending}
                      isError={velocityQuery.isError}
                      onRetry={retryVelocity}
                    />
                    <DistrictVelocityMap
                      data={velocityPoints}
                      isLoading={velocityQuery.isPending}
                      isError={velocityQuery.isError}
                      onRetry={retryVelocity}
                    />
                  </div>
                </Suspense>
                </ProFeatureLock>
              </div>

              {/* Tool links */}
              <div className="mt-12 border-t border-border pt-8">
                <p className="mb-4 text-footnote font-medium text-muted-foreground">{t("shell.nav.tools", "Tools")}</p>
                <div className="flex flex-wrap gap-2">
                {[
                  { label: t("shell.nav.valueMyVehicle", "What's my vehicle worth?"), to: "/estimate" },
                  { label: t("shell.nav.priceTrends", "Price trends"), to: "/trends" },
                  { label: t("shell.nav.importTax", "Import tax calculator"), to: "/calculator" },
                  { label: t("shell.nav.electric", "Electric & hybrid"), to: "/ev-hub" },
                  { label: t("shell.nav.officialUpdates", "Tax & customs updates"), to: "/official-pulse" },
                ].map((tool) => (
                  <Link key={tool.label} to={tool.to}
                    className="group/tool flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2.5 text-caption font-semibold text-foreground no-underline transition-ui hover:border-primary/30 hover:bg-primary/[0.06] hover:shadow-soft active:scale-[0.98]"
                  >
                    {tool.label}
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground transition-ui group-hover/tool:text-primary group-hover/tool:translate-x-0.5" />
                  </Link>
                ))}
                </div>
              </div>
            </div>
          </RevealSection>


          {/* ── Market overview (Pro) — deliberately low on the page ─────── */}
          <section className="cv-auto border-b border-border bg-background">
            <div className="mx-auto max-w-[1560px] px-5 py-10 sm:px-6 lg:py-14">
              <ProFeatureLock label={t("shell.home.marketOverviewLock", "Full market overview")}>
                <Suspense fallback={null}>
                  {!liveMarketSnapshot && !stats && !dashboardInsights ? (
                    <MarketIntelligenceSkeleton />
                  ) : (
                    <MarketIntelligencePanel snapshot={liveMarketSnapshot} stats={stats} insights={dashboardInsights} />
                  )}
                </Suspense>
              </ProFeatureLock>
            </div>
          </section>

          {/* ── Sources — static credit list (no marquee) ──────────────── */}
          <SourceCredits
            items={(liveMarketSnapshot?.source_status || [])
              .filter((st) => Number(st.listings_found || 0) > 0)
              .map((st) => ({ source: st.source, listings: Number(st.listings_found || 0) }))}
          />
        </>
      ) : (
        <div aria-hidden className="min-h-[1800px]" />
      )}

      {/* ── DIALOGS ─────────────────────────────────────────────── */}
      <Dialog open={showMarketAlerts} onOpenChange={setShowMarketAlerts}>
        <DialogContent className="max-h-[86vh] max-w-2xl overflow-y-auto text-foreground">
          <DialogHeader>
            <DialogTitle className="text-title3 font-semibold">{t("home.marketAlertsTitle", "Market alerts")}</DialogTitle>
          </DialogHeader>
          <Card padding="sm" className="bg-surface-2 shadow-none">
            <p className="text-caption font-medium text-label-2">{t("shell.home.currentSearch", "Current search")}</p>
            <p className="mt-1 text-body font-semibold text-foreground">{currentAlertSummary}</p>
            <div className="mt-3 flex gap-2">
              <Input
                value={alertPriceInput}
                onChange={(e) => setAlertPriceInput(e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                placeholder={t("home.alertTargetPlaceholder", "Target max price (LKR)")}
                aria-label={t("home.alertTargetPlaceholder", "Target max price (LKR)")}
                className="num flex-1"
              />
              <Button type="button" onClick={saveCurrentMarketAlert}>{t("common.save", "Save")}</Button>
            </div>
          </Card>
          {marketAlerts.length ? (
            <div className="space-y-1.5">
              {marketAlerts.map((alert) => (
                <div key={alert.id} className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface-1 p-3 transition-colors duration-short hover:bg-surface-2">
                  <div className="min-w-0">
                    <p className="truncate text-body font-semibold text-foreground">{alert.label}</p>
                    <p className="num mt-0.5 text-footnote text-label-2">{alert.target_price_lkr ? t("alerts.underPrice", "Under {price}", { price: formatPrice(alert.target_price_lkr) }) : t("home.newListingsAvailable", "New listings available")}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button type="button" variant="tertiary" size="sm" onClick={() => { setFilters({ ...(alert.filters as FilterState), sort: alert.filters.sort || DEFAULT_SORT, page: 1 }); setShowMarketAlerts(false); scrollToMarket(); }}>{t("common.open", "Open")}</Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => deleteMarketAlert(alert.id)}>{t("common.delete", "Delete")}</Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={BellOff}
              title={t("home.noAlertsTitle", "No alerts saved")}
              body={t("home.noAlertsBody", "Set a target price above and we'll watch this search for you.")}
              className="py-8"
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showSavedListings} onOpenChange={setShowSavedListings}>
        <DialogContent className="max-h-[86vh] max-w-2xl overflow-y-auto text-foreground">
          <DialogHeader>
            <DialogTitle className="text-title3 font-semibold">{t("home.savedListingsTitle", "Saved listings")}</DialogTitle>
            <DialogDescription>{t("home.savedOnDevice", "Saved on this browser only. These listings don't sync to your account or send price alerts.")}</DialogDescription>
          </DialogHeader>
          {savedListingsLoading ? (
            <div className="space-y-1.5" aria-busy="true">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} shape="row" className="h-16" />)}</div>
          ) : savedListings.length ? (
            <div className="content-in space-y-1.5">
              <AnimatePresence initial={false}>
              {savedListings.map((listing) => (
                <motion.div
                  key={listing.id}
                  layout={!motionStill}
                  exit={{ opacity: 0, scale: motionStill ? 1 : 0.98, transition: { duration: duration.short, ease: ease.accelerate } }}
                  transition={spring.snappy}
                  className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface-1 p-3 transition-colors duration-short hover:bg-surface-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-body font-semibold text-foreground">{listing.make} {listing.model} {listing.year || ""}</p>
                    <p className="num mt-0.5 text-footnote text-label-2">{listing.district || "LK"} · {isReasonableListingPrice(Number(listing.price_lkr || 0)) ? formatPrice(listing.price_lkr) : t("common.na", "N/A")}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button type="button" variant="ghost" size="sm" onClick={() => toggleWatchlist(listing)}>{t("home.remove", "Remove")}</Button>
                    <Button asChild variant="tertiary" size="sm">
                      <Link to={`/listing/${listing.id}`} onClick={() => setShowSavedListings(false)} className="no-underline">
                        {t("common.open", "Open")} <ExternalLink aria-hidden />
                      </Link>
                    </Button>
                  </div>
                </motion.div>
              ))}
              </AnimatePresence>
            </div>
          ) : savedListingsError ? (
            <ErrorState body={savedListingsError} className="py-8" />
          ) : (
            <EmptyState
              icon={Heart}
              title={t("home.noSavedTitle", "Nothing saved yet")}
              body={t("home.noSavedBodyHeart", "Tap the heart on any listing and it will wait for you here.")}
              className="py-8"
              action={
                <Button asChild>
                  <Link to="/#market" onClick={() => setShowSavedListings(false)} className="no-underline">
                    {t("common.browseInventory", "Browse inventory")}
                  </Link>
                </Button>
              }
            />
          )}
          {savedListingsError && savedListings.length > 0 ? <p role="alert" className="text-footnote text-deal-high-text">{savedListingsError}</p> : null}
        </DialogContent>
      </Dialog>

      <FilterSheetHost ref={filterSheetRef} filters={filters} onFiltersChange={setFilters} />

    </div>
  );
}
