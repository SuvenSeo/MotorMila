import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { APIError, estimatePrice, formatPrice, getMakes, getModels, getPriceTrends } from "@/services/api";
import { PriceEstimate, PriceTrendPoint } from "@/types/car";
import { SRI_LANKA_DISTRICTS } from "@/data/districts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { SellerFairAskCard } from "@/components/SellerFairAskCard";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { PageHero } from "@/components/PageHero";
import { FreePlanBanner } from "@/components/FreePlanBanner";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { ProFeatureLock } from "@/components/ProFeatureLock";
import { AlertTriangle, BarChart3, Gauge, ShieldCheck, TrendingUp } from "lucide-react";
import { revealContainer, revealItem } from "@/lib/motion";
import { useAppPreferences } from "@/lib/appPreferences";
import { useAuth } from "@/lib/authContext";
import { freePlanCopy, hasFullPlatformAccess } from "@/lib/planLimits";
import { visuals } from "@/lib/visualAssets";

type EstimateForm = {
  make: string;
  model: string;
  year: number;
  condition: "brand_new" | "reconditioned" | "used";
  transmission: "automatic" | "manual" | "cvt" | "tiptronic";
  fuel_type: "petrol" | "diesel" | "hybrid" | "electric" | "plugin_hybrid";
  mileage_km: number;
  district: string;
};

type TrendProjection = {
  annualizedRate: number;
  oneYearValue: number;
  threeYearValue: number;
  windowMonths: number;
};

function monthToIndex(value: string): number | null {
  const [yearRaw, monthRaw] = String(value || "").split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return year * 12 + month;
}

function getTrendProjection(points: PriceTrendPoint[], baseMedian: number): TrendProjection | null {
  if (!Number.isFinite(baseMedian) || baseMedian <= 0) return null;
  const normalized = [...points]
    .filter((p) => Number.isFinite(p.median_price) && p.median_price > 0)
    .sort((a, b) => String(a.month).localeCompare(String(b.month)));
  if (normalized.length < 2) return null;
  const first = normalized[0];
  const last = normalized[normalized.length - 1];
  const fi = monthToIndex(first.month);
  const li = monthToIndex(last.month);
  if (fi === null || li === null || li <= fi) return null;
  const window = li - fi;
  const ratio = Number(last.median_price) / Number(first.median_price);
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  const rate = Math.pow(ratio, 12 / window) - 1;
  if (!Number.isFinite(rate) || Math.abs(rate) > 0.75) return null;
  const y1 = baseMedian * (1 + rate);
  const y3 = baseMedian * Math.pow(1 + rate, 3);
  if (!Number.isFinite(y1) || !Number.isFinite(y3) || y1 <= 0 || y3 <= 0) return null;
  return { annualizedRate: rate, oneYearValue: y1, threeYearValue: y3, windowMonths: window };
}

const selectClass = "h-11 rounded-xl border-border bg-surface text-sm text-foreground focus-visible:ring-2 focus-visible:ring-primary/40";
const inputClass = "h-11 rounded-xl border-border bg-surface text-base md:text-sm text-foreground num focus-visible:ring-2 focus-visible:ring-primary/40";

export default function Estimate() {
  const { t } = useAppPreferences();
  const { hasProAccess, isAdmin } = useAuth();
  const fullAccess = hasFullPlatformAccess({ hasProAccess, isAdmin });
  const [makes, setMakes] = useState<{ make: string; count: number }[]>([]);
  const [modelsList, setModelsList] = useState<{ model: string; count: number }[]>([]);
  const [form, setForm] = useState<EstimateForm>({
    make: "", model: "", year: 2021, condition: "reconditioned",
    transmission: "automatic", fuel_type: "hybrid", mileage_km: 50_000, district: "Colombo",
  });
  const [result, setResult] = useState<PriceEstimate | null>(null);
  const [colomboMedian, setColomboMedian] = useState<number | null>(null);
  const [trendPoints, setTrendPoints] = useState<PriceTrendPoint[]>([]);
  const [trendUnavailable, setTrendUnavailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { getMakes().then(setMakes).catch(() => setMakes([])); }, []);
  useEffect(() => {
    if (!form.make) { setModelsList([]); return; }
    getModels(form.make).then(setModelsList).catch(() => setModelsList([]));
  }, [form.make]);

  const update = (patch: Partial<EstimateForm>) => setForm((prev) => ({ ...prev, ...patch }));

  const handleEstimate = async () => {
    if (!form.make || !form.model) return;
    setLoading(true); setError(null); setTrendUnavailable(false);
    const fallback = t("estimate.errorFallback", "Unable to estimate. Try another model, year, or district.");
    try {
      const [estimate, trends, colombo] = await Promise.all([
        estimatePrice(form),
        getPriceTrends(form.make, form.model, form.condition, form.district).catch(() => null),
        // Sellers outside Colombo ask "what would this fetch in Colombo?" —
        // run the same profile against the Colombo market for a delta line.
        form.district !== "Colombo"
          ? estimatePrice({ ...form, district: "Colombo" }).catch(() => null)
          : Promise.resolve(null),
      ]);
      setResult(estimate);
      setColomboMedian(colombo && colombo.median > 0 ? colombo.median : null);
      setTrendPoints(Array.isArray(trends) ? trends : []);
      setTrendUnavailable(trends === null);
    } catch (err) {
      setError(err instanceof APIError ? err.detail || fallback : err instanceof Error ? err.message || fallback : fallback);
      setResult(null); setTrendPoints([]);
    } finally { setLoading(false); }
  };

  const projection = useMemo(() => result ? getTrendProjection(trendPoints, result.median) : null, [result, trendPoints]);

  return (
    <PageCanvas>
      <PageHero
        theme="valuation"
        eyebrow={t("estimate.eyebrow", "Valuation workbench")}
        eyebrowIcon={Gauge}
        watermarkIcon={BarChart3}
        title={<>{t("estimate.title", "What's your car worth?")}</>}
        description={t("estimate.description", "District-aware fair value ranges, trend projection, and seller ask guidance from live Sri Lanka inventory.")}
        media={visuals.alt2HeroOrangeSunset}
        mediaPosition="center 40%"
        mediaTone="brand"
        highlights={[
          { label: t("estimate.highlight.method", "Method"), value: t("estimate.highlight.methodValue", "Comps"), hint: t("estimate.highlight.methodHint", "Comparable listing median") },
          { label: t("estimate.highlight.trend", "Trend aware"), value: t("estimate.highlight.trendValue", "12 mo"), hint: t("estimate.highlight.trendHint", "Price trajectory projection") },
          { label: t("estimate.highlight.district", "District fit"), value: t("estimate.highlight.districtValue", "25+"), hint: t("estimate.highlight.districtHint", "Localized market lanes") },
        ]}
      />

      <FreePlanBanner />

      <PageBody>
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">

          {/* ── INPUT PANEL ──────────────────────────────────────── */}
          <motion.div variants={revealItem} className="rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6">
            <div className="mb-6 flex items-center gap-3 border-b border-border pb-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface">
                <Gauge className="h-4 w-4 text-primary" aria-hidden />
              </div>
              <div>
                <p className="text-[12px] font-semibold text-muted-foreground">{t("estimate.step01", "Step 01")}</p>
                <h2 className="text-sm font-bold text-foreground">{t("estimate.vehicleProfile", "Vehicle profile")}</h2>
              </div>
            </div>

            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="est-make" className="text-[12px] font-semibold text-muted-foreground">{t("common.make", "Make")}</label>
                  <Select value={form.make} onValueChange={(v) => update({ make: v, model: "" })}>
                    <SelectTrigger id="est-make" className={selectClass}><SelectValue placeholder={t("common.selectMake", "Select make")} /></SelectTrigger>
                    <SelectContent className="border-border bg-popover text-popover-foreground">
                      {makes.map((m) => <SelectItem key={m.make} value={m.make} className="focus:bg-primary/15 focus:text-foreground">{m.make} ({m.count})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="est-model" className="text-[12px] font-semibold text-muted-foreground">{t("common.model", "Model")}</label>
                  <Select value={form.model} onValueChange={(v) => update({ model: v })} disabled={!form.make || !modelsList.length}>
                    <SelectTrigger id="est-model" className={`${selectClass} disabled:opacity-50`}><SelectValue placeholder={t("common.selectModel", "Select model")} /></SelectTrigger>
                    <SelectContent className="border-border bg-popover text-popover-foreground">
                      {modelsList.map((m) => <SelectItem key={m.model} value={m.model} className="focus:bg-primary/15 focus:text-foreground">{m.model} ({m.count})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="est-year" className="text-[12px] font-semibold text-muted-foreground">{t("valuation.field.year", "Year")}</label>
                  <Input id="est-year" type="number" min={1990} max={new Date().getFullYear() + 1} value={form.year} onChange={(e) => update({ year: Number(e.target.value) || 0 })} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="est-cond" className="text-[12px] font-semibold text-muted-foreground">{t("valuation.field.condition", "Condition")}</label>
                  <Select value={form.condition} onValueChange={(v: EstimateForm["condition"]) => update({ condition: v })}>
                    <SelectTrigger id="est-cond" className={selectClass}><SelectValue /></SelectTrigger>
                    <SelectContent className="border-border bg-popover text-popover-foreground">
                      <SelectItem value="brand_new" className="focus:bg-primary/15 focus:text-foreground">{t("condition.brandNew", "Brand New")}</SelectItem>
                      <SelectItem value="reconditioned" className="focus:bg-primary/15 focus:text-foreground">{t("condition.reconditioned", "Reconditioned")}</SelectItem>
                      <SelectItem value="used" className="focus:bg-primary/15 focus:text-foreground">{t("condition.used", "Used")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="est-trans" className="text-[12px] font-semibold text-muted-foreground">{t("valuation.field.transmission", "Transmission")}</label>
                  <Select value={form.transmission} onValueChange={(v: EstimateForm["transmission"]) => update({ transmission: v })}>
                    <SelectTrigger id="est-trans" className={selectClass}><SelectValue /></SelectTrigger>
                    <SelectContent className="border-border bg-popover text-popover-foreground">
                      <SelectItem value="automatic" className="focus:bg-primary/15 focus:text-foreground">{t("trans.automatic", "Automatic")}</SelectItem>
                      <SelectItem value="manual" className="focus:bg-primary/15 focus:text-foreground">{t("trans.manual", "Manual")}</SelectItem>
                      <SelectItem value="cvt" className="focus:bg-primary/15 focus:text-foreground">{t("trans.cvt", "CVT")}</SelectItem>
                      <SelectItem value="tiptronic" className="focus:bg-primary/15 focus:text-foreground">{t("trans.tiptronic", "Tiptronic")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="est-fuel" className="text-[12px] font-semibold text-muted-foreground">{t("valuation.field.fuel", "Fuel Type")}</label>
                  <Select value={form.fuel_type} onValueChange={(v: EstimateForm["fuel_type"]) => update({ fuel_type: v })}>
                    <SelectTrigger id="est-fuel" className={selectClass}><SelectValue /></SelectTrigger>
                    <SelectContent className="border-border bg-popover text-popover-foreground">
                      <SelectItem value="petrol" className="focus:bg-primary/15 focus:text-foreground">{t("fuel.petrol", "Petrol")}</SelectItem>
                      <SelectItem value="diesel" className="focus:bg-primary/15 focus:text-foreground">{t("fuel.diesel", "Diesel")}</SelectItem>
                      <SelectItem value="hybrid" className="focus:bg-primary/15 focus:text-foreground">{t("fuel.hybrid", "Hybrid")}</SelectItem>
                      <SelectItem value="plugin_hybrid" className="focus:bg-primary/15 focus:text-foreground">{t("fuel.pluginHybrid", "Plug-in Hybrid")}</SelectItem>
                      <SelectItem value="electric" className="focus:bg-primary/15 focus:text-foreground">{t("fuel.electric", "Electric")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="est-km" className="text-[12px] font-semibold text-muted-foreground">{t("valuation.field.mileage", "Mileage (KM)")}</label>
                  <Input id="est-km" type="number" min={0} max={500000} value={form.mileage_km} onChange={(e) => update({ mileage_km: Number(e.target.value) || 0 })} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="est-dist" className="text-[12px] font-semibold text-muted-foreground">{t("valuation.field.district", "District")}</label>
                  <Select value={form.district} onValueChange={(v) => update({ district: v })}>
                    <SelectTrigger id="est-dist" className={selectClass}><SelectValue /></SelectTrigger>
                    <SelectContent className="border-border bg-popover text-popover-foreground">
                      {SRI_LANKA_DISTRICTS.map((d) => <SelectItem key={d} value={d} className="focus:bg-primary/15 focus:text-foreground">{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="border-t border-border pt-5">
                <button type="button" onClick={handleEstimate} disabled={!form.make || !form.model || loading}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-[12px] font-semibold text-primary-foreground shadow-soft transition-transform hover:bg-primary/95 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40"
                >
                  <Gauge className="h-3.5 w-3.5" aria-hidden />
                  {loading ? t("estimate.running", "Running...") : t("estimate.run", "Run valuation")}
                </button>
                {!form.make || !form.model ? <p className="mt-2 text-center text-[11px] text-muted-foreground font-semibold">{t("estimate.selectToEnable", "Select make and model to enable.")}</p> : null}
                {error && (
                  <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> <span>{error}</span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* ── OUTPUT PANEL ─────────────────────────────────────── */}
          <motion.div variants={revealItem} className="rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6 lg:sticky lg:top-20">
            <div className="mb-6 flex items-center justify-between gap-3 border-b border-border pb-5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface">
                  <TrendingUp className="h-4 w-4 text-primary" aria-hidden />
                </div>
                <div>
                  <p className="text-[12px] font-semibold text-muted-foreground">{t("estimate.step02", "Step 02")}</p>
                  <h2 className="text-sm font-bold text-foreground">{t("estimate.marketOutput", "Market output")}</h2>
                </div>
              </div>
              {result && (
                <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[12px] font-semibold text-primary-bright">
                  {result.confidence}
                </span>
              )}
            </div>

            {!result && !loading && (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
                <Gauge className="h-5 w-5 text-muted-foreground/40" aria-hidden />
                <p className="max-w-xs text-[12px] font-medium text-muted-foreground">
                  {t("estimate.empty", "Enter a vehicle profile and run valuation to see live median pricing and trajectory.")}
                </p>
              </div>
            )}

            {loading && (
              <div className="space-y-3" aria-busy="true">
                <div className="h-24 rounded-xl border border-border bg-surface animate-pulse" />
                <div className="h-16 rounded-xl border border-border bg-surface animate-pulse" />
                <div className="h-20 rounded-xl border border-border bg-surface animate-pulse" />
              </div>
            )}

            {result && !loading && (
              <motion.div initial="hidden" animate="show" variants={revealContainer} className="space-y-4">
                {/* Median — featured hero of the output: larger, primary-tinted */}
                <motion.div variants={revealItem} aria-live="polite" className="rounded-2xl border border-primary/20 bg-surface p-5 shadow-soft">
                  <p className="text-[12px] font-semibold text-muted-foreground">{t("estimate.fairMarketRange", "Fair market range")}</p>
                  <p className="num mt-2 text-4xl font-bold leading-none tracking-tight text-foreground sm:text-[2.75rem]">
                    {formatPrice(result.low)} – {formatPrice(result.high)}
                  </p>
                  <p className="mt-3 text-[11px] text-muted-foreground font-medium">
                    {t("estimate.medianBasedOn", "Median {median} · based on {count} comparable asking prices — a range, not a promise; actual sale prices in SL typically settle 5–15% under ask", {
                      median: formatPrice(result.median),
                      count: result.comparable_count.toLocaleString(),
                    })}
                  </p>
                  {colomboMedian !== null && result.median > 0 && form.district !== "Colombo" && (
                    <p className="mt-3 border-t border-border pt-3 text-[11px] text-muted-foreground font-medium">
                      {t("estimate.sameProfileIn", "Same profile in")} <span className="font-bold text-foreground">Colombo</span>:{" "}
                      <span className="num font-bold text-foreground">{formatPrice(colomboMedian)}</span>{" "}
                      <span className={`num font-bold ${colomboMedian >= result.median ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                        ({colomboMedian >= result.median ? "+" : ""}
                        {(((colomboMedian - result.median) / result.median) * 100).toFixed(1)}% vs {form.district})
                      </span>
                    </p>
                  )}
                </motion.div>

                {/* Range */}
                <motion.div variants={revealItem} className="rounded-xl border border-border bg-surface p-4">
                  <div className="flex items-center justify-between text-[12px] font-semibold text-muted-foreground">
                    <span>{t("common.low", "Low")}</span><span>{t("common.high", "High")}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full w-full rounded-full bg-gradient-to-r from-primary/60 via-primary to-primary/60" />
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="num text-[13px] font-bold text-foreground">{formatPrice(result.low)}</span>
                    <span className="num text-[13px] font-bold text-foreground">{formatPrice(result.high)}</span>
                  </div>
                </motion.div>

                {/* Signals */}
                <motion.div variants={revealItem} className="flex flex-wrap gap-1.5">
                  <span className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary-bright">
                    <ShieldCheck className="h-3 w-3" aria-hidden /> {result.confidence}
                  </span>
                  <span className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[10px] font-bold text-muted-foreground transition-colors hover:text-foreground">
                    <BarChart3 className="h-3 w-3" aria-hidden /> <span className="num">{result.comparable_count}</span> {t("estimate.comparables", "comparables")}
                  </span>
                  <span className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[10px] font-bold text-muted-foreground transition-colors hover:text-foreground">
                    <TrendingUp className="h-3 w-3" aria-hidden /> {t("estimate.mileageAdj", "Mileage adj: {yesNo}", { yesNo: result.mileage_adjusted ? t("common.yes", "Yes") : t("common.no", "No") })}
                  </span>
                </motion.div>

                {/* Trajectory */}
                <motion.div variants={revealItem} className="rounded-xl border border-border bg-surface p-4">
                  <p className="text-[12px] font-semibold text-muted-foreground">{t("estimate.trajectory", "Trajectory")}</p>
                  {fullAccess ? (
                    projection ? (
                      <div className="mt-3 space-y-3">
                        <p className="text-[11px] text-muted-foreground font-medium">
                          {t("estimate.derivedFrom", "Derived from {months} months of data for {make} {model}.", {
                            months: projection.windowMonths,
                            make: form.make,
                            model: form.model,
                          })}
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-2xl border border-border bg-card p-3">
                            <p className="text-[10px] text-muted-foreground font-semibold">{t("estimate.oneYearProjected", "1Y projected")}</p>
                            <p className="num mt-1 text-[13px] font-bold text-foreground">{formatPrice(projection.oneYearValue)}</p>
                          </div>
                          <div className="rounded-2xl border border-border bg-card p-3">
                            <p className="text-[10px] text-muted-foreground font-semibold">{t("estimate.threeYearProjected", "3Y projected")}</p>
                            <p className="num mt-1 text-[13px] font-bold text-foreground">{formatPrice(projection.threeYearValue)}</p>
                          </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground font-medium">
                          {t("estimate.annualRate", "Annual rate:")}{" "}
                          <span className={`num font-bold ${projection.annualizedRate >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                            {projection.annualizedRate >= 0 ? "+" : ""}{(projection.annualizedRate * 100).toFixed(1)}%
                          </span>
                        </p>
                      </div>
                    ) : (
                      <p className="mt-2 text-[11px] text-muted-foreground font-medium">
                        {trendUnavailable
                          ? t("estimate.trendUnavailable", "Trend data temporarily unavailable.")
                          : t("estimate.notEnoughHistory", "Not enough historical data for projection.")}
                      </p>
                    )
                  ) : (
                    <div className="mt-3">
                      <UpgradePrompt
                        title={freePlanCopy.estimateTitle}
                        body={freePlanCopy.estimateBody}
                        variant="strip"
                      />
                    </div>
                  )}
                </motion.div>

                <motion.div variants={revealItem}>
                  {fullAccess ? (
                    <SellerFairAskCard
                      marketMedian={result.median}
                      make={form.make}
                      model={form.model}
                      year={form.year}
                    />
                  ) : (
                    <ProFeatureLock label={freePlanCopy.estimateTitle}>
                      <div className="rounded-xl border border-border bg-surface p-5">
                        <p className="text-sm font-bold text-foreground">{t("estimate.sellerAsk", "Seller fair ask")}</p>
                        <p className="mt-2 text-[12px] text-muted-foreground">{freePlanCopy.estimateBody}</p>
                      </div>
                    </ProFeatureLock>
                  )}
                </motion.div>

                {/* Methodology */}
                <motion.div variants={revealItem} className="rounded-xl border border-border bg-surface p-4">
                  <p className="text-[12px] font-semibold text-muted-foreground">{t("estimate.methodology", "Methodology")}</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground font-medium">{result.methodology}</p>
                </motion.div>
              </motion.div>
            )}
          </motion.div>
        </div>
      </PageBody>
    </PageCanvas>
  );
}
