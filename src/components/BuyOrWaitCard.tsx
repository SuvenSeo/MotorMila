import { useQuery } from "@tanstack/react-query";
import { Hourglass, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { getPriceTrends } from "@/services/api";
import { QUERY_STALE } from "@/lib/queryPolicy";
import { computePriceOutlook } from "@/lib/priceOutlook";
import { useAppPreferences } from "@/lib/appPreferences";
import { cn } from "@/lib/utils";

/**
 * Buy-now-or-wait outlook for a make/model, from the same trend series the
 * ModelTrendPanel charts (shared React Query key, so no extra request).
 * Always labelled indicative: it describes the recent trend, not the future.
 */
export function BuyOrWaitCard({ make, model, className }: { make: string; model: string; className?: string }) {
  const { t } = useAppPreferences();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["model-trend-panel", make, model],
    queryFn: () => getPriceTrends(make, model),
    enabled: Boolean(make && model),
    staleTime: QUERY_STALE.hub,
  });

  if (isLoading) {
    return <div className={cn("skeleton-shimmer h-40 rounded-2xl", className)} aria-hidden />;
  }
  if (isError) return null;

  const outlook = computePriceOutlook(data ?? []);
  const Icon =
    outlook.stance === "easing" ? TrendingDown : outlook.stance === "firming" ? TrendingUp : outlook.stance === "steady" ? Minus : Hourglass;
  const tone =
    outlook.stance === "easing"
      ? "bg-deal-green/10 text-deal-good-text"
      : outlook.stance === "firming"
        ? "bg-deal-high/10 text-deal-high-text"
        : "bg-muted text-foreground";

  return (
    <section aria-labelledby="buy-or-wait-title" className={cn("rounded-2xl border border-border bg-card p-6 shadow-soft", className)}>
      <div className="flex items-start gap-3">
        <span className={cn("inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl", tone)}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-caption font-semibold text-muted-foreground">
            {t("outlook.eyebrow", "Buy now or wait? · Indicative")}
          </p>
          <h3 id="buy-or-wait-title" className="mt-0.5 font-display text-callout font-semibold text-foreground">
            {outlook.headline}
          </h3>
          {outlook.monthlyChangePct !== null && (
            <p className="num mt-0.5 text-footnote text-muted-foreground">
              {t("outlook.change", "{sign}{pct}% a month on average over {n} months · {samples} ads", {
                sign: outlook.monthlyChangePct > 0 ? "+" : outlook.monthlyChangePct < 0 ? "−" : "",
                pct: Math.abs(outlook.monthlyChangePct).toFixed(1),
                n: outlook.windowMonths,
                samples: outlook.totalSamples.toLocaleString("en-LK"),
              })}
            </p>
          )}
        </div>
      </div>
      <p className="mt-3 text-body leading-relaxed text-foreground">{outlook.advice}</p>
      <p className="mt-3 text-caption leading-relaxed text-muted-foreground">
        {t(
          "outlook.disclaimer",
          "Based on median asking prices of {make} {model} ads, not sale prices. Confidence: {confidence}. Duty, surcharge or loan-cap changes can move prices quickly. This isn't financial advice.",
          { make, model, confidence: outlook.confidence },
        )}
      </p>
    </section>
  );
}
