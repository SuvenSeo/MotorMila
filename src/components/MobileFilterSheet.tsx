import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { FilterState } from "@/types/car";
import { getMakes, getModels } from "@/services/api";
import { SRI_LANKA_DISTRICTS } from "@/data/districts";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useAppPreferences } from "@/lib/appPreferences";

const ALL = "__all";
const MIN_PRICE = 500_000;
const MAX_PRICE = 100_000_000;

const PRICE_PRESET_VALUES: { key: string; fallback: string; min: number; max: number }[] = [
  { key: "filter.presetUnder3m", fallback: "Under 3M", min: MIN_PRICE, max: 3_000_000 },
  { key: "filter.preset3to6", fallback: "3M–6M", min: 3_000_000, max: 6_000_000 },
  { key: "filter.preset6to10", fallback: "6M–10M", min: 6_000_000, max: 10_000_000 },
  { key: "filter.preset10plus", fallback: "10M+", min: 10_000_000, max: MAX_PRICE },
];

const QUICK_MAKES = ["Toyota", "Suzuki", "Honda", "Nissan"];

function PillBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-11 rounded-2xl border px-3 py-2.5 text-[12px] font-medium transition-all duration-150 active:scale-[0.97] ${
        active
          ? "border-primary/35 bg-primary/[0.12] text-primary"
          : "border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function FilterSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2 border-t border-border pt-4 first:border-0 first:pt-0">
      <p className="text-[12px] font-medium text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

export interface MobileFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
}

export function MobileFilterSheet({
  open,
  onOpenChange,
  filters,
  onFiltersChange,
}: MobileFilterSheetProps) {
  const { t } = useAppPreferences();
  const [makes, setMakes] = useState<{ make: string; count: number }[]>([]);
  const [modelsList, setModelsList] = useState<{ model: string; count: number }[]>([]);

  const [localMake, setLocalMake] = useState(filters.make || "");
  const [localModel, setLocalModel] = useState(filters.model || "");
  const [localPriceMin, setLocalPriceMin] = useState(
    filters.price_min ? String(filters.price_min) : "",
  );
  const [localPriceMax, setLocalPriceMax] = useState(
    filters.price_max ? String(filters.price_max) : "",
  );
  const [localDistrict, setLocalDistrict] = useState(filters.district || "");

  useEffect(() => {
    getMakes().then(setMakes).catch(() => setMakes([]));
  }, []);

  useEffect(() => {
    if (localMake) {
      getModels(localMake)
        .then(setModelsList)
        .catch(() => setModelsList([]));
    } else {
      setModelsList([]);
    }
  }, [localMake]);

  useEffect(() => {
    if (!open) return;
    setLocalMake(filters.make || "");
    setLocalModel(filters.model || "");
    setLocalPriceMin(filters.price_min ? String(filters.price_min) : "");
    setLocalPriceMax(filters.price_max ? String(filters.price_max) : "");
    setLocalDistrict(filters.district || "");
  }, [open, filters]);

  const activeCount = useMemo(
    () =>
      [
        filters.make,
        filters.model,
        filters.price_min ?? filters.price_max,
        filters.district,
      ].filter(Boolean).length,
    [filters],
  );

  function parsePriceInput(value: string): number | undefined {
    const n = Number(value.replace(/[^\d]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }

  const handleApply = useCallback(() => {
    startTransition(() => {
      onFiltersChange({
        ...filters,
        make: localMake || undefined,
        model: localModel || undefined,
        price_min: parsePriceInput(localPriceMin),
        price_max: parsePriceInput(localPriceMax),
        district: localDistrict || undefined,
        page: 1,
      });
    });
    onOpenChange(false);
  }, [
    filters,
    localDistrict,
    localMake,
    localModel,
    localPriceMax,
    localPriceMin,
    onFiltersChange,
    onOpenChange,
  ]);

  const handleClear = useCallback(() => {
    setLocalMake("");
    setLocalModel("");
    setLocalPriceMin("");
    setLocalPriceMax("");
    setLocalDistrict("");
    startTransition(() => {
      onFiltersChange({
        ...filters,
        make: undefined,
        model: undefined,
        price_min: undefined,
        price_max: undefined,
        district: undefined,
        page: 1,
      });
    });
    onOpenChange(false);
  }, [filters, onFiltersChange, onOpenChange]);

  const isPriceHidden = filters.price_availability === "unavailable";

  const pricePresets = useMemo(
    () => PRICE_PRESET_VALUES.map((preset) => ({ ...preset, label: t(preset.key, preset.fallback) })),
    [t],
  );

  const selectTriggerClass =
    "h-11 min-h-11 rounded-2xl border-border bg-surface text-sm text-foreground transition-colors hover:border-primary/40";
  const selectContentClass =
    "max-h-64 border-border bg-popover text-foreground";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-2xl border-t border-border bg-card p-0 text-foreground touch-pan-y"
      >
        <SheetHeader className="border-b border-border px-5 pb-4 pt-5">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              {t("filter.quickFilters", "Quick Filters")}
              {activeCount > 0 && (
                <span
                  aria-label={t("filter.activeCountAria", "{count} active filters", { count: activeCount })}
                  className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground"
                >
                  {activeCount}
                </span>
              )}
            </SheetTitle>
            <button
              type="button"
              onClick={handleClear}
              className="min-h-11 min-w-11 rounded-full px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              aria-label={t("filter.clearAllAria", "Clear all filters")}
            >
              {t("common.clearAll", "Clear all")}
            </button>
          </div>
        </SheetHeader>

        <div className="space-y-4 px-5 py-5">
          {/* Make */}
          <FilterSection label={t("common.make", "Make")}>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("filter.quickMakeAria", "Quick make selection")}>
              {QUICK_MAKES.map((make) => (
                <PillBtn
                  key={make}
                  active={localMake === make}
                  onClick={() => {
                    const next = localMake === make ? "" : make;
                    setLocalMake(next);
                    setLocalModel("");
                  }}
                >
                  {make}
                </PillBtn>
              ))}
            </div>
            <Select
              value={localMake || ALL}
              onValueChange={(v) => {
                setLocalMake(v === ALL ? "" : v);
                setLocalModel("");
              }}
            >
              <SelectTrigger className={selectTriggerClass} aria-label={t("common.selectMake", "Select make")}>
                <SelectValue placeholder={t("common.allMakes", "All makes")} />
              </SelectTrigger>
              <SelectContent className={selectContentClass}>
                <SelectItem value={ALL}>{t("common.allMakes", "All makes")}</SelectItem>
                {makes.map((m) => (
                  <SelectItem key={m.make} value={m.make}>
                    {m.make} ({m.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterSection>

          {/* Model — shown only when a make is selected and models are available */}
          {localMake && modelsList.length > 0 && (
            <FilterSection label={t("common.model", "Model")}>
              <Select
                value={localModel || ALL}
                onValueChange={(v) => setLocalModel(v === ALL ? "" : v)}
              >
                <SelectTrigger className={selectTriggerClass} aria-label={t("common.selectModel", "Select model")}>
                  <SelectValue placeholder={t("common.allModels", "All models")} />
                </SelectTrigger>
                <SelectContent className={selectContentClass}>
                  <SelectItem value={ALL}>{t("common.allModels", "All models")}</SelectItem>
                  {modelsList.map((m) => (
                    <SelectItem key={m.model} value={m.model}>
                      {m.model} ({m.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterSection>
          )}

          {/* Price — hidden in price-unavailable mode */}
          {!isPriceHidden && (
            <FilterSection label={t("filter.priceRange", "Price range")}>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("filter.pricePresetsAria", "Price range presets")}>
                {pricePresets.map((preset) => {
                  const isActive =
                    localPriceMin === String(preset.min) &&
                    localPriceMax === String(preset.max);
                  return (
                    <PillBtn
                      key={preset.label}
                      active={isActive}
                      onClick={() => {
                        if (isActive) {
                          setLocalPriceMin("");
                          setLocalPriceMax("");
                        } else {
                          setLocalPriceMin(String(preset.min));
                          setLocalPriceMax(String(preset.max));
                        }
                      }}
                    >
                      {preset.label}
                    </PillBtn>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={localPriceMin}
                  onChange={(e) =>
                    setLocalPriceMin(e.target.value.replace(/[^\d]/g, ""))
                  }
                  inputMode="numeric"
                  placeholder={t("filter.minLkr", "Min LKR")}
                  aria-label={t("filter.minPriceAria", "Minimum price")}
                  className="h-11 rounded-2xl border-border bg-surface text-sm text-foreground transition-colors focus-visible:border-primary/40"
                />
                <Input
                  value={localPriceMax}
                  onChange={(e) =>
                    setLocalPriceMax(e.target.value.replace(/[^\d]/g, ""))
                  }
                  inputMode="numeric"
                  placeholder={t("filter.maxLkr", "Max LKR")}
                  aria-label={t("filter.maxPriceAria", "Maximum price")}
                  className="h-11 rounded-2xl border-border bg-surface text-sm text-foreground transition-colors focus-visible:border-primary/40"
                />
              </div>
            </FilterSection>
          )}

          {/* District */}
          <FilterSection label={t("common.district", "District")}>
            <Select
              value={localDistrict || ALL}
              onValueChange={(v) => setLocalDistrict(v === ALL ? "" : v)}
            >
              <SelectTrigger className={selectTriggerClass} aria-label={t("common.district", "District")}>
                <SelectValue placeholder={t("common.allDistricts", "All districts")} />
              </SelectTrigger>
              <SelectContent className={selectContentClass}>
                <SelectItem value={ALL}>{t("common.allDistricts", "All districts")}</SelectItem>
                {SRI_LANKA_DISTRICTS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterSection>
        </div>

        {/* Action footer — sticky so Apply stays reachable while scrolling filters */}
        <div
          className="sticky bottom-0 z-10 flex gap-3 border-t border-border bg-card/95 px-5 py-4 backdrop-blur-md"
          style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="min-h-11 flex-1 rounded-xl border border-border py-3 text-[13px] font-semibold text-muted-foreground transition-all duration-150 hover:border-primary/40 hover:text-foreground active:scale-[0.98]"
          >
            {t("common.cancel", "Cancel")}
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="min-h-11 flex-1 rounded-xl bg-primary py-3 text-[13px] font-bold text-primary-foreground shadow-soft transition-all duration-150 hover:bg-primary/95 active:scale-[0.98]"
          >
            {t("filter.apply", "Apply filters")}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
