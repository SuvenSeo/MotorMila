import { formatPrice } from "@/services/api";
import {
  computeCashToOwn,
  getFinanceClassLabel,
  type CashToOwnResult,
  type VehicleFinanceClass,
} from "@/lib/cashToOwn";

interface CashToOwnStripProps {
  priceLkr: number;
  financeClass: VehicleFinanceClass;
  interestRatePct?: number;
  termYears?: number;
  /** EV home wallbox allowance (0 for non-EVs). */
  chargerLkr?: number;
}

export function CashToOwnStrip({
  priceLkr,
  financeClass,
  interestRatePct = 15,
  termYears = 5,
  chargerLkr = 0,
}: CashToOwnStripProps) {
  const result: CashToOwnResult | null = computeCashToOwn({
    priceLkr,
    financeClass,
    interestRatePct,
    termYears,
    chargerLkr,
  });

  if (!result) return null;

  return (
    <section
      className="rounded-2xl border border-border/80 bg-surface/80 p-4 shadow-xs"
      aria-label="Cash to own under CBSL LTV"
    >
      <p className="text-[12px] font-medium text-muted-foreground">
        Cash to own · CBSL LTV planning
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">{result.affordableNote}</p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Min cash today" value={formatPrice(result.trueCashTodayLkr)} emphasize />
        <Metric label="Down (LTV)" value={formatPrice(result.minCashDownLkr)} />
        <Metric label="Max finance" value={formatPrice(result.maxFinanceLkr)} />
        <Metric label={`Monthly · ${termYears}y`} value={formatPrice(result.monthlyPaymentLkr)} />
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
        True drive-away: down + stamp (~{Math.round((result.stampDutyLkr / Math.max(result.maxFinanceLkr, 1)) * 100)}% of loan) +
        transfer {formatPrice(result.transferFeeLkr)}
        {result.chargerAllowanceLkr > 0 ? ` + charger ${formatPrice(result.chargerAllowanceLkr)}` : ""} +
        1-month insurance reserve. Class: {getFinanceClassLabel(financeClass)}. Bank terms vary —
        planning only.
      </p>
    </section>
  );
}

function Metric({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div>
      <p className="text-[12px] font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 num text-sm font-semibold ${emphasize ? "text-primary" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}
