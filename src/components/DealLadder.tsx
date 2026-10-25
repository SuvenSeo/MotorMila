import { computeDealLadder } from "@/lib/dealLadder";
import { formatPrice } from "@/services/api";
import { cn } from "@/lib/utils";
import { useAppPreferences } from "@/lib/appPreferences";

const BAND_LABEL = {
  good_deal: ["listingMeta.goodDeal", "Good Deal"],
  fair: ["listingMeta.fairPrice", "Fair Price"],
  overpriced: ["listingMeta.overpriced", "Overpriced"],
} as const;

interface DealLadderProps {
  askingPrice: number;
  marketMedianLkr: number;
  className?: string;
}

const RUNG_TONE = {
  good_deal: {
    active: "border-deal-good/35 bg-deal-good/10 text-deal-good-text",
    idle: "border-border/60 text-muted-foreground",
  },
  fair: {
    active: "border-primary/35 bg-primary/10 text-primary-bright",
    idle: "border-border/60 text-muted-foreground",
  },
  overpriced: {
    active: "border-deal-high/35 bg-deal-high/10 text-deal-high-text",
    idle: "border-border/60 text-muted-foreground",
  },
} as const;

export function DealLadder({ askingPrice, marketMedianLkr, className }: DealLadderProps) {
  const { t } = useAppPreferences();
  const ladder = computeDealLadder({ askingPrice, marketMedianLkr });
  if (!ladder) return null;
  const bandName = (band: keyof typeof BAND_LABEL) => t(BAND_LABEL[band][0], BAND_LABEL[band][1]);

  return (
    <div className={cn("mt-4 border-t border-border pt-3", className)}>
      <p className="text-caption font-medium text-muted-foreground">
        {t("dealLadder.title", "Deal ladder")}
      </p>
      <p className="mt-2 text-footnote font-semibold text-foreground">
        {ladder.band === "good_deal" ? (
          t("dealLadder.already", "Already a Good Deal")
        ) : ladder.cutToGoodDeal > 0 ? (
          (() => {
            const [before, after] = t("dealLadder.cut", "Cut {amount} to hit Good Deal", { amount: "\u0000" }).split("\u0000");
            return (
              <>
                {before}
                <span className="num text-primary">{formatPrice(ladder.cutToGoodDeal)}</span>
                {after}
              </>
            );
          })()
        ) : (
          bandName(ladder.band)
        )}
      </p>
      <p className="mt-1 text-caption text-muted-foreground">
        {t("dealLadder.currentBand", "Current band:")}{" "}
        <span
          className={cn(
            "font-semibold",
            ladder.band === "good_deal" && "text-deal-good-text",
            ladder.band === "fair" && "text-primary",
            ladder.band === "overpriced" && "text-deal-high-text",
          )}
        >
          {bandName(ladder.band)}
        </span>
      </p>

      <ol className="mt-3 space-y-1.5">
        {ladder.rungs.map((rung) => {
          const tone = RUNG_TONE[rung.band];
          const priceHint =
            rung.band === "good_deal"
              ? `≤ ${formatPrice(ladder.goodDealPrice)}`
              : rung.band === "fair"
                ? `≤ ${formatPrice(ladder.overpricedThreshold - 1)}`
                : `≥ ${formatPrice(ladder.overpricedThreshold)}`;

          return (
            <li
              key={rung.band}
              className={cn(
                "flex items-center justify-between rounded-2xl border px-2.5 py-1.5 text-caption font-medium",
                rung.active ? tone.active : tone.idle,
              )}
            >
              <span>{bandName(rung.band)}{rung.active ? t("dealLadder.you", " · you") : ""}</span>
              <span className="num font-medium normal-case tracking-normal opacity-80">{priceHint}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
