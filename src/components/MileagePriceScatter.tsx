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
import { formatPriceLkrMillions } from "@/lib/formatting";

export interface MileagePricePoint {
  mileage: number;
  price_lkr: number;
  id?: number;
  label?: string;
}

interface MileagePriceScatterProps {
  points?: MileagePricePoint[];
  title?: string;
}

function formatKm(value: number): string {
  if (value >= 1000) return `${Math.round(value / 1000)}k`;
  return `${value}`;
}

export const MileagePriceScatter = memo(function MileagePriceScatter({
  points = [],
  title = "Mileage vs. Price",
}: MileagePriceScatterProps) {
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

  if (validPoints.length < 3) {
    return (
      <div className="data-card flex h-[320px] flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-[13px] text-muted-foreground">
          Not enough data points to render scatter chart — minimum 3 required.
        </p>
      </div>
    );
  }

  return (
    <div className="data-card p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="tech-label">{title}</p>
        <span className="rounded-2xl border border-border bg-surface px-2.5 py-1 text-[12px] font-semibold text-muted-foreground">
          {validPoints.length} listings
        </span>
      </div>
      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
            <CartesianGrid
              strokeDasharray="4 8"
              stroke="hsl(var(--foreground) / 0.06)"
            />
            <XAxis
              type="number"
              dataKey="mileage"
              name="Mileage"
              axisLine={false}
              tickLine={false}
              tick={{
                fill: "hsl(var(--muted-foreground))",
                fontSize: 10,
                fontWeight: 600,
                fontFamily: "Nofex",
              }}
              tickFormatter={formatKm}
              label={{
                value: "Mileage (km, thousands)",
                position: "insideBottom",
                offset: -12,
                style: {
                  fill: "hsl(var(--muted-foreground))",
                  fontSize: 11,
                  fontFamily: "Nofex",
                  fontWeight: 500,
                  letterSpacing: "0.02em",
                },
              }}
            />
            <YAxis
              type="number"
              dataKey="price_lkr"
              name="Price"
              axisLine={false}
              tickLine={false}
              tick={{
                fill: "hsl(var(--muted-foreground))",
                fontSize: 10,
                fontWeight: 600,
                fontFamily: "Nofex",
              }}
              tickFormatter={(value: number) => `${(value / 1_000_000).toFixed(0)}M`}
              width={44}
            />
            <Tooltip
              cursor={{ strokeDasharray: "3 3", stroke: "hsl(var(--border))" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const pt = payload[0]?.payload as MileagePricePoint | undefined;
                if (!pt) return null;
                return (
                  <div
                    className="rounded-xl border border-border bg-card px-3 py-2 shadow-soft"
                    style={{ boxShadow: "0 12px 36px rgba(0,0,0,0.3)" }}
                  >
                    {pt.label && (
                      <p className="mb-1.5 text-xs font-bold text-foreground">{pt.label}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      Mileage:{" "}
                      <span className="num font-semibold text-foreground">
                        {pt.mileage.toLocaleString()} km
                      </span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Price:{" "}
                      <span className="num font-semibold text-foreground">
                        {formatPriceLkrMillions(pt.price_lkr)}
                      </span>
                    </p>
                  </div>
                );
              }}
            />
            <Scatter
              data={validPoints}
              fill="var(--gold)"
              fillOpacity={0.72}
              stroke="hsl(var(--background))"
              strokeWidth={0.8}
              r={5}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});

MileagePriceScatter.displayName = "MileagePriceScatter";
