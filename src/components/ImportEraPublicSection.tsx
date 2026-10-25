import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { m } from "motion/react";
import { ArrowRightLeft, Crown, History } from "lucide-react";
import { formatPrice, getImportEraSplit } from "@/services/api";
import type { ImportEraSplitData } from "@/types/car";
import { useAppPreferences } from "@/lib/appPreferences";
import { listItem } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { buttonVariants } from "@/components/ui/button-variants";
import { SectionHeading } from "@/components/ui/section-heading";

/**
 * Post-freeze premium in percent (one decimal), or null when either median is
 * missing or the cohorts are not like-for-like (post/pre outside 0.5x–4x, e.g. a
 * make that sold motorbikes before the freeze and cars after).
 */
export function importEraPremiumPct(pre: number | null | undefined, post: number | null | undefined): number | null {
  if (!pre || !post || pre <= 0 || post <= 0) return null;
  const ratio = post / pre;
  if (ratio > 4 || ratio < 0.5) return null;
  return Math.round((ratio - 1) * 1000) / 10;
}

export function ImportEraPublicSection() {
  const { t, localeTag } = useAppPreferences();
  const [data, setData] = useState<ImportEraSplitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    getImportEraSplit(6)
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return (
    <Card padding="md" role="region" aria-labelledby="import-era-heading">
      <SectionHeading
        id="import-era-heading"
        eyebrow={t("importEra.eyebrow", "Post-freeze market")}
        title={t("importEra.title", "Pre-freeze vs post-freeze price cohorts")}
        description={t(
          "importEra.body",
          "Median asking prices for top makes before and after the 2025 import reopening — the two-tier used market in one view.",
        )}
        actions={<Badge variant="info">{t("importEra.public", "Public")}</Badge>}
      />

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : error ? (
        <ErrorState className="py-8" title={t("importEra.error", "Import-era data temporarily unavailable.")} onRetry={retry} />
      ) : !data?.makes?.length ? (
        <EmptyState
          className="py-8"
          icon={History}
          title={t("importEra.emptyTitle", "Cohorts are still forming")}
          body={t("importEra.empty", "Not enough year-tagged listings to build era cohorts yet.")}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.makes.slice(0, 6).map((row, i) => {
            const pre = row.pre_freeze.median_price_lkr;
            const post = row.post_freeze.median_price_lkr;
            const premium = importEraPremiumPct(pre, post);
            // A make whose cohorts mix vehicle types (Honda: motorbikes before the
            // freeze, cars after) yields a meaningless "+2349%": say so instead.
            const mixedCohort = premium == null && pre != null && post != null && pre > 0 && post > 0;
            return (
              <m.article
                key={row.make}
                variants={listItem}
                custom={i}
                initial="hidden"
                animate="show"
                className="rounded-card border border-border bg-surface-2 p-4"
              >
                <p className="text-callout font-semibold text-foreground">{row.make}</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {[
                    { label: t("importEra.pre", "Pre-freeze"), value: pre, count: row.pre_freeze.count, tone: "text-deal-caution-text" },
                    { label: t("importEra.post", "Post-freeze"), value: post, count: row.post_freeze.count, tone: "text-primary" },
                  ].map((c) => (
                    <div key={c.label} className="min-w-0">
                      <p className="text-caption text-label-2">{c.label}</p>
                      <p className={cn("mt-0.5 text-footnote font-semibold tabular-nums", c.tone)}>
                        {c.value != null ? formatPrice(c.value) : "—"}
                      </p>
                      <p className="text-caption tabular-nums text-label-2">
                        {t("importEra.listings", "{n} listings", { n: Number(c.count || 0).toLocaleString(localeTag) })}
                      </p>
                    </div>
                  ))}
                </div>
                {premium != null ? (
                  <p className="mt-3 text-caption text-label-2">
                    {t("importEra.premium", "Post-freeze premium")}{" "}
                    <span className="font-semibold tabular-nums text-foreground">
                      {premium >= 0 ? "+" : ""}
                      {premium}%
                    </span>
                  </p>
                ) : mixedCohort ? (
                  <p className="mt-3 text-caption text-label-2">
                    {t("importEra.mixedCohort", "Mixed vehicle types, so no like-for-like premium")}
                  </p>
                ) : null}
              </m.article>
            );
          })}
        </div>
      )}

      <div className="mt-5 flex flex-col gap-3 rounded-card border border-primary/25 bg-primary/10 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Crown className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <div>
            <p className="text-footnote font-semibold text-foreground">{t("importEra.proTitle", "Pro district arbitrage")}</p>
            <p className="mt-0.5 text-caption text-label-2">
              {t("importEra.proBody", "See buy-here / sell-there median gaps by make and model across Sri Lanka districts.")}
            </p>
          </div>
        </div>
        <Link to="/pro" className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "self-start no-underline")}>
          <ArrowRightLeft aria-hidden />
          {t("importEra.proCta", "Open Pro lanes")}
        </Link>
      </div>
    </Card>
  );
}
