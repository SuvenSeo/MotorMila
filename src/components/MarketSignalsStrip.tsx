import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Landmark } from "lucide-react";
import { Link } from "react-router-dom";
import { getMarketSignals } from "@/services/api";
import type { MarketSignal } from "@/types/car";
import { formatPulseValue, labelPulseMetric, labelPulseSource } from "@/lib/officialPulseContent";
import { QUERY_STALE } from "@/lib/queryPolicy";

function SignalCard({ signal }: { signal: MarketSignal }) {
  const title = labelPulseMetric(signal.category || signal.metric);
  const period =
    signal.period_year && signal.period_month
      ? `${signal.period_year}-${String(signal.period_month).padStart(2, "0")}`
      : null;

  return (
    <Link
      to={`/official-pulse/${signal.id}`}
      className="inventory-tile min-w-[220px] flex-1 p-4 no-underline"
    >
      <article>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[12px] font-medium text-primary/70">
              {labelPulseSource(signal.source)} · {signal.signal_type.replace(/_/g, " ")}
            </p>
            <h3 className="mt-2 text-sm font-semibold text-foreground">{title}</h3>
          </div>
          <span
            className="rounded-full border border-border p-1.5 text-muted-foreground"
            aria-hidden
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
          </span>
        </div>
        <p className="mt-3 text-lg font-semibold tracking-tight text-foreground num">
          {formatPulseValue(signal.value_numeric, signal.unit, signal.metric)}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {period ? `Period ${period}` : "Latest official pulse"}
        </p>
      </article>
    </Link>
  );
}

export function MarketSignalsStrip() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["market-signals", 6],
    queryFn: () => getMarketSignals(6),
    staleTime: QUERY_STALE.market,
    retry: 1,
  });

  if (isError) return null;

  return (
    <section className="rounded-[2rem] border border-border bg-surface/80 p-5 sm:p-6" aria-label="Official market signals">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-primary/80" />
          <div>
            <p className="text-[12px] font-medium text-muted-foreground">Official pulse</p>
            <h2 className="text-sm font-semibold text-foreground">Government & import market signals</h2>
          </div>
        </div>
        <Link
          to="/official-pulse"
          className="text-[11px] font-semibold text-primary no-underline transition-colors hover:text-primary/80"
        >
          Open pulse desk →
        </Link>
      </div>

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-[1.75rem] border border-border bg-card" />
          ))}
        </div>
      ) : data && data.length > 0 ? (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {data.map((signal) => (
            <SignalCard key={signal.id} signal={signal} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Official registration and import-cost signals will appear here after the market-signals sync runs.{" "}
          <Link to="/official-pulse" className="font-medium text-primary no-underline hover:underline">
            Read what each signal means
          </Link>
          .
        </p>
      )}
    </section>
  );
}
