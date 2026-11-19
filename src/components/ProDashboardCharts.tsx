import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatLkrCompact } from "@/lib/price";
import type { ImportEraMakeRow } from "@/types/car";
import type { ProBreakdownPoint } from "@/types/pro";

export type ProTrendChartPoint = { month: string; median: number; avg: number; samples: number };

const AXIS_TICK = { fill: "hsl(var(--muted-foreground))", fontSize: 12 };

const TOOLTIP_STYLE = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 12,
  color: "hsl(var(--foreground))",
};

const TOOLTIP_LABEL_STYLE = { color: "hsl(var(--foreground))" };

export function ProDetailTrendChart({ data }: { data: ProTrendChartPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="month" tick={AXIS_TICK} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} unit="M" />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          formatter={(value: number, name: string) => [formatLkrCompact(Number(value) * 1_000_000), name]}
        />
        <Line type="monotone" dataKey="median" name="Median" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} />
        <Line type="monotone" dataKey="avg" name="Average" stroke="hsl(var(--muted-foreground))" strokeWidth={2} strokeDasharray="4 3" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ProLaneTrendChart({ data }: { data: ProTrendChartPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="month" tick={AXIS_TICK} axisLine={false} tickLine={false} />
        <YAxis width={44} tick={AXIS_TICK} axisLine={false} tickLine={false} unit="M" />
        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
        <Line type="monotone" dataKey="median" stroke="hsl(213 100% 64%)" strokeWidth={2.5} dot={false} name="Median" />
        <Line type="monotone" dataKey="avg" stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={false} strokeDasharray="4 3" name="Average" />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ProSourceMixChart({ data }: { data: ProBreakdownPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="label" interval={0} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis
          width={40}
          tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : `${v}`)}
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip cursor={{ fill: "hsl(var(--muted) / 0.4)" }} contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
        <Bar dataKey="count" fill="hsl(213 100% 64%)" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ProImportEraChart({ makes }: { makes: ImportEraMakeRow[] }) {
  const data = makes.map((row) => ({
    make: row.make,
    pre: row.pre_freeze.median_price_lkr !== null ? row.pre_freeze.median_price_lkr / 1_000_000 : null,
    post: row.post_freeze.median_price_lkr !== null ? row.post_freeze.median_price_lkr / 1_000_000 : null,
    preCount: row.pre_freeze.count,
    postCount: row.post_freeze.count,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="make" tick={AXIS_TICK} axisLine={false} tickLine={false} />
        <YAxis width={44} tick={AXIS_TICK} axisLine={false} tickLine={false} unit="M" />
        <Tooltip
          cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
          contentStyle={TOOLTIP_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          formatter={(value: unknown, name: string, props: { payload?: Record<string, unknown> }) => {
            const numVal = typeof value === "number" ? value : null;
            const isPost = name === "post";
            const count = isPost ? (props.payload?.postCount ?? 0) : (props.payload?.preCount ?? 0);
            const label = isPost ? "Post-freeze ≥2025" : "Pre-freeze ≤2024";
            return [numVal !== null ? `${formatLkrCompact(numVal * 1_000_000)} (${count} listings)` : "—", label];
          }}
        />
        <Bar dataKey="pre" name="Pre-freeze ≤2024" fill="hsl(var(--deal-amber))" radius={[6, 6, 0, 0]} />
        <Bar dataKey="post" name="Post-freeze ≥2025" fill="hsl(var(--signal-cyan))" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
