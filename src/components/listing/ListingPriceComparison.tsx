import { useAppPreferences } from "@/lib/appPreferences";
import { DEAL_BAR_CLASSES, DEAL_TEXT_CLASSES } from "@/lib/dealBadge";
import type { FmvSummary } from "@/lib/fmv";
import { formatPrice } from "@/services/api";

export function ListingPriceComparison({ fmv, verdictTitle }: { fmv: FmvSummary; verdictTitle?: string }) {
  const { t } = useAppPreferences();
  const kind = fmv.verify_first ? "verify" : fmv.band;
  const position = Math.max(8, Math.min(92, 50 - fmv.delta_pct));

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <span className="num text-caption font-medium text-label-2">
          {t("listingCard.typical", "Typical {price}", { price: formatPrice(fmv.fmv_lkr) })}
        </span>
        <span className={`num ml-auto text-right text-caption font-semibold ${DEAL_TEXT_CLASSES[kind]}`} title={verdictTitle}>
          {fmv.shortLabel}
        </span>
      </div>
      <div aria-hidden className="mt-1.5 h-1 overflow-hidden rounded-full bg-foreground/10">
        <div
          className={`h-full origin-left rounded-full transition-transform duration-long ease-decelerate motion-reduce:transition-none ${DEAL_BAR_CLASSES[kind]}`}
          style={{ transform: `scaleX(${position / 100})` }}
        />
      </div>
    </div>
  );
}
