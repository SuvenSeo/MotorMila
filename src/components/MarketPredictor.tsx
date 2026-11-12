import { memo, useMemo } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { PriceTrendPoint } from "@/types/car";

interface MarketPredictorProps {
  trendData?: PriceTrendPoint[];
  listingsToday?: number;
}

type SentimentBand = {
  label: "Strong Buy" | "Buy" | "Wait 3 Months" | "Sell";
  toneClass: string;
  dotClass: string;
  icon: React.ComponentType<{ className?: string }>;
  text: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function pickSentimentBand(score: number): SentimentBand {
  if (score >= 72) {
    return { label: "Strong Buy", toneClass: "text-deal-good-text", dotClass: "bg-deal-good", icon: ArrowUpRight, text: "Recent median movement and limited fresh supply suggest higher near-term asking pressure." };
  }
  if (score >= 56) {
    return { label: "Buy", toneClass: "text-deal-good-text", dotClass: "bg-deal-good", icon: ArrowUpRight, text: "Momentum is positive, but sample depth is still important before making an offer." };
  }
  if (score >= 40) {
    return { label: "Wait 3 Months", toneClass: "text-primary", dotClass: "bg-primary", icon: ArrowRight, text: "The signal is mixed, so compare fresh listings before moving quickly." };
  }
  return { label: "Sell", toneClass: "text-deal-high-text", dotClass: "bg-deal-high", icon: ArrowDownRight, text: "Asking prices look soft versus the current listing flow." };
}

export const MarketPredictor = memo(function MarketPredictor({ trendData, listingsToday = 0 }: MarketPredictorProps) {
  const sentimentScore = useMemo(() => {
    const baseline = trendData?.length
      ? clamp(36 + (trendData[trendData.length - 1].median_price / 300000), 28, 84)
      : 52;
    const historyOffset = trendData?.length && trendData.length > 1
      ? clamp((trendData[trendData.length - 1].median_price - trendData[0].median_price) / 180000, -8, 8)
      : 0;
    const liquidityPressure = listingsToday > 40 ? -3 : listingsToday > 20 ? 1 : 4;
    return clamp(Math.round((baseline * 0.78) + historyOffset + liquidityPressure), 18, 92);
  }, [listingsToday, trendData]);

  const band = useMemo(() => pickSentimentBand(sentimentScore), [sentimentScore]);
  const ToneIcon = band.icon;

  const predictiveInsights = useMemo(
    () => [
      trendData?.length
        ? `${trendData.length.toLocaleString()} monthly points feed this directional timing signal.`
        : "Trend depth is still building, so this timing signal is conservative.",
      `${listingsToday.toLocaleString()} new listings today indicate ${listingsToday > 35 ? "heavy supply" : "contained supply"} in metro districts.`,
      `Historical median trend suggests ${sentimentScore >= 56 ? "stable-to-upward" : sentimentScore >= 40 ? "mixed" : "softening"} pressure over the next cycle.`,
    ],
    [listingsToday, sentimentScore, trendData?.length],
  );

  return (
    <section className="asset-surface rounded-xl p-5 md:p-6 transition-shadow duration-medium hover:shadow-soft-lg">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="tech-label font-bold text-muted-foreground">Market pulse</p>
          <h3 className="text-title2 font-bold tracking-tight text-foreground">Buy timing signal</h3>
        </div>
        <div className={`inline-flex items-center gap-2 rounded-2xl border border-border bg-surface px-3 py-1.5 text-caption font-semibold tracking-tight ${band.toneClass}`}>
          <span className={`h-2 w-2 rounded-full ${band.dotClass}`} />
          <ToneIcon className="h-3.5 w-3.5" />
          Sentiment: {band.label}
        </div>
      </div>

      <p className={`mt-3 text-footnote ${band.toneClass}`}>{band.text}</p>

      <ul className="mt-4 space-y-2 text-footnote text-foreground">
        {predictiveInsights.map((insight) => (
          <li key={insight} className="flex gap-2">
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <span>{insight}</span>
          </li>
        ))}
      </ul>
    </section>
  );
});

MarketPredictor.displayName = "MarketPredictor";
