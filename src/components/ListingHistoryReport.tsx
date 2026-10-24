import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { AlertTriangle, ShieldAlert, History, Clock, TrendingDown, Layers, Info } from "lucide-react";
import { getListingHistoryReport, formatPrice } from "@/services/api";
import type { HistoryReport, HistoryReportFlag } from "@/types/car";
import { revealItem } from "@/lib/motion";
import { useAppPreferences } from "@/lib/appPreferences";

const FLAG_ICON: Record<string, typeof AlertTriangle> = {
  odometer_inconsistency: ShieldAlert,
  multi_listed: Layers,
  long_market: Clock,
  price_cut_streak: TrendingDown,
  possibly_sold: AlertTriangle,
};

function flagTone(severity: string): string {
  if (severity === "high") return "border-deal-high/25 bg-deal-high/10 text-deal-high-text";
  if (severity === "medium") return "border-deal-caution/25 bg-deal-caution/10 text-deal-caution-text";
  return "border-border bg-surface text-muted-foreground";
}

function formatDate(iso: string | null, localeTag: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString(localeTag, { day: "numeric", month: "short", year: "numeric" }) : "—";
}

function FlagRow({ flag }: { flag: HistoryReportFlag }) {
  const Icon = FLAG_ICON[flag.kind] || Info;
  return (
    <div className={`flex items-start gap-2.5 rounded-2xl border p-3 ${flagTone(flag.severity)}`}>
      <Icon className="h-4 w-4 shrink-0 mt-0.5" />
      <p className="text-caption leading-relaxed font-medium">{flag.detail}</p>
    </div>
  );
}

export function ListingHistoryReport({ listingId }: { listingId: number | string }) {
  const { t, localeTag } = useAppPreferences();
  const [report, setReport] = useState<HistoryReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getListingHistoryReport(listingId)
      .then((r) => { if (!cancelled) setReport(r); })
      .catch(() => { /* additive section — silent */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [listingId]);

  if (loading) {
    return <div className="h-40 rounded-xl border border-border bg-surface animate-pulse" />;
  }
  if (!report) return null;

  const hasSignals =
    report.flags.length > 0 ||
    report.related_listings.length > 0 ||
    (report.days_on_market ?? 0) > 0 ||
    report.price_points.length > 1;

  if (!hasSignals) return null;

  return (
    <motion.div
      variants={revealItem}
      initial="hidden"
      animate="show"
      className="rounded-xl border border-border bg-card p-5"
    >
      <div className="mb-4 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
          <History className="h-4 w-4 text-primary-bright" />
        </div>
        <div>
          <h2 className="text-footnote font-bold text-foreground">{t("historyReport.title", "Listing history")}</h2>
          <p className="text-caption text-muted-foreground font-semibold">{t("historyReport.subtitle", "What our archive knows about this ad")}</p>
        </div>
      </div>

      {/* Timeline facts */}
      <div className="grid grid-cols-3 gap-2 border-b border-border pb-4">
        <div>
          <p className="text-caption font-medium text-muted-foreground">{t("historyReport.firstSeen", "First seen")}</p>
          <p className="mt-1 text-caption font-bold text-foreground">{formatDate(report.first_seen_at, localeTag)}</p>
        </div>
        <div>
          <p className="text-caption font-medium text-muted-foreground">{t("historyReport.daysOnMarket", "Days on market")}</p>
          <p className="mt-1 text-caption font-bold text-foreground num">{report.days_on_market ?? "—"}</p>
        </div>
        <div>
          <p className="text-caption font-medium text-muted-foreground">{t("historyReport.priceCuts", "Price cuts")}</p>
          <p className="mt-1 text-caption font-bold text-foreground num">
            {report.price_cuts}
            {report.total_change_pct !== null && report.total_change_pct < 0 && (
              <span className="ml-1 text-deal-good-text">({report.total_change_pct}%)</span>
            )}
          </p>
        </div>
      </div>

      {/* Flags */}
      {report.flags.length > 0 && (
        <div className="mt-4 space-y-2">
          {report.flags.map((f, i) => <FlagRow key={`${f.kind}-${i}`} flag={f} />)}
        </div>
      )}

      {/* Related listings */}
      {report.related_listings.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-caption font-medium text-muted-foreground">
            {t("historyReport.related", "Same vehicle in other ads ({n})", { n: report.related_listings.length })}
          </p>
          <div className="space-y-1.5">
            {report.related_listings.map((r) => (
              <Link
                key={r.id}
                to={`/listing/${r.id}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-2.5 no-underline transition-colors hover:border-primary/40 hover:bg-card"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-caption font-semibold text-foreground">{r.title}</span>
                  <span className="text-caption text-muted-foreground font-medium">
                    {r.source}
                    {r.mileage ? ` · ${(r.mileage / 1000).toFixed(0)}k km` : ""}
                    {" · "}
                    {r.confidence === "confirmed"
                      ? t("historyReport.matched", "matched")
                      : r.confidence === "photo_match"
                        ? t("historyReport.samePhoto", "same photo")
                        : t("historyReport.likelyMatch", "likely match")}
                  </span>
                </span>
                {r.price_lkr && <span className="shrink-0 text-caption font-bold text-foreground num">{formatPrice(r.price_lkr)}</span>}
              </Link>
            ))}
          </div>
        </div>
      )}

      <p className="mt-4 flex items-start gap-1.5 border-t border-border pt-3 text-caption leading-relaxed text-muted-foreground font-medium">
        <Info className="h-3 w-3 shrink-0 mt-0.5" />
        {report.disclaimer}
      </p>
    </motion.div>
  );
}
