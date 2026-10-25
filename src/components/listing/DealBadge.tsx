import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, FileWarning, Info, TrendingDown, TrendingUp, Minus, X } from "lucide-react";
import { Link } from "react-router-dom";
import { AnimatePresence, m } from "motion/react";
import { fadeIn, scaleIn, useReducedMotionOrLowData } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { howWePriceHref } from "@/lib/howWePrice";
import { useAppPreferences } from "@/lib/appPreferences";
import {
  DEAL_BADGE_CLASSES,
  DEAL_SOFT_CLASSES,
  VERIFY_BELOW_PCT,
  dealBadgeLabel,
  formatLkrShort,
  type DealBadge as DealBadgeModel,
  type DealConfidence,
} from "@/lib/dealBadge";

export interface DealWhyData {
  fmvLkr: number | null;
  askingLkr: number | null;
  compsCount: number | null;
  confidence: DealConfidence | null;
  method: string | null;
}

interface DealBadgeProps {
  badge: DealBadgeModel;
  /** "overlay" = on photos / sticky bar (solid fill); "soft" = plain surfaces. */
  tone?: "overlay" | "soft";
  size?: "sm" | "md";
  /** When given, a "Why?" button opens the FMV reasoning popover. */
  why?: DealWhyData | null;
  className?: string;
}

const ICONS = {
  below: TrendingDown,
  above: TrendingUp,
  fair: Minus,
  verify: AlertTriangle,
  lease: FileWarning,
} as const;

const METHOD_KEYS: Record<string, [string, string]> = {
  ols_comps: ["deal.method.ols", "Regression on similar listings (year, mileage, district)"],
  adjusted_median: ["deal.method.adjusted", "Median of similar listings, adjusted for mileage and district"],
  cohort_median: ["deal.method.cohort", "Median asking price of the same make, model and year"],
};

export function DealBadge({ badge, tone = "soft", size = "sm", why, className }: DealBadgeProps) {
  const { t } = useAppPreferences();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const whyRef = useRef<HTMLButtonElement>(null);
  const calm = useReducedMotionOrLowData();
  // The popover grows out of its "Why?" trigger.
  const originX = whyRef.current ? whyRef.current.offsetLeft + whyRef.current.offsetWidth / 2 : 0;
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onPointer = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  if (badge.kind === "none") return null;
  const label = dealBadgeLabel(badge, t);
  const Icon = ICONS[badge.kind];
  const palette = tone === "overlay" ? DEAL_BADGE_CLASSES[badge.kind] : DEAL_SOFT_CLASSES[badge.kind];
  const showWhy = Boolean(why) && badge.kind !== "lease";

  const comps = why?.compsCount != null && Number(why.compsCount) > 0 ? Math.floor(Number(why.compsCount)) : null;
  const confidence = why?.confidence ?? null;
  const method = why?.method && why.method !== "insufficient_data" ? why.method : null;
  const methodCopy = method ? METHOD_KEYS[method] : null;

  return (
    <span ref={wrapRef} className={cn("relative inline-flex items-center gap-1.5", className)}>
      <span
        data-deal-kind={badge.kind}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border font-semibold num leading-tight",
          size === "md" ? "px-3 py-1 text-footnote" : "px-2.5 py-0.5 text-caption",
          palette,
        )}
      >
        <Icon aria-hidden className={size === "md" ? "h-3.5 w-3.5" : "h-3 w-3"} />
        {label}
      </span>

      {showWhy && (
        <button
          ref={whyRef}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setOpen((v) => !v);
          }}
          className="pointer-events-auto inline-flex min-h-[28px] items-center gap-0.5 rounded-full px-1.5 text-caption font-semibold text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Info aria-hidden className="h-3 w-3" />
          {t("deal.why", "Why?")}
        </button>
      )}

      <AnimatePresence>
      {showWhy && open && (
        <m.span
          key="why"
          initial="hidden"
          animate="show"
          exit="exit"
          variants={calm ? fadeIn : scaleIn}
          style={{ transformOrigin: `${Math.round(originX)}px 0px` }}
          id={panelId}
          role="dialog"
          aria-label={t("deal.whyTitle", "How we judged this price")}
          className="absolute left-0 top-full z-50 mt-2 block w-[min(18rem,calc(100vw-2.5rem))] rounded-xl border border-border bg-popover p-3.5 text-left text-popover-foreground shadow-soft-xl"
        >
          <span className="mb-1.5 flex items-start justify-between gap-2">
            <span className="text-caption font-semibold text-foreground">{t("deal.whyTitle", "How we judged this price")}</span>
            <button
              type="button"
              aria-label={t("deal.close", "Close")}
              onClick={() => setOpen(false)}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X aria-hidden className="h-3.5 w-3.5" />
            </button>
          </span>
          <span className="block space-y-1.5 text-caption leading-relaxed text-muted-foreground">
            {why?.fmvLkr != null && why.fmvLkr > 0 && (
              <span className="block">
                {t("deal.whyTypical", "Typical asking price for similar vehicles: {fmv}.", { fmv: formatLkrShort(why.fmvLkr) })}
              </span>
            )}
            <span className="block">
              {comps != null
                ? t("deal.whyComps", "Based on {n} comparable listings.", { n: comps })
                : t("deal.whyNoComps", "Comparable count not available for this estimate.")}
            </span>
            <span className="block">
              {confidence === "high"
                ? t("deal.conf.high", "Confidence: high — plenty of close matches.")
                : confidence === "medium"
                  ? t("deal.conf.medium", "Confidence: medium — decent matches.")
                  : confidence === "low" || confidence === "none"
                    ? t("deal.conf.low", "Confidence: low — few matches, treat as a rough guide.")
                    : t("deal.conf.unknown", "Confidence not rated.")}
            </span>
            {methodCopy && (
              <span className="block">{t("deal.whyMethod", "Method: {method}.", { method: t(methodCopy[0], methodCopy[1]) })}</span>
            )}
            {badge.kind === "verify" && (
              <span className="block font-medium text-deal-caution-text">
                {t(
                  "deal.whyVerify",
                  "More than {pct}% under typical, or a weak estimate. Bait prices are a common scam — see the car and the CR book before paying anything.",
                  { pct: VERIFY_BELOW_PCT },
                )}
              </span>
            )}
            <span className="block text-caption">
              {t("deal.whyAsking", "These are asking prices on listing sites, not sale prices.")}
            </span>
            <Link
              to={howWePriceHref("fmv")}
              onClick={() => setOpen(false)}
              className="inline-flex min-h-[28px] items-center text-caption font-semibold text-primary-bright underline underline-offset-2 hover:text-foreground"
            >
              {t("deal.howWePrice", "How we price →")}
            </Link>
          </span>
        </m.span>
      )}
      </AnimatePresence>
    </span>
  );
}
