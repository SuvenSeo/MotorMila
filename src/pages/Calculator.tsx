import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { formatPrice, getPermits, getMacroContext, type LandedCostResult, type TcoResult, type PermitInfo, type MacroContext } from "@/services/api";
import {
  calculateLandedCostResilient as calculateLandedCost,
  calculateTcoResilient as calculateTco,
  type OfflineFlag,
} from "@/lib/offlineCalculators";
import { Input } from "@/components/ui/input";
import {
  Banknote,
  Gauge,
  WalletCards,
  FileText,
  TrendingDown,
  Compass,
  AlertTriangle,
  CheckCircle,
  Link2,
  Bell,
  BellOff,
  RefreshCw,
  FileBadge,
  Lock,
} from "lucide-react";
import { LeaseCalculator } from "@/components/LeaseCalculator";
import { CashToOwnStrip } from "@/components/CashToOwnStrip";
import { OwnershipCostsPanel } from "@/components/OwnershipCostsPanel";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { PageHero } from "@/components/PageHero";
import { FreePlanBanner } from "@/components/FreePlanBanner";
import { SlidingNumber } from "@/components/ui/SlidingNumber";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { toast } from "sonner";
import { getSurchargeCountdown } from "@/lib/importTaxModel";
import { computeCashToOwn, EV_HOME_CHARGER_LKR } from "@/lib/cashToOwn";
import {
  AFFORDABILITY_DEFAULTS,
  dsrPreCheck,
  leaseVsLoanRows,
  maxPriceFromInstalment,
  monthlyForPrice,
} from "@/utils/affordability";
import { useAppPreferences } from "@/lib/appPreferences";
import { useAuth } from "@/lib/authContext";
import {
  FREE_CALCULATOR_TABS,
  freePlanCopy,
  hasFullPlatformAccess,
} from "@/lib/planLimits";
import {
  consumeSurchargeLapseNotification,
  isSurchargeNotifySubscribed,
  subscribeSurchargeLapseNotify,
  unsubscribeSurchargeLapseNotify,
} from "@/lib/surchargeAlert";
import { visuals } from "@/lib/visualAssets";

type TabType = "landed-cost" | "lease" | "tco" | "ownership" | "permits" | "depreciation";
type FuelType = "petrol" | "diesel" | "hybrid" | "electric";

const TAB_IDS: TabType[] = ["landed-cost", "lease", "tco", "ownership", "permits", "depreciation"];
const FUEL_TYPES: FuelType[] = ["petrol", "diesel", "hybrid", "electric"];
const FREE_TAB_SET = new Set<string>(FREE_CALCULATOR_TABS);

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

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring" as const,
      stiffness: 220,
      damping: 24
    }
  }
} as const;

export default function Calculator() {
  const { t } = useAppPreferences();
  const { hasProAccess, isAdmin } = useAuth();
  const fullAccess = hasFullPlatformAccess({ hasProAccess, isAdmin });
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const raw = searchParams.get("tab") as TabType | null;
    return raw && TAB_IDS.includes(raw) ? raw : "landed-cost";
  });
  const tabUnlocked = fullAccess || FREE_TAB_SET.has(activeTab);

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
  const [macro, setMacro] = useState<MacroContext | null>(null);
  const [fxLoading, setFxLoading] = useState(false);
  const [fxUserOverridden, setFxUserOverridden] = useState(() => searchParams.has("fx"));
  const surchargeCountdown = getSurchargeCountdown();
  const [surchargeNotifyOn, setSurchargeNotifyOn] = useState(() => isSurchargeNotifySubscribed());

  const applyLiveFx = async ({ silent = false }: { silent?: boolean } = {}) => {
    setFxLoading(true);
    try {
      const quote = await getMacroContext();
      setMacro(quote);
      if (!fxUserOverridden || !silent) {
        setExchangeRate(quote.usd_lkr);
        setFxUserOverridden(false);
      }
      if (!silent) {
        if (quote.fallback) {
          toast.message("Using reference FX rate", {
            description: "Live FX feed is unreachable right now — Rs 300 / USD reference rate applied. Confirm with your bank before committing.",
          });
        } else {
          toast.success(`Live FX · Rs ${quote.usd_lkr.toLocaleString()} / USD`, {
            description: quote.reference_date
              ? `CBSL-linked print · ref ${quote.reference_date}`
              : quote.source,
          });
        }
      }
    } catch (e: unknown) {
      if (!silent) {
        const message = e instanceof Error ? e.message : "Could not fetch FX";
        toast.error("Live FX unavailable", { description: message });
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
      toast.message("Surcharge lapse reminder cleared");
      return;
    }
    subscribeSurchargeLapseNotify();
    setSurchargeNotifyOn(true);
    toast.success(
      `We'll remind you here when the 50% CID surcharge lapses (gazetted ${surchargeCountdown.expiryLabel}).`,
    );
  };

  // Lease / Cash-to-own state (original logic wrapper)
  const [leasePrice, setLeasePrice] = useState(() => numParam(searchParams, "price", 15000000));
  const [leaseCc, setLeaseCc] = useState(() => numParam(searchParams, "leasecc", 1500));
  // Financing discovery (B3-E): EV charger allowance, DSR pre-check, instalment budget.
  const [isEV, setIsEV] = useState(() => boolParam(searchParams, "ev", false));
  const [salary, setSalary] = useState(() => numParam(searchParams, "sal", 0));
  const [existingCommit, setExistingCommit] = useState(() => numParam(searchParams, "com", 0));
  const [budget, setBudget] = useState(() => numParam(searchParams, "inst", AFFORDABILITY_DEFAULTS.budgetRs, { positive: true }));
  const [finRate, setFinRate] = useState(() => numParam(searchParams, "rate", AFFORDABILITY_DEFAULTS.annualRatePct, { positive: true }));
  const [finYears, setFinYears] = useState(() => Math.min(10, Math.max(1, numParam(searchParams, "yrs", AFFORDABILITY_DEFAULTS.termYears, { positive: true }))));

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

  // Permit state
  const [permits, setPermits] = useState<PermitInfo[]>([]);
  const [permitsLoading, setPermitsLoading] = useState(false);

  // Fetch permits on tab mount
  useEffect(() => {
    if (activeTab === "permits") {
      setPermitsLoading(true);
      getPermits()
        .then((data) => {
          setPermits(data);
          // If empty, seed mock data in UI for rich preview representation
          if (data.length === 0) {
            setPermits([
              { id: 1, permit_name: "Government Doctor Permit", permit_type: "duty_free", market_price_lkr: 5500000 },
              { id: 2, permit_name: "Government MP / State Officer Permit", permit_type: "duty_free", market_price_lkr: 9800000 },
              { id: 3, permit_name: "Special EV Import Permit (Remittance)", permit_type: "ev", market_price_lkr: 2200000 },
              { id: 4, permit_name: "Foreign Employment EV Permit", permit_type: "ev", market_price_lkr: 1800000 },
            ]);
          }
        })
        .catch(() => {
          toast.error(t("calc.networkErrorToast", "Network error"), {
            description: t("calc.permitsLoadError", "Failed to load permit prices. Showing benchmark rates."),
          });
        })
        .finally(() => setPermitsLoading(false));
    }
  }, [activeTab, t]);

  // Run calculations automatically or on submit
  const runLandedCostCalc = async () => {
    setLcLoading(true);
    try {
      const payload = {
        cif_usd: cifUsd,
        exchange_rate: exchangeRate,
        fuel_type: lcFuelType,
        engine_cc: lcFuelType !== "electric" ? lcEngineCc : undefined,
        motor_kw: lcFuelType === "electric" ? lcMotorKw : undefined,
        apply_sscl: applySscl,
      };
      const [res, resWithoutSurcharge] = await Promise.all([
        calculateLandedCost({ ...payload, apply_surcharge: applySurcharge }),
        // Second variant powers the "if the surcharge lapses" delta.
        applySurcharge && !surchargeCountdown.expired
          ? calculateLandedCost({ ...payload, apply_surcharge: false })
          : Promise.resolve(null),
      ]);
      setLcResult(res);
      setLcLapseSavings(
        resWithoutSurcharge ? Math.max(0, res.landed_cost - resWithoutSurcharge.landed_cost) : null,
      );
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : "An error occurred.";
      const message =
        raw === "Failed to fetch" || raw.includes("NetworkError")
          ? "Could not reach the calculation API. Check your connection and try again."
          : raw;
      toast.error("Calculation failed", { description: message });
    } finally {
      setLcLoading(false);
    }
  };

  const runTcoCalc = async () => {
    setTcoLoading(true);
    try {
      const res = await calculateTco({
        daily_km: tcoDailyKm,
        fuel_type: tcoFuelType,
        mileage_kmpl: tcoKmpl,
        lease_installment: tcoLease,
        insurance_annual: tcoInsurance,
        service_annual: tcoService,
        tyres_annual: tcoTyres,
        resale_loss_annual: tcoDepreciation,
      });
      setTcoResult(res);
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : "An error occurred.";
      const message =
        raw === "Failed to fetch" || raw.includes("NetworkError")
          ? "Could not reach the calculation API. Check your connection and try again."
          : raw;
      toast.error("Calculation failed", { description: message });
    } finally {
      setTcoLoading(false);
    }
  };

  // Debounced recalcs: typing fires one request per pause, not per keystroke
  // (the backend rate-limits /calculators, so per-keystroke POSTs would 429).
  useEffect(() => {
    const timer = setTimeout(() => void runLandedCostCalc(), 350);
    return () => clearTimeout(timer);
    // Recalculate only when landed-cost inputs change (not when helper identity changes).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional input-driven recalculation
  }, [cifUsd, exchangeRate, lcFuelType, lcEngineCc, lcMotorKw, applySurcharge, applySscl]);

  useEffect(() => {
    const timer = setTimeout(() => void runTcoCalc(), 350);
    return () => clearTimeout(timer);
    // Recalculate only when TCO inputs change (not when helper identity changes).
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

  return (
    <PageCanvas>
      <PageHero
        theme="calculator"
        eyebrow={t("calc.eyebrow", "Motormila Intelligence Hub")}
        eyebrowIcon={Compass}
        watermarkIcon={Banknote}
        title={<>{t("calc.title", "Mobility & Tax Calculators")}<span className="text-sheen">.</span></>}
        description={t("calc.description", "Verify import tax gazettes, map Total Cost of Ownership (TCO), track black market permits, and assess retention curves.")}
        media={visuals.alt2PageInsuranceFinance}
        mediaPosition="center 30%"
        mediaTone="brand"
        highlights={[
          { label: "Import duty", value: "Live FX", hint: "CBSL-linked landed cost" },
          { label: "Ownership", value: "Licence+", hint: "Revenue licence & CMT" },
          { label: "Permits", value: "Tracker", hint: "Black market permit signals" },
        ]}
      />

      <FreePlanBanner />

      {(lcResult?.offline || tcoResult?.offline) && (
        <div className="mx-auto max-w-[1320px] px-4 pt-4">
          <p className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-200">
            {t("calc.offlineBadge", "On-device calculation — server unreachable, same gazette schedules.")}
          </p>
        </div>
      )}

      <PageBody className="space-y-0 pb-0">
      <motion.div variants={itemVariants} className="flex max-w-[1320px] flex-nowrap items-center gap-3 pb-6">
        <div className="flex min-w-0 flex-1 flex-nowrap gap-1 overflow-x-auto rounded-full border border-border bg-card p-1.5 shadow-soft snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-none sm:flex-wrap sm:overflow-visible">
          {[
            { id: "landed-cost", label: t("calc.tab.landed", "Landed Cost"), icon: Banknote },
            { id: "lease", label: t("calc.tab.lease", "Lease Scenario"), icon: WalletCards },
            { id: "tco", label: t("calc.tab.tco", "Ownership TCO"), icon: Gauge },
            { id: "ownership", label: t("calc.tab.ownership", "On-road fees"), icon: FileBadge },
            { id: "permits", label: t("calc.tab.permits", "Permit Tracker"), icon: FileText },
            { id: "depreciation", label: t("calc.tab.depreciation", "Retention Curves"), icon: TrendingDown },
          ].map((tab) => {
            const Icon = tab.icon;
            const locked = !fullAccess && !FREE_TAB_SET.has(tab.id);
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                aria-pressed={activeTab === tab.id}
                className={`relative flex min-h-[40px] shrink-0 snap-start items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold tracking-wide transition-colors z-10 active:scale-[0.97] ${
                  activeTab === tab.id
                    ? "text-black font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="active-tab-indicator"
                    className="absolute inset-0 bg-primary rounded-full -z-10 shadow-soft"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                {locked ? <Lock className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                {tab.label}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => void copyShareLink()}
          className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground shadow-soft transition-colors hover:text-foreground active:scale-[0.97]"
          title={t("calc.shareTitle", "Copy a shareable link to this calculation")}
        >
          <Link2 className="h-3.5 w-3.5" />
          {t("calc.share", "Share")}
        </button>
      </motion.div>

      <div className="mx-auto max-w-[1320px] px-5 pb-16 sm:px-6 relative z-10">
        {!tabUnlocked ? (
          <UpgradePrompt
            title={freePlanCopy.calcTitle}
            body={freePlanCopy.calcBody}
            className="max-w-xl mx-auto"
          />
        ) : (
        <AnimatePresence mode="wait">
          {activeTab === "landed-cost" && (
            <motion.div
              key="landed-cost-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]"
            >
              {/* Surcharge countdown — time-boxed gazette moment */}
              <div className="lg:col-span-2 rounded-2xl border border-amber-500/25 bg-amber-400/[0.06] p-4">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span className="text-xs font-bold text-amber-700 dark:text-amber-300">
                      {surchargeCountdown.expired
                        ? t("calc.surchargeExpired", "The 50% CID surcharge's gazetted 3-month period has ended")
                        : t("calc.surchargeActive", "50% CID surcharge in force — set to lapse in {days} day(s)", { days: surchargeCountdown.daysLeft })}
                    </span>
                  </div>
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    {surchargeCountdown.expired
                      ? t("calc.surchargeExpiredHint", "No extension has been gazetted as of our last review — verify current customs rates before committing an import.")
                      : t("calc.surchargeActiveHint", "Gazetted expiry {date} · no extension decision announced · LCs opened on or before 15 May 2026 are exempt", { date: surchargeCountdown.expiryLabel })}
                  </span>
                  {!surchargeCountdown.expired && (
                    <button
                      type="button"
                      onClick={toggleSurchargeNotify}
                      aria-pressed={surchargeNotifyOn}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-2xl border border-amber-500/30 bg-amber-400/10 px-3 py-1.5 text-[11px] font-bold text-amber-800 transition-colors hover:bg-amber-400/20 dark:text-amber-200"
                    >
                      {surchargeNotifyOn ? (
                        <>
                          <BellOff className="h-3.5 w-3.5" aria-hidden />
                          {t("calc.reminderOn", "Reminder on — tap to clear")}
                        </>
                      ) : (
                        <>
                          <Bell className="h-3.5 w-3.5" aria-hidden />
                          {t("calc.notifySurcharge", "Notify me when the surcharge drops")}
                        </>
                      )}
                    </button>
                  )}
                  <AnimatePresence initial={false}>
                    {!surchargeCountdown.expired && applySurcharge && lcLapseSavings !== null && lcLapseSavings > 0 && (
                      <motion.span
                        initial={{ opacity: 0, scale: 0.92 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.92 }}
                        transition={{ duration: 0.18 }}
                        className="w-full text-center sm:w-auto sm:text-left sm:ml-auto rounded-full border border-emerald-500/25 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 num"
                      >
                        {t("calc.lapseSavings", "This import lands {amount} cheaper if it lapses", { amount: formatPrice(lcLapseSavings) })}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Inputs */}
              <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-soft h-fit space-y-5">
                <div className="flex items-center gap-3 border-b border-border pb-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-2xl border border-border bg-surface">
                    <Banknote className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-[14px] font-bold text-foreground">{t("calc.importConfig", "Import Configuration")}</h2>
                    <p className="text-[10px] text-muted-foreground font-semibold">{t("calc.importConfigHint", "Taxes compounding on CIF valuation")}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label htmlFor="lc-cif" className="text-[12px] font-medium text-muted-foreground/80">{t("calc.cifUsd", "CIF Price (USD)")}</label>
                      <Input id="lc-cif" type="number" value={cifUsd} onChange={(e) => setCifUsd(Number(e.target.value))} className="num bg-surface border-border focus-visible:ring-primary/40" />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="lc-fx" className="text-[12px] font-medium text-muted-foreground/80">{t("calc.exchangeRate", "Exchange Rate (LKR)")}</label>
                      <div className="flex gap-2">
                        <Input
                          id="lc-fx"
                          type="number"
                          value={exchangeRate}
                          onChange={(e) => {
                            setFxUserOverridden(true);
                            setExchangeRate(Number(e.target.value));
                          }}
                          className="num bg-surface border-border focus-visible:ring-primary/40"
                        />
                        <button
                          type="button"
                          onClick={() => void applyLiveFx()}
                          disabled={fxLoading}
                          className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-2xl border border-border bg-surface px-3 text-[10px] font-bold text-foreground transition-colors hover:border-primary/40 disabled:opacity-60"
                          title="Pull latest CBSL-linked USD/LKR"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${fxLoading ? "animate-spin" : ""}`} />
                          Live FX
                        </button>
                      </div>
                      {macro ? (
                        <p className="text-[10px] font-semibold text-muted-foreground">
                          {macro.fallback ? (
                            <span className="text-deal-amber">Reference rate — live FX unavailable · </span>
                          ) : (
                            <>Feed {macro.source.replace(/_/g, " ")} </>
                          )}
                          {macro.reference_date ? `· ref ${macro.reference_date}` : ""}
                          {macro.inflation_yoy_percent != null
                            ? ` · CCPI YoY ${macro.inflation_yoy_percent}%`
                            : ""}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[12px] font-medium text-muted-foreground/80">{t("calc.fuelCategory", "Fuel Category")}</label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(["petrol", "diesel", "hybrid", "electric"] as const).map((fuel) => (
                        <button
                          key={fuel}
                          onClick={() => setLcFuelType(fuel)}
                          aria-pressed={lcFuelType === fuel}
                          className={`min-h-[36px] rounded-2xl border py-2.5 text-[10px] font-bold capitalize transition-all active:scale-[0.97] ${
                            lcFuelType === fuel
                              ? "border-primary/40 bg-primary/10 text-primary-bright"
                              : "border-border bg-surface text-muted-foreground hover:text-foreground hover:border-primary/40"
                          }`}
                        >
                          {fuel}
                        </button>
                      ))}
                    </div>
                  </div>

                  {lcFuelType !== "electric" ? (
                    <div className="space-y-1.5">
                      <label htmlFor="lc-cc" className="text-[12px] font-medium text-muted-foreground/80">{t("calc.engineCc", "Engine Capacity (CC)")}</label>
                      <Input id="lc-cc" type="number" value={lcEngineCc} onChange={(e) => setLcEngineCc(Number(e.target.value))} className="num bg-surface border-border focus-visible:ring-primary/40" />
                      {lcFuelType === "hybrid" && lcEngineCc > 1500 && (
                        <p className="flex items-center gap-1.5 text-[10px] text-amber-600 dark:text-amber-400 font-semibold mt-1">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          Capacity is above the 1500cc cliff. Excise rate steps up significantly.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <label htmlFor="lc-kw" className="text-[12px] font-medium text-muted-foreground/80">{t("calc.motorKw", "Motor Power (kW)")}</label>
                      <Input id="lc-kw" type="number" value={lcMotorKw} onChange={(e) => setLcMotorKw(Number(e.target.value))} className="num bg-surface border-border focus-visible:ring-primary/40" />
                    </div>
                  )}

                  <div className="space-y-3 pt-3 border-t border-border">
                    <label className="flex items-center gap-3 cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">
                      <input type="checkbox" checked={applySurcharge} onChange={(e) => setApplySurcharge(e.target.checked)} className="accent-primary h-4 w-4 rounded" />
                      Apply 50% CID Gazette Surcharge (Compounding)
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">
                      <input type="checkbox" checked={applySscl} onChange={(e) => setApplySscl(e.target.checked)} className="accent-primary h-4 w-4 rounded" />
                      Apply 2.5% SSCL Levy
                    </label>
                  </div>
                </div>
              </div>

              {/* Landed Cost Results — the number is the hero */}
              <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-soft-lg space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-foreground">{t("calc.breakdown", "Landed Cost breakdown")}</h3>
                  <p className="text-[10px] text-muted-foreground font-semibold mt-0.5">{t("calc.breakdownHint", "Indicative tax components based on 2026 gazette calculations")}</p>
                </div>

                {lcLoading && !lcResult ? (
                  <div className="h-64 flex items-center justify-center">
                    <div role="status" aria-label="Calculating" className="h-6 w-6 animate-spin rounded-full border border-t-transparent border-primary" />
                  </div>
                ) : lcResult ? (
                  <div className={`space-y-5 transition-opacity duration-200 ${lcLoading ? "opacity-60" : "opacity-100"}`}>
                    <div className="space-y-3 border-b border-border pb-4">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{t("calc.baseCif", "Base CIF LKR Equivalent")}</span>
                        <span className="font-semibold text-foreground num">{formatPrice(lcResult.cif_lkr)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{t("calc.cid", "Customs Import Duty (20%)")}</span>
                        <span className="font-semibold text-foreground num">{formatPrice(lcResult.cid)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{t("calc.surchargeOnCid", "Surcharge on CID (50% Surcharge)")}</span>
                        <span className="font-semibold text-foreground num">{formatPrice(lcResult.surcharge)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{t("calc.excise", "Excise Duty (Capacity Banded)")}</span>
                        <span className="font-semibold text-foreground num">{formatPrice(lcResult.excise)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{t("calc.sscl", "SSCL (2.5%)")}</span>
                        <span className="font-semibold text-foreground num">{formatPrice(lcResult.sscl)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{t("calc.vat", "VAT (18% Compounded)")}</span>
                        <span className="font-semibold text-foreground num">{formatPrice(lcResult.vat)}</span>
                      </div>
                      {lcResult.luxury_tax > 0 && (
                        <div className="flex justify-between text-xs text-rose-600 dark:text-rose-400 font-semibold">
                          <span>{t("calc.luxuryTax", "Luxury Tax (Excess Portion)")}</span>
                          <span className="num">{formatPrice(lcResult.luxury_tax)}</span>
                        </div>
                      )}
                    </div>

                    {/* Featured readout — landed cost towers, total taxes demoted below it */}
                    <div aria-live="polite" className="rounded-2xl border border-primary/25 bg-primary/5 p-5 sm:p-6 shadow-soft">
                      <span className="text-[12px] font-semibold text-primary-bright">{t("calc.estLanded", "Est. Landed Cost")}</span>
                      <div className="display-1 text-foreground num mt-2">
                        {lcResult.landed_cost == null || !Number.isFinite(lcResult.landed_cost) ? (
                          "N/A"
                        ) : (
                          <span className="inline-flex items-baseline">
                            <span>Rs.&nbsp;</span>
                            <SlidingNumber value={Math.round((lcResult.landed_cost / 1_000_000) * 100) / 100} />
                            <span>M</span>
                          </span>
                        )}
                      </div>
                      <div className="mt-4 flex items-center gap-3 border-t border-primary/15 pt-3">
                        <span className="text-[12px] font-medium text-muted-foreground">Total Taxes &amp; Duties</span>
                        <span className="ml-auto text-sm font-bold text-primary num">+{formatPrice(lcResult.total_tax)}</span>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-surface border border-border p-3 flex gap-2">
                      <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      <p className="text-[10px] leading-relaxed text-muted-foreground font-semibold">{lcResult.notes}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            </motion.div>
          )}

          {activeTab === "lease" && (
            <motion.div
              key="lease-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]"
            >
              {/* ORIGINAL CONFIG INPUTS */}
              <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-soft h-fit space-y-5">
                <div className="flex items-center gap-3 border-b border-border pb-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-2xl border border-border bg-surface">
                    <WalletCards className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-[14px] font-bold text-foreground">{t("calc.leaseAssumptions", "Lease Assumptions")}</h2>
                    <p className="text-[10px] text-muted-foreground font-semibold">{t("calc.leaseAssumptionsHint", "Bases for loan to value margins")}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="lease-price" className="text-[12px] font-medium text-muted-foreground/80">{t("calc.vehicleValuation", "Vehicle Valuation (LKR)")}</label>
                    <Input id="lease-price" type="number" value={leasePrice} onChange={(e) => setLeasePrice(Number(e.target.value))} className="num bg-surface border-border focus-visible:ring-primary/40 font-semibold text-foreground text-base" />
                    <p className="text-[10px] text-muted-foreground font-semibold num">{formatPrice(leasePrice)}</p>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="lease-cc" className="text-[12px] font-medium text-muted-foreground/80">{t("calc.engineCc", "Engine Capacity (CC)")}</label>
                    <Input id="lease-cc" type="number" value={leaseCc} onChange={(e) => setLeaseCc(Number(e.target.value))} className="num bg-surface border-border focus-visible:ring-primary/40" />
                  </div>
                </div>
              </div>

              {/* RENDER DUAL PANELS */}
              <div className="space-y-6">
                {/* CBSL 40/60 LTV arbitrage — regulation-made, nobody else surfaces it */}
                <AnimatePresence initial={false}>
                {leasePrice >= 1_000_000 && (() => {
                  const usedDown = leasePrice * 0.4;   // 60% LTV on registered used
                  const newDown = leasePrice * 0.6;    // 40% LTV on new/unregistered
                  const usedBudgetFromNewDown = newDown / 0.4; // same cash, used market
                  return (
                    <motion.div
                      key="ltv-arbitrage"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden rounded-2xl border border-primary/20 bg-primary/[0.05] shadow-soft"
                    >
                      <div className="p-4">
                      <div className="flex items-start gap-2.5">
                        <Compass className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        <div className="space-y-1.5">
                          <p className="text-xs font-bold text-foreground">{t("calc.ltvTitle", "The 40/60 rule is working in your favour on used cars")}</p>
                          <p className="text-[11px] leading-relaxed text-muted-foreground font-medium">
                            CBSL caps financing at <span className="font-bold text-foreground">40%</span> for brand-new or unregistered vehicles but{" "}
                            <span className="font-bold text-foreground">60%</span> for registered used (&gt;1yr). For this{" "}
                            <span className="num font-bold text-foreground">{formatPrice(leasePrice)}</span> vehicle: registered used needs{" "}
                            <span className="num font-bold text-emerald-600 dark:text-emerald-400">{formatPrice(usedDown)}</span> down; new or unregistered needs{" "}
                            <span className="num font-bold text-rose-600 dark:text-rose-400">{formatPrice(newDown)}</span> — the same cash that would stretch to a{" "}
                            <span className="num font-bold text-foreground">{formatPrice(usedBudgetFromNewDown)}</span> registered used car.
                          </p>
                          <p className="text-[10px] font-semibold text-muted-foreground">
                            CBSL Act Directions No. 01 of 2026 (from 25 May 2026) · banks may apply stricter internal caps
                          </p>
                        </div>
                      </div>
                      </div>
                    </motion.div>
                  );
                })()}
                </AnimatePresence>
                <div>
                  <span className="text-[12px] font-medium text-muted-foreground">{t("calc.cashRequirements", "Cash requirements")}</span>
                  <CashToOwnStrip priceLkr={leasePrice} financeClass="registered_used" />
                </div>
                <div>
                  <span className="text-[12px] font-medium text-muted-foreground">{t("calc.leaseModeling", "Lease Scenario modeling")}</span>
                  <LeaseCalculator price={leasePrice} financeClass="registered_used" />
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "tco" && (
            <motion.div
              key="tco-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]"
            >
              {/* Inputs */}
              <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-soft space-y-4 h-fit">
                <div className="flex items-center gap-3 border-b border-border pb-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-2xl border border-border bg-surface">
                    <Gauge className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-[14px] font-bold text-foreground">{t("calc.tcoAssumptions", "TCO Assumptions")}</h2>
                    <p className="text-[10px] text-muted-foreground font-semibold">{t("calc.tcoAssumptionsHint", "Commute, service, and amortization")}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="tco-km" className="text-[12px] font-medium text-muted-foreground/80">{t("calc.dailyCommute", "Daily Commute (KM)")}</label>
                    <Input id="tco-km" type="number" value={tcoDailyKm} onChange={(e) => setTcoDailyKm(Number(e.target.value))} className="num bg-surface border-border focus-visible:ring-primary/40" />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="tco-kmpl" className="text-[12px] font-medium text-muted-foreground/80">{t("calc.fuelEfficiency", "Fuel Efficiency (KMPL)")}</label>
                    <Input id="tco-kmpl" type="number" value={tcoKmpl} onChange={(e) => setTcoKmpl(Number(e.target.value))} className="num bg-surface border-border focus-visible:ring-primary/40" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-muted-foreground/80">Fuel Type</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(["petrol", "diesel", "hybrid", "electric"] as const).map((fuel) => (
                      <button
                        key={fuel}
                        onClick={() => setTcoFuelType(fuel)}
                        aria-pressed={tcoFuelType === fuel}
                        className={`min-h-[36px] rounded-2xl border py-2.5 text-[10px] font-bold capitalize transition-all active:scale-[0.97] ${
                          tcoFuelType === fuel
                            ? "border-primary/40 bg-primary/10 text-primary-bright"
                            : "border-border bg-surface text-muted-foreground hover:text-foreground hover:border-primary/40"
                        }`}
                      >
                        {fuel}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="tco-lease" className="text-[12px] font-medium text-muted-foreground/80">{t("calc.monthlyLease", "Monthly Lease (LKR)")}</label>
                  <Input id="tco-lease" type="number" value={tcoLease} onChange={(e) => setTcoLease(Number(e.target.value))} className="num bg-surface border-border focus-visible:ring-primary/40" />
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
                  <div className="space-y-1.5">
                    <label htmlFor="tco-ins" className="text-[12px] font-medium text-muted-foreground/80">{t("calc.annualInsurance", "Annual Insurance")}</label>
                    <Input id="tco-ins" type="number" value={tcoInsurance} onChange={(e) => setTcoInsurance(Number(e.target.value))} className="num bg-surface border-border focus-visible:ring-primary/40" />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="tco-svc" className="text-[12px] font-medium text-muted-foreground/80">{t("calc.annualService", "Annual Service")}</label>
                    <Input id="tco-svc" type="number" value={tcoService} onChange={(e) => setTcoService(Number(e.target.value))} className="num bg-surface border-border focus-visible:ring-primary/40" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="tco-tyres" className="text-[12px] font-medium text-muted-foreground/80">{t("calc.annualTyres", "Annual Tyres")}</label>
                    <Input id="tco-tyres" type="number" value={tcoTyres} onChange={(e) => setTcoTyres(Number(e.target.value))} className="num bg-surface border-border focus-visible:ring-primary/40" />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="tco-dep" className="text-[12px] font-medium text-muted-foreground/80">{t("calc.annualResaleLoss", "Annual Resale Loss")}</label>
                    <Input id="tco-dep" type="number" value={tcoDepreciation} onChange={(e) => setTcoDepreciation(Number(e.target.value))} className="num bg-surface border-border focus-visible:ring-primary/40" />
                  </div>
                </div>
              </div>

              {/* TCO Results — monthly cost is the hero number */}
              <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-soft-lg space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-foreground">{t("calc.tcoBreakdown", "Monthly Cost of Ownership breakdown")}</h3>
                  <p className="text-[10px] text-muted-foreground font-semibold mt-0.5">{t("calc.tcoBreakdownHint", "Calculated using live Octane API price metrics")}</p>
                </div>

                {tcoLoading && !tcoResult ? (
                  <div className="h-64 flex items-center justify-center">
                    <div role="status" aria-label="Calculating" className="h-6 w-6 animate-spin rounded-full border border-t-transparent border-primary" />
                  </div>
                ) : tcoResult ? (
                  <div className={`space-y-5 transition-opacity duration-200 ${tcoLoading ? "opacity-60" : "opacity-100"}`}>
                    <div className="space-y-3 border-b border-border pb-4">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Live fuel/energy price benchmark</span>
                        <span className="font-semibold text-foreground num">Rs. {tcoResult.fuel_price_lkr.toLocaleString()} / L or kWh</span>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Monthly fuel/energy consumption</span>
                        <span className="font-semibold text-foreground num">{formatPrice(tcoResult.fuel_cost_monthly)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Monthly lease installments</span>
                        <span className="font-semibold text-foreground num">{formatPrice(tcoResult.lease_cost_monthly)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Amortized service, insurance, tyres & depreciation</span>
                        <span className="font-semibold text-foreground num">{formatPrice(tcoResult.overhead_cost_monthly)}</span>
                      </div>
                    </div>

                    <div aria-live="polite" className="rounded-2xl border border-primary/25 bg-primary/5 p-6 text-center shadow-soft">
                      <span className="text-[12px] font-semibold text-primary-bright">{t("calc.tcoTotal", "Total ownership cost / month")}</span>
                      <p className="display-1 text-foreground mt-2 num">{formatPrice(tcoResult.total_tco_monthly)}</p>
                    </div>

                    <div className="rounded-2xl bg-surface border border-border p-3 flex gap-2">
                      <Compass className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <p className="text-[10px] leading-relaxed text-muted-foreground font-semibold">{tcoResult.notes}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            </motion.div>
          )}

          {activeTab === "ownership" && (
            <motion.div
              key="ownership-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
            >
              <OwnershipCostsPanel
                initialFuel={lcFuelType}
                initialCc={lcEngineCc}
                initialPrice={leasePrice}
              />
            </motion.div>
          )}

          {activeTab === "permits" && (
            <motion.div
              key="permits-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-soft">
                <div className="mb-4">
                  <h3 className="text-sm font-bold text-foreground">{t("calc.permitsTitle", "Live Permit Black Market Tracker")}</h3>
                  <p className="text-[10px] text-muted-foreground font-semibold mt-0.5">{t("calc.permitsHint", "Indicative values of transferable and EV remittance import licenses")}</p>
                </div>

                {permitsLoading ? (
                  <div className="h-32 flex items-center justify-center">
                    <div role="status" aria-label="Calculating" className="h-6 w-6 animate-spin rounded-full border border-t-transparent border-primary" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-border text-muted-foreground text-[11px] font-semibold">
                          <th className="py-3 px-4">{t("calc.permitName", "Permit Name")}</th>
                          <th className="py-3 px-4">{t("calc.permitType", "Type")}</th>
                          <th className="py-3 px-4 text-right">{t("calc.permitPremium", "Premium Value (LKR)")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {permits.map((permit) => (
                          <tr key={permit.id} className="border-b border-border hover:bg-surface transition-colors">
                            <td className="py-4 px-4 font-semibold text-foreground">{permit.permit_name}</td>
                            <td className="py-4 px-4 capitalize font-medium text-muted-foreground">{permit.permit_type.replace("_", " ")}</td>
                            <td className="py-4 px-4 text-right font-bold text-primary num">{formatPrice(permit.market_price_lkr)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === "depreciation" && (
            <motion.div
              key="depreciation-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-soft">
                <div className="mb-6">
                  <h3 className="text-sm font-bold text-foreground">{t("calc.retentionTitle", "Sri Lanka Value Retention Curves")}</h3>
                  <p className="text-[10px] text-muted-foreground font-semibold mt-0.5">{t("calc.retentionHint", "Asset retention curves demonstrating how specific models retain value in the local market")}</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    { model: "Suzuki Wagon R", type: "Kei Car / Hybrid", values: ["92%", "85%", "78%"], tone: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-500/25", note: "The gold standard of value retention. Heavy demand for daily urban runs." },
                    { model: "Honda Vezel Hybrid", type: "Crossover", values: ["82%", "65%", "48%"], tone: "text-amber-600 dark:text-amber-400", border: "border-amber-500/25", note: "Drops heavily after 3 years once the hybrid battery pack warranty expires." },
                    { model: "Toyota Land Cruiser Prado", type: "Luxury SUV", values: ["95%", "92%", "88%"], tone: "text-primary", border: "border-primary/25", note: "Prado holds extreme value due to luxury status symbol and low import options." },
                    { model: "Nissan Leaf EV", type: "Full EV", values: ["60%", "38%", "20%"], tone: "text-rose-600 dark:text-rose-400", border: "border-rose-500/25", note: "Fastest depreciation curve due to battery degradation fears." },
                  ].map((curve) => (
                    <div key={curve.model} className={`data-card border ${curve.border} bg-surface p-4 flex flex-col justify-between`}>
                      <div>
                        <span className="text-[11px] font-medium text-muted-foreground">{curve.type}</span>
                        <h4 className="text-sm font-bold text-foreground mt-1">{curve.model}</h4>

                        <div className="mt-4 space-y-2 border-b border-border pb-4">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">{t("calc.year1", "Year 1")}</span>
                            <span className={`font-bold num ${curve.tone}`}>{curve.values[0]}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">{t("calc.year3", "Year 3")}</span>
                            <span className={`font-bold num ${curve.tone}`}>{curve.values[1]}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">{t("calc.year5", "Year 5")}</span>
                            <span className={`font-bold num ${curve.tone}`}>{curve.values[2]}</span>
                          </div>
                        </div>
                      </div>

                      <p className="text-[10px] leading-relaxed text-muted-foreground font-semibold mt-4">{curve.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        )}
      </div>
      </PageBody>
    </PageCanvas>
  );
}
