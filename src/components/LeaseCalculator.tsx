import { useState } from "react";
import { formatPrice } from "@/services/api";
import {
  CBSL_LTV_CAPS,
  getFinanceClassLabel,
  minDownPaymentPctForClass,
  type VehicleFinanceClass,
} from "@/lib/cashToOwn";

export function LeaseCalculator({
  price,
  financeClass = "registered_used",
}: {
  price: number;
  financeClass?: VehicleFinanceClass;
}) {
  const ltvMinDown = minDownPaymentPctForClass(financeClass);
  const [downPaymentPct, setDownPaymentPct] = useState(() => Math.max(30, ltvMinDown));
  const [interestRate, setInterestRate] = useState(15);
  const [years, setYears] = useState(5);

  const downPayment = price * (downPaymentPct / 100);
  const principal = price - downPayment;
  const monthlyInterestRate = (interestRate / 100) / 12;
  const numberOfPayments = years * 12;
  const financedShare = 1 - downPaymentPct / 100;
  const exceedsLtv = financedShare > CBSL_LTV_CAPS[financeClass] + 0.001;

  const monthlyPayment =
    monthlyInterestRate === 0
      ? principal / numberOfPayments
      : (principal * monthlyInterestRate * Math.pow(1 + monthlyInterestRate, numberOfPayments)) /
        (Math.pow(1 + monthlyInterestRate, numberOfPayments) - 1);

  const totalInterest = (monthlyPayment * numberOfPayments) - principal;

  return (
    <div className="page-panel space-y-6 rounded-xl p-6">
      <div className="flex flex-col gap-1">
        <h3 className="field-label text-foreground">Lease payment calculator</h3>
        <p className="text-[10px] text-muted-foreground">
          CBSL-oriented max LTV {Math.round(CBSL_LTV_CAPS[financeClass] * 100)}% · {getFinanceClassLabel(financeClass)}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 border-b border-border pb-6">
        <div>
          <div className="flex justify-between mb-1">
            <label htmlFor="lease-down-payment" className="field-label block">Down payment</label>
            <span className="text-xs font-medium text-foreground num">{downPaymentPct}% ({formatPrice(downPayment)})</span>
          </div>
          <input
            id="lease-down-payment"
            type="range"
            min="10"
            max="90"
            step="5"
            value={downPaymentPct}
            onChange={e => setDownPaymentPct(Number(e.target.value))}
            className="mt-2 h-1.5 w-full appearance-none rounded-full bg-foreground/10 accent-primary outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="lease-interest" className="field-label mb-1 block">Interest rate (%)</label>
            <input
              id="lease-interest"
              type="number"
              step="0.5"
              value={interestRate}
              onChange={e => setInterestRate(Number(e.target.value))}
              className="w-full rounded-xl border border-border bg-surface p-3 text-sm font-medium text-foreground outline-none transition-[border-color,box-shadow] focus:ring-1 focus:ring-primary/50"
            />
          </div>
          <div>
            <label htmlFor="lease-term" className="field-label mb-1 block">Term (years)</label>
            <select
              id="lease-term"
              value={years}
              onChange={e => setYears(Number(e.target.value))}
              className="w-full appearance-none rounded-xl border border-border bg-surface p-3 text-sm font-medium text-foreground outline-none transition-[border-color,box-shadow] focus:ring-1 focus:ring-primary/50"
            >
              <option value="3">3 Years (36 mo)</option>
              <option value="5">5 Years (60 mo)</option>
              <option value="7">7 Years (84 mo)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center px-1">
          <span className="text-xs font-medium text-muted-foreground">Principal Amount</span>
          <span className="text-sm font-medium text-foreground num">{formatPrice(principal)}</span>
        </div>
        <div className="flex justify-between items-center px-1">
          <span className="text-xs font-medium text-muted-foreground">Total Interest Paid</span>
          <span className="text-sm font-medium text-foreground num">{formatPrice(totalInterest)}</span>
        </div>
      </div>

      {exceedsLtv ? (
        <p className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200/90">
          Financed share exceeds typical CBSL LTV for this class. Raise down payment to at least{" "}
          {ltvMinDown}% (about {formatPrice(price * (ltvMinDown / 100))}) for a realistic cash gap.
        </p>
      ) : null}

      <div className="pt-2">
        <div className="flex flex-col rounded-xl border border-primary/20 bg-primary/10 p-5 sm:flex-row sm:items-center sm:justify-between">
          <span className="mb-1 text-sm font-semibold tracking-tight text-primary sm:mb-0">Est. monthly payment</span>
          <span className="text-2xl font-bold text-foreground tracking-tight num">
            {formatPrice(monthlyPayment)}
            <span className="ml-1 text-sm font-normal text-muted-foreground">/mo</span>
          </span>
        </div>
      </div>
    </div>
  );
}
