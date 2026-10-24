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
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";

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

  return (
    <div className="space-y-2.5">
      <SegmentedControl
        value={frequency}
        onValueChange={(v: SavedSearchFrequency) => setFrequency(v)}
        semantics="radio"
        aria-label={t("search.alertFrequency", "Alert frequency")}
        size={touch ? "touch" : "md"}
        options={FREQUENCIES.map((f) => ({ value: f.value as SavedSearchFrequency, label: t(f.key, f.fallback) }))}
      />
      <p className="text-caption text-label-2">
        {frequency === "daily"
          ? t("search.freqDailyHint", "One summary a day at 7am.")
          : frequency === "instant"
            ? t("search.freqInstantHint", "As soon as a match is listed.")
            : t("search.freqOffHint", "Saved on this device only, no alerts.")}
      </p>
      <Button
        type="button"
        variant="secondary"
        size={touch ? "lg" : "md"}
        onClick={save}
        loading={busy}
        className="w-full"
      >
        <BellRing aria-hidden />
        {t("search.saveThisSearch", "Save this search")}
      </Button>
      {status ? (
        <p role="status" className="content-in text-caption text-label-2">
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
                className={cn(
                  "min-w-0 flex-1 truncate rounded-control px-2 text-left text-footnote font-medium text-primary transition-colors duration-short hover:bg-primary/10 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  touch ? "min-h-11" : "min-h-8",
                )}
                title={search.name}
              >
                {search.name}
              </button>
              <Select value={search.frequency ?? "off"} onValueChange={(v) => void change(search, v as SavedSearchFrequency)}>
                <SelectTrigger
                  aria-label={t("search.alertFrequencyFor", "Alert frequency for {name}", { name: search.name })}
                  className={cn("w-24 px-2.5 text-caption", touch ? "h-11" : "h-8")}
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
              <Button
                type="button"
                variant="ghost"
                size={touch ? "icon" : "icon-sm"}
                onClick={() => void remove(search)}
                aria-label={t("search.deleteSaved", "Delete {name}", { name: search.name })}
                className="text-label-2"
              >
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-caption text-label-2">{t("filter.noSavedSearches", "No saved searches yet.")}</p>
      )}
    </div>
  );
}
