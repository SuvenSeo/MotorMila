import { useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Calculator, Search, Wallet } from "lucide-react";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { PageHero } from "@/components/PageHero";
import { formatPrice } from "@/services/api";
import { useAppPreferences } from "@/lib/appPreferences";
import {
  buildAffordableSearchUrl,
  computeAffordability,
  DEFAULT_AFFORDABILITY_ASSUMPTIONS,
  type AffordabilityAssumptions,
  type AffordabilityBreakdown,
} from "@/lib/affordability";
import { formatLkrMonthly } from "@/lib/price";

const STORAGE_KEY = "motormila.afford.v1";

function NumberField({
  label,
  value,
  onChange,
  suffix,
  step = 1,
  min = 0,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  step?: number;
  min?: number;
  hint?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-footnote font-medium text-foreground">
        {label}
      </label>
      <div className="mt-1.5 flex items-center rounded-2xl border border-border bg-background focus-within:ring-2 focus-within:ring-ring">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="h-11 w-full min-w-0 rounded-2xl bg-transparent px-3.5 text-body tabular-nums text-foreground outline-none"
        />
        {suffix && <span className="pr-3.5 text-footnote text-muted-foreground">{suffix}</span>}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-caption text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

function ResultCard({
  title,
  subtitle,
  result,
  condition,
}: {
  title: string;
  subtitle: string;
  result: AffordabilityBreakdown;
  condition: "used" | "reconditioned";
}) {
  const { t } = useAppPreferences();
  const limitText =
    result.limitedBy === "monthly"
      ? t("afford.limitMonthly", "Your monthly budget is the limit here.")
      : result.limitedBy === "ltv"
        ? t("afford.limitLtv", "The loan cap (LTV) and your cash are the limit here.")
        : t("afford.limitCash", "Your cash is the limit here.");
  return (
    <div className="rounded-[1.75rem] border border-border bg-card p-5 shadow-soft">
      <p className="text-footnote font-semibold text-muted-foreground">{title}</p>
      <p className="text-caption text-muted-foreground">{subtitle}</p>
      <p className="num mt-3 text-title1 font-extrabold leading-none tracking-tight text-foreground">
        {result.maxPriceLkr > 0 ? formatPrice(result.maxPriceLkr) : "—"}
      </p>
      <p className="mt-1 text-caption text-muted-foreground">{t("afford.maxPrice", "Highest asking price that fits")}</p>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-footnote">
        <dt className="text-muted-foreground">{t("afford.down", "Down payment")}</dt>
        <dd className="num text-right font-semibold">{formatPrice(result.downPaymentLkr)}</dd>
        <dt className="text-muted-foreground">{t("afford.upfront", "Upfront costs")}</dt>
        <dd className="num text-right font-semibold">{formatPrice(result.upfrontCostsLkr)}</dd>
        <dt className="text-muted-foreground">{t("afford.loan", "Loan / lease")}</dt>
        <dd className="num text-right font-semibold">{formatPrice(result.loanLkr)}</dd>
        <dt className="text-muted-foreground">{t("afford.monthly", "Monthly")}</dt>
        <dd className="num text-right font-semibold">{formatLkrMonthly(result.monthlyLkr)}</dd>
      </dl>
      <p className="mt-3 text-caption text-muted-foreground">{limitText}</p>
      {result.maxPriceLkr > 0 && (
        <Link
          to={buildAffordableSearchUrl(result.maxPriceLkr, { condition })}
          className="mt-4 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-2xl bg-primary px-4 text-footnote font-semibold text-primary-foreground no-underline transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Search className="h-3.5 w-3.5" aria-hidden />
          {t("afford.browse", "See cars up to {price}", { price: formatPrice(result.maxPriceLkr) })}
        </Link>
      )}
    </div>
  );
}

/** "Search by what I can afford": cash + monthly budget → price ceiling → filtered search. */
export default function Afford() {
  const { t } = useAppPreferences();
  const [cash, setCash] = useState(3_000_000);
  const [monthly, setMonthly] = useState(85_000);
  const [a, setA] = useState<AffordabilityAssumptions>(DEFAULT_AFFORDABILITY_ASSUMPTIONS);

  useEffect(() => {
    document.title = "What car can I afford? Sri Lanka budget search | Motormila";
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved && typeof saved === "object") {
        if (Number.isFinite(saved.cash)) setCash(saved.cash);
        if (Number.isFinite(saved.monthly)) setMonthly(saved.monthly);
        if (saved.a) setA({ ...DEFAULT_AFFORDABILITY_ASSUMPTIONS, ...saved.a });
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ cash, monthly, a }));
    } catch {
      /* ignore */
    }
  }, [cash, monthly, a]);

  const result = useMemo(() => computeAffordability(cash, monthly, a), [cash, monthly, a]);
  const setAssumption = <K extends keyof AffordabilityAssumptions>(k: K, v: AffordabilityAssumptions[K]) =>
    setA((prev) => ({ ...prev, [k]: v }));

  return (
    <PageCanvas>
      <PageHero
        eyebrow={t("afford.eyebrow", "Budget search")}
        eyebrowIcon={Wallet}
        watermarkIcon={Calculator}
        title={t("afford.title", "What can I afford?")}
        description={t(
          "afford.description",
          "Enter the cash you have and what you can pay each month. We apply the CBSL loan-to-value caps, a lease rate and transfer costs, then show you the cars that fit.",
        )}
      />
      <PageBody narrow className="space-y-8">
        <section aria-labelledby="afford-inputs" className="rounded-[1.75rem] border border-border bg-card p-5 shadow-soft">
          <h2 id="afford-inputs" className="text-body font-semibold text-foreground">
            {t("afford.yourBudget", "Your budget")}
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <NumberField label={t("afford.cash", "Cash available today")} value={cash} onChange={setCash} suffix="LKR" step={50_000} />
            <NumberField
              label={t("afford.monthlyBudget", "Monthly instalment you can pay")}
              value={monthly}
              onChange={setMonthly}
              suffix="LKR"
              step={5_000}
              hint={t("afford.monthlyHint", "Enter 0 to buy with cash only.")}
            />
          </div>
        </section>

        <section aria-label={t("afford.results", "Results")} aria-live="polite" className="grid gap-4 md:grid-cols-2">
          <ResultCard
            title={t("afford.registered", "Registered used car")}
            subtitle={t("afford.registeredSub", "First registered over a year ago: up to {ltv}% financing", { ltv: Math.round(a.ltvRegistered * 100) })}
            result={result.registered}
            condition="used"
          />
          <ResultCard
            title={t("afford.unregistered", "Unregistered / reconditioned")}
            subtitle={t("afford.unregisteredSub", "New, recon or under a year old: up to {ltv}% financing", { ltv: Math.round(a.ltvUnregistered * 100) })}
            result={result.unregistered}
            condition="reconditioned"
          />
        </section>

        <details className="group rounded-[1.75rem] border border-border bg-card p-5 shadow-soft">
          <summary className="cursor-pointer list-none text-body font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {t("afford.assumptions", "Assumptions (edit to match your lender)")}
            <span className="ml-2 text-caption font-normal text-muted-foreground group-open:hidden">{t("afford.show", "Show")}</span>
          </summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <NumberField
              label={t("afford.ltvReg", "Max financing, registered (%)")}
              value={Math.round(a.ltvRegistered * 100)}
              onChange={(v) => setAssumption("ltvRegistered", Math.min(90, Math.max(0, v)) / 100)}
              suffix="%"
            />
            <NumberField
              label={t("afford.ltvUnreg", "Max financing, unregistered (%)")}
              value={Math.round(a.ltvUnregistered * 100)}
              onChange={(v) => setAssumption("ltvUnregistered", Math.min(90, Math.max(0, v)) / 100)}
              suffix="%"
            />
            <NumberField label={t("afford.rate", "Interest rate (yearly, reducing)")} value={a.annualRatePct} onChange={(v) => setAssumption("annualRatePct", Math.max(0, v))} suffix="%" step={0.5} />
            <NumberField label={t("afford.term", "Term")} value={a.termYears} onChange={(v) => setAssumption("termYears", Math.min(10, Math.max(1, v)))} suffix={t("afford.years", "years")} />
            <NumberField label={t("afford.stamp", "Stamp duty + lender fees (% of loan)")} value={a.stampDutyPct} onChange={(v) => setAssumption("stampDutyPct", Math.max(0, v))} suffix="%" step={0.5} />
            <NumberField label={t("afford.transfer", "Ownership transfer fee")} value={a.transferFeeLkr} onChange={(v) => setAssumption("transferFeeLkr", Math.max(0, v))} suffix="LKR" step={500} />
            <label className="flex items-center gap-2.5 text-footnote text-foreground sm:col-span-2">
              <input
                type="checkbox"
                checked={a.includeInsurance}
                onChange={(e) => setAssumption("includeInsurance", e.target.checked)}
                className="h-4 w-4 rounded border-border accent-[hsl(var(--primary))]"
              />
              {t("afford.insurance", "Include first-year comprehensive insurance in cash needed (about 1.2% of price, Rs 80k–250k)")}
            </label>
          </div>
          <button
            type="button"
            onClick={() => setA(DEFAULT_AFFORDABILITY_ASSUMPTIONS)}
            className="mt-4 rounded-full border border-border px-4 py-2 text-caption font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("afford.reset", "Reset to defaults")}
          </button>
        </details>

        <p className="text-caption leading-relaxed text-muted-foreground">
          {t(
            "afford.disclaimer",
            "Indicative planning figures only, not a loan offer. Financing caps follow CBSL Directions No. 01 of 2026 (effective 25 May 2026): 40% for unregistered or under-1-year cars, 60% for cars registered over a year and for commercial vehicles. Lenders set their own rates, fees and eligibility. Check with your bank or leasing company before you commit.",
          )}
        </p>
      </PageBody>
    </PageCanvas>
  );
}
