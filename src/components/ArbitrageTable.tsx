import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, Lock } from "lucide-react";
import { formatPriceLkrMillions } from "@/lib/formatting";
import { grossGapLkr, netGapLkr, resolveTransportLkr, type TransportForGap } from "@/lib/transport";
import type { ProArbitrageGap } from "@/types/pro";
import { cn } from "@/lib/utils";

export type ArbitrageSortKey = "net" | "gap_pct" | "gross";

export interface ArbitrageTableProps {
  gaps: ProArbitrageGap[];
  /** Flat LKR cost or per-gap resolver; defaults to the SL transport estimate. */
  transport?: TransportForGap;
  /** Trial cap: only the first N rows stay sharp, the rest blur + lock. */
  visibleLimit?: number;
  trialCtaTo?: string;
}

interface EnrichedGap {
  gap: ProArbitrageGap;
  transportLkr: number;
  grossLkr: number;
  netLkr: number;
}

function SortIcon({ active, dir }: { active: boolean; dir: 1 | -1 }) {
  if (!active) return <ArrowUpDown className="h-3 w-3 opacity-50" aria-hidden="true" />;
  return dir === 1 ? (
    <ArrowUp className="h-3 w-3" aria-hidden="true" />
  ) : (
    <ArrowDown className="h-3 w-3" aria-hidden="true" />
  );
}

function GapCells({ row }: { row: EnrichedGap }) {
  const { gap, transportLkr, grossLkr, netLkr } = row;
  return (
    <>
      <td className="px-4 py-3 font-semibold text-deal-good-text">{gap.buy_district}</td>
      <td className="px-4 py-3 font-semibold text-primary">{gap.sell_district}</td>
      <td className="px-4 py-3 text-foreground num">{formatPriceLkrMillions(gap.buy_median_lkr)}</td>
      <td className="px-4 py-3 text-foreground num">{formatPriceLkrMillions(gap.sell_median_lkr)}</td>
      <td className="px-4 py-3 font-bold text-primary num">+{gap.gap_pct.toFixed(1)}%</td>
      <td className="px-4 py-3 text-muted-foreground num" title="Fuel + driver + transfer estimate">
        {formatPriceLkrMillions(transportLkr)}
      </td>
      <td className={cn("px-4 py-3 font-bold num", netLkr >= 0 ? "text-deal-good-text" : "text-deal-high-text")}>
        {netLkr >= 0 ? "+" : "−"}{formatPriceLkrMillions(Math.abs(netLkr))}
      </td>
      <td className="hidden px-4 py-3 text-muted-foreground num lg:table-cell">
        {formatPriceLkrMillions(grossLkr)}
      </td>
    </>
  );
}

/**
 * Sortable cross-district arbitrage table with a net-after-transport column.
 * Props-driven: gaps + transport estimator in, ranked net opportunities out.
 */
export function ArbitrageTable({ gaps, transport, visibleLimit, trialCtaTo = "/pricing" }: ArbitrageTableProps) {
  const [sortKey, setSortKey] = useState<ArbitrageSortKey>("net");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const rows = useMemo<EnrichedGap[]>(
    () =>
      gaps.map((gap) => {
        const transportLkr = resolveTransportLkr(gap, transport);
        return { gap, transportLkr, grossLkr: grossGapLkr(gap), netLkr: netGapLkr(gap, transportLkr) };
      }),
    [gaps, transport],
  );

  const sorted = useMemo(() => {
    const valueOf = (row: EnrichedGap) =>
      sortKey === "net" ? row.netLkr : sortKey === "gross" ? row.grossLkr : row.gap.gap_pct;
    return [...rows].sort((a, b) => (valueOf(a) - valueOf(b)) * sortDir);
  }, [rows, sortKey, sortDir]);

  const limit = visibleLimit ?? sorted.length;
  const visible = sorted.slice(0, limit);
  const teaser = sorted.slice(limit, limit + 2);
  const lockedCount = Math.max(0, sorted.length - visible.length);

  const toggleSort = (key: ArbitrageSortKey) => {
    if (key === sortKey) {
      setSortDir((dir) => (dir === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(-1);
    }
  };

  if (!rows.length) return null;

  const headers: Array<{ key: ArbitrageSortKey | null; label: string; hint?: string }> = [
    { key: null, label: "Buy in" },
    { key: null, label: "Sell in" },
    { key: null, label: "Buy median" },
    { key: null, label: "Sell median" },
    { key: "gap_pct", label: "Gap %" },
    { key: null, label: "Transport", hint: "Fuel + driver + transfer estimate" },
    { key: "net", label: "Net" },
    { key: "gross", label: "Gross" },
  ];

  return (
    <div className="overflow-auto rounded-xl border border-border" aria-label="Arbitrage gaps table">
      <table className="w-full min-w-[760px] text-footnote">
        <thead className="sticky top-0 z-10 bg-surface">
          <tr>
            {headers.map((header) => (
              <th key={header.label} className="border-b border-border px-4 py-3 text-left field-label">
                {header.key ? (
                  <button
                    type="button"
                    onClick={() => toggleSort(header.key as ArbitrageSortKey)}
                    aria-label={`Sort by ${header.label}`}
                    className="inline-flex items-center gap-1 tracking-tight transition-colors hover:text-foreground"
                  >
                    {header.label}
                    <SortIcon active={sortKey === header.key} dir={sortDir} />
                  </button>
                ) : (
                  <span title={header.hint}>{header.label}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <tr
              key={`${row.gap.buy_district}-${row.gap.sell_district}`}
              className="border-t border-border transition-colors hover:bg-surface"
            >
              <GapCells row={row} />
            </tr>
          ))}
          {teaser.map((row) => (
            <tr
              key={`locked-${row.gap.buy_district}-${row.gap.sell_district}`}
              aria-hidden="true"
              className="select-none border-t border-border blur-sm"
            >
              <GapCells row={row} />
            </tr>
          ))}
        </tbody>
      </table>
      {lockedCount > 0 && (
        <Link
          to={trialCtaTo}
          className="flex items-center justify-center gap-2 border-t border-border bg-primary/5 px-4 py-3 text-caption font-bold text-primary-bright no-underline transition-colors hover:bg-primary/10"
        >
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          {lockedCount} more gap{lockedCount === 1 ? "" : "s"} locked — start a 7-day free trial to unlock net rankings
        </Link>
      )}
    </div>
  );
}
