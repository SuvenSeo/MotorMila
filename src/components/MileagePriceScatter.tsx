import { memo, useMemo } from "react";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ScatterChart as ScatterIcon } from "lucide-react";
import { formatPriceLkrMillions } from "@/lib/formatting";
import { formatLkrAxis } from "@/lib/price";
import { useAppPreferences } from "@/lib/appPreferences";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ChartFrame,
  ChartTooltipCard,
  chartAxis,
  chartColor,
  chartGrid,
  chartTick,
  chartTooltip,
  useChartCalm,
  useChartDraw,
} from "@/components/ui/chart-theme";

export interface MileagePricePoint {
  mileage: number;
  price_lkr: number;
  id?: number;
  label?: string;
}

interface MileagePriceScatterProps {
  points?: MileagePricePoint[];
  title?: string;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

function formatKm(value: number): string {
  if (value >= 1000) return `${Math.round(value / 1000)}k`;
  return `${value}`;
}

export const MileagePriceScatter = memo(function MileagePriceScatter({
  points = [],
  title,
  isLoading = false,
  isError = false,
  onRetry,
}: MileagePriceScatterProps) {
  const { t } = useAppPreferences();
  const calm = useChartCalm();
  const heading = title ?? t("scatter.defaultTitle", "Mileage vs. Price");
  const validPoints = useMemo(
    () =>
      points.filter(
        (p) =>
          Number.isFinite(p.mileage) &&
          p.mileage >= 0 &&
          Number.isFinite(p.price_lkr) &&
          p.price_lkr > 0,
      ),
    [points],
  );
  const state = isLoading ? "loading" : isError ? "error" : validPoints.length < 3 ? "empty" : "ready";
  const draw = useChartDraw(state === "ready");

  return (
    <Card padding="md">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-callout font-semibold text-foreground">{heading}</p>
        {state === "ready" ? (
          <Badge variant="neutral" className="tabular-nums">
            {t("scatter.count", "{n} listings", { n: validPoints.length })}
          </Badge>
        ) : null}
      </div>
      <ChartFrame
        state={state}
        heightClass="h-80"
        emptyIcon={ScatterIcon}
        emptyTitle={t("scatter.emptyTitle", "Not enough priced ads with mileage")}
        emptyBody={t("scatter.emptyBody", "Not enough data points to render the scatter chart — minimum 3 required.")}
        errorTitle={t("scatter.errorTitle", "The scatter chart didn't load")}
        onRetry={onRetry}
        label={t("scatter.aria", "{title}: {n} listings plotted by mileage and asking price", {
          title: heading,
          n: validPoints.length,
        })}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 12, bottom: 24, left: 0 }}>
            <CartesianGrid {...chartGrid} vertical />
            <XAxis
              {...chartAxis}
              type="number"
              dataKey="mileage"
              name="Mileage"
              tickFormatter={formatKm}
              label={{
                value: t("scatter.xLabel", "Mileage (km, thousands)"),
                position: "insideBottom",
                offset: -16,
                style: chartTick,
              }}
            />
            <YAxis
              {...chartAxis}
              type="number"
              dataKey="price_lkr"
              name="Price"
              tickFormatter={(value: number) => formatLkrAxis(value)}
              width={60}
            />
            <Tooltip
              {...chartTooltip(calm)}
              cursor={{ strokeDasharray: "3 3", stroke: chartColor.grid }}
              content={(p) => (
                <ChartTooltipCard
                  {...p}
                  title={(_l, payload) => (payload?.[0]?.payload as MileagePricePoint | undefined)?.label ?? null}
                  rows={(payload) => {
                    const pt = payload?.[0]?.payload as MileagePricePoint | undefined;
                    if (!pt) return [];
                    return [
                      { label: t("scatter.mileage", "Mileage"), value: `${pt.mileage.toLocaleString("en-US")} km` },
                      { label: t("scatter.price", "Price"), value: formatPriceLkrMillions(pt.price_lkr) },
                    ];
                  }}
                />
              )}
            />
            <Scatter
              data={validPoints}
              fill={chartColor.primary}
              fillOpacity={0.7}
              stroke={chartColor.surface}
              strokeWidth={1}
              {...draw}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </ChartFrame>
    </Card>
  );
});

MileagePriceScatter.displayName = "MileagePriceScatter";
