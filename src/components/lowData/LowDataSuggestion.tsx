import { Feather, X } from "lucide-react";
import { useLowData } from "@/hooks/useLowData";
import { useAppPreferences } from "@/lib/appPreferences";

/**
 * One-time, dismissible offer shown when the browser reports Data Saver
 * (`navigator.connection.saveData`) and the user has never set low-data mode.
 * Render it anywhere (Settings, app shell). Renders nothing otherwise.
 */
export function LowDataSuggestion({ className }: { className?: string }) {
  const { shouldSuggest, setLowData, dismissSuggestion } = useLowData();
  const { t } = useAppPreferences();
  if (!shouldSuggest) return null;
  return (
    <div role="status" className={`flex items-start gap-3 rounded-2xl border border-primary/25 bg-primary/10 p-3 text-footnote text-foreground ${className ?? ""}`}>
      <Feather className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{t("lowData.suggestTitle", "Data Saver is on")}</p>
        <p className="mt-0.5 text-muted-foreground">
          {t("lowData.suggestBody", "Turn on low-data mode? Smaller photos, no animations, charts load only when you tap.")}
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => setLowData(true)}
            className="inline-flex min-h-9 items-center rounded-full bg-primary px-4 text-caption font-semibold text-primary-foreground"
          >
            {t("lowData.suggestOn", "Turn on")}
          </button>
          <button
            type="button"
            onClick={dismissSuggestion}
            className="inline-flex min-h-9 items-center rounded-full border border-border bg-card px-4 text-caption font-semibold text-foreground"
          >
            {t("lowData.suggestNo", "Not now")}
          </button>
        </div>
      </div>
      <button type="button" onClick={dismissSuggestion} aria-label={t("lowData.suggestNo", "Not now")} className="rounded-full p-1 text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
