import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3 } from "lucide-react";
import { getDistrictVelocity } from "@/services/api";
import { QUERY_STALE } from "@/lib/queryPolicy";
import { useAppPreferences } from "@/lib/appPreferences";
import { cleanDistrict } from "@/lib/dataSanity";
import { Card } from "@/components/ui/card";
import {
  ChartFrame,
  ChartTooltipCard,
  chartAxis,
  chartColor,
  chartTick,
  chartTooltip,
  useChartCalm,
  useChartDraw,
} from "@/components/ui/chart-theme";

const ROW_HEIGHT = 36;

/**
 * District listing-volume breakdown — horizontal bars on the shared chart
 * theme, wired to the real district-velocity API. Country-level rows
 * ("Sri Lanka") are not districts and are dropped.
 */
export function DistrictVelocityList() {
  const { t } = useAppPreferences();
  const calm = useChartCalm();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["district-velocity-list"],
    queryFn: getDistrictVelocity,
    staleTime: QUERY_STALE.hub,
  });

  const rows = useMemo(
    () =>
      [...(data?.points ?? [])]
        .filter((p) => cleanDistrict(p.district))
        .sort((a, b) => Number(b.listing_count || 0) - Number(a.listing_count || 0))
        .slice(0, 8)
        .map((p) => ({ name: String(p.district), value: Number(p.listing_count || 0) })),
    [data],
  );
  const state = isLoading ? "loading" : isError ? "error" : rows.length === 0 ? "empty" : "ready";
  const draw = useChartDraw(state === "ready");
  const listingsLabel = t("districtVelocity.listingsLabel", "Listings");

  return (
    <Card padding="md">
      <p className="text-footnote font-semibold text-primary">{t("districtVelocity.eyebrow", "Market pulse")}</p>
      <h3 className="mt-1 font-display text-title3 font-semibold text-foreground">
        {t("districtVelocity.title", "District sales velocity")}
      </h3>
      <p className="mt-1 text-footnote text-label-2">{t("districtVelocity.sub", "Active listings · top 8 districts")}</p>
      <ChartFrame
        state={state}
        className="mt-5"
        heightClass={state === "ready" ? "" : "h-72"}
        emptyIcon={BarChart3}
        emptyTitle={t("districtVelocity.emptyTitle", "No district volume yet")}
        emptyBody={t("districtVelocity.emptyBody", "Bars appear once listings carry a district.")}
        errorTitle={t("districtVelocity.errorTitle", "District volume didn't load")}
        onRetry={() => void refetch()}
      >
        <div style={{ height: rows.length * ROW_HEIGHT + 8 }} aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }} barCategoryGap={8}>
              <XAxis type="number" hide domain={[0, "dataMax"]} />
              <YAxis {...chartAxis} type="category" dataKey="name" width={96} tickMargin={4} />
              <Tooltip
                {...chartTooltip(calm)}
                cursor={{ fill: chartColor.grid, fillOpacity: 0.35 }}
                content={(p) => (
                  <ChartTooltipCard
                    {...p}
                    rows={(payload) => [
                      {
                        label: listingsLabel,
                        value: Number(payload?.[0]?.value ?? 0).toLocaleString("en-US"),
                        color: chartColor.primary,
                      },
                    ]}
                  />
                )}
              />
              <Bar dataKey="value" fill={chartColor.primary} fillOpacity={0.9} radius={6} {...draw}>
                <LabelList
                  dataKey="value"
                  position="right"
                  style={{ ...chartTick.style, fill: chartColor.foreground, fontSize: chartTick.fontSize, fontFamily: chartTick.fontFamily }}
                  formatter={(v: unknown) => Number(v).toLocaleString("en-US")}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        {/* Screen-reader equivalent of the chart */}
        <ul className="sr-only">
          {rows.map((r) => (
            <li key={r.name}>
              {r.name}: {t("districtVelocity.listings", "{count} listings", { count: r.value })}
            </li>
          ))}
        </ul>
      </ChartFrame>
    </Card>
  );
}
