import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RotateCcw, Search, SlidersHorizontal, Wallet } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import {
  AnimatedLkr,
  CheckRow,
  FormCard,
  NumberField,
  ResultCard,
  ResultRow,
  ResultRows,
  ToolGrid,
  ToolPage,
} from "@/components/tools/ToolKit";
import { formatPrice } from "@/services/api";
import { useAppPreferences } from "@/lib/appPreferences";
import {
  buildAffordableSearchUrl,
  computeAffordability,
  DEFAULT_AFFORDABILITY_ASSUMPTIONS,
  type AffordabilityAssumptions,
  type AffordabilityBreakdown,
} from "@/lib/affordability";

const STORAGE_KEY = "motormila.afford.v1";

function AffordResult({
  title,
  subtitle,
  result,
  condition,
  primary,
}: {
  title: string;
  subtitle: string;
  result: AffordabilityBreakdown;
  condition: "used" | "reconditioned";
  primary?: boolean;
}) {
  const { t } = useAppPreferences();
  const limitText =
    result.limitedBy === "monthly"
      ? t("afford.limitMonthly", "Your monthly budget is the limit here.")
      : result.limitedBy === "ltv"
        ? t("afford.limitLtv", "The loan cap (LTV) and your cash are the limit here.")
        : t("afford.limitCash", "Your cash is the limit here.");
  const fits = result.maxPriceLkr > 0;
  return (
    <ResultCard
      emphasis={primary}
      label={title}
      value={fits ? <AnimatedLkr value={result.maxPriceLkr} /> : "—"}
      caption={fits ? t("afford.maxPrice", "Highest asking price that fits") : t("tools.afford.nothingFits", "Nothing fits yet. Add cash or a monthly budget.")}
      footer={
        fits ? (
          <Button asChild variant={primary ? "primary" : "secondary"} className="w-full">
            <Link to={buildAffordableSearchUrl(result.maxPriceLkr, { condition })}>
              <Search aria-hidden />
              {t("afford.browse", "See cars up to {price}", { price: formatPrice(result.maxPriceLkr) })}
            </Link>
          </Button>
        ) : null
      }
    >
      <ResultRows>
        <ResultRow label={t("afford.down", "Down payment")} value={<AnimatedLkr value={result.downPaymentLkr} />} />
        <ResultRow label={t("afford.upfront", "Upfront costs")} value={<AnimatedLkr value={result.upfrontCostsLkr} />} />
        <ResultRow label={t("afford.loan", "Loan / lease")} value={<AnimatedLkr value={result.loanLkr} />} />
        <ResultRow label={t("afford.monthly", "Monthly")} value={<AnimatedLkr value={result.monthlyLkr} mode="monthly" />} />
      </ResultRows>
      <p className="mt-3 text-caption text-label-2">
        {subtitle}. {limitText}
      </p>
    </ResultCard>
  );
}

/** "Search by what I can afford": cash + monthly budget → price ceiling → filtered search. */
export default function Afford() {
  const { t } = useAppPreferences();
  const [cash, setCash] = useState(3_000_000);
  const [monthly, setMonthly] = useState(85_000);
  const [a, setA] = useState<AffordabilityAssumptions>(DEFAULT_AFFORDABILITY_ASSUMPTIONS);

  useEffect(() => {
    // Title/description come from RouteMeta (translated, matches the prerendered shell).
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
    <ToolPage
      header={
        <PageHeader
          eyebrow={t("afford.eyebrow", "Budget search")}
          eyebrowIcon={Wallet}
          title={t("afford.title", "What can I afford?")}
          description={t(
            "afford.description",
            "Enter the cash you have and what you can pay each month. We apply the CBSL loan-to-value caps, a lease rate and transfer costs, then show you the cars that fit.",
          )}
        />
      }
    >
      <ToolGrid
        form={
          <>
            <FormCard icon={Wallet} title={t("afford.yourBudget", "Your budget")}>
              <div className="grid gap-4 sm:grid-cols-2">
                <NumberField id="afford-cash" label={t("afford.cash", "Cash available today")} value={cash} onChange={setCash} prefix="Rs" step={50_000} />
                <NumberField
                  id="afford-monthly"
                  label={t("afford.monthlyBudget", "Monthly instalment you can pay")}
                  value={monthly}
                  onChange={setMonthly}
                  prefix="Rs"
                  step={5_000}
                  hint={t("afford.monthlyHint", "Enter 0 to buy with cash only.")}
                />
              </div>
            </FormCard>

          </>
        }
        after={
          <>
            <FormCard
              icon={SlidersHorizontal}
              title={t("tools.afford.assumptionsTitle", "Assumptions")}
              description={t("tools.afford.assumptionsBody", "Edit these to match your lender.")}
              action={
                <Button variant="tertiary" size="sm" onClick={() => setA(DEFAULT_AFFORDABILITY_ASSUMPTIONS)}>
                  <RotateCcw aria-hidden />
                  {t("afford.reset", "Reset to defaults")}
                </Button>
              }
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <NumberField
                  id="afford-ltv-reg"
                  label={t("afford.ltvReg", "Max financing, registered (%)")}
                  value={Math.round(a.ltvRegistered * 100)}
                  onChange={(v) => setAssumption("ltvRegistered", Math.min(90, Math.max(0, v)) / 100)}
                  suffix="%"
                />
                <NumberField
                  id="afford-ltv-unreg"
                  label={t("afford.ltvUnreg", "Max financing, unregistered (%)")}
                  value={Math.round(a.ltvUnregistered * 100)}
                  onChange={(v) => setAssumption("ltvUnregistered", Math.min(90, Math.max(0, v)) / 100)}
                  suffix="%"
                />
                <NumberField id="afford-rate" label={t("afford.rate", "Interest rate (yearly, reducing)")} value={a.annualRatePct} onChange={(v) => setAssumption("annualRatePct", Math.max(0, v))} suffix="%" step={0.5} />
                <NumberField id="afford-term" label={t("afford.term", "Term")} value={a.termYears} onChange={(v) => setAssumption("termYears", Math.min(10, Math.max(1, v)))} suffix={t("afford.years", "years")} />
                <NumberField id="afford-stamp" label={t("afford.stamp", "Stamp duty + lender fees (% of loan)")} value={a.stampDutyPct} onChange={(v) => setAssumption("stampDutyPct", Math.max(0, v))} suffix="%" step={0.5} />
                <NumberField id="afford-transfer" label={t("afford.transfer", "Ownership transfer fee")} value={a.transferFeeLkr} onChange={(v) => setAssumption("transferFeeLkr", Math.max(0, v))} prefix="Rs" step={500} />
              </div>
              <CheckRow id="afford-insurance" checked={a.includeInsurance} onCheckedChange={(v) => setAssumption("includeInsurance", v)} className="-mx-2">
                <span className="text-footnote">
                  {t("afford.insurance", "Include first-year comprehensive insurance in cash needed (about 1.2% of price, Rs 80k–250k)")}
                </span>
              </CheckRow>
            </FormCard>

            <p className="text-caption text-label-2">
              {t(
                "afford.disclaimer",
                "Indicative planning figures only, not a loan offer. Financing caps follow CBSL Directions No. 01 of 2026 (effective 25 May 2026): 40% for unregistered or under-1-year cars, 60% for cars registered over a year and for commercial vehicles. Lenders set their own rates, fees and eligibility. Check with your bank or leasing company before you commit.",
              )}
            </p>
          </>
        }
        result={
          <section aria-label={t("afford.results", "Results")} className="space-y-4">
            <AffordResult
              primary
              title={t("afford.registered", "Registered used car")}
              subtitle={t("afford.registeredSub", "First registered over a year ago: up to {ltv}% financing", { ltv: Math.round(a.ltvRegistered * 100) })}
              result={result.registered}
              condition="used"
            />
            <AffordResult
              title={t("afford.unregistered", "Unregistered / reconditioned")}
              subtitle={t("afford.unregisteredSub", "New, recon or under a year old: up to {ltv}% financing", { ltv: Math.round(a.ltvUnregistered * 100) })}
              result={result.unregistered}
              condition="reconditioned"
            />
          </section>
        }
      />
    </ToolPage>
  );
}
