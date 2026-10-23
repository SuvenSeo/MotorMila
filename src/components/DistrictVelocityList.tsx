import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts";
import { getDistrictVelocity } from "@/services/api";
import { QUERY_STALE } from "@/lib/queryPolicy";
import { useAppPreferences } from "@/lib/appPreferences";
import { cleanDistrict } from "@/lib/dataSanity";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

/**
 * District listing-volume breakdown — horizontal bar chart (shadcn chart on
 * Recharts), wired to the real district-velocity API. Country-level rows
 * ("Sri Lanka") are not districts and are dropped.
 */
export function DistrictVelocityList() {
  const { t } = useAppPreferences();
  const { data, isLoading } = useQuery({
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

  if (!isLoading && rows.length === 0) return null;

  const chartConfig = {
    value: { label: t("districtVelocity.listingsLabel", "Listings"), color: "hsl(var(--primary))" },
  } satisfies ChartConfig;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6">
      <p className="text-caption font-semibold text-muted-foreground">
        {t("districtVelocity.eyebrow", "Market pulse")}
      </p>
      <h3 className="mt-1 font-display text-title3 font-semibold text-foreground">
        {t("districtVelocity.title", "District sales velocity")}
      </h3>
      <p className="mt-1 text-footnote text-muted-foreground">
        {t("districtVelocity.sub", "Active listings · top 8 districts")}
      </p>
      {isLoading ? (
        <div className="mt-6 space-y-2.5" aria-hidden>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      ) : (
        <>
          <ChartContainer
            config={chartConfig}
            className="mt-5 aspect-auto w-full"
            style={{ height: rows.length * 38 + 8 }}
            aria-hidden
          >
            <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }} barCategoryGap={6}>
              <XAxis type="number" hide domain={[0, "dataMax"]} />
              <YAxis
                type="category"
                dataKey="name"
                tickLine={false}
                axisLine={false}
                width={96}
                fontSize={12}
              />
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel={false} />} />
              <Bar dataKey="value" fill="var(--color-value)" fillOpacity={0.85} radius={6} isAnimationActive={false}>
                <LabelList
                  dataKey="value"
                  position="right"
                  className="fill-foreground"
                  fontSize={12}
                  formatter={(v: unknown) => Number(v).toLocaleString("en-LK")}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
          {/* Screen-reader equivalent of the chart */}
          <ul className="sr-only">
            {rows.map((r) => (
              <li key={r.name}>
                {r.name}: {t("districtVelocity.listings", "{count} listings", { count: r.value })}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
