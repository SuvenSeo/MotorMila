import type { CSSProperties } from "react";
import { Sparkles } from "lucide-react";
import { useAppPreferences } from "@/lib/appPreferences";
import { formatLkrShort } from "@/lib/dealBadge";
import type { PriceVerdictOk } from "@/lib/priceVerdict";

/** The meter spans −30 % … +30 % around the AI Value (clamped at the ends). */
const SPAN_PCT = 30;

/**
 * "AI Value" read-out under the asking price: the reference price and a band
 * (great → fair → high) with a marker where this ad sits. Reads the one
 * verdict the page already resolved (lib/priceVerdict), so it can never
 * disagree with the deal badge, FMV card or sticky bar. The marker slides in
 * once (transform only); still under reduced motion / low data.
 */
export function AiValueMeter({ verdict, className }: { verdict: PriceVerdictOk; className?: string }) {
  const { t } = useAppPreferences();
  const clamped = Math.max(-SPAN_PCT, Math.min(SPAN_PCT, verdict.gapPct));
  const x = Math.round(((clamped + SPAN_PCT) / (SPAN_PCT * 2)) * 1000) / 10;
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-center gap-1.5 text-caption font-semibold text-foreground">
          <Sparkles aria-hidden className="h-3.5 w-3.5 text-primary" />
          {t("shell.home.hud.title", "AI Value")}
        </p>
        <p className="num text-footnote font-semibold text-foreground">{formatLkrShort(verdict.referenceLkr)}</p>
      </div>
      <div
        className="cine-meter mt-3"
        role="img"
        aria-label={t("listing.aiValue.meterAria", "Asking price compared with the AI Value: {pct}% {dir}", {
          pct: verdict.pct,
          dir: verdict.gapPct < 0 ? t("listing.aiValue.below", "below") : t("listing.aiValue.above", "above"),
        })}
      >
        <span className="cine-meter__band" />
        <span className="cine-meter__carrier" style={{ "--x": x } as CSSProperties}>
          <span className="cine-meter__dot" />
        </span>
      </div>
      <div className="mt-2 flex justify-between text-caption text-muted-foreground">
        <span>{t("shell.home.hud.great", "Great price")}</span>
        <span>{t("shell.home.hud.fair", "Fair")}</span>
        <span>{t("shell.home.hud.high", "High")}</span>
      </div>
    </div>
  );
}
