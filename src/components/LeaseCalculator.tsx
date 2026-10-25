import { useState } from "react";
import { formatPrice } from "@/services/api";
import {
  CBSL_LTV_CAPS,
  getFinanceClassLabel,
  minDownPaymentPctForClass,
  type VehicleFinanceClass,
} from "@/lib/cashToOwn";
import { useAppPreferences } from "@/lib/appPreferences";
import { Slider } from "@/components/ui/slider";
import { SimpleSelect } from "@/components/ui/select";
import {
  AnimatedLkr,
  Field,
  Notice,
  NumberField,
  ResultCard,
  ResultRow,
  ResultRows,
} from "@/components/tools/ToolKit";

/**
 * Lease payment calculator (Calculator → Lease, Listing detail). Down payment
 * slider + rate + term in, the monthly instalment out as the hero number.
 */
export function LeaseCalculator({
  price,
  financeClass = "registered_used",
}: {
  price: number;
  financeClass?: VehicleFinanceClass;
}) {
  const { t } = useAppPreferences();
  const ltvMinDown = minDownPaymentPctForClass(financeClass);
  const [downPaymentPct, setDownPaymentPct] = useState(() => Math.max(30, ltvMinDown));
  const [interestRate, setInterestRate] = useState(15);
  const [years, setYears] = useState(5);

  const downPayment = price * (downPaymentPct / 100);
  const principal = price - downPayment;
  const monthlyInterestRate = interestRate / 100 / 12;
  const numberOfPayments = years * 12;
  const financedShare = 1 - downPaymentPct / 100;
  const exceedsLtv = financedShare > CBSL_LTV_CAPS[financeClass] + 0.001;

  const monthlyPayment =
    monthlyInterestRate === 0
      ? principal / numberOfPayments
      : (principal * monthlyInterestRate * Math.pow(1 + monthlyInterestRate, numberOfPayments)) /
        (Math.pow(1 + monthlyInterestRate, numberOfPayments) - 1);

  const totalInterest = monthlyPayment * numberOfPayments - principal;

  return (
    <ResultCard
      label={t("tools.lease.monthly", "Est. monthly payment")}
      value={<AnimatedLkr value={monthlyPayment} mode="monthly" />}
      caption={t("tools.lease.caption", "Lease payment calculator · max LTV {ltv}% · {cls}", {
        ltv: Math.round(CBSL_LTV_CAPS[financeClass] * 100),
        cls: getFinanceClassLabel(financeClass),
      })}
      footer={
        exceedsLtv ? (
          <Notice tone="caution">
            {t(
              "tools.lease.ltvWarn",
              "The financed share is above the usual CBSL limit for this class. Raise the down payment to at least {pct}% (about {amount}).",
              { pct: ltvMinDown, amount: formatPrice(price * (ltvMinDown / 100)) },
            )}
          </Notice>
        ) : null
      }
    >
      <div className="space-y-4">
        <Field
          label={t("tools.lease.down", "Down payment")}
          htmlFor="lease-down-payment"
          aside={`${downPaymentPct}% · ${formatPrice(downPayment)}`}
        >
          <Slider
            id="lease-down-payment"
            min={10}
            max={90}
            step={5}
            value={[downPaymentPct]}
            onValueChange={([v]) => setDownPaymentPct(v)}
            thumbLabel={t("tools.lease.down", "Down payment")}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <NumberField id="lease-interest" label={t("tools.lease.rate", "Interest rate")} value={interestRate} onChange={setInterestRate} suffix="%" step={0.5} />
          <Field label={t("tools.lease.term", "Term")} htmlFor="lease-term">
            <SimpleSelect
              id="lease-term"
              value={String(years)}
              onValueChange={(v) => setYears(Number(v))}
              options={[3, 5, 7].map((y) => ({ value: String(y), label: t("tools.lease.yearsShort", "{n} years", { n: y }) }))}
            />
          </Field>
        </div>
        <ResultRows className="border-t border-separator pt-4">
          <ResultRow label={t("tools.lease.principal", "Amount financed")} value={<AnimatedLkr value={principal} />} />
          <ResultRow label={t("tools.lease.interest", "Total interest paid")} value={<AnimatedLkr value={totalInterest} />} />
        </ResultRows>
      </div>
    </ResultCard>
  );
}
