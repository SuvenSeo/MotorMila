import { useMemo } from "react";
import { m } from "motion/react";
import { duration, ease, fadeIn, scaleIn } from "@/lib/motion";
import { Link } from "react-router-dom";
import { Bell, MapPin, SearchX, Wallet, X } from "lucide-react";
import type { FilterState } from "@/types/car";
import { nearbyDistricts, widenPrice } from "@/lib/searchSuggestions";
import { useAppPreferences } from "@/lib/appPreferences";
import { formatLkrRange } from "@/lib/price";
import { EMPTY_FILTERS } from "@/lib/searchUrlState";

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
  const chip =
    "inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-footnote font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary-bright active:scale-[0.98] sm:min-h-9";

  return (
    <m.div
      initial="hidden"
      animate="show"
      variants={fadeIn}
      className="rounded-[2rem] border border-dashed border-border px-5 py-10 text-center sm:px-8"
    >
      <m.span
        className="block"
        variants={scaleIn}
        transition={{ duration: duration.long, ease: ease.decelerate }}
      >
        <SearchX aria-hidden className="mx-auto h-8 w-8 text-muted-foreground" />
      </m.span>
      <p className="mt-3 text-body font-semibold text-foreground">{t("search.noResultsTitle", "No listings match all of these filters")}</p>
      <p className="mx-auto mt-1.5 max-w-md text-footnote text-muted-foreground">
        {t("search.noResultsBody", "Try one of these, or get an alert when a match is listed.")}
      </p>

      <div className="mx-auto mt-6 max-w-xl space-y-4 text-left">
        {nearby.length ? (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-caption font-medium text-muted-foreground">
              <MapPin aria-hidden className="h-3.5 w-3.5" /> {t("search.tryNearby", "Try a nearby district")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {nearby.map((d) => (
                <button key={d} type="button" className={chip} onClick={() => apply({ district: d })}>
                  {d}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {hasPrice ? (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-caption font-medium text-muted-foreground">
              <Wallet aria-hidden className="h-3.5 w-3.5" /> {t("search.widenPriceLabel", "Widen your budget")}
            </p>
            {(() => {
              const wider = widenPrice(filters.price_min, filters.price_max);
              return (
                <button type="button" className={chip} onClick={() => apply(wider)}>
                  {formatLkrRange(wider.price_min, wider.price_max)}
                </button>
              );
            })()}
          </div>
        ) : null}

        {removable.length ? (
          <div>
            <p className="mb-2 text-caption font-medium text-muted-foreground">{t("search.removeFilter", "Remove a filter")}</p>
            <div className="flex flex-wrap gap-1.5">
              {removable.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={chip}
                  onClick={() => apply(item.patch)}
                  aria-label={t("search.removeFilterAria", "Remove filter {label}", { label: item.label })}
                >
                  <span className="max-w-[12rem] truncate capitalize">{item.label}</span>
                  <X aria-hidden className="h-3.5 w-3.5 opacity-70" />
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-7 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={onCreateAlert}
          disabled={alertStatus === "saving" || alertStatus === "saved"}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-footnote font-semibold text-primary-foreground transition-colors hover:bg-primary/95 disabled:opacity-60"
        >
          <Bell aria-hidden className="h-4 w-4" />
          {alertStatus === "saved"
            ? t("search.alertSaved", "Alert saved — we'll tell you when one is listed")
            : t("search.alertMe", "Alert me when one is listed")}
        </button>
        <button
          type="button"
          onClick={() => onFiltersChange({ ...EMPTY_FILTERS })}
          className="min-h-11 rounded-full border border-border px-5 text-footnote font-medium text-foreground transition-colors hover:bg-foreground/[0.03]"
        >
          {t("search.clearAll", "Clear all filters")}
        </button>
      </div>
      {alertStatus === "limit" ? (
        <p role="status" className="mt-3 text-caption text-muted-foreground">
          {isSignedIn
            ? t("search.alertLimitPro", "You've reached your alert limit. Remove one or upgrade for more.")
            : t("search.alertLimitGuest", "Your free alert is in use.")}{" "}
          <Link to={isSignedIn ? "/alerts" : "/sign-in"} className="font-medium text-primary-bright">
            {isSignedIn ? t("search.manageAlerts", "Manage alerts") : t("search.signInForAlerts", "Sign in to manage alerts")}
          </Link>
        </p>
      ) : alertStatus === "error" ? (
        <p role="status" className="mt-3 text-caption text-muted-foreground">
          {t("search.alertSavedLocal", "Saved on this device. We couldn't reach the alert server just now.")}
        </p>
      ) : null}
    </m.div>
  );
}
