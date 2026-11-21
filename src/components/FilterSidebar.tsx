import { memo, startTransition, useId, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { FilterState, Condition, BodyType, Transmission, FuelType, SortOption, VehicleCategory } from "@/types/car";
import { getListingSources, getMakes, getModels, type ListingSourceStat } from "@/services/api";
import { SRI_LANKA_DISTRICTS } from "@/data/districts";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ChevronDown, Search, X } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { duration, ease, spring, useReducedMotionOrLowData } from "@/lib/motion";
import { Chip } from "@/components/ui/chip";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useAppPreferences } from "@/lib/appPreferences";
import { formatLkrRange } from "@/lib/price";
import { cn } from "@/lib/utils";
import { resolveSearchAlias } from "@/lib/searchAliases";
import { EMPTY_FILTERS } from "@/lib/searchUrlState";
import { PriceRangeFilter } from "@/components/search/PriceRangeFilter";
import { SavedSearchesPanel } from "@/components/search/SavedSearchesPanel";

interface FilterSidebarProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
}

export interface FilterPanelProps extends FilterSidebarProps {
  /** Drawer variant: 44px touch targets, no sticky inner header. */
  touch?: boolean;
}

const ALL_OPTION = "__all";
const MIN_YEAR = 1990;
const MAX_YEAR = Math.max(2026, new Date().getFullYear());
const MAX_MILEAGE = 300_000;
const MILEAGE_STEP = 10_000;
const MAKE_LIMIT = 8;
const MAKE_SEARCH_LIMIT = 24;


const VEHICLE_CATEGORY_VALUES: Array<{ value: VehicleCategory; key: string; fallback: string }> = [
  { value: "cars", key: "vehicle.cars", fallback: "Cars" },
  { value: "motorbikes", key: "vehicle.bikes", fallback: "Bikes" },
  { value: "three-wheelers", key: "vehicle.tuks", fallback: "Tuks" },
  { value: "vans", key: "vehicle.vans", fallback: "Vans" },
  { value: "buses", key: "vehicle.buses", fallback: "Buses" },
  { value: "lorries", key: "vehicle.lorries", fallback: "Lorries" },
  { value: "heavy-duty", key: "vehicle.heavy", fallback: "Heavy" },
  { value: "tractors", key: "vehicle.tractors", fallback: "Tractors" },
  { value: "boats", key: "vehicle.boats", fallback: "Boats" },
  { value: "bicycles", key: "vehicle.cycles", fallback: "Cycles" },
  { value: "others", key: "vehicle.other", fallback: "Other" },
];

const CAR_BODY_VALUES: Array<{ value: BodyType | undefined; key: string; fallback: string }> = [
  { value: undefined, key: "common.all", fallback: "All" },
  { value: "sedan", key: "body.sedan", fallback: "Sedan" },
  { value: "suv", key: "body.suv", fallback: "SUV" },
  { value: "hatchback", key: "body.hatch", fallback: "Hatch" },
  { value: "crossover", key: "body.crossover", fallback: "Crossover" },
  { value: "mpv", key: "body.mpv", fallback: "MPV" },
  { value: "jeep", key: "body.jeep", fallback: "Jeep" },
  { value: "mini", key: "body.mini", fallback: "Mini" },
  { value: "luxury", key: "body.luxury", fallback: "Luxury" },
  { value: "van", key: "body.van", fallback: "Van" },
  { value: "pickup", key: "body.pickup", fallback: "Pickup" },
  { value: "wagon", key: "body.wagon", fallback: "Wagon" },
  { value: "coupe", key: "body.coupe", fallback: "Coupe" },
  { value: "convertible", key: "body.cabrio", fallback: "Cabrio" },
];

const UNAVAILABLE_PRICE_SORTS = new Set<SortOption>(["deal_score", "price_asc", "price_desc"]);

/** Groups the rail can collapse. First few are open on a first visit. */
type FilterGroupId =
  | "vehicle"
  | "search"
  | "make"
  | "model"
  | "price"
  | "year"
  | "fuel"
  | "transmission"
  | "condition"
  | "body"
  | "mileage"
  | "district"
  | "source"
  | "saved";

const DEFAULT_OPEN_GROUPS = new Set<FilterGroupId>(["vehicle", "search", "make", "model", "price"]);

const OPEN_GROUPS_KEY = "motormila.filterOpenGroups.v1";

/** Which active chip belongs to which group, so group counts can't drift from the chips. */
const CHIP_GROUP: Record<string, FilterGroupId> = {
  q: "search",
  category: "vehicle",
  make: "make",
  model: "model",
  district: "district",
  condition: "condition",
  body: "body",
  fuel: "fuel",
  trans: "transmission",
  source: "source",
  inv: "price",
  price: "price",
  year: "year",
  mileage: "mileage",
};

type OpenGroupState = Partial<Record<FilterGroupId, boolean>>;

function readOpenGroups(): OpenGroupState {
  try {
    const raw = window.sessionStorage.getItem(OPEN_GROUPS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const groups: OpenGroupState = {};
    for (const id of Object.keys(DEFAULT_OPEN_GROUPS) as FilterGroupId[]) {
      const value = (parsed as Record<string, unknown>)[id];
      if (typeof value === "boolean") groups[id] = value;
    }
    return groups;
  } catch {
    return {};
  }
}

function persistOpenGroups(groups: OpenGroupState) {
  try {
    window.sessionStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(groups));
  } catch {
    return;
  }
}

function useFilterGroups(allOpen: boolean) {
  const [openGroups, setOpenGroups] = useState<OpenGroupState>(readOpenGroups);
  // The drawer opens every group (it is a focused sheet); the rail starts on the first few.
  const isOpenByDefault = useCallback(
    (id: FilterGroupId) => allOpen || DEFAULT_OPEN_GROUPS.has(id),
    [allOpen],
  );

  const store = useCallback((next: OpenGroupState) => {
    persistOpenGroups(next);
    setOpenGroups(next);
  }, []);

  const isGroupOpen = useCallback(
    (id: FilterGroupId) => openGroups[id] ?? isOpenByDefault(id),
    [isOpenByDefault, openGroups],
  );

  const toggleGroup = useCallback(
    (id: FilterGroupId) => {
      store({ ...openGroups, [id]: !(openGroups[id] ?? isOpenByDefault(id)) });
    },
    [isOpenByDefault, openGroups, store],
  );

  const expandGroup = useCallback(
    (id: FilterGroupId) => {
      if (openGroups[id] ?? isOpenByDefault(id)) return;
      store({ ...openGroups, [id]: true });
    },
    [isOpenByDefault, openGroups, store],
  );

  return { isGroupOpen, toggleGroup, expandGroup };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseOptionalInteger(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed.replace(/[^\d]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatMileage(value?: number, anyLabel = "Any") {
  if (!value) return anyLabel;
  return `${Math.round(value / 1000)}k km`;
}

/** A collapsible group: caption label + count + rotating chevron, panel stays mounted so inputs keep their state. */
function FilterGroup({
  id,
  label,
  count,
  open,
  onToggle,
  touch,
  children,
}: {
  id: FilterGroupId;
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  touch?: boolean;
  children: ReactNode;
}) {
  const panelId = `filter-group-${id}`;
  return (
    <section className="border-t border-separator first:border-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(
          "-mx-2 flex w-full items-center justify-between gap-2 rounded-control px-2 text-left transition-colors duration-short hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          touch ? "min-h-11 py-2" : "min-h-9 py-1.5",
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-caption font-semibold uppercase tracking-caps text-label-2">{label}</span>
          {count > 0 ? (
            <span className="num rounded-pill bg-primary/10 px-1.5 text-caption font-semibold text-primary">{count}</span>
          ) : null}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "h-4 w-4 shrink-0 text-label-2 transition-transform duration-short ease-standard",
            open && "rotate-180",
          )}
        />
      </button>
      <div id={panelId} hidden={!open} className="pb-4 pt-2">
        {children}
      </div>
    </section>
  );
}

/** One filter option: the kit Chip (selected = filled). Touch drawer: 44px rows. */
function PillButton({
  active,
  onClick,
  children,
  touch,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  touch?: boolean;
}) {
  return (
    <Chip selected={active} onClick={onClick} className={touch ? "h-11 px-4" : undefined}>
      {children}
    </Chip>
  );
}

export function FilterPanel({ filters, onFiltersChange, touch = false }: FilterPanelProps) {
  const { t } = useAppPreferences();
  const motionStill = useReducedMotionOrLowData();
  const { isGroupOpen, toggleGroup, expandGroup } = useFilterGroups(touch);
  const archiveSwitchId = useId();
  const [makes, setMakes] = useState<{ make: string; count: number }[]>([]);
  const [modelsList, setModelsList] = useState<{ model: string; count: number }[]>([]);
  const [sourceOptions, setSourceOptions] = useState<ListingSourceStat[]>([]);
  const [keywordInput, setKeywordInput] = useState(filters.q || "");
  const [makeQuery, setMakeQuery] = useState("");
  const [modelSearchQuery, setModelSearchQuery] = useState("");

  const [yearRange, setYearRange] = useState<[number, number]>([
    filters.year_min ?? MIN_YEAR,
    filters.year_max ?? MAX_YEAR,
  ]);
  const [mileageValue, setMileageValue] = useState<number>(filters.mileage_max ?? MAX_MILEAGE);
  const [mileageInput, setMileageInput] = useState<string>(filters.mileage_max ? String(filters.mileage_max) : "");

  useEffect(() => {
    getMakes().then(setMakes).catch(() => setMakes([]));
  }, []);

  useEffect(() => {
    getListingSources()
      .then(setSourceOptions)
      .catch(() => setSourceOptions([]));
  }, []);

  useEffect(() => {
    if (filters.make) {
      getModels(filters.make).then(setModelsList).catch(() => setModelsList([]));
    } else {
      setModelsList([]);
    }
  }, [filters.make]);

  useEffect(() => {
    setModelSearchQuery("");
  }, [filters.make]);

  useEffect(() => {
    setKeywordInput(filters.q || "");
  }, [filters.q]);

  useEffect(() => {
    setYearRange([filters.year_min ?? MIN_YEAR, filters.year_max ?? MAX_YEAR]);
  }, [filters.year_min, filters.year_max]);

  useEffect(() => {
    setMileageValue(filters.mileage_max ?? MAX_MILEAGE);
    setMileageInput(filters.mileage_max ? String(filters.mileage_max) : "");
  }, [filters.mileage_max]);

  const makeSearchTerm = makeQuery.trim().toLowerCase();

  const visibleMakes = useMemo(() => {
    const ranked = [...makes].sort((a, b) => b.count - a.count);
    const matched = makeSearchTerm ? ranked.filter((item) => item.make.toLowerCase().includes(makeSearchTerm)) : ranked;
    return matched.slice(0, makeSearchTerm ? MAKE_SEARCH_LIMIT : MAKE_LIMIT);
  }, [makeSearchTerm, makes]);

  const makeChips = useMemo(() => {
    const chips = visibleMakes.map((item) => ({ make: item.make, count: item.count }));
    if (filters.make && !chips.some((chip) => chip.make === filters.make)) {
      chips.unshift({ make: filters.make, count: 0 });
    }
    return chips;
  }, [filters.make, visibleMakes]);

  const filteredModels = useMemo(() => {
    const modelTerm = modelSearchQuery.trim().toLowerCase();
    return modelsList.filter(
      (item) =>
        (!makeSearchTerm || item.model.toLowerCase().includes(makeSearchTerm)) &&
        (!modelTerm || item.model.toLowerCase().includes(modelTerm)),
    );
  }, [makeSearchTerm, modelSearchQuery, modelsList]);

  const priceAvailability = filters.price_availability === "unavailable" ? "unavailable" : "priced";

  const vehicleCategoryOptions = useMemo(
    () => VEHICLE_CATEGORY_VALUES.map((option) => ({ ...option, label: t(option.key, option.fallback) })),
    [t],
  );
  const carBodyOptions = useMemo(
    () => CAR_BODY_VALUES.map((option) => ({ ...option, label: t(option.key, option.fallback) })),
    [t],
  );
  const fuelOptions = useMemo(
    () =>
      [
        { value: undefined as FuelType | undefined, label: t("common.all", "All") },
        { value: "petrol" as FuelType, label: t("fuel.petrol", "Petrol") },
        { value: "diesel" as FuelType, label: t("fuel.diesel", "Diesel") },
        { value: "hybrid" as FuelType, label: t("fuel.hybrid", "Hybrid") },
        { value: "electric" as FuelType, label: t("fuel.electric", "Electric") },
      ],
    [t],
  );
  const transmissionOptions = useMemo(
    () =>
      [
        { value: undefined as Transmission | undefined, label: t("common.all", "All") },
        { value: "automatic" as Transmission, label: t("trans.automatic", "Automatic") },
        { value: "manual" as Transmission, label: t("trans.manual", "Manual") },
        { value: "cvt" as Transmission, label: t("trans.cvt", "CVT") },
      ],
    [t],
  );
  const conditionOptions = useMemo(
    () =>
      [
        { value: undefined as Condition | undefined, label: t("common.all", "All") },
        { value: "brand_new" as Condition, label: t("condition.newShort", "New") },
        { value: "reconditioned" as Condition, label: t("condition.reconShort", "Recon") },
        { value: "used" as Condition, label: t("condition.used", "Used") },
      ],
    [t],
  );
  const update = useCallback(
    (patch: Partial<FilterState>) => {
      startTransition(() => {
        onFiltersChange({ ...filters, ...patch, page: 1 });
      });
    },
    [filters, onFiltersChange],
  );

  const setVehicleCategory = useCallback(
    (category: VehicleCategory) => {
      update({
        vehicle_category: category,
        // Body styles are car-shaped — clear when leaving cars.
        body_type: category === "cars" ? filters.body_type : undefined,
      });
    },
    [filters.body_type, update],
  );

  const clear = useCallback(() => {
    startTransition(() => {
      onFiltersChange({ ...EMPTY_FILTERS });
    });
  }, [onFiltersChange]);

  const activeCategory = filters.vehicle_category || "cars";
  const showCarBodyFilters = activeCategory === "cars";

  const setInventoryMode = useCallback(
    (mode: "priced" | "unavailable") => {
      const shouldUseUnavailable = mode === "unavailable";
      update({
        price_availability: shouldUseUnavailable ? "unavailable" : undefined,
        price_min: shouldUseUnavailable ? undefined : filters.price_min,
        price_max: shouldUseUnavailable ? undefined : filters.price_max,
        sort: shouldUseUnavailable && UNAVAILABLE_PRICE_SORTS.has(filters.sort) ? "best_match" : filters.sort,
      });
    },
    [filters.price_max, filters.price_min, filters.sort, update],
  );

  const commitKeyword = useCallback(
    (nextKeyword = keywordInput) => {
      const normalized = nextKeyword.trim().split(/\s+/).join(" ");
      if (!normalized) {
        update({ q: undefined });
        return;
      }
      // Singlish / misspelling tolerance: "akwa 2015" → Toyota Aqua + "2015".
      const alias = resolveSearchAlias(normalized);
      if (alias.make && !filters.make) {
        update({ make: alias.make, model: alias.model, q: alias.rest || undefined });
        setKeywordInput(alias.rest);
        return;
      }
      update({ q: alias.normalized || normalized });
    },
    [filters.make, keywordInput, update],
  );

  const commitMileageInput = useCallback(
    (nextMileageInput = mileageInput) => {
      const parsed = parseOptionalInteger(nextMileageInput);
      const normalized = parsed == null ? MAX_MILEAGE : clamp(parsed, 0, MAX_MILEAGE);

      setMileageValue(normalized);
      update({ mileage_max: parsed == null || normalized === MAX_MILEAGE ? undefined : normalized });
    },
    [mileageInput, update],
  );

  const changeMakeQuery = useCallback(
    (value: string) => {
      setMakeQuery(value);
      if (!value.trim()) return;
      expandGroup("make");
      if (filters.make) expandGroup("model");
    },
    [expandGroup, filters.make],
  );

  type ActiveChip = { key: string; label: string; onRemove: () => void };

  const activeChips = useMemo((): ActiveChip[] => {
    const chips: ActiveChip[] = [];

    if (filters.q) chips.push({ key: "q", label: filters.q, onRemove: () => update({ q: undefined }) });
    if (activeCategory !== "cars") {
      const categoryLabel =
        vehicleCategoryOptions.find((option) => option.value === activeCategory)?.label || activeCategory;
      chips.push({
        key: "category",
        label: categoryLabel,
        onRemove: () => setVehicleCategory("cars"),
      });
    }
    if (filters.make) chips.push({ key: "make", label: filters.make, onRemove: () => update({ make: undefined, model: undefined }) });
    if (filters.model) chips.push({ key: "model", label: filters.model, onRemove: () => update({ model: undefined }) });
    if (filters.district) chips.push({ key: "district", label: filters.district, onRemove: () => update({ district: undefined }) });
    if (filters.condition) {
      chips.push({
        key: "condition",
        label: filters.condition.replace(/_/g, " "),
        onRemove: () => update({ condition: undefined }),
      });
    }
    if (filters.body_type) chips.push({ key: "body", label: filters.body_type, onRemove: () => update({ body_type: undefined }) });
    if (filters.fuel_type) chips.push({ key: "fuel", label: filters.fuel_type, onRemove: () => update({ fuel_type: undefined }) });
    if (filters.transmission) {
      chips.push({ key: "trans", label: filters.transmission, onRemove: () => update({ transmission: undefined }) });
    }
    if (filters.source) chips.push({ key: "source", label: filters.source, onRemove: () => update({ source: undefined }) });
    if (priceAvailability === "unavailable") {
      chips.push({ key: "inv", label: t("filter.noPrice", "No price"), onRemove: () => setInventoryMode("priced") });
    }
    if (filters.include_archive) {
      chips.push({
        key: "archive",
        label: t("filter.archiveChip", "360K+ Archive"),
        onRemove: () => update({ include_archive: false }),
      });
    }
    if (filters.year_min || filters.year_max) {
      chips.push({
        key: "year",
        label: `${filters.year_min ?? MIN_YEAR}–${filters.year_max ?? MAX_YEAR}`,
        onRemove: () => update({ year_min: undefined, year_max: undefined }),
      });
    }
    if (filters.price_min || filters.price_max) {
      chips.push({
        key: "price",
        label: formatLkrRange(filters.price_min, filters.price_max),
        onRemove: () => update({ price_min: undefined, price_max: undefined }),
      });
    }
    if (filters.mileage_max) {
      chips.push({
        key: "mileage",
        label: `≤ ${formatMileage(filters.mileage_max)}`,
        onRemove: () => update({ mileage_max: undefined }),
      });
    }

    return chips;
  }, [activeCategory, filters, priceAvailability, setInventoryMode, setVehicleCategory, t, update, vehicleCategoryOptions]);

  const groupCounts = useMemo(() => {
    const counts: Partial<Record<FilterGroupId, number>> = {};
    for (const chip of activeChips) {
      const group = CHIP_GROUP[chip.key];
      if (!group) continue;
      counts[group] = (counts[group] ?? 0) + 1;
    }
    return counts;
  }, [activeChips]);

  const groupCount = (id: FilterGroupId) => groupCounts[id] ?? 0;
  const selectTriggerClass = touch ? "h-11" : undefined;
  const fieldClass = touch ? "h-11" : undefined;

  return (
    <div className={cn("text-footnote", touch ? "px-5 pb-4 pt-4" : "p-4")}>
      <div
        className={cn(
          // Desktop rail: title, count and the one-line summary stay pinned while the groups scroll.
          "sticky top-0 z-10 border-b border-separator bg-surface-1",
          touch ? "-mx-5 -mt-4 px-5 pb-3 pt-3" : "-mx-4 -mt-4 px-4 pb-3 pt-4",
        )}
      >
        {/* In the drawer the sheet header already shows "Filters" + "Clear all". */}
        {touch ? null : (
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex min-w-0 items-center gap-2 font-display text-title3 font-semibold tracking-tight text-foreground">
              <span className="truncate">{t("filter.title", "Filters")}</span>
              {activeChips.length > 0 ? (
                <span
                  aria-label={t("filter.activeCountAria", "{count} active filters", { count: activeChips.length })}
                  className="num shrink-0 rounded-pill bg-primary/10 px-2 text-caption font-semibold leading-5 text-primary"
                >
                  {activeChips.length}
                </span>
              ) : null}
            </h2>
            {activeChips.length > 0 ? (
              <Button type="button" variant="tertiary" size="sm" className="h-7 shrink-0 px-2.5" onClick={clear}>
                {t("common.clearAll", "Clear all")}
              </Button>
            ) : null}
          </div>
        )}

        {activeChips.length > 0 ? (
          <div
            className="mt-2 flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="group"
            aria-label={t("filter.activeCountAria", "{count} active filters", { count: activeChips.length })}
          >
            <AnimatePresence initial={false}>
              {activeChips.map((chip) => (
                <m.span
                  key={chip.key}
                  initial={motionStill ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: motionStill ? 1 : 0.9, transition: { duration: duration.short, ease: ease.accelerate } }}
                  transition={motionStill ? { duration: duration.micro } : spring.snappy}
                  className="inline-flex shrink-0"
                >
                  <Chip
                    selected
                    onClick={chip.onRemove}
                    aria-label={t("search.removeFilterAria", "Remove filter {label}", { label: chip.label })}
                    className={cn("max-w-full gap-1 pl-3 pr-2", chip.key !== "q" && "capitalize", touch && "h-11")}
                  >
                    <span className="truncate">{chip.label}</span>
                    <X className="shrink-0 opacity-70" aria-hidden />
                  </Chip>
                </m.span>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <p className="mt-1 text-caption text-label-2">{t("filter.noneActive", "No filters applied yet")}</p>
        )}
      </div>

      <div className="space-y-4 pt-4">
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-label-2" />
          <Input
            value={makeQuery}
            onChange={(event) => changeMakeQuery(event.target.value)}
            placeholder={t("filter.findMakeModel", "Find a make or model")}
            aria-label={t("filter.findMakeModel", "Find a make or model")}
            className={cn("pl-9 pr-9", fieldClass)}
          />
          {makeQuery ? (
            <button
              type="button"
              onClick={() => setMakeQuery("")}
              aria-label={t("filter.clearFind", "Clear make search")}
              className="tap-44 absolute right-0.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-label-2 transition-colors duration-short hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>

        <SegmentedControl
          value={priceAvailability}
          onValueChange={(v) => setInventoryMode(v)}
          aria-label={t("filter.priceModeAria", "Listings with or without a price")}
          size={touch ? "touch" : "md"}
          options={[
            { value: "priced", label: t("filter.withPrice", "With price") },
            { value: "unavailable", label: t("filter.noPrice", "No price") },
          ]}
        />

        <label htmlFor={archiveSwitchId} className={cn("flex cursor-pointer items-center justify-between gap-3", touch ? "min-h-11" : "min-h-8")}>
          <span className="min-w-0">
            <span className="block text-footnote font-medium text-foreground">
              {t("filter.includeArchive", "Include 360K+ price archive")}
            </span>
            <span className="block text-caption text-label-2">
              {t("filter.includeArchiveHint", "Adds older ads for price history")}
            </span>
          </span>
          <Switch
            id={archiveSwitchId}
            checked={Boolean(filters.include_archive)}
            onCheckedChange={(next) => update({ include_archive: next })}
          />
        </label>

        <FilterGroup
          id="vehicle"
          label={t("filter.vehicle", "Vehicle")}
          count={groupCount("vehicle")}
          open={isGroupOpen("vehicle")}
          onToggle={() => toggleGroup("vehicle")}
          touch={touch}
        >
          <div className="flex flex-wrap gap-1.5">
            {vehicleCategoryOptions.map((option) => (
              <PillButton
                key={option.value}
                touch={touch}
                active={activeCategory === option.value}
                onClick={() => setVehicleCategory(option.value)}
              >
                {option.label}
              </PillButton>
            ))}
          </div>
        </FilterGroup>

        <FilterGroup
          id="search"
          label={t("filter.search", "Search")}
          count={groupCount("search")}
          open={isGroupOpen("search")}
          onToggle={() => toggleGroup("search")}
          touch={touch}
        >
          <Input
            value={keywordInput}
            onChange={(event) => setKeywordInput(event.target.value)}
            onBlur={() => commitKeyword()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitKeyword();
              }
            }}
            placeholder={t("filter.searchPlaceholder", "Make, model, year…")}
            aria-label={t("filter.searchAria", "Search listings")}
            className={fieldClass}
          />
        </FilterGroup>

        <FilterGroup
          id="make"
          label={t("common.make", "Make")}
          count={groupCount("make")}
          open={isGroupOpen("make")}
          onToggle={() => toggleGroup("make")}
          touch={touch}
        >
          <div className="flex flex-wrap gap-1.5">
            <PillButton
              touch={touch}
              active={!filters.make}
              onClick={() => update({ make: undefined, model: undefined })}
            >
              {t("common.allMakes", "All makes")}
            </PillButton>
            {makeChips.map((option) => (
              <PillButton
                key={option.make}
                touch={touch}
                active={filters.make === option.make}
                onClick={() => update({ make: option.make, model: undefined })}
              >
                {option.make}
                {option.count > 0 ? <span className="num text-caption opacity-60">{option.count.toLocaleString()}</span> : null}
              </PillButton>
            ))}
          </div>
          {makes.length > visibleMakes.length ? (
            <p className="mt-2 text-caption text-label-2">
              {t("filter.moreMakes", "Top {n} makes — search to narrow the list", { n: visibleMakes.length })}
            </p>
          ) : null}
        </FilterGroup>

        {filters.make ? (
          <FilterGroup
            id="model"
            label={t("common.model", "Model")}
            count={groupCount("model")}
            open={isGroupOpen("model")}
            onToggle={() => toggleGroup("model")}
            touch={touch}
          >
            <div className="space-y-2">
              {modelsList.length > 8 ? (
                <Input
                  value={modelSearchQuery}
                  onChange={(event) => setModelSearchQuery(event.target.value)}
                  placeholder={t("filter.findModel", "Find model…")}
                  aria-label={t("common.model", "Model")}
                  className={fieldClass}
                />
              ) : null}
              <Select value={filters.model || ALL_OPTION} onValueChange={(value) => update({ model: value === ALL_OPTION ? undefined : value })}>
                <SelectTrigger aria-label={t("filter.byModelAria", "Filter by model")} className={selectTriggerClass}>
                  <SelectValue placeholder={t("common.allModels", "All models")} />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value={ALL_OPTION}>{t("common.allModels", "All models")}</SelectItem>
                  {filteredModels.map((model) => (
                    <SelectItem key={model.model} value={model.model}>
                      {model.model} ({model.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </FilterGroup>
        ) : null}

        <FilterGroup
          id="price"
          label={t("filter.price", "Price")}
          count={groupCount("price")}
          open={isGroupOpen("price")}
          onToggle={() => toggleGroup("price")}
          touch={touch}
        >
          {priceAvailability === "unavailable" ? (
            <p className="text-footnote text-label-2">{t("filter.priceUnavailableHint", "Switch to \"With price\" to filter by budget.")}</p>
          ) : (
            <PriceRangeFilter
              filters={filters}
              touch={touch}
              onCommit={(price_min, price_max) => update({ price_min, price_max })}
            />
          )}
        </FilterGroup>

        <FilterGroup
          id="year"
          label={t("common.year", "Year")}
          count={groupCount("year")}
          open={isGroupOpen("year")}
          onToggle={() => toggleGroup("year")}
          touch={touch}
        >
          <p className="num mb-1 text-footnote font-medium text-foreground">
            {yearRange[0]} – {yearRange[1]}
          </p>
          <Slider
            thumbLabels={[t("filter.fromYearSlider", "From year slider"), t("filter.toYearSlider", "To year slider")]}
            min={MIN_YEAR}
            max={MAX_YEAR}
            step={1}
            value={yearRange}
            onValueChange={(value) => setYearRange([value[0] ?? MIN_YEAR, value[1] ?? MAX_YEAR])}
            onValueCommit={(value) =>
              update({
                year_min: value[0] === MIN_YEAR ? undefined : value[0],
                year_max: value[1] === MAX_YEAR ? undefined : value[1],
              })
            }
          />
        </FilterGroup>

        <FilterGroup
          id="fuel"
          label={t("common.fuel", "Fuel")}
          count={groupCount("fuel")}
          open={isGroupOpen("fuel")}
          onToggle={() => toggleGroup("fuel")}
          touch={touch}
        >
          <div className="flex flex-wrap gap-1.5">
            {fuelOptions.map((option) => (
              <PillButton
                key={option.value ?? "all"}
                touch={touch}
                active={filters.fuel_type === option.value || (!filters.fuel_type && !option.value)}
                onClick={() => update({ fuel_type: option.value })}
              >
                {option.label}
              </PillButton>
            ))}
          </div>
        </FilterGroup>

        <FilterGroup
          id="transmission"
          label={t("common.transmission", "Transmission")}
          count={groupCount("transmission")}
          open={isGroupOpen("transmission")}
          onToggle={() => toggleGroup("transmission")}
          touch={touch}
        >
          <div className="flex flex-wrap gap-1.5">
            {transmissionOptions.map((option) => (
              <PillButton
                key={option.value ?? "all"}
                touch={touch}
                active={filters.transmission === option.value || (!filters.transmission && !option.value)}
                onClick={() => update({ transmission: option.value })}
              >
                {option.label}
              </PillButton>
            ))}
          </div>
        </FilterGroup>

        <FilterGroup
          id="condition"
          label={t("common.condition", "Condition")}
          count={groupCount("condition")}
          open={isGroupOpen("condition")}
          onToggle={() => toggleGroup("condition")}
          touch={touch}
        >
          <div className="flex flex-wrap gap-1.5">
            {conditionOptions.map((option) => (
              <PillButton
                key={option.label}
                touch={touch}
                active={filters.condition === option.value}
                onClick={() => update({ condition: option.value })}
              >
                {option.label}
              </PillButton>
            ))}
          </div>
        </FilterGroup>

        {showCarBodyFilters ? (
          <FilterGroup
            id="body"
            label={t("filter.bodyStyle", "Body / style")}
            count={groupCount("body")}
            open={isGroupOpen("body")}
            onToggle={() => toggleGroup("body")}
            touch={touch}
          >
            <div className="flex flex-wrap gap-1.5">
              {carBodyOptions.map((option) => (
                <PillButton
                  key={option.label}
                  touch={touch}
                  active={filters.body_type === option.value || (!filters.body_type && !option.value)}
                  onClick={() => update({ body_type: option.value })}
                >
                  {option.label}
                </PillButton>
              ))}
            </div>
          </FilterGroup>
        ) : null}

        <FilterGroup
          id="mileage"
          label={t("common.mileage", "Mileage")}
          count={groupCount("mileage")}
          open={isGroupOpen("mileage")}
          onToggle={() => toggleGroup("mileage")}
          touch={touch}
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Input
                value={mileageInput}
                onChange={(event) => setMileageInput(event.target.value.replace(/[^\d]/g, ""))}
                onBlur={() => commitMileageInput()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitMileageInput();
                  }
                }}
                inputMode="numeric"
                placeholder={t("filter.maxKm", "Max km")}
                aria-label={t("filter.maxMileageAria", "Maximum mileage")}
                className={cn("num flex-1", fieldClass)}
              />
              <span className="num shrink-0 text-footnote font-medium text-label-2">{formatMileage(mileageValue === MAX_MILEAGE ? undefined : mileageValue, t("filter.anyMileage", "Any"))}</span>
            </div>
            <Slider
              thumbLabel={t("filter.maxMileageSlider", "Maximum mileage slider")}
              min={0}
              max={MAX_MILEAGE}
              step={MILEAGE_STEP}
              value={[mileageValue]}
              onValueChange={(value) => {
                const nextMileage = value[0] ?? MAX_MILEAGE;
                setMileageValue(nextMileage);
                setMileageInput(String(nextMileage));
              }}
              onValueCommit={(value) => update({ mileage_max: value[0] === MAX_MILEAGE ? undefined : value[0] })}
            />
          </div>
        </FilterGroup>

        <FilterGroup
          id="district"
          label={t("common.district", "District")}
          count={groupCount("district")}
          open={isGroupOpen("district")}
          onToggle={() => toggleGroup("district")}
          touch={touch}
        >
          <Select value={filters.district || ALL_OPTION} onValueChange={(value) => update({ district: value === ALL_OPTION ? undefined : value })}>
            <SelectTrigger aria-label={t("filter.byDistrictAria", "Filter by district")} className={selectTriggerClass}>
              <SelectValue placeholder={t("common.allDistricts", "All districts")} />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              <SelectItem value={ALL_OPTION}>{t("common.allDistricts", "All districts")}</SelectItem>
              {SRI_LANKA_DISTRICTS.map((district) => (
                <SelectItem key={district} value={district}>
                  {district}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterGroup>

        <FilterGroup
          id="source"
          label={t("common.source", "Source")}
          count={groupCount("source")}
          open={isGroupOpen("source")}
          onToggle={() => toggleGroup("source")}
          touch={touch}
        >
          <Select value={filters.source || ALL_OPTION} onValueChange={(value) => update({ source: value === ALL_OPTION ? undefined : value })}>
            <SelectTrigger aria-label={t("filter.bySourceAria", "Filter by source")} className={selectTriggerClass}>
              <SelectValue placeholder={t("common.allSources", "All sources")} />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              <SelectItem value={ALL_OPTION}>{t("common.allSources", "All sources")}</SelectItem>
              {sourceOptions.map((source) => (
                <SelectItem key={source.source} value={source.source}>
                  {source.label} ({source.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterGroup>

        <FilterGroup
          id="saved"
          label={t("filter.savedSearches", "Saved searches")}
          count={groupCount("saved")}
          open={isGroupOpen("saved")}
          onToggle={() => toggleGroup("saved")}
          touch={touch}
        >
          <SavedSearchesPanel filters={filters} onOpen={(next) => onFiltersChange(next)} touch={touch} />
        </FilterGroup>
      </div>
    </div>
  );
}

export const FilterSidebar = memo(function FilterSidebar({ filters, onFiltersChange }: FilterSidebarProps) {
  return (
    <aside className="hidden w-full lg:block">
      <Card padding="none" className="max-h-[calc(100vh-7.5rem)] overflow-y-auto overscroll-contain">
        <FilterPanel filters={filters} onFiltersChange={onFiltersChange} />
      </Card>
    </aside>
  );
});

FilterSidebar.displayName = "FilterSidebar";
