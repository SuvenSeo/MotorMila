import { useMemo } from "react";
import { m } from "motion/react";
import { fadeIn, scaleIn, useReducedMotionOrLowData, opacityOnly } from "@/lib/motion";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Bell, MapPin, SearchX, Wallet, X } from "lucide-react";
import type { FilterState } from "@/types/car";
import { nearbyDistricts, widenPrice } from "@/lib/searchSuggestions";
import { useAppPreferences } from "@/lib/appPreferences";
import { formatLkrRange } from "@/lib/price";
import { EMPTY_FILTERS } from "@/lib/searchUrlState";
import { cn } from "@/lib/utils";

export type AlertStatus = "idle" | "saving" | "saved" | "limit" | "error";

export interface NoResultsStateProps {
  filters: FilterState;
  onFiltersChange: (next: FilterState) => void;
  onCreateAlert: () => void;
  alertStatus: AlertStatus;
  isSignedIn: boolean;
}

/**
 * Honest empty state: say nothing matched, then offer concrete ways out —
 * nearby districts, a wider price, dropping one filter, or an alert for when
 * a match is listed. No invented counts.
 */
export function NoResultsState({ filters, onFiltersChange, onCreateAlert, alertStatus, isSignedIn }: NoResultsStateProps) {
  const { t } = useAppPreferences();
  const calm = useReducedMotionOrLowData();
  const nearby = useMemo(() => nearbyDistricts(filters.district), [filters.district]);
  const hasPrice = Boolean(filters.price_min || filters.price_max);

  const removable = useMemo(() => {
    const items: Array<{ key: string; label: string; patch: Partial<FilterState> }> = [];
    if (filters.q) items.push({ key: "q", label: `"${filters.q}"`, patch: { q: undefined } });
    if (filters.model) items.push({ key: "model", label: filters.model, patch: { model: undefined } });
    else if (filters.make) items.push({ key: "make", label: filters.make, patch: { make: undefined } });
    if (filters.district) items.push({ key: "district", label: filters.district, patch: { district: undefined } });
    if (hasPrice) {
      items.push({
        key: "price",
        label: formatLkrRange(filters.price_min, filters.price_max),
        patch: { price_min: undefined, price_max: undefined },
      });
    }
    if (filters.year_min || filters.year_max) {
      items.push({ key: "year", label: `${filters.year_min ?? "…"}–${filters.year_max ?? "…"}`, patch: { year_min: undefined, year_max: undefined } });
    }
    if (filters.mileage_max) items.push({ key: "mileage", label: `≤ ${Math.round(filters.mileage_max / 1000)}k km`, patch: { mileage_max: undefined } });
    if (filters.fuel_type) items.push({ key: "fuel", label: filters.fuel_type, patch: { fuel_type: undefined } });
    if (filters.transmission) items.push({ key: "trans", label: filters.transmission, patch: { transmission: undefined } });
    if (filters.condition) items.push({ key: "cond", label: filters.condition.replace(/_/g, " "), patch: { condition: undefined } });
    if (filters.body_type) items.push({ key: "body", label: filters.body_type, patch: { body_type: undefined } });
    if (filters.source) items.push({ key: "source", label: filters.source, patch: { source: undefined } });
    if (filters.fresh_24h) items.push({ key: "fresh", label: t("home.newIn24h", "New in 24h"), patch: { fresh_24h: undefined } });
    return items;
  }, [filters, hasPrice, t]);

  const apply = (patch: Partial<FilterState>) => onFiltersChange({ ...filters, ...patch, page: 1 });
  const chip = "h-11 sm:h-9";
  const sectionLabel = "mb-2 flex items-center gap-1.5 text-footnote font-medium text-label-2";

  return (
    <Card padding="none" className="px-5 py-12 text-center sm:px-10 sm:py-16">
    <m.div initial="hidden" animate="show" variants={fadeIn}>
      <m.span
        className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-label-2"
        variants={calm ? opacityOnly(scaleIn) : scaleIn}
      >
        <SearchX aria-hidden className="h-6 w-6" strokeWidth={1.75} />
      </m.span>
      <h3 role="status" className="mt-4 text-title3 font-semibold text-foreground [text-wrap:balance]">{t("search.noResultsTitle", "No listings match all of these filters")}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-body text-label-2">
        {t("search.noResultsBody", "Try one of these, or get an alert when a match is listed.")}
      </p>

      <div className="mx-auto mt-8 max-w-xl space-y-5 text-left">
        {nearby.length ? (
          <div>
            <p className={sectionLabel}>
              <MapPin aria-hidden className="h-4 w-4" /> {t("search.tryNearby", "Try a nearby district")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {nearby.map((d) => (
                <Chip key={d} className={chip} onClick={() => apply({ district: d })}>
                  {d}
                </Chip>
              ))}
            </div>
          </div>
        ) : null}

        {hasPrice ? (
          <div>
            <p className={sectionLabel}>
              <Wallet aria-hidden className="h-4 w-4" /> {t("search.widenPriceLabel", "Widen your budget")}
            </p>
            {(() => {
              const wider = widenPrice(filters.price_min, filters.price_max);
              return (
                <Chip className={cn(chip, "num")} onClick={() => apply(wider)}>
                  {formatLkrRange(wider.price_min, wider.price_max)}
                </Chip>
              );
            })()}
          </div>
        ) : null}

        {removable.length ? (
          <div>
            <p className={sectionLabel}>{t("search.removeFilter", "Remove a filter")}</p>
            <div className="flex flex-wrap gap-1.5">
              {removable.map((item) => (
                <Chip
                  key={item.key}
                  className={chip}
                  onClick={() => apply(item.patch)}
                  aria-label={t("search.removeFilterAria", "Remove filter {label}", { label: item.label })}
                >
                  <span className="max-w-48 truncate capitalize">{item.label}</span>
                  <X aria-hidden className="opacity-60" />
                </Chip>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-8 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-center">
        <Button
          type="button"
          onClick={onCreateAlert}
          loading={alertStatus === "saving"}
          disabled={alertStatus === "saved"}
          className="h-11 whitespace-normal"
        >
          <Bell aria-hidden />
          {alertStatus === "saved"
            ? t("search.alertSaved", "Alert saved — we'll tell you when one is listed")
            : t("search.alertMe", "Alert me when one is listed")}
        </Button>
        <Button type="button" variant="secondary" onClick={() => onFiltersChange({ ...EMPTY_FILTERS })} className="h-11">
          {t("search.clearAll", "Clear all filters")}
        </Button>
      </div>
      {alertStatus === "limit" ? (
        <p role="status" className="content-in mt-3 text-footnote text-label-2">
          {isSignedIn
            ? t("search.alertLimitPro", "You've reached your alert limit. Remove one or upgrade for more.")
            : t("search.alertLimitGuest", "Your free alert is in use.")}{" "}
          <Link to={isSignedIn ? "/alerts" : "/sign-in"} className="font-semibold text-primary">
            {isSignedIn ? t("search.manageAlerts", "Manage alerts") : t("search.signInForAlerts", "Sign in to manage alerts")}
          </Link>
        </p>
      ) : alertStatus === "error" ? (
        <p role="status" className="content-in mt-3 text-footnote text-label-2">
          {t("search.alertSavedLocal", "Saved on this device. We couldn't reach the alert server just now.")}
        </p>
      ) : null}
    </m.div>
    </Card>
  );
}
