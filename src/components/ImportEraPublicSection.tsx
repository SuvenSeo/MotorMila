import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRightLeft, Crown } from "lucide-react";
import { formatPrice, getImportEraSplit } from "@/services/api";
import type { ImportEraSplitData } from "@/types/car";

export function ImportEraPublicSection() {
  const [data, setData] = useState<ImportEraSplitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getImportEraSplit(6)
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch(() => {
        if (!cancelled) setError("Import-era data temporarily unavailable.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="rounded-3xl border border-border/80 bg-card p-5 sm:p-6 shadow-soft" aria-labelledby="import-era-heading">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-caption font-medium text-primary/70">Post-freeze market</p>
          <h2 id="import-era-heading" className="mt-1 text-footnote font-semibold text-foreground">
            Pre-freeze vs post-freeze price cohorts
          </h2>
          <p className="mt-1 max-w-2xl text-caption text-muted-foreground">
            Median asking prices for top makes before and after the 2025 import reopening — the two-tier used market in one view.
          </p>
        </div>
        <span className="text-caption font-medium text-primary/70">Public</span>
      </div>

      {loading ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl border border-border/80 bg-surface/70" />
          ))}
        </div>
      ) : error ? (
        <p className="text-footnote text-muted-foreground">{error}</p>
      ) : !data?.makes?.length ? (
        <p className="text-footnote text-muted-foreground">Not enough year-tagged listings to build era cohorts yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.makes.slice(0, 6).map((row) => {
            const pre = row.pre_freeze.median_price_lkr;
            const post = row.post_freeze.median_price_lkr;
            const premium =
              pre && post && pre > 0 ? Math.round(((post - pre) / pre) * 1000) / 10 : null;
            return (
              <article key={row.make} className="rounded-2xl border border-border/80 bg-surface/70 p-4 shadow-xs">
                <p className="text-footnote font-semibold text-foreground">{row.make}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-caption">
                  <div>
                    <p className="text-muted-foreground">Pre-freeze</p>
                    <p className="mt-0.5 font-semibold num text-deal-caution-text">
                      {pre != null ? formatPrice(pre) : "—"}
                    </p>
                    <p className="text-caption text-muted-foreground">{row.pre_freeze.count} listings</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Post-freeze</p>
                    <p className="mt-0.5 font-semibold num text-primary">
                      {post != null ? formatPrice(post) : "—"}
                    </p>
                    <p className="text-caption text-muted-foreground">{row.post_freeze.count} listings</p>
                  </div>
                </div>
                {premium != null ? (
                  <p className="mt-2 text-caption text-muted-foreground">
                    Post-freeze premium{" "}
                    <span className="font-semibold text-foreground num">
                      {premium >= 0 ? "+" : ""}
                      {premium}%
                    </span>
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Crown className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <p className="text-footnote font-semibold text-foreground">Pro district arbitrage</p>
            <p className="mt-0.5 text-caption text-muted-foreground">
              See buy-here / sell-there median gaps by make and model across Sri Lanka districts.
            </p>
          </div>
        </div>
        <Link
          to="/pro"
          className="inline-flex h-9 items-center gap-1.5 self-start rounded-2xl border border-border px-3 text-caption font-medium text-foreground no-underline hover:bg-foreground/[0.03]"
        >
          <ArrowRightLeft className="h-3.5 w-3.5" />
          Open Pro lanes
        </Link>
      </div>
    </section>
  );
}
