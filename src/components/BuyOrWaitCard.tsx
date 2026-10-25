import { useQuery } from "@tanstack/react-query";
import { Hourglass, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { getPriceTrends } from "@/services/api";
import { QUERY_STALE } from "@/lib/queryPolicy";
import { computePriceOutlook } from "@/lib/priceOutlook";
import { useAppPreferences } from "@/lib/appPreferences";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";

/**
 * Buy-now-or-wait outlook for a make/model, from the same trend series the
 * ModelTrendPanel charts (shared React Query key, so no extra request).
 * Always labelled indicative: it describes the recent trend, not the future.
 */
export function BuyOrWaitCard({
  make,
  model,
  className,
  displayMake,
  displayModel,
}: {
  make: string;
  model: string;
  className?: string;
  /** Human casing for copy (route params can be lowercase slugs). */
  displayMake?: string;
  displayModel?: string;
}) {
  const names = { make: displayMake ?? make, model: displayModel ?? model };
  const { t } = useAppPreferences();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["model-trend-panel", make, model],
    queryFn: () => getPriceTrends(make, model),
    enabled: Boolean(make && model),
    staleTime: QUERY_STALE.hub,
  });

  if (isLoading) {
    return (
      <Card padding="md" className={className} aria-busy="true">
        <div className="flex items-start gap-3" aria-hidden>
          <Skeleton shape="circle" className="h-10 w-10 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton shape="text" className="h-3 w-1/2" />
            <Skeleton shape="text" className="h-5 w-3/4" />
          </div>
        </div>
        <div className="mt-4 space-y-2" aria-hidden>
          <Skeleton shape="text" />
          <Skeleton shape="text" className="w-5/6" />
          <Skeleton shape="text" className="w-2/3" />
        </div>
      </Card>
    );
  }
  if (isError) {
    return (
      <Card padding="none" className={className}>
        <ErrorState className="py-8" title={t("outlook.errorTitle", "The outlook didn't load")} onRetry={() => void refetch()} />
      </Card>
    );
  }

  const outlook = computePriceOutlook(data ?? []);
  const Icon =
    outlook.stance === "easing" ? TrendingDown : outlook.stance === "firming" ? TrendingUp : outlook.stance === "steady" ? Minus : Hourglass;
  const tone =
    outlook.stance === "easing"
      ? "bg-deal-good/10 text-deal-good-text"
      : outlook.stance === "firming"
        ? "bg-deal-high/10 text-deal-high-text"
        : "bg-surface-2 text-foreground";

  return (
    <Card padding="md" role="region" aria-labelledby="buy-or-wait-title" className={cn("content-in", className)}>
      <div className="flex items-start gap-3">
        <span className={cn("inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full", tone)}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-footnote font-semibold text-primary">
            {t("outlook.eyebrow", "Buy now or wait? · Indicative")}
          </p>
          <h3 id="buy-or-wait-title" className="mt-1 font-display text-title3 font-semibold text-foreground">
            {t(`outlook.${outlook.stance}.headline`, outlook.headline)}
          </h3>
          {outlook.monthlyChangePct !== null && (
            <p className="mt-1 text-footnote tabular-nums text-label-2">
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
      <p className="mt-4 text-body text-foreground">{t(`outlook.${outlook.stance}.advice`, outlook.advice)}</p>
      <p className="mt-3 text-caption text-label-2">
        {t(
          "outlook.disclaimer",
          "Based on median asking prices of {make} {model} ads, not sale prices. Confidence: {confidence}. Duty, surcharge or loan-cap changes can move prices quickly. This isn't financial advice.",
          { ...names, confidence: t(`outlook.conf.${outlook.confidence}`, outlook.confidence) },
        )}
      </p>
    </Card>
  );
}
