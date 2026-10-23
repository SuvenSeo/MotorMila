import { useEffect, useState } from "react";
import { Database, ShieldCheck } from "lucide-react";
import { getSourceQuality } from "@/services/api";
import type { SourceQualityRow, SourceQualityResponse } from "@/types/car";
import { Skeleton } from "@/components/ui/skeleton";

type MetricConfig = {
  label: string;
  value: string;
  colorClass: string;
  barWidth: number;
};

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function metricColor(good: boolean, ok: boolean): string {
  if (good) return "text-deal-good-text";
  if (ok) return "text-deal-caution-text";
  return "text-deal-high-text";
}

function barColor(good: boolean, ok: boolean): string {
  if (good) return "bg-deal-good";
  if (ok) return "bg-deal-caution";
  return "bg-deal-high";
}

function buildMetrics(row: SourceQualityRow): MetricConfig[] {
  const fillGood = row.price_fill_rate >= 0.8;
  const fillOk = row.price_fill_rate >= 0.5;
  const freshGood = row.fresh_24h_pct >= 0.3;
  const freshOk = row.fresh_24h_pct >= 0.1;
  const outlierGood = row.outlier_rate < 0.05;
  const outlierOk = row.outlier_rate < 0.1;
  const dupGood = row.duplicate_rate < 0.05;
  const dupOk = row.duplicate_rate < 0.1;

  return [
    {
      label: "Price fill rate",
      value: pct(row.price_fill_rate),
      colorClass: metricColor(fillGood, fillOk),
      barWidth: Math.min(100, row.price_fill_rate * 100),
    },
    {
      label: "Fresh 24h",
      value: pct(row.fresh_24h_pct),
      colorClass: metricColor(freshGood, freshOk),
      barWidth: Math.min(100, row.fresh_24h_pct * 100),
    },
    {
      label: "Outlier rate",
      value: pct(row.outlier_rate),
      colorClass: metricColor(outlierGood, outlierOk),
      barWidth: Math.min(100, row.outlier_rate * 400),
    },
    {
      label: "Duplicate rate",
      value: pct(row.duplicate_rate),
      colorClass: metricColor(dupGood, dupOk),
      barWidth: Math.min(100, row.duplicate_rate * 400),
    },
  ];
}

function SourceCard({ row }: { row: SourceQualityRow }) {
  const metrics = buildMetrics(row);
  return (
    <div className="asset-surface rounded-xl p-5 transition-ui duration-medium ease-decelerate hover:border-primary/30 hover:shadow-soft-lg">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-callout font-bold text-foreground">{row.source}</p>
          <p className="mt-1 tech-label text-muted-foreground">
            {row.listing_count.toLocaleString()} listings
          </p>
        </div>
        <ShieldCheck className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      </div>

      <div className="mt-4 space-y-3">
        {metrics.map((metric) => {
          const good = metric.colorClass.includes("emerald");
          const ok = metric.colorClass.includes("amber");
          return (
            <div key={metric.label}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-caption text-muted-foreground">{metric.label}</p>
                <p className={`text-caption font-bold num ${metric.colorClass}`}>{metric.value}</p>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-foreground/[0.06]">
                <div
                  className={`h-full rounded-full transition-ui duration-long ease-decelerate ${barColor(good, ok)}`}
                  style={{ width: `${metric.barWidth}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SourceQualityScorecard() {
  const [data, setData] = useState<SourceQualityResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getSourceQuality()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading source quality">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-52 rounded-xl bg-foreground/[0.03]" />
        ))}
      </div>
    );
  }

  if (!data || data.sources.length === 0) {
    return (
      <div className="console-empty">
        <Database className="mx-auto mb-3 h-7 w-7 text-muted-foreground" aria-hidden="true" />
        <p className="text-footnote text-muted-foreground">No source quality data available yet.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {data.sources.map((row) => (
        <SourceCard key={row.source} row={row} />
      ))}
    </div>
  );
}
