import { Feather } from "lucide-react";
import { useLowData } from "@/hooks/useLowData";
import { useAppPreferences } from "@/lib/appPreferences";
import { cn } from "@/lib/utils";
import { m } from "motion/react";
import { spring, useReducedMotionOrLowData } from "@/lib/motion";
import { LowDataSuggestion } from "./LowDataSuggestion";

/** Settings card: low-data mode toggle (+ Data Saver suggestion). */
export function LowDataSettingsCard({ className }: { className?: string }) {
  const { lowData, setLowData } = useLowData();
  const { t } = useAppPreferences();
  const motionStill = useReducedMotionOrLowData();
  const id = "settings-low-data";
  return (
    <section
      aria-labelledby={`${id}-title`}
      className={cn("rounded-3xl border border-border/80 bg-card/85 p-6 shadow-soft sm:p-8", className)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border/80 bg-surface/80 text-primary">
            <Feather className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h2 id={`${id}-title`} className="text-body font-bold tracking-tight text-foreground">
              {t("lowData.title", "Low-data mode")}
            </h2>
            <p className="mt-0.5 text-caption font-medium text-muted-foreground">
              {t("lowData.subtitle", "Saves mobile data and battery on slow connections.")}
            </p>
          </div>
        </div>
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={lowData}
          aria-labelledby={`${id}-title`}
          onClick={() => setLowData(!lowData)}
          className={cn(
            "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            lowData ? "border-primary bg-primary" : "border-border bg-surface",
          )}
        >
          {/* Knob springs across (bouncy, toggles only); instant once low-data
              is on, since that mode turns animation off. */}
          <m.span
            aria-hidden
            initial={false}
            animate={{ x: lowData ? 24 : 4 }}
            transition={motionStill ? { duration: 0 } : spring.expressive}
            className="inline-block h-5 w-5 rounded-full bg-background shadow"
          />
        </button>
      </div>
      <ul className="mt-4 grid gap-1.5 text-caption text-muted-foreground sm:grid-cols-2">
        <li>• {t("lowData.point.images", "Small thumbnail photos only")}</li>
        <li>• {t("lowData.point.carousel", "Photo carousels don't auto-play")}</li>
        <li>• {t("lowData.point.motion", "Animations turned off")}</li>
        <li>• {t("lowData.point.charts", "Charts load only when you tap them")}</li>
      </ul>
      <p className="mt-3 text-caption text-muted-foreground">
        {t("lowData.storedLocally", "Saved on this device only.")}
      </p>
      <LowDataSuggestion className="mt-4" />
    </section>
  );
}
