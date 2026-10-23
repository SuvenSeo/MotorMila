import { useCallback, useState } from "react";
import { BellRing, X } from "lucide-react";
import type { FilterState } from "@/types/car";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppPreferences } from "@/lib/appPreferences";
import {
  DEFAULT_SAVED_SEARCH_FREQUENCY,
  removeSavedSearchAlert,
  saveSearchWithAlert,
  savedSearchLabel,
  setSavedSearchFrequency,
  type AlertSyncStatus,
} from "@/lib/savedSearchAlerts";
import { deleteSavedSearch, listSavedSearches, type SavedSearch, type SavedSearchFrequency } from "@/utils/savedSearches";
import { cn } from "@/lib/utils";

const FREQUENCIES: Array<{ value: SavedSearchFrequency; key: string; fallback: string }> = [
  { value: "instant", key: "search.freqInstant", fallback: "Instant" },
  { value: "daily", key: "search.freqDaily", fallback: "Daily" },
  { value: "off", key: "search.freqOff", fallback: "Off" },
];

export interface SavedSearchesPanelProps {
  filters: FilterState;
  onOpen: (filters: FilterState) => void;
  touch?: boolean;
}

/**
 * Save the current search with an alert cadence (Instant / Daily / Off),
 * backed by the server alert API. "Daily" is the default and maps to the
 * 07:00 digest; "Off" keeps the search on this device only.
 */
export function SavedSearchesPanel({ filters, onOpen, touch = false }: SavedSearchesPanelProps) {
  const { t } = useAppPreferences();
  const [frequency, setFrequency] = useState<SavedSearchFrequency>(DEFAULT_SAVED_SEARCH_FREQUENCY);
  const [saved, setSaved] = useState<SavedSearch[]>(() => listSavedSearches());
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<AlertSyncStatus | null>(null);

  const refresh = useCallback(() => setSaved(listSavedSearches()), []);

  const statusText = (s: AlertSyncStatus | null): string | null => {
    switch (s) {
      case "saved":
        return t("search.savedWithAlert", "Saved. Alerts are on.");
      case "local":
        return t("search.savedLocal", "Saved on this device (alerts off).");
      case "limit":
        return t("search.alertLimitShort", "Saved, but your alert limit is reached, so alerts are off for this one.");
      case "error":
        return t("search.alertServerDown", "Saved on this device. Alerts couldn't be switched on just now.");
      default:
        return null;
    }
  };

  const save = async () => {
    setBusy(true);
    const { status: next } = await saveSearchWithAlert(
      savedSearchLabel(filters, t("filter.currentSearch", "Current search")),
      filters,
      frequency,
    );
    setStatus(next);
    setBusy(false);
    refresh();
  };

  const change = async (search: SavedSearch, next: SavedSearchFrequency) => {
    const { status: s } = await setSavedSearchFrequency(search, next);
    setStatus(s);
    refresh();
  };

  const remove = async (search: SavedSearch) => {
    deleteSavedSearch(search.id);
    refresh();
    await removeSavedSearchAlert(search);
  };

  const segBtn = (active: boolean) =>
    cn(
      "flex-1 rounded-full px-2 text-caption font-medium transition-colors",
      touch ? "min-h-11" : "py-1",
      active ? "bg-primary/15 text-primary-bright shadow-xs" : "text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="space-y-2">
      <div
        role="radiogroup"
        aria-label={t("search.alertFrequency", "Alert frequency")}
        className="flex gap-1 rounded-full bg-surface/80 p-1"
      >
        {FREQUENCIES.map((f) => (
          <button
            key={f.value}
            type="button"
            role="radio"
            aria-checked={frequency === f.value}
            onClick={() => setFrequency(f.value)}
            className={segBtn(frequency === f.value)}
          >
            {t(f.key, f.fallback)}
          </button>
        ))}
      </div>
      <p className="text-caption text-muted-foreground">
        {frequency === "daily"
          ? t("search.freqDailyHint", "One summary a day at 7am.")
          : frequency === "instant"
            ? t("search.freqInstantHint", "As soon as a match is listed.")
            : t("search.freqOffHint", "Saved on this device only, no alerts.")}
      </p>
      <button
        type="button"
        onClick={save}
        disabled={busy}
        className={cn(
          "inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 text-caption font-semibold text-primary-bright transition-colors hover:bg-primary/10 disabled:opacity-60",
          touch ? "min-h-11" : "py-1.5",
        )}
      >
        <BellRing aria-hidden className="h-3.5 w-3.5" />
        {t("search.saveThisSearch", "Save this search")}
      </button>
      {status ? (
        <p role="status" className="text-caption text-muted-foreground">
          {statusText(status)}
        </p>
      ) : null}

      {saved.length ? (
        <ul className="space-y-1 pt-1">
          {saved.slice(0, 5).map((search) => (
            <li key={search.id} className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onOpen({ sort: "best_match", vehicle_category: "cars", ...search.filters, page: 1 } as FilterState)}
                className="min-w-0 flex-1 truncate rounded-full px-2 py-1 text-left text-caption text-primary-bright hover:bg-primary/5"
                title={search.name}
              >
                {search.name}
              </button>
              <Select value={search.frequency ?? "off"} onValueChange={(v) => void change(search, v as SavedSearchFrequency)}>
                <SelectTrigger
                  aria-label={t("search.alertFrequencyFor", "Alert frequency for {name}", { name: search.name })}
                  className="h-7 w-[5.5rem] rounded-full border-transparent bg-surface/70 px-2 text-caption"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {t(f.key, f.fallback)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                onClick={() => void remove(search)}
                aria-label={t("search.deleteSaved", "Delete {name}", { name: search.name })}
                className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-caption text-muted-foreground">{t("filter.noSavedSearches", "No saved searches yet.")}</p>
      )}
    </div>
  );
}
