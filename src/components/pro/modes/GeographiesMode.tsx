import { useMemo } from "react";
import { ArrowRightLeft, MapPin } from "lucide-react";
import { DeskSection, Figure, Panel } from "@/components/pro/Panel";
import { DeltaChip, StatPill } from "@/components/pro/DeltaChip";
import { DistributionBand } from "@/components/pro/DistributionBand";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatLkrCompact } from "@/lib/price";
import { pctChange, rankOf } from "@/lib/proAnalytics";
import { useAppPreferences } from "@/lib/appPreferences";
import type { DistrictVelocityPoint } from "@/types/car";
import type { ProArbitrageGap, ProDistrictProfile, ProVehicleLane } from "@/types/pro";

/**
 * Geographies — the same market read two ways. Districts answer "where is
 * stock, and where is it moving"; the arbitrage scanner answers "is the same
 * car cheaper elsewhere", which is the trade every broker in Sri Lanka runs
 * but nobody can price.
 */
export function GeographiesMode({
  districts,
  lanes,
  velocity,
  gaps,
  loading,
  marketMedian,
  arbitrageLane,
  onArbitrageLane,
  onOpenDistrict,
}: {
  districts: ProDistrictProfile[];
  lanes: ProVehicleLane[];
  velocity: DistrictVelocityPoint[];
  gaps: ProArbitrageGap[];
  loading: boolean;
  marketMedian: number | null;
  /** `"all"` scans the whole market; otherwise a `make|||model` lane key. */
  arbitrageLane: string;
  onArbitrageLane: (value: string) => void;
  onOpenDistrict: (district: string) => void;
}) {
  const { t } = useAppPreferences();

  const velocityByDistrict = useMemo(() => {
    const map = new Map<string, DistrictVelocityPoint>();
    for (const point of velocity) map.set(point.district, point);
    return map;
  }, [velocity]);

  const districtMedians = districts.map((district) => district.median_price_lkr);
  const medianLow = Math.min(...districtMedians.filter((value): value is number => value != null && value > 0));
  const medianHigh = Math.max(...districtMedians.filter((value): value is number => value != null && value > 0));
  const spreadPct = pctChange(medianHigh, medianLow);

  const arbitrageLabel = arbitrageLane === "all" ? t("pro.geo.wholeMarket", "Whole market") : arbitrageLane.replace("|||", " ");

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Panel
          label={t("pro.geo.districts", "Districts with stock")}
          value={<Figure size="sm">{districts.length}</Figure>}
          hint={t("pro.geo.districtsHint", "Areas returning at least one priced listing in the current snapshot")}
          className="rounded-card border border-border"
        />
        <Panel
          label={t("pro.geo.spreadLabel", "District price spread")}
          value={<Figure size="sm" tone="primary">{spreadPct != null ? `${spreadPct.toFixed(0)}%` : "—"}</Figure>}
          hint={t("pro.geo.spreadHint", "Highest district median as a premium to the lowest — the size of the arbitrage opportunity")}
          className="rounded-card border border-border"
        >
          {Number.isFinite(medianLow) && Number.isFinite(medianHigh) ? (
            <DistributionBand
              min={medianLow}
              max={medianHigh}
              median={marketMedian}
              markerLabel={t("pro.geo.nationalMedian", "National median")}
              format={(value) => formatLkrCompact(value)}
              size="sm"
            />
          ) : null}
        </Panel>
        <Panel
          label={t("pro.geo.gapsLabel", "Open gaps found")}
          value={<Figure size="sm">{gaps.length}</Figure>}
          hint={t("pro.geo.gapsHint", "District pairs where the same lane trades far enough apart to cover the trip")}
          className="rounded-card border border-border"
          footer={<span>{t("pro.geo.gapsFooter", "Minimum two priced listings per side, outliers removed")}</span>}
        />
      </div>

      <DeskSection
        label={t("pro.section.districts", "01 · Areas")}
        id="pro-districts"
        title={t("pro.geo.title", "Districts, ranked")}
        body={t(
          "pro.geo.body",
          "Depth, price position and delivery speed per district. A district with high stock and slow turnover is where an asking price has room to move.",
        )}
      >
        <div className="rounded-card border border-border bg-surface-1">
          {districts.length === 0 ? (
            <EmptyState
              icon={MapPin}
              title={t("pro.geo.empty", "No district profiles yet")}
              body={t("pro.geo.emptyBody", "Profiles appear once listings carry a district and a price.")}
              className="py-12"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem] border-separate border-spacing-0 text-left">
                <caption className="sr-only">{t("pro.geo.caption", "District profiles with price position and velocity")}</caption>
                <thead>
                  <tr className="text-caption text-label-3">
                    <th scope="col" className="border-b border-separator px-3 py-2 font-medium">{t("pro.col.district", "District")}</th>
                    <th scope="col" className="border-b border-separator px-3 py-2 text-right font-medium">{t("pro.col.stock", "Stock")}</th>
                    <th scope="col" className="border-b border-separator px-3 py-2 text-right font-medium">{t("pro.col.median", "Median")}</th>
                    <th scope="col" className="border-b border-separator px-3 py-2 text-right font-medium">{t("pro.col.vsMarket", "vs market")}</th>
                    <th scope="col" className="border-b border-separator px-3 py-2 text-right font-medium">{t("pro.geo.newWeek", "New 7d")}</th>
                    <th scope="col" className="border-b border-separator px-3 py-2 text-right font-medium">{t("pro.geo.velocity", "Velocity")}</th>
                    <th scope="col" className="border-b border-separator px-3 py-2 font-medium">{t("pro.geo.leader", "Lane leader")}</th>
                  </tr>
                </thead>
                <tbody>
                  {districts.map((district) => {
                    const speed = velocityByDistrict.get(district.district);
                    const vsMarket = pctChange(district.median_price_lkr, marketMedian);
                    const rank = rankOf(district.listing_count, districtMedians.length ? districts.map((item) => item.listing_count) : []);
                    return (
                      <tr key={district.district} className="group transition-colors hover:bg-surface-2/70">
                        <td className="border-b border-separator px-3 py-2">
                          <button
                            type="button"
                            onClick={() => onOpenDistrict(district.district)}
                            className="flex items-baseline gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <span className="text-caption tabular-nums text-label-3">{rank ? String(rank.rank).padStart(2, "0") : ""}</span>
                            <span className="text-footnote font-semibold text-foreground group-hover:text-primary">{district.district}</span>
                          </button>
                        </td>
                        <td className="whitespace-nowrap border-b border-separator px-3 py-2 text-right text-footnote font-semibold tabular-nums text-foreground">
                          {district.listing_count.toLocaleString("en-US")}
                        </td>
                        <td className="whitespace-nowrap border-b border-separator px-3 py-2 text-right text-footnote font-semibold tabular-nums text-foreground">
                          {formatLkrCompact(district.median_price_lkr)}
                        </td>
                        <td className="whitespace-nowrap border-b border-separator px-3 py-2 text-right">
                          {vsMarket != null ? <DeltaChip pct={vsMarket} polarity="price" /> : <span className="text-caption text-label-3">—</span>}
                        </td>
                        <td className="whitespace-nowrap border-b border-separator px-3 py-2 text-right text-caption tabular-nums text-label-2">
                          {speed ? speed.new_7d_count.toLocaleString("en-US") : "—"}
                        </td>
                        <td className="whitespace-nowrap border-b border-separator px-3 py-2 text-right">
                          {speed ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-surface-3 sm:block" aria-hidden>
                                <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, speed.velocity_score * 6)}%` }} />
                              </span>
                              <span className="text-caption font-semibold tabular-nums text-label-2">{speed.velocity_score.toFixed(1)}</span>
                            </span>
                          ) : (
                            <span className="text-caption text-label-3">—</span>
                          )}
                        </td>
                        <td className="border-b border-separator px-3 py-2 text-caption text-label-2">
                          {district.top_make || district.top_model ? `${district.top_make ?? ""} ${district.top_model ?? ""}`.trim() : "—"}
                          <span className="ml-1.5 text-label-3">{district.source_count} src</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DeskSection>

      <DeskSection
        label={t("pro.section.arbitrage", "02 · Arbitrage")}
        id="pro-arbitrage"
        title={t("pro.geo.arbTitle", "The same car, priced apart")}
        body={t(
          "pro.geo.arbBody",
          "For one lane, the districts with the widest median gap. Every pair needs real depth on both sides, so a single optimistic ad cannot create an opportunity.",
        )}
        actions={
          <Select value={arbitrageLane} onValueChange={onArbitrageLane}>
            <SelectTrigger className="w-full sm:w-[18rem]" aria-label={t("pro.geo.scanAria", "Choose a lane to scan")}>
              <SelectValue placeholder={t("pro.geo.scanPlaceholder", "Scan the whole market")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("pro.geo.wholeMarket", "Whole market")}</SelectItem>
              {lanes.slice(0, 80).map((lane) => (
                <SelectItem key={`${lane.make}|||${lane.model}`} value={`${lane.make}|||${lane.model}`}>
                  {lane.make} {lane.model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      >
        <div className="rounded-card border border-border bg-surface-1">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-separator px-3 py-2">
            <p className="text-caption text-label-3">
              {t("pro.geo.scanning", "Scanning")}: <span className="font-semibold text-label-2">{arbitrageLabel}</span>
            </p>
            {spreadPct != null ? <StatPill tone="accent">{t("pro.geo.openGaps", "{n} pairs", { n: String(gaps.length) })}</StatPill> : null}
          </div>
          {loading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} shape="text" className="h-10" />
              ))}
            </div>
          ) : gaps.length === 0 ? (
            <EmptyState
              icon={ArrowRightLeft}
              title={t("pro.geo.noGaps", "No usable gaps in this scope")}
              body={t("pro.geo.noGapsBody", "Either the lane is too thin across districts, or its asking prices are already consistent nationally.")}
              className="py-12"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[42rem] border-separate border-spacing-0 text-left">
                <caption className="sr-only">{t("pro.geo.arbCaption", "Cross-district price gaps")}</caption>
                <thead>
                  <tr className="text-caption text-label-3">
                    <th scope="col" className="border-b border-separator px-3 py-2 font-medium">{t("pro.col.lane", "Lane")}</th>
                    <th scope="col" className="border-b border-separator px-3 py-2 font-medium">{t("pro.geo.buyWhere", "Buy")}</th>
                    <th scope="col" className="border-b border-separator px-3 py-2 font-medium">{t("pro.geo.sellWhere", "Sell")}</th>
                    <th scope="col" className="border-b border-separator px-3 py-2 text-right font-medium">{t("pro.geo.buyMedian", "Buy median")}</th>
                    <th scope="col" className="border-b border-separator px-3 py-2 text-right font-medium">{t("pro.geo.sellMedian", "Sell median")}</th>
                    <th scope="col" className="border-b border-separator px-3 py-2 text-right font-medium">{t("pro.geo.gap", "Gap")}</th>
                  </tr>
                </thead>
                <tbody>
                  {gaps.map((gap) => (
                    <tr key={`${gap.make ?? ""}-${gap.model ?? ""}-${gap.buy_district}-${gap.sell_district}`} className="transition-colors hover:bg-surface-2/70">
                      <td className="border-b border-separator px-3 py-2 text-footnote font-semibold text-foreground">
                        {gap.make && gap.model ? `${gap.make} ${gap.model}` : arbitrageLabel}
                      </td>
                      <td className="border-b border-separator px-3 py-2 text-footnote text-label-2">
                        {gap.buy_district}
                        <span className="ml-1 text-caption text-label-3">n {gap.buy_listing_count}</span>
                      </td>
                      <td className="border-b border-separator px-3 py-2 text-footnote text-label-2">
                        {gap.sell_district}
                        <span className="ml-1 text-caption text-label-3">n {gap.sell_listing_count}</span>
                      </td>
                      <td className="whitespace-nowrap border-b border-separator px-3 py-2 text-right text-footnote tabular-nums text-foreground">
                        {formatLkrCompact(gap.buy_median_lkr)}
                      </td>
                      <td className="whitespace-nowrap border-b border-separator px-3 py-2 text-right text-footnote tabular-nums text-foreground">
                        {formatLkrCompact(gap.sell_median_lkr)}
                      </td>
                      <td className="whitespace-nowrap border-b border-separator px-3 py-2 text-right">
                        <StatPill tone={gap.gap_pct >= 10 ? "good" : "neutral"} className={cn(gap.gap_pct >= 10 && "font-semibold")}>
                          +{gap.gap_pct.toFixed(1)}%
                        </StatPill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DeskSection>
    </div>
  );
}
