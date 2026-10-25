import { Feather } from "lucide-react";
import { useLowData } from "@/hooks/useLowData";
import { useAppPreferences } from "@/lib/appPreferences";
import { cn } from "@/lib/utils";
import { cardVariants } from "@/components/ui/card";
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
      className={cn(cardVariants({ padding: "md" }), className)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary">
            <Feather className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h2 id={`${id}-title`} className="text-callout font-semibold text-foreground">
              {t("lowData.title", "Low-data mode")}
            </h2>
            <p className="mt-0.5 text-footnote text-label-2">
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
            "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-short ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            lowData ? "border-primary bg-primary" : "border-border bg-surface-3",
          )}
        >
          {/* Knob springs across (bouncy, toggles only); instant once low-data
              is on, since that mode turns animation off. */}
          <m.span
            aria-hidden
            initial={false}
            animate={{ x: lowData ? 24 : 4 }}
            transition={motionStill ? { duration: 0 } : spring.snappy}
            className="inline-block h-5 w-5 rounded-full bg-background shadow-e1"
          />
        </button>
      </div>
      <ul className="mt-4 grid gap-1.5 text-footnote text-label-2 sm:grid-cols-2">
        <li>• {t("lowData.point.images", "Small thumbnail photos only")}</li>
        <li>• {t("lowData.point.carousel", "Photo carousels don't auto-play")}</li>
        <li>• {t("lowData.point.motion", "Animations turned off")}</li>
        <li>• {t("lowData.point.charts", "Charts load only when you tap them")}</li>
      </ul>
      <p className="mt-3 text-footnote text-label-2">
        {t("lowData.storedLocally", "Saved on this device only.")}
      </p>
      <LowDataSuggestion className="mt-4" />
    </section>
  );
}
