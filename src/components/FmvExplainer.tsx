import { useEffect, useId, useRef, useState } from "react";
import { Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPriceLkrMillions } from "@/lib/formatting";

export type FmvConfidence = "high" | "medium" | "low" | "none";
export type FmvLocale = "en" | "si" | "ta";

export interface FmvExplainerProps {
  compsCount: number;
  confidence: FmvConfidence;
  /** Backend FMV method, e.g. ols_comps | adjusted_median | cohort_median. */
  method?: string | null;
  /** LKR adjustment applied for mileage (negative = lowered FMV). */
  kmAdjustmentLkr?: number | null;
  /** LKR adjustment applied for district / location. */
  districtAdjustmentLkr?: number | null;
  fmvLkr?: number | null;
  updatedAt?: string | null;
  locale?: FmvLocale;
  className?: string;
}

type Copy = {
  trigger: string;
  title: string;
  comps: (n: number) => string;
  noComps: string;
  confidence: Record<FmvConfidence, string>;
  km: (v: string) => string;
  kmMissing: string;
  district: (v: string) => string;
  districtMissing: string;
  updated: (v: string) => string;
  close: string;
};

const STRINGS: Record<FmvLocale, Copy> = {
  en: {
    trigger: "Why this FMV?",
    title: "How we estimated fair value",
    comps: (n) => `Based on ${n} similar listing${n === 1 ? "" : "s"} on the market right now.`,
    noComps: "Not enough similar listings for a strong estimate — treat this FMV as a rough guide.",
    confidence: {
      high: "High confidence — plenty of close matches.",
      medium: "Medium confidence — decent matches, small differences remain.",
      low: "Low confidence — few matches, price could swing.",
      none: "No confidence rating — too little data.",
    },
    km: (v) => `Mileage adjustment: ${v}. High mileage pulls FMV down, low mileage lifts it.`,
    kmMissing: "Mileage is already factored into the model average.",
    district: (v) => `District adjustment: ${v}. Prices run hotter in some districts.`,
    districtMissing: "Location is already factored into the model average.",
    updated: (v) => `Updated ${v}.`,
    close: "Close",
  },
  // STUB (si): core keys translated, detail rows fall back to English until localised.
  si: {
    trigger: "මෙම FMV එක ඇයි?",
    title: "සාධාරණ අගය තක්සේරු කළ ආකාරය",
    comps: (n) => `Based on ${n} similar listing${n === 1 ? "" : "s"} on the market right now. [si stub]`,
    noComps: "Not enough similar listings for a strong estimate. [si stub]",
    confidence: {
      high: "High confidence [si stub].",
      medium: "Medium confidence [si stub].",
      low: "Low confidence [si stub].",
      none: "No confidence rating [si stub].",
    },
    km: (v) => `Mileage adjustment: ${v}. [si stub]`,
    kmMissing: "Mileage is already factored into the model average. [si stub]",
    district: (v) => `District adjustment: ${v}. [si stub]`,
    districtMissing: "Location is already factored into the model average. [si stub]",
    updated: (v) => `Updated ${v}. [si stub]`,
    close: "වසන්න",
  },
  // STUB (ta): core keys translated, detail rows fall back to English until localised.
  ta: {
    trigger: "இந்த FMV ஏன்?",
    title: "நியாயமான மதிப்பை மதிப்பிட்ட விதம்",
    comps: (n) => `Based on ${n} similar listing${n === 1 ? "" : "s"} on the market right now. [ta stub]`,
    noComps: "Not enough similar listings for a strong estimate. [ta stub]",
    confidence: {
      high: "High confidence [ta stub].",
      medium: "Medium confidence [ta stub].",
      low: "Low confidence [ta stub].",
      none: "No confidence rating [ta stub].",
    },
    km: (v) => `Mileage adjustment: ${v}. [ta stub]`,
    kmMissing: "Mileage is already factored into the model average. [ta stub]",
    district: (v) => `District adjustment: ${v}. [ta stub]`,
    districtMissing: "Location is already factored into the model average. [ta stub]",
    updated: (v) => `Updated ${v}. [ta stub]`,
    close: "மூடு",
  },
};

const METHOD_LABEL: Record<string, string> = {
  ols_comps: "OLS model",
  adjusted_median: "Adj. median",
  cohort_median: "Cohort median",
};

function formatSignedLkr(value: number): string {
  const abs = formatPriceLkrMillions(Math.abs(value));
  return value < 0 ? `−${abs}` : `+${abs}`;
}

export function FmvExplainer({
  compsCount,
  confidence,
  method,
  kmAdjustmentLkr,
  districtAdjustmentLkr,
  fmvLkr,
  updatedAt,
  locale = "en",
  className,
}: FmvExplainerProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const t = STRINGS[locale] ?? STRINGS.en;
  const count = Number.isFinite(Number(compsCount)) ? Math.max(0, Math.floor(Number(compsCount))) : 0;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open ]);

  const updatedLabel = updatedAt
    ? (() => {
        const d = new Date(updatedAt);
        return Number.isNaN(d.getTime())
          ? null
          : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      })()
    : null;

  return (
    <div ref={wrapRef} className={cn("relative inline-block", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[12px] font-semibold text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
      >
        <Info className="h-3 w-3" aria-hidden />
        {t.trigger}
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={t.title}
          className="absolute left-0 top-full z-40 mt-2 w-72 rounded-xl border border-border bg-popover p-4 text-left shadow-soft-xl"
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <h4 className="text-[12px] font-semibold text-primary-bright">
              {t.title}
            </h4>
            <button
              type="button"
              aria-label={t.close}
              onClick={() => setOpen(false)}
              className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>

          {fmvLkr != null && Number(fmvLkr) > 0 && (
            <p className="num text-sm font-extrabold text-foreground">
              {formatPriceLkrMillions(Number(fmvLkr))}
            </p>
          )}

          <ul className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-muted-foreground">
            <li>• {count > 0 ? t.comps(count) : t.noComps}</li>
            <li>• {t.confidence[confidence] ?? t.confidence.none}</li>
            <li>
              •{" "}
              {kmAdjustmentLkr != null && Number.isFinite(Number(kmAdjustmentLkr))
                ? t.km(formatSignedLkr(Number(kmAdjustmentLkr)))
                : t.kmMissing}
            </li>
            <li>
              •{" "}
              {districtAdjustmentLkr != null && Number.isFinite(Number(districtAdjustmentLkr))
                ? t.district(formatSignedLkr(Number(districtAdjustmentLkr)))
                : t.districtMissing}
            </li>
            {method && method !== "insufficient_data" && (
              <li>• {METHOD_LABEL[method] ?? method}</li>
            )}
            {updatedLabel && <li>• {t.updated(updatedLabel)}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
