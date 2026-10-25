import { formatPrice } from "@/services/api";
import {
  computeCashToOwn,
  getFinanceClassLabel,
  type CashToOwnResult,
  type VehicleFinanceClass,
} from "@/lib/cashToOwn";
import { useAppPreferences } from "@/lib/appPreferences";
import { Card } from "@/components/ui/card";
import { AnimatedLkr, Stat } from "@/components/tools/ToolKit";

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
  const { t } = useAppPreferences();
  const result: CashToOwnResult | null = computeCashToOwn({
    priceLkr,
    financeClass,
    interestRatePct,
    termYears,
    chargerLkr,
  });

  if (!result) return null;

  const stampPct = Math.round((result.stampDutyLkr / Math.max(result.maxFinanceLkr, 1)) * 100);

  return (
    <Card padding="sm" className="sm:p-5" aria-label={t("tools.cash.aria", "Cash to own under CBSL LTV")}>
      <p className="text-footnote font-semibold text-foreground">{t("tools.cash.title", "Cash to own · CBSL LTV planning")}</p>
      <p className="mt-0.5 text-caption text-label-2">{result.affordableNote}</p>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label={t("tools.cash.today", "Min cash today")} value={<AnimatedLkr value={result.trueCashTodayLkr} />} emphasis />
        <Stat label={t("tools.cash.down", "Down (LTV)")} value={<AnimatedLkr value={result.minCashDownLkr} />} />
        <Stat label={t("tools.cash.maxFinance", "Max finance")} value={<AnimatedLkr value={result.maxFinanceLkr} />} />
        <Stat label={t("tools.cash.monthly", "Monthly · {n}y", { n: termYears })} value={<AnimatedLkr value={result.monthlyPaymentLkr} mode="monthly" />} />
      </div>
      <p className="mt-4 text-caption text-label-2">
        {t(
          "tools.cash.note",
          "True drive-away: down payment + stamp duty (about {stamp}% of the loan) + transfer {transfer}{charger} + a one-month insurance reserve. Class: {cls}. Bank terms vary; planning only.",
          {
            stamp: stampPct,
            transfer: formatPrice(result.transferFeeLkr),
            charger:
              result.chargerAllowanceLkr > 0
                ? t("tools.cash.charger", " + charger {amount}", { amount: formatPrice(result.chargerAllowanceLkr) })
                : "",
            cls: getFinanceClassLabel(financeClass),
          },
        )}
      </p>
    </Card>
  );
}
