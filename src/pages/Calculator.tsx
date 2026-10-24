import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AnimatePresence, m } from "motion/react";
import { Banknote, Bell, BellOff, Calculator as CalculatorIcon, CheckCircle2, FileBadge, Gauge, Link2, RefreshCw, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { tween } from "@/lib/motion";
import { formatPrice, getMacroContext, type LandedCostResult, type TcoResult, type MacroContext } from "@/services/api";
import {
  calculateLandedCostResilient as calculateLandedCost,
  calculateTcoResilient as calculateTco,
  calculateLandedCostOffline,
  calculateTcoOffline,
  type OfflineFlag,
} from "@/lib/offlineCalculators";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AdornedInput,
  AnimatedLkr,
  CheckRow,
  ChoiceChips,
  Field,
  FormCard,
  Notice,
  NumberField,
  ResultCard,
  ResultRow,
  ResultRows,
  ResultSkeleton,
  ToolGrid,
  ToolPage,
} from "@/components/tools/ToolKit";
import { LeaseCalculator } from "@/components/LeaseCalculator";
import { CashToOwnStrip } from "@/components/CashToOwnStrip";
import { OwnershipCostsPanel } from "@/components/OwnershipCostsPanel";
import { FreePlanBanner } from "@/components/FreePlanBanner";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { getSurchargeCountdown } from "@/lib/importTaxModel";
import { AFFORDABILITY_DEFAULTS } from "@/utils/affordability";
import { useAppPreferences } from "@/lib/appPreferences";
import { localizeCalcNote } from "@/lib/calcNotesI18n";
import { useAuth } from "@/lib/authContext";
import { FREE_CALCULATOR_TABS, freePlanText, hasFullPlatformAccess } from "@/lib/planLimits";
import {
  consumeSurchargeLapseNotification,
  isSurchargeNotifySubscribed,
  subscribeSurchargeLapseNotify,
  unsubscribeSurchargeLapseNotify,
} from "@/lib/surchargeAlert";

type TabType = "landed-cost" | "lease" | "tco" | "ownership" | "permits" | "depreciation";
type FuelType = "petrol" | "diesel" | "hybrid" | "electric";

const TAB_IDS: TabType[] = ["landed-cost", "lease", "tco", "ownership", "permits", "depreciation"];
const FUEL_TYPES: FuelType[] = ["petrol", "diesel", "hybrid", "electric"];
const FREE_TAB_SET = new Set<string>(FREE_CALCULATOR_TABS);
/**
 * Tabs that are not real calculators yet (hard-coded benchmark tables) stay
 * hidden for everyone; /permits has the permit page. Locked tabs are hidden
 * too — we only show calculators this visitor can actually run. The ids stay
 * valid in the URL so old shared links fall back to the landed-cost tab.
 */
const UNFINISHED_TABS = new Set<TabType>(["permits", "depreciation"]);
function visibleTabsFor(fullAccess: boolean): TabType[] {
  return TAB_IDS.filter((id) => !UNFINISHED_TABS.has(id) && (fullAccess || FREE_TAB_SET.has(id)));
}

// Cap URL-seeded numbers well above any real-world value; a crafted
// ?cif=1e300 must not reach the backend or overflow the math.
const MAX_URL_NUMBER = 1e12;

function numParam(
  params: URLSearchParams,
  key: string,
  fallback: number,
  { positive = false }: { positive?: boolean } = {},
): number {
  const raw = params.get(key);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > MAX_URL_NUMBER) return fallback;
  if (positive && value <= 0) return fallback;
  return value;
}

function fuelParam(params: URLSearchParams, key: string, fallback: FuelType): FuelType {
  const raw = params.get(key) as FuelType | null;
  return raw && FUEL_TYPES.includes(raw) ? raw : fallback;
}

function boolParam(params: URLSearchParams, key: string, fallback: boolean): boolean {
  const raw = params.get(key);
  if (raw === null) return fallback;
  return raw !== "0" && raw !== "false";
}

/** Display FX at 2 dp (e.g. 330.60); the unrounded rate is kept for the math. */
function formatFxDisplay(rate: number): string {
  return Number.isFinite(rate) ? (Math.round(rate * 100) / 100).toFixed(2) : "";
}

export default function Calculator() {
  const { t } = useAppPreferences();
  const { hasProAccess, isAdmin } = useAuth();
  const fullAccess = hasFullPlatformAccess({ hasProAccess, isAdmin });
  const [searchParams, setSearchParams] = useSearchParams();
  const visibleTabs = visibleTabsFor(fullAccess);
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const raw = searchParams.get("tab") as TabType | null;
    return raw && visibleTabsFor(fullAccess).includes(raw) ? raw : "landed-cost";
  });
  // Plan can resolve after first paint; never sit on a tab that isn't shown.
  useEffect(() => {
    if (!visibleTabs.includes(activeTab)) setActiveTab("landed-cost");
  }, [activeTab, visibleTabs]);
  const tabUnlocked = visibleTabs.includes(activeTab);

  // Landed Cost State (seeded from the shareable URL when present)
  const [cifUsd, setCifUsd] = useState(() => numParam(searchParams, "cif", 12000, { positive: true }));
  const [exchangeRate, setExchangeRate] = useState(() => numParam(searchParams, "fx", 300.0, { positive: true }));
  const [lcFuelType, setLcFuelType] = useState<FuelType>(() => fuelParam(searchParams, "fuel", "hybrid"));
  const [lcEngineCc, setLcEngineCc] = useState(() => numParam(searchParams, "cc", 1500));
  const [lcMotorKw, setLcMotorKw] = useState(() => numParam(searchParams, "kw", 110));
  // Default OFF once the gazetted CID surcharge window has lapsed — the page
  // already tells the user the period ended, so pre-checking the box
  // contradicted that banner and inflated every landed-cost total.
  const [applySurcharge, setApplySurcharge] = useState(() =>
    boolParam(searchParams, "surcharge", !getSurchargeCountdown().expired),
  );
  const [applySscl, setApplySscl] = useState(() => boolParam(searchParams, "sscl", true));
  const [lcResult, setLcResult] = useState<(LandedCostResult & OfflineFlag) | null>(null);
  // What this exact import saves if the 50% surcharge lapses on schedule.
  const [lcLapseSavings, setLcLapseSavings] = useState<number | null>(null);
  const [lcLoading, setLcLoading] = useState(false);
  const [lcError, setLcError] = useState<string | null>(null);
  const [macro, setMacro] = useState<MacroContext | null>(null);
  const [fxLoading, setFxLoading] = useState(false);
  const [fxUserOverridden, setFxUserOverridden] = useState(() => searchParams.has("fx"));
  const [fxFocused, setFxFocused] = useState(false);
  const [fxText, setFxText] = useState("");
  const surchargeCountdown = getSurchargeCountdown();
  const [surchargeNotifyOn, setSurchargeNotifyOn] = useState(() => isSurchargeNotifySubscribed());

  const applyLiveFx = async ({ silent = false }: { silent?: boolean } = {}) => {
    // The silent mount-time seed never spins the button; only a tap does.
    if (!silent) setFxLoading(true);
    try {
      const quote = await getMacroContext();
      setMacro(quote);
      if (!fxUserOverridden || !silent) {
        setExchangeRate(quote.usd_lkr);
        setFxUserOverridden(false);
      }
      if (!silent) {
        if (quote.fallback) {
          toast.message(t("tools.calc.fxReferenceTitle", "Using reference FX rate"), {
            description: t(
              "tools.calc.fxReferenceBody",
              "Live FX feed is unreachable right now. The Rs 300 / USD reference rate is applied. Confirm with your bank before committing.",
            ),
          });
        } else {
          toast.success(t("tools.calc.fxLiveToast", "Live FX · Rs {rate} / USD", { rate: formatFxDisplay(quote.usd_lkr) }), {
            description: quote.reference_date ? t("tools.calc.fxRef", "CBSL-linked print · ref {date}", { date: quote.reference_date }) : quote.source,
          });
        }
      }
    } catch (e: unknown) {
      if (!silent) {
        const message = e instanceof Error ? e.message : t("tools.calc.fxFailed", "Could not fetch FX");
        toast.error(t("tools.calc.fxUnavailable", "Live FX unavailable"), { description: message });
      }
    } finally {
      setFxLoading(false);
    }
  };

  useEffect(() => {
    // Auto-seed FX once when the URL did not pin ?fx=
    if (!searchParams.has("fx")) {
      void applyLiveFx({ silent: true });
    } else {
      void getMacroContext()
        .then(setMacro)
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only FX seed
  }, []);

  useEffect(() => {
    const message = consumeSurchargeLapseNotification();
    if (message) {
      toast.success(message, { duration: 10_000 });
      setSurchargeNotifyOn(false);
    }
  }, []);

  const toggleSurchargeNotify = () => {
    if (surchargeNotifyOn) {
      unsubscribeSurchargeLapseNotify();
      setSurchargeNotifyOn(false);
      toast.message(t("calc.reminderCleared", "Surcharge lapse reminder cleared"));
      return;
    }
    subscribeSurchargeLapseNotify();
    setSurchargeNotifyOn(true);
    toast.success(
      t("calc.reminderSet", "We'll remind you here when the 50% CID surcharge lapses (gazetted {date}).", {
        date: surchargeCountdown.expiryLabel,
      }),
    );
  };

  // Lease / Cash-to-own state. The financing-discovery params (ev, sal, com,
  // inst, rate, yrs) are kept so shared links round-trip unchanged.
  const [leasePrice, setLeasePrice] = useState(() => numParam(searchParams, "price", 15000000));
  const [leaseCc, setLeaseCc] = useState(() => numParam(searchParams, "leasecc", 1500));
  const [isEV] = useState(() => boolParam(searchParams, "ev", false));
  const [salary] = useState(() => numParam(searchParams, "sal", 0));
  const [existingCommit] = useState(() => numParam(searchParams, "com", 0));
  const [budget] = useState(() => numParam(searchParams, "inst", AFFORDABILITY_DEFAULTS.budgetRs, { positive: true }));
  const [finRate] = useState(() => numParam(searchParams, "rate", AFFORDABILITY_DEFAULTS.annualRatePct, { positive: true }));
  const [finYears] = useState(() => Math.min(10, Math.max(1, numParam(searchParams, "yrs", AFFORDABILITY_DEFAULTS.termYears, { positive: true }))));

  // TCO Calculator State (seeded from the shareable URL when present)
  const [tcoDailyKm, setTcoDailyKm] = useState(() => numParam(searchParams, "km", 40));
  const [tcoFuelType, setTcoFuelType] = useState<FuelType>(() => fuelParam(searchParams, "tfuel", "hybrid"));
  const [tcoKmpl, setTcoKmpl] = useState(() => numParam(searchParams, "kmpl", 18, { positive: true }));
  const [tcoLease, setTcoLease] = useState(() => numParam(searchParams, "lease", 85000));
  const [tcoInsurance, setTcoInsurance] = useState(() => numParam(searchParams, "ins", 120000));
  const [tcoService, setTcoService] = useState(() => numParam(searchParams, "svc", 60000));
  const [tcoTyres, setTcoTyres] = useState(() => numParam(searchParams, "tyres", 30000));
  const [tcoDepreciation, setTcoDepreciation] = useState(() => numParam(searchParams, "dep", 100000));
  const [tcoResult, setTcoResult] = useState<(TcoResult & OfflineFlag) | null>(null);
  const [tcoLoading, setTcoLoading] = useState(false);
  const [tcoError, setTcoError] = useState<string | null>(null);

  const errorMessage = (e: unknown) => {
    const raw = e instanceof Error ? e.message : "";
    return !raw || raw === "Failed to fetch" || raw.includes("NetworkError")
      ? t("calc.networkError", "Could not reach the calculation API. Check your connection and try again.")
      : raw;
  };

  const lcRequest = useRef(0);
  const runLandedCostCalc = async () => {
    const id = ++lcRequest.current;
    const payload = {
      cif_usd: cifUsd,
      exchange_rate: exchangeRate,
      fuel_type: lcFuelType,
      engine_cc: lcFuelType !== "electric" ? lcEngineCc : undefined,
      motor_kw: lcFuelType === "electric" ? lcMotorKw : undefined,
      apply_sscl: applySscl,
    };
    // Instant answer from the on-device gazette engine while the live API
    // (which can take a cold start) responds; the live figures then roll in.
    // Only when there is no live result on screen, so a warm API never flickers.
    setLcResult((prev) => {
      if (prev && !prev.offline) return prev;
      try {
        return { ...calculateLandedCostOffline({ ...payload, apply_surcharge: applySurcharge }), offline: true };
      } catch {
        return prev;
      }
    });
    setLcLoading(true);
    try {
      const [res, resWithoutSurcharge] = await Promise.all([
        calculateLandedCost({ ...payload, apply_surcharge: applySurcharge }),
        // Second variant powers the "if the surcharge lapses" delta.
        applySurcharge && !surchargeCountdown.expired
          ? calculateLandedCost({ ...payload, apply_surcharge: false })
          : Promise.resolve(null),
      ]);
      if (id !== lcRequest.current) return;
      setLcResult(res);
      setLcError(null);
      setLcLapseSavings(resWithoutSurcharge ? Math.max(0, res.landed_cost - resWithoutSurcharge.landed_cost) : null);
    } catch (e: unknown) {
      if (id !== lcRequest.current) return;
      const message = errorMessage(e);
      setLcError(message);
      toast.error(t("calc.calcFailed", "Calculation failed"), { description: message });
    } finally {
      if (id === lcRequest.current) setLcLoading(false);
    }
  };

  const tcoRequest = useRef(0);
  const runTcoCalc = async () => {
    const id = ++tcoRequest.current;
    const input = {
      daily_km: tcoDailyKm,
      fuel_type: tcoFuelType,
      mileage_kmpl: tcoKmpl,
      lease_installment: tcoLease,
      insurance_annual: tcoInsurance,
      service_annual: tcoService,
      tyres_annual: tcoTyres,
      resale_loss_annual: tcoDepreciation,
    };
    setTcoLoading(true);
    // On-device figures fill the card while the live API answers (see landed cost).
    void calculateTcoOffline(input)
      .then((offline) => {
        if (id !== tcoRequest.current) return;
        setTcoResult((prev) => (prev && !prev.offline ? prev : { ...offline, offline: true }));
      })
      .catch(() => undefined);
    try {
      const res = await calculateTco(input);
      if (id !== tcoRequest.current) return;
      setTcoResult(res);
      setTcoError(null);
    } catch (e: unknown) {
      if (id !== tcoRequest.current) return;
      const message = errorMessage(e);
      setTcoError(message);
      toast.error(t("calc.calcFailed", "Calculation failed"), { description: message });
    } finally {
      if (id === tcoRequest.current) setTcoLoading(false);
    }
  };

  // Debounced recalcs: typing fires one request per pause, not per keystroke
  // (the backend rate-limits /calculators, so per-keystroke POSTs would 429).
  useEffect(() => {
    const timer = setTimeout(() => void runLandedCostCalc(), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional input-driven recalculation
  }, [cifUsd, exchangeRate, lcFuelType, lcEngineCc, lcMotorKw, applySurcharge, applySscl]);

  useEffect(() => {
    const timer = setTimeout(() => void runTcoCalc(), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional input-driven recalculation
  }, [tcoDailyKm, tcoFuelType, tcoKmpl, tcoLease, tcoInsurance, tcoService, tcoTyres, tcoDepreciation]);

  // Keep the URL shareable: tab + active tab's inputs, replace-state so
  // typing doesn't spam browser history.
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("tab", activeTab);
    if (activeTab === "landed-cost") {
      params.set("cif", String(cifUsd));
      params.set("fx", String(exchangeRate));
      params.set("fuel", lcFuelType);
      if (lcFuelType === "electric") {
        params.set("kw", String(lcMotorKw));
      } else {
        params.set("cc", String(lcEngineCc));
      }
      if (!applySurcharge) params.set("surcharge", "0");
      if (!applySscl) params.set("sscl", "0");
    } else if (activeTab === "lease") {
      params.set("price", String(leasePrice));
      params.set("leasecc", String(leaseCc));
      if (isEV) params.set("ev", "1");
      if (salary > 0) params.set("sal", String(salary));
      if (existingCommit > 0) params.set("com", String(existingCommit));
      params.set("inst", String(budget));
      params.set("rate", String(finRate));
      params.set("yrs", String(finYears));
    } else if (activeTab === "tco") {
      params.set("km", String(tcoDailyKm));
      params.set("tfuel", tcoFuelType);
      params.set("kmpl", String(tcoKmpl));
      params.set("lease", String(tcoLease));
      params.set("ins", String(tcoInsurance));
      params.set("svc", String(tcoService));
      params.set("tyres", String(tcoTyres));
      params.set("dep", String(tcoDepreciation));
    }
    if (`?${params.toString()}` !== window.location.search) {
      setSearchParams(params, { replace: true });
    }
  }, [
    activeTab, cifUsd, exchangeRate, lcFuelType, lcEngineCc, lcMotorKw,
    applySurcharge, applySscl, leasePrice, leaseCc, isEV, salary, existingCommit,
    budget, finRate, finYears, tcoDailyKm, tcoFuelType,
    tcoKmpl, tcoLease, tcoInsurance, tcoService, tcoTyres, tcoDepreciation,
    setSearchParams,
  ]);

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success(t("calc.linkCopied", "Link copied"), { description: t("calc.linkCopiedDesc", "This calculation is now shareable.") });
    } catch {
      toast.error(t("calc.copyFailed", "Copy failed"), {
        description: t("calc.copyFailedDesc", "Copy the address bar URL to share this calculation."),
      });
    }
  };

  const fuelOptions = FUEL_TYPES.map((fuel) => ({ value: fuel, label: t(`fuel.${fuel}`, fuel) }));
  const onDeviceBadge = (offline?: boolean) =>
    offline ? (
      <Badge variant="neutral" title={t("calc.offlineBadge", "Calculated on this device with the same gazette schedules the server uses.")}>
        {t("tools.calc.onDevice", "On device")}
      </Badge>
    ) : null;

  const tabs = [
    { id: "landed-cost" as const, label: t("calc.tab.landed", "Landed Cost"), icon: Banknote },
    { id: "lease" as const, label: t("calc.tab.lease", "Lease Scenario"), icon: WalletCards },
    { id: "tco" as const, label: t("calc.tab.tco", "Ownership TCO"), icon: Gauge },
    { id: "ownership" as const, label: t("calc.tab.ownership", "On-road fees"), icon: FileBadge },
  ].filter((tab) => visibleTabs.includes(tab.id));

  /* ── Landed cost ──────────────────────────────────────────────────────── */
  const surchargeNotice = (
    <Notice
      tone="caution"
      title={
        surchargeCountdown.expired
          ? t("calc.surchargeExpired", "The 50% CID surcharge's gazetted 3-month period has ended")
          : t("calc.surchargeActive", "50% CID surcharge in force — set to lapse in {days} day(s)", { days: surchargeCountdown.daysLeft })
      }
      action={
        !surchargeCountdown.expired ? (
          <Button type="button" variant="secondary" size="sm" onClick={toggleSurchargeNotify} aria-pressed={surchargeNotifyOn}>
            {surchargeNotifyOn ? <BellOff aria-hidden /> : <Bell aria-hidden />}
            {surchargeNotifyOn ? t("calc.reminderOn", "Reminder on — tap to clear") : t("calc.notifySurcharge", "Notify me when the surcharge drops")}
          </Button>
        ) : null
      }
    >
      <p className="text-label-2">
        {surchargeCountdown.expired
          ? t("calc.surchargeExpiredHint", "No extension has been gazetted as of our last review — verify current customs rates before committing an import.")
          : t("calc.surchargeActiveHint", "Gazetted expiry {date} · no extension decision announced · LCs opened on or before 15 May 2026 are exempt", {
              date: surchargeCountdown.expiryLabel,
            })}
      </p>
    </Notice>
  );

  const landedForm = (
    <>
      {surchargeNotice}
      <FormCard icon={Banknote} title={t("calc.importConfig", "Import Configuration")} description={t("calc.importConfigHint", "Taxes compounding on CIF valuation")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField id="lc-cif" label={t("calc.cifUsd", "CIF Price (USD)")} value={cifUsd} onChange={setCifUsd} prefix="$" step={500} />
          <Field
            label={t("calc.exchangeRate", "Exchange Rate (LKR)")}
            htmlFor="lc-fx"
            hint={
              macro ? (
                <>
                  {macro.fallback ? (
                    <span className="text-deal-caution-text">{t("tools.calc.fxReferenceShort", "Reference rate · live FX unavailable")}</span>
                  ) : (
                    t("tools.calc.fxFeed", "Feed {source}", { source: macro.source.replace(/_/g, " ") })
                  )}
                  {macro.reference_date ? ` · ref ${macro.reference_date}` : ""}
                  {macro.inflation_yoy_percent != null ? ` · CCPI YoY ${macro.inflation_yoy_percent}%` : ""}
                </>
              ) : undefined
            }
          >
            <div className="flex gap-2">
              <AdornedInput
                id="lc-fx"
                type="number"
                inputMode="decimal"
                step="0.01"
                prefix="Rs"
                aria-describedby={macro ? "lc-fx-hint" : undefined}
                // Show 2 dp; full CBSL precision stays in state for the math.
                value={fxFocused ? fxText : formatFxDisplay(exchangeRate)}
                onFocus={() => {
                  setFxText(formatFxDisplay(exchangeRate));
                  setFxFocused(true);
                }}
                onBlur={() => setFxFocused(false)}
                onChange={(e) => {
                  setFxText(e.target.value);
                  const next = Number(e.target.value);
                  if (Number.isFinite(next) && next > 0) {
                    setFxUserOverridden(true);
                    setExchangeRate(next);
                  }
                }}
              />
              <Button
                type="button"
                variant="secondary"
                className="shrink-0 px-3.5"
                onClick={() => void applyLiveFx()}
                loading={fxLoading}
                title={t("tools.calc.liveFxTitle", "Pull the latest CBSL-linked USD/LKR rate")}
              >
                <RefreshCw aria-hidden />
                {t("tools.calc.liveFx", "Live FX")}
              </Button>
            </div>
          </Field>
        </div>

        <ChoiceChips label={t("calc.fuelCategory", "Fuel Category")} value={lcFuelType} options={fuelOptions} onChange={setLcFuelType} fill />

        {lcFuelType !== "electric" ? (
          <div>
            <NumberField id="lc-cc" label={t("calc.engineCc", "Engine Capacity (CC)")} value={lcEngineCc} onChange={setLcEngineCc} suffix="cc" step={50} />
            <AnimatePresence initial={false}>
              {lcFuelType === "hybrid" && lcEngineCc > 1500 ? (
                <m.p
                  key="cc-cliff"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0, transition: tween.enter }}
                  exit={{ opacity: 0, transition: tween.exit }}
                  className="mt-1.5 text-caption font-medium text-deal-caution-text"
                >
                  {t("calc.ccCliffWarn", "Capacity is above the 1500cc cliff. Excise rate steps up significantly.")}
                </m.p>
              ) : null}
            </AnimatePresence>
          </div>
        ) : (
          <NumberField id="lc-kw" label={t("calc.motorKw", "Motor Power (kW)")} value={lcMotorKw} onChange={setLcMotorKw} suffix="kW" step={5} />
        )}

        <div className="-mx-2 border-t border-separator pt-3">
          <CheckRow id="lc-surcharge" checked={applySurcharge} onCheckedChange={setApplySurcharge}>
            <span className="text-footnote">{t("calc.applySurcharge", "Apply 50% CID Gazette Surcharge (Compounding)")}</span>
          </CheckRow>
          <CheckRow id="lc-sscl" checked={applySscl} onCheckedChange={setApplySscl}>
            <span className="text-footnote">{t("calc.applySscl", "Apply 2.5% SSCL Levy")}</span>
          </CheckRow>
        </div>
      </FormCard>
    </>
  );

  const landedResult =
    lcLoading && !lcResult ? (
      <ResultSkeleton rows={6} label={t("tools.calculating", "Calculating")} />
    ) : lcResult ? (
      <ResultCard
        busy={lcLoading && !lcResult.offline}
        label={t("calc.estLanded", "Est. Landed Cost")}
        badge={onDeviceBadge(lcResult.offline)}
        value={Number.isFinite(lcResult.landed_cost) ? <AnimatedLkr value={lcResult.landed_cost} /> : t("tools.notAvailable", "Not available")}
        caption={
          <>
            {t("calc.totalTaxes", "Total Taxes & Duties")}{" "}
            <span className="font-semibold text-primary">
              <AnimatedLkr value={lcResult.total_tax} plus />
            </span>
          </>
        }
        footer={
          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {!surchargeCountdown.expired && applySurcharge && lcLapseSavings !== null && lcLapseSavings > 0 ? (
                <m.div
                  key="lapse"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1, transition: tween.enter }}
                  exit={{ opacity: 0, transition: tween.exit }}
                >
                  <Notice tone="success">
                    {t("calc.lapseSavings", "This import lands {amount} cheaper if it lapses", { amount: formatPrice(lcLapseSavings) })}
                  </Notice>
                </m.div>
              ) : null}
            </AnimatePresence>
            {lcResult.notes ? (
              <Notice tone="neutral" icon={CheckCircle2}>
                <span className="text-label-2">{localizeCalcNote(lcResult.notes, t)}</span>
              </Notice>
            ) : null}
          </div>
        }
      >
        <p className="mb-3 text-caption text-label-2">{t("calc.breakdownHint", "Indicative tax components based on 2026 gazette calculations")}</p>
        <ResultRows>
          <ResultRow label={t("calc.baseCif", "Base CIF LKR Equivalent")} value={<AnimatedLkr value={lcResult.cif_lkr} />} />
          <ResultRow label={t("calc.cid", "Customs Import Duty (20%)")} value={<AnimatedLkr value={lcResult.cid} />} />
          <ResultRow label={t("calc.surchargeOnCid", "Surcharge on CID (50% Surcharge)")} value={<AnimatedLkr value={lcResult.surcharge} />} />
          <ResultRow label={t("calc.excise", "Excise Duty (Capacity Banded)")} value={<AnimatedLkr value={lcResult.excise} />} />
          <ResultRow label={t("calc.sscl", "SSCL (2.5%)")} value={<AnimatedLkr value={lcResult.sscl} />} />
          <ResultRow label={t("calc.vat", "VAT (18% Compounded)")} value={<AnimatedLkr value={lcResult.vat} />} />
          {lcResult.luxury_tax > 0 ? (
            <ResultRow tone="danger" label={t("calc.luxuryTax", "Luxury Tax (Excess Portion)")} value={<AnimatedLkr value={lcResult.luxury_tax} />} />
          ) : null}
        </ResultRows>
      </ResultCard>
    ) : lcError ? (
      <ErrorState className="rounded-card border border-border bg-surface-1 py-10 shadow-e1" body={lcError} onRetry={() => void runLandedCostCalc()} />
    ) : (
      <ResultSkeleton rows={6} label={t("tools.calculating", "Calculating")} />
    );

  /* ── Lease ────────────────────────────────────────────────────────────── */
  const usedDown = leasePrice * 0.4; // 60% LTV on registered used
  const newDown = leasePrice * 0.6; // 40% LTV on new/unregistered
  const usedBudgetFromNewDown = newDown / 0.4; // same cash, used market

  const leaseForm = (
    <>
      <FormCard icon={WalletCards} title={t("calc.leaseAssumptions", "Lease Assumptions")} description={t("calc.leaseAssumptionsHint", "Bases for loan to value margins")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            id="lease-price"
            label={t("calc.vehicleValuation", "Vehicle Valuation (LKR)")}
            value={leasePrice}
            onChange={setLeasePrice}
            prefix="Rs"
            step={100_000}
            hint={formatPrice(leasePrice)}
          />
          <NumberField id="lease-cc" label={t("calc.engineCc", "Engine Capacity (CC)")} value={leaseCc} onChange={setLeaseCc} suffix="cc" step={50} />
        </div>
      </FormCard>
      {/* CBSL 40/60 LTV arbitrage — regulation-made, nobody else surfaces it */}
      {leasePrice >= 1_000_000 ? (
        <Notice tone="info" title={t("calc.ltvTitle", "The 40/60 rule is working in your favour on used cars")}>
          <p className="text-label-2">
            {t(
              "tools.calc.ltvBody",
              "CBSL caps financing at 40% for brand-new or unregistered vehicles but 60% for registered used (over 1 year). For this {price} vehicle, registered used needs {usedDown} down; new or unregistered needs {newDown}. The same cash would stretch to a {usedBudget} registered used car.",
              {
                price: formatPrice(leasePrice),
                usedDown: formatPrice(usedDown),
                newDown: formatPrice(newDown),
                usedBudget: formatPrice(usedBudgetFromNewDown),
              },
            )}
          </p>
          <p className="mt-1.5 text-caption text-label-2">
            {t("tools.calc.ltvSource", "CBSL Act Directions No. 01 of 2026 (from 25 May 2026) · banks may apply stricter internal caps")}
          </p>
        </Notice>
      ) : null}
      <CashToOwnStrip priceLkr={leasePrice} financeClass="registered_used" />
    </>
  );

  /* ── TCO ──────────────────────────────────────────────────────────────── */
  const tcoForm = (
    <FormCard icon={Gauge} title={t("calc.tcoAssumptions", "TCO Assumptions")} description={t("calc.tcoAssumptionsHint", "Commute, service, and amortization")}>
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField id="tco-km" label={t("calc.dailyCommute", "Daily Commute (KM)")} value={tcoDailyKm} onChange={setTcoDailyKm} suffix="km" step={5} />
        <NumberField id="tco-kmpl" label={t("calc.fuelEfficiency", "Fuel Efficiency (KMPL)")} value={tcoKmpl} onChange={setTcoKmpl} suffix="km/l" step={0.5} />
      </div>
      <ChoiceChips label={t("tools.calc.fuelType", "Fuel type")} value={tcoFuelType} options={fuelOptions} onChange={setTcoFuelType} fill />
      <NumberField id="tco-lease" label={t("calc.monthlyLease", "Monthly Lease (LKR)")} value={tcoLease} onChange={setTcoLease} prefix="Rs" step={5_000} />
      <div className="grid gap-4 border-t border-separator pt-4 sm:grid-cols-2">
        <NumberField id="tco-ins" label={t("calc.annualInsurance", "Annual Insurance")} value={tcoInsurance} onChange={setTcoInsurance} prefix="Rs" step={5_000} />
        <NumberField id="tco-svc" label={t("calc.annualService", "Annual Service")} value={tcoService} onChange={setTcoService} prefix="Rs" step={5_000} />
        <NumberField id="tco-tyres" label={t("calc.annualTyres", "Annual Tyres")} value={tcoTyres} onChange={setTcoTyres} prefix="Rs" step={5_000} />
        <NumberField id="tco-dep" label={t("calc.annualResaleLoss", "Annual Resale Loss")} value={tcoDepreciation} onChange={setTcoDepreciation} prefix="Rs" step={10_000} />
      </div>
    </FormCard>
  );

  const tcoResultView =
    tcoLoading && !tcoResult ? (
      <ResultSkeleton rows={4} label={t("tools.calculating", "Calculating")} />
    ) : tcoResult ? (
      <ResultCard
        busy={tcoLoading && !tcoResult.offline}
        label={t("calc.tcoTotal", "Total ownership cost / month")}
        badge={onDeviceBadge(tcoResult.offline)}
        value={<AnimatedLkr value={tcoResult.total_tco_monthly} mode="monthly" />}
        caption={t("calc.tcoBreakdown", "Monthly Cost of Ownership breakdown")}
        footer={
          tcoResult.notes ? (
            <Notice tone="neutral">
              <span className="text-label-2">{localizeCalcNote(tcoResult.notes, t)}</span>
            </Notice>
          ) : null
        }
      >
        <ResultRows>
          <ResultRow
            label={t("tools.calc.fuelBenchmark", "Fuel / energy price benchmark")}
            value={t("tools.calc.perUnit", "Rs {price} / L or kWh", { price: tcoResult.fuel_price_lkr.toLocaleString("en-US") })}
          />
          <ResultRow label={t("tools.calc.fuelMonthly", "Fuel / energy each month")} value={<AnimatedLkr value={tcoResult.fuel_cost_monthly} mode="monthly" />} />
          <ResultRow label={t("tools.calc.leaseMonthly", "Lease instalments")} value={<AnimatedLkr value={tcoResult.lease_cost_monthly} mode="monthly" />} />
          <ResultRow
            label={t("tools.calc.overheadMonthly", "Service, insurance, tyres and resale loss")}
            value={<AnimatedLkr value={tcoResult.overhead_cost_monthly} mode="monthly" />}
          />
        </ResultRows>
      </ResultCard>
    ) : tcoError ? (
      <ErrorState className="rounded-card border border-border bg-surface-1 py-10 shadow-e1" body={tcoError} onRetry={() => void runTcoCalc()} />
    ) : (
      <ResultSkeleton rows={4} label={t("tools.calculating", "Calculating")} />
    );

  return (
    <ToolPage
      header={
        <PageHeader
          eyebrow={t("shell.calc.eyebrow", "Calculator")}
          eyebrowIcon={CalculatorIcon}
          title={t("shell.calc.title", "Import tax calculator")}
          description={t(
            "shell.calc.description",
            "Work out what an imported vehicle costs once it lands: customs duty, surcharge, excise, SSCL and VAT on the CIF price, using the current gazette rates.",
          )}
          actions={
            tabUnlocked ? (
              <Button variant="secondary" onClick={() => void copyShareLink()} title={t("calc.shareTitle", "Copy a shareable link to this calculation")}>
                <Link2 aria-hidden />
                {t("calc.share", "Share")}
              </Button>
            ) : null
          }
        />
      }
    >
      <div className="mb-5 empty:hidden">
        <FreePlanBanner />
      </div>
      {!tabUnlocked ? (
        <UpgradePrompt title={freePlanText(t, "calcTitle")} body={freePlanText(t, "calcBody")} className="mx-auto max-w-xl" />
      ) : (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)}>
          {tabs.length > 1 ? (
            /* Mobile: the strip scrolls sideways; labels never truncate. */
            <div className="-mx-5 mb-5 overflow-x-auto px-5 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
              <TabsList aria-label={t("tools.calc.tabsLabel", "Calculators")}>
                {tabs.map(({ id, label, icon: Icon }) => (
                  <TabsTrigger key={id} value={id}>
                    <Icon className="h-4 w-4" aria-hidden />
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          ) : null}

          <TabsContent value="landed-cost" className="mt-0">
            <ToolGrid form={landedForm} result={landedResult} />
          </TabsContent>
          {visibleTabs.includes("lease") ? (
            <TabsContent value="lease" className="mt-0">
              <ToolGrid form={leaseForm} result={<LeaseCalculator price={leasePrice} financeClass="registered_used" />} />
            </TabsContent>
          ) : null}
          {visibleTabs.includes("tco") ? (
            <TabsContent value="tco" className="mt-0">
              <ToolGrid form={tcoForm} result={tcoResultView} />
            </TabsContent>
          ) : null}
          {visibleTabs.includes("ownership") ? (
            <TabsContent value="ownership" className="mt-0">
              <OwnershipCostsPanel initialFuel={lcFuelType} initialCc={lcEngineCc} initialPrice={leasePrice} />
            </TabsContent>
          ) : null}
        </Tabs>
      )}
    </ToolPage>
  );
}
