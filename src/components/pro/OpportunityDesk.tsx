import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { DeltaChip } from "@/components/pro/DeltaChip";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { daysSince, percentileRank, pctChange } from "@/lib/proAnalytics";
import { formatLkrCompact } from "@/lib/price";
import { useAppPreferences } from "@/lib/appPreferences";
import type { ProListingSample } from "@/types/pro";

type SortKey = "gap" | "score" | "fresh";

/**
 * The opportunity desk: what is mispriced *right now*, in one table. Each row
 * states the listing's position against its own lane median (the denominator
 * that was missing before), the deal score with a percentile so "8.4" means
 * something, and how long it has been listed — the three facts a broker acts on.
 */
export function OpportunityDesk({
  listings,
  laneMedian,
  laneScores,
  emptyLabel,
}: {
  listings: ProListingSample[];
  /** Median asking price per `make|||model`. */
  laneMedian: Map<string, number | null>;
  /** Every lane's average deal score, for the percentile column. */
  laneScores: number[];
  emptyLabel?: string;
}) {
  const { t } = useAppPreferences();
  const [sort, setSort] = useState<SortKey>("gap");

  const rows = useMemo(() => {
    const enriched = listings.map((listing) => {
      const median = laneMedian.get(`${listing.make}|||${listing.model}`) ?? null;
      const gap = pctChange(listing.price_lkr ?? null, median);
      const scorePct = percentileRank(listing.deal_score ?? null, laneScores);
      const age = daysSince(listing.first_seen_at ?? listing.last_seen_at ?? null);
      return { listing, gap, scorePct, age };
    });
    return enriched.sort((a, b) => {
      if (sort === "score") return (b.listing.deal_score ?? -1) - (a.listing.deal_score ?? -1);
      if (sort === "fresh") return (a.age ?? 999) - (b.age ?? 999);
      return (a.gap ?? 999) - (b.gap ?? 999);
    });
  }, [listings, laneMedian, laneScores, sort]);

  if (listings.length === 0) {
    return <p className="py-10 text-center text-footnote text-label-3">{emptyLabel ?? t("pro.market.noOpportunities", "No scored opportunities in the current snapshot.")}</p>;
  }

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-3 px-1 pb-2">
        <p className="text-caption text-label-3">
          {t("pro.market.rankedBy", "Ranked by gap to lane median")}
        </p>
        <SegmentedControl<SortKey>
          value={sort}
          onValueChange={setSort}
          aria-label={t("pro.market.sortAria", "Sort opportunities")}
          size="sm"
          options={[
            { value: "gap", label: t("pro.market.sortGap", "Gap") },
            { value: "score", label: t("pro.market.sortScore", "Score") },
            { value: "fresh", label: t("pro.market.sortFresh", "Newest") },
          ]}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] border-separate border-spacing-0 text-left">
          <caption className="sr-only">{t("pro.market.opportunitiesCaption", "Scored listings priced against their own lane median")}</caption>
          <thead>
            <tr className="text-caption text-label-3">
              <th scope="col" className="w-8 border-b border-separator pb-1.5 pr-2 font-medium">#</th>
              <th scope="col" className="border-b border-separator pb-1.5 pr-3 font-medium">{t("pro.col.vehicle", "Vehicle")}</th>
              <th scope="col" className="border-b border-separator pb-1.5 pr-3 text-right font-medium">{t("pro.col.price", "Price")}</th>
              <th scope="col" className="border-b border-separator pb-1.5 pr-3 text-right font-medium">{t("pro.col.vsLane", "vs lane")}</th>
              <th scope="col" className="border-b border-separator pb-1.5 pr-3 text-right font-medium">{t("pro.col.score", "Score")}</th>
              <th scope="col" className="border-b border-separator pb-1.5 text-right font-medium">{t("pro.col.listed", "Listed")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ listing, gap, scorePct, age }, index) => (
              <tr key={listing.id} className="group">
                <td className="py-2 pr-2 align-middle text-caption tabular-nums text-label-3">{String(index + 1).padStart(2, "0")}</td>
                <td className="max-w-[16rem] py-2 pr-3 align-middle">
                  <Link to={`/listing/${listing.id}`} className="block min-w-0 no-underline">
                    <span className="flex items-center gap-1 text-footnote font-semibold text-foreground group-hover:text-primary">
                      <span className="truncate">{listing.make} {listing.model}</span>
                      <span className="shrink-0 font-medium text-label-3">{listing.year || ""}</span>
                      <ArrowUpRight aria-hidden className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                    </span>
                    <span className="mt-0.5 block truncate text-caption text-label-3">
                      {listing.district || "Sri Lanka"} · {listing.source}
                    </span>
                  </Link>
                </td>
                <td className="whitespace-nowrap py-2 pr-3 text-right align-middle text-footnote font-semibold tabular-nums text-foreground">
                  {formatLkrCompact(listing.price_lkr)}
                </td>
                <td className="py-2 pr-3 text-right align-middle">
                  <DeltaChip pct={gap} polarity="price" />
                </td>
                <td className="py-2 pr-3 text-right align-middle">
                  <span className="inline-flex flex-col items-end">
                    <span className="text-footnote font-semibold tabular-nums text-foreground">{listing.deal_score?.toFixed(1) ?? "—"}</span>
                    <span className="text-caption tabular-nums text-label-3">
                      {scorePct != null ? `P${Math.round(scorePct)}` : ""}
                    </span>
                  </span>
                </td>
                <td className="whitespace-nowrap py-2 text-right align-middle text-caption tabular-nums text-label-2">
                  {age == null ? "—" : age === 0 ? t("pro.market.today", "today") : t("pro.market.daysAgo", "{n}d", { n: String(age) })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
