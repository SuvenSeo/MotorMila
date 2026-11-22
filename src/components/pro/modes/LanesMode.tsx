import { useMemo, useState } from "react";
import { Car, Download, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { DeskSection } from "@/components/pro/Panel";
import { DeltaChip } from "@/components/pro/DeltaChip";
import { Sparkline } from "@/components/pro/Sparkline";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatLkrCompact } from "@/lib/price";
import { formatRelativeTime } from "@/lib/formatting";
import { isThinSample, momentum, rankOf, sparkValues } from "@/lib/proAnalytics";
import { useAppPreferences } from "@/lib/appPreferences";
import type { ProVehicleLane } from "@/types/pro";

export type LaneFocus = "all" | "hot" | "coverage" | "fresh";

/** High minus low asking price, as a share of the lane median. */
function spread(lane: ProVehicleLane): number {
  const median = lane.median_price_lkr;
  const low = lane.min_price_lkr;
  const high = lane.max_price_lkr;
  if (!median || low == null || high == null || median <= 0) return 0;
  return ((high - low) / median) * 100;
}
type LaneSort = "stock" | "median" | "momentum" | "spread" | "deal";

const SORTS: Array<{ value: LaneSort; label: string }> = [
  { value: "stock", label: "Stock" },
  { value: "median", label: "Median" },
  { value: "momentum", label: "Momentum" },
  { value: "spread", label: "Spread" },
  { value: "deal", label: "Deal" },
];

/**
 * Lanes — the desk's working table. Every row carries the four things a broker
 * needs to pick a target: how deep the market is, where the price sits, which
 * way it has moved, and how thin the sample is. A row opens the lane's record
 * in a sheet, so the table is never lost.
 */
export function LanesMode({
  lanes,
  loading,
  hasProAccess,
  district,
  source,
  onDistrict,
  onSource,
  onOpenLane,
  onExport,
}: {
  lanes: ProVehicleLane[];
  loading: boolean;
  hasProAccess: boolean;
  /** Global scope from the command bar. */
  district: string;
  source: string;
  onDistrict: (value: string) => void;
  onSource: (value: string) => void;
  onOpenLane: (lane: ProVehicleLane) => void;
  onExport: (format: "csv" | "pdf") => void;
}) {
  const { t } = useAppPreferences();
  const [search, setSearch] = useState("");
  const [focus, setFocus] = useState<LaneFocus>("all");
  const [sort, setSort] = useState<LaneSort>("stock");
  const [showAll, setShowAll] = useState(false);

  const districtOptions = useMemo(
    () => Array.from(new Set(lanes.map((lane) => lane.top_district).filter(Boolean) as string[])).sort(),
    [lanes],
  );
  const sourceOptions = useMemo(
    () => Array.from(new Set(lanes.map((lane) => lane.top_source).filter(Boolean) as string[])).sort(),
    [lanes],
  );

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = lanes.filter((lane) => {
      if (needle && !`${lane.make} ${lane.model}`.toLowerCase().includes(needle)) return false;
      if (district !== "all" && lane.top_district !== district) return false;
      if (source !== "all" && lane.top_source !== source) return false;
      if (focus === "hot" && (lane.avg_deal_score ?? 0) < 8) return false;
      if (focus === "coverage" && lane.district_count < 2) return false;
      if (focus === "fresh") {
        const at = lane.latest_seen_at ? Date.parse(lane.latest_seen_at) : NaN;
        if (!Number.isFinite(at) || Date.now() - at > 7 * 86_400_000) return false;
      }
      return true;
    });
    return filtered.sort((a, b) => {
      if (sort === "median") return (b.median_price_lkr ?? 0) - (a.median_price_lkr ?? 0);
      if (sort === "momentum") return Math.abs(b.change_90d_pct ?? 0) - Math.abs(a.change_90d_pct ?? 0);
      if (sort === "deal") return (b.avg_deal_score ?? -99) - (a.avg_deal_score ?? -99);
      if (sort === "spread") return spread(b) - spread(a);
      return b.listing_count - a.listing_count;
    });
  }, [lanes, search, district, source, focus, sort]);

  // A screen, not a spreadsheet: 40 rows by default, with the count stated.
  const ROW_CAP = 40;
  const capped = showAll ? rows : rows.slice(0, ROW_CAP);
  const visible = hasProAccess ? capped : capped.slice(0, 5);
  const totalStock = rows.reduce((sum, lane) => sum + lane.listing_count, 0);

  return (
    <div className="space-y-6">
      <DeskSection
        label={t("pro.section.lanes", "Lanes")}
        id="pro-lanes"
        title={t("pro.lanes.title", "The lane table")}
        body={t(
          "pro.lanes.body",
          "Make and model groups, ranked the way a buyer shortlists: stock, price, movement, and how far the median sits from the whole market.",
        )}
        actions={
          <>
            <Button type="button" variant="secondary" size="sm" onClick={() => onExport("csv")} disabled={loading || rows.length === 0}>
              <Download aria-hidden /> {t("pro.lanes.csv", "CSV")}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => onExport("pdf")} disabled={loading || rows.length === 0}>
              <Download aria-hidden /> {t("pro.lanes.pdf", "PDF")}
            </Button>
          </>
        }
      >
        <div className="rounded-card border border-border bg-surface-1">
          <div className="flex flex-col gap-2 border-b border-separator p-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-label-3" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("pro.lanes.search", "Search make or model")}
                aria-label={t("pro.lanes.searchAria", "Search lanes")}
                className="w-full pl-9"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:w-auto lg:grid-cols-3">
              <Select value={district} onValueChange={onDistrict}>
                <SelectTrigger aria-label={t("pro.lanes.districtAria", "Filter by district")}>
                  <SelectValue placeholder={t("pro.lanes.district", "District")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("pro.lanes.allDistricts", "All districts")}</SelectItem>
                  {districtOptions.map((option) => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={source} onValueChange={onSource}>
                <SelectTrigger aria-label={t("pro.lanes.sourceAria", "Filter by source")}>
                  <SelectValue placeholder={t("pro.lanes.source", "Source")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("pro.lanes.allSources", "All sources")}</SelectItem>
                  {sourceOptions.map((option) => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={focus} onValueChange={(value) => setFocus(value as LaneFocus)}>
                <SelectTrigger aria-label={t("pro.lanes.focusAria", "Filter by focus")}>
                  <SelectValue placeholder={t("pro.lanes.focus", "Focus")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("pro.lanes.focusAll", "All lanes")}</SelectItem>
                  <SelectItem value="hot">{t("pro.lanes.focusHot", "Deal-score ≥ 8")}</SelectItem>
                  <SelectItem value="coverage">{t("pro.lanes.focusCoverage", "Multi-district")}</SelectItem>
                  <SelectItem value="fresh">{t("pro.lanes.focusFresh", "Fresh supply")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-separator px-3 py-2">
            <p className="text-caption text-label-3">
              <span className="font-semibold text-label-2">{rows.length.toLocaleString("en-US")}</span> {t("pro.lanes.count", "lanes")}
              <span aria-hidden className="mx-1.5">·</span>
              {totalStock.toLocaleString("en-US")} {t("pro.lanes.listings", "listings")}
              {!hasProAccess && rows.length > visible.length ? (
                <>
                  <span aria-hidden className="mx-1.5">·</span>
                  <span className="font-semibold text-primary">{t("pro.lanes.locked", "{n} more with Pro", { n: String(rows.length - visible.length) })}</span>
                </>
              ) : null}
            </p>
            <div className="flex items-center gap-2">
              <SlidersHorizontal aria-hidden className="h-3.5 w-3.5 text-label-3" />
              <SegmentedControl<LaneSort>
                value={sort}
                onValueChange={setSort}
                size="sm"
                aria-label={t("pro.lanes.sortAria", "Sort lanes")}
                options={SORTS.map((item) => ({ value: item.value, label: item.label }))}
              />
            </div>
          </div>

          {loading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} shape="text" className="h-10" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Car}
              title={t("pro.lanes.empty", "No lanes match this scope")}
              body={t("pro.lanes.emptyBody", "Clear the district, source or focus filter to see the whole market.")}
              className="py-12"
              action={
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setFocus("all");
                    onDistrict("all");
                    onSource("all");
                  }}
                >
                  {t("pro.lanes.reset", "Reset filters")}
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] border-separate border-spacing-0 text-left">
                <caption className="sr-only">{t("pro.lanes.caption", "Make and model lanes with price position and momentum")}</caption>
                <thead className="sticky top-0 z-10 bg-surface-1">
                  <tr className="text-caption text-label-3">
                    <th scope="col" className="border-b border-separator px-3 py-2 font-medium">{t("pro.col.lane", "Lane")}</th>
                    <th scope="col" className="border-b border-separator px-3 py-2 text-right font-medium">{t("pro.col.stock", "Stock")}</th>
                    <th scope="col" className="border-b border-separator px-3 py-2 text-right font-medium">{t("pro.col.median", "Median")}</th>
                    <th scope="col" className="border-b border-separator px-3 py-2 text-right font-medium">{t("pro.col.sixMonths", "6 mo")}</th>
                    <th scope="col" className="border-b border-separator px-3 py-2 text-right font-medium">{t("pro.col.spread", "Spread")}</th>
                    <th scope="col" className="border-b border-separator px-3 py-2 text-right font-medium">{t("pro.col.deal", "Deal")}</th>
                    <th scope="col" className="border-b border-separator px-3 py-2 text-right font-medium">{t("pro.col.reach", "Reach")}</th>
                    <th scope="col" className="border-b border-separator px-3 py-2 text-right font-medium">{t("pro.col.seen", "Seen")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((lane) => {
                    const spark = sparkValues(lane.spark_6m);
                    const trend = momentum(lane.change_90d_pct);
                    const laneSpread = spread(lane);
                    const rank = rankOf(lane.listing_count, lanes.map((item) => item.listing_count));
                    const thin = isThinSample(lane.listing_count);
                    return (
                      <tr
                        key={`${lane.make}-${lane.model}`}
                        className="group transition-colors hover:bg-surface-2/70"
                      >
                        <td className="border-b border-separator px-3 py-2">
                          <button
                            type="button"
                            onClick={() => onOpenLane(lane)}
                            className="block max-w-[18rem] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <span className="block truncate text-footnote font-semibold text-foreground group-hover:text-primary">
                              {lane.make} {lane.model}
                            </span>
                            <span className="mt-0.5 block truncate text-caption text-label-3">
                              {lane.top_district || t("pro.lanes.noDistrict", "No district leader")}
                              {rank ? ` · #${rank.rank} of ${rank.total}` : ""}
                            </span>
                          </button>
                        </td>
                        <td className="whitespace-nowrap border-b border-separator px-3 py-2 text-right">
                          <span className={cn("text-footnote font-semibold tabular-nums", thin ? "text-label-2" : "text-foreground")}>
                            {lane.listing_count.toLocaleString("en-US")}
                          </span>
                          {(lane.new_7d_count ?? 0) > 0 ? (
                            <span className="ml-1.5 inline-flex items-center rounded-full bg-primary/10 px-1.5 text-caption font-semibold tabular-nums text-primary">
                              +{lane.new_7d_count}
                            </span>
                          ) : thin ? (
                            <span className="ml-1.5 text-caption text-label-3">{t("pro.lanes.thin", "thin")}</span>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap border-b border-separator px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {spark.length > 1 ? (
                              <Sparkline
                                values={spark}
                                tone={trend === "falling" ? "down" : trend === "rising" ? "up" : "neutral"}
                                width={56}
                                height={18}
                                label={t("pro.lanes.spark", "{lane} median, last six months", { lane: `${lane.make} ${lane.model}` })}
                                className="hidden sm:block"
                              />
                            ) : null}
                            <span className="text-footnote font-semibold tabular-nums text-foreground">{formatLkrCompact(lane.median_price_lkr)}</span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap border-b border-separator px-3 py-2 text-right">
                          {lane.change_90d_pct != null ? <DeltaChip pct={lane.change_90d_pct} polarity="price" /> : <span className="text-caption text-label-3">—</span>}
                        </td>
                        <td className="whitespace-nowrap border-b border-separator px-3 py-2 text-right">
                          {laneSpread > 0 ? (
                            <span
                              className="text-footnote font-semibold tabular-nums text-label-2"
                              title={t("pro.lanes.spreadTitle", "High minus low asking price, as a share of the median")}
                            >
                              {laneSpread.toFixed(0)}%
                            </span>
                          ) : (
                            <span className="text-caption text-label-3">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap border-b border-separator px-3 py-2 text-right">
                          <span className="text-footnote font-semibold tabular-nums text-foreground">{lane.avg_deal_score?.toFixed(1) ?? "—"}</span>
                        </td>
                        <td className="whitespace-nowrap border-b border-separator px-3 py-2 text-right text-caption tabular-nums text-label-2">
                          {lane.district_count} <span className="text-label-3">dist</span> · {lane.source_count} <span className="text-label-3">src</span>
                        </td>
                        <td className="whitespace-nowrap border-b border-separator px-3 py-2 text-right text-caption text-label-3">
                          {lane.latest_seen_at ? formatRelativeTime(lane.latest_seen_at) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {hasProAccess && rows.length > capped.length ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-separator px-3 py-2">
              <p className="text-caption text-label-3">
                {t("pro.lanes.showing", "Showing {shown} of {total} lanes", { shown: String(capped.length), total: String(rows.length) })}
              </p>
              <Button type="button" variant="secondary" size="sm" onClick={() => setShowAll(true)}>
                {t("pro.lanes.showAll", "Show all")}
              </Button>
            </div>
          ) : null}

          {!hasProAccess && rows.length > visible.length ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-separator bg-primary/[0.06] px-3 py-2.5">
              <p className="text-caption text-label-2">
                {t("pro.lanes.upgradeBody", "The full desk shows every lane, every month of history, and the export pack.")}
              </p>
              <Button asChild size="sm">
                <Link to="/pricing">
                  <Sparkles aria-hidden /> {t("pro.lanes.upgrade", "See Pro")}
                </Link>
              </Button>
            </div>
          ) : null}
        </div>
      </DeskSection>

      {rows.length > 0 ? (
        <p className="text-caption text-label-3">
          {t(
            "pro.lanes.footnote",
            "Median is the midpoint of asking prices, not a transaction price. Lanes under {n} listings are labelled thin so a sample of three never reads like a trend.",
            { n: "5" },
          )}
        </p>
      ) : null}
    </div>
  );
}
