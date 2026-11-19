import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAppPreferences } from "@/lib/appPreferences";
import type { PriceGapPoint, TurnoverPoint } from "@/lib/dealerDashboardData";

const TOOLTIP_STYLE = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 12,
  fontSize: "12px",
  color: "hsl(var(--foreground))",
} as const;

const TOOLTIP_LABEL_STYLE = { color: "hsl(var(--muted-foreground))" } as const;

const CHART_BLUE = "hsl(213 100% 64%)";

export function DealerTurnoverChart({ data }: { data: TurnoverPoint[] }) {
  const { t } = useAppPreferences();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="turnoverArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_BLUE} stopOpacity={0.22} />
            <stop offset="100%" stopColor={CHART_BLUE} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="week" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
        <Area type="monotone" dataKey="sellThrough" name={t("dealerDash.momentumIndex", "Momentum index")} stroke={CHART_BLUE} fill="url(#turnoverArea)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function DealerPriceGapChart({ data }: { data: PriceGapPoint[] }) {
  const { t } = useAppPreferences();
  const isMobile = useIsMobile();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="district"
          interval={0}
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          angle={isMobile ? -35 : 0}
          textAnchor={isMobile ? "end" : "middle"}
          height={isMobile ? 56 : 30}
        />
        <YAxis width={44} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} />
        <Tooltip cursor={{ fill: "hsl(var(--muted) / 0.4)" }} contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} formatter={(v: number) => [`${v.toFixed(1)}%`, t("dealerDash.gap", "Gap")]} />
        <Bar dataKey="gapPct" fill={CHART_BLUE} radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
