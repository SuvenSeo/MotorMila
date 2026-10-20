import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { getMakes, getModels, getPriceTrendSeries, getHybridBands, formatPrice } from "@/services/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SRI_LANKA_DISTRICTS } from "@/data/districts";
import { PriceHistoryChart } from "@/components/PriceHistoryChart";
import { TrendKpis } from "@/components/TrendKpis";
import { ImportEraPublicSection } from "@/components/ImportEraPublicSection";
import { RotateCcw, Zap, BarChart3 } from "lucide-react";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { PageHero } from "@/components/PageHero";
import { FreePlanBanner } from "@/components/FreePlanBanner";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { ProFeatureLock } from "@/components/ProFeatureLock";
import { revealItem } from "@/lib/motion";
import { useAppPreferences } from "@/lib/appPreferences";
import { useAuth } from "@/lib/authContext";
import {
  FREE_TRENDS_MONTHS,
  freePlanCopy,
  hasFullPlatformAccess,
  takeLastMonths,
} from "@/lib/planLimits";
import { visuals } from "@/lib/visualAssets";
import type { HybridBandsData, PriceTrendPoint } from "@/types/car";
import {
  getExciseRatePerCc,
  getHybridExciseCliffInsight,
  HYBRID_EXCISE_CLIFF_CC,
} from "@/lib/importTaxModel";

// Pre-compute per-band excise rates from importTaxModel (pure, no async).
const HYBRID_BAND_EXCISE = {
  low: getExciseRatePerCc("hybrid", HYBRID_EXCISE_CLIFF_CC),          // ≤1500 cc
  midLow: getExciseRatePerCc("hybrid", HYBRID_EXCISE_CLIFF_CC + 1),   // just above cliff
  midHigh: getExciseRatePerCc("hybrid", 2000),                         // 2000 cc
  highLow: getExciseRatePerCc("hybrid", 2001),                         // just over 2000
  highHigh: getExciseRatePerCc("hybrid", 3000),                        // 3000 cc
} as const;

function exciseLabelFor(ccMax: number | null): string {
  if (ccMax === null) return `Rs. ${HYBRID_BAND_EXCISE.highLow.toLocaleString()}–${HYBRID_BAND_EXCISE.highHigh.toLocaleString()}/cc`;
  if (ccMax <= HYBRID_EXCISE_CLIFF_CC) return `Rs. ${HYBRID_BAND_EXCISE.low.toLocaleString()}/cc`;
  return `Rs. ${HYBRID_BAND_EXCISE.midLow.toLocaleString()}–${HYBRID_BAND_EXCISE.midHigh.toLocaleString()}/cc`;
}

/** Band colour from low to high tax burden. Signal hues carry light + dark
 * variants so the text meets contrast on both themes (bars stay saturated). */
function bandColor(index: number): { bar: string; badge: string; text: string } {
  const palette = [
    { bar: "bg-emerald-500", badge: "bg-emerald-500/10 border-emerald-500/25", text: "text-emerald-700 dark:text-emerald-400" },
    { bar: "bg-amber-500",   badge: "bg-amber-500/10 border-amber-500/25",     text: "text-amber-700 dark:text-amber-400"   },
    { bar: "bg-rose-500",    badge: "bg-rose-500/10 border-rose-500/25",        text: "text-rose-700 dark:text-rose-400"    },
  ];
  return palette[Math.min(index, palette.length - 1)];
}

export default function Trends() {
  const { t } = useAppPreferences();
  const { hasProAccess, isAdmin } = useAuth();
  const fullAccess = hasFullPlatformAccess({ hasProAccess, isAdmin });
  const [makes, setMakes] = useState<{ make: string; count: number }[]>([]);
  const [modelsList, setModelsList] = useState<{ model: string; count: number }[]>([]);
  const [selectedMake, setSelectedMake] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [condition, setCondition] = useState("all");
  const [district, setDistrict] = useState("all");
  const [trendData, setTrendData] = useState<PriceTrendPoint[]>([]);
  const [coverageNote, setCoverageNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [hybridBands, setHybridBands] = useState<HybridBandsData | null>(null);
  const [hybridLoading, setHybridLoading] = useState(false);
  const [hybridError, setHybridError] = useState<string | null>(null);

  // Free: ignore district/condition filters (Pro depth).
  const effectiveCondition = fullAccess ? condition : "all";
  const effectiveDistrict = fullAccess ? district : "all";
  const visibleTrendData = fullAccess
    ? trendData
    : takeLastMonths(trendData, FREE_TRENDS_MONTHS);

  useEffect(() => {
    let c = false;
    getMakes().then((items) => { if (!c) { setMakes(items); setSelectedMake((cur) => cur || items[0]?.make || ""); } }).catch(() => { if (!c) setMakes([]); });
    return () => { c = true; };
  }, []);

  useEffect(() => {
    if (!selectedMake) { setModelsList([]); setSelectedModel(""); return; }
    let c = false;
    setModelsList([]); setSelectedModel("");
    getModels(selectedMake).then((items) => { if (!c) { setModelsList(items); setSelectedModel((cur) => cur || items[0]?.model || ""); } }).catch(() => { if (!c) setModelsList([]); });
    return () => { c = true; };
  }, [selectedMake]);

  useEffect(() => {
    if (!selectedMake || !selectedModel) { setTrendData([]); setCoverageNote(null); return; }
    let c = false;
    setLoading(true); setError(null);
    getPriceTrendSeries(
      selectedMake,
      selectedModel,
      effectiveCondition !== "all" ? effectiveCondition : undefined,
      effectiveDistrict !== "all" ? effectiveDistrict : undefined,
    )
      .then((s) => { if (!c) { setTrendData(s.points); setCoverageNote(s.coverage_note); } })
      .catch(() => {
        if (!c) {
          setTrendData([]);
          setCoverageNote(t("trends.tempUnavailable", "Trend data temporarily unavailable."));
          setError(t("trends.loadError", "Unable to load trend data."));
        }
      })
      .finally(() => { if (!c) setLoading(false); });
    return () => { c = true; };
  }, [selectedMake, selectedModel, effectiveCondition, effectiveDistrict, t]);

  useEffect(() => {
    let c = false;
    setHybridLoading(true);
    setHybridError(null);
    getHybridBands()
      .then((data) => { if (!c) setHybridBands(data); })
      .catch(() => { if (!c) setHybridError(t("trends.hybridError", "Hybrid band data temporarily unavailable.")); })
      .finally(() => { if (!c) setHybridLoading(false); });
    return () => { c = true; };
  }, [t]);

  const chartTitle = selectedMake && selectedModel ? `${selectedMake} ${selectedModel}` : t("trends.selectLane", "Select a lane");
  const emptyMessage = !selectedMake || !selectedModel
    ? t("trends.selectToLoad", "Select make and model to load price history.")
    : error || t("trends.noData", "No trend data for this combination yet.");
  const hasNarrow = effectiveDistrict !== "all" || effectiveCondition !== "all";

  const conditionLabel = (value: string) => {
    if (value === "all") return t("common.any", "Any");
    if (value === "used") return t("condition.used", "Used");
    if (value === "reconditioned") return t("condition.reconditioned", "Reconditioned");
    if (value === "brand_new") return t("condition.brandNew", "Brand New");
    return value;
  };

  const selectTriggerClass = "h-11 rounded-full border-border bg-surface text-sm text-foreground";
  const selectContentClass = "border-border bg-popover text-popover-foreground";
  const fieldLabelClass = "text-[12px] font-semibold text-muted-foreground";

  return (
    <PageCanvas>
      <FreePlanBanner />
      <PageHero
        theme="trends"
        eyebrow={t("trends.eyebrow", "Trend studio")}
        watermarkIcon={BarChart3}
        title={<>{t("trends.title", "Price trends.")}</>}
        description={t("trends.description", "Track median price movement for any vehicle lane across Sri Lanka.")}
        media={visuals.priceIntelligenceBg}
        mediaPosition="center"
        mediaTone="brand"
        highlights={[
          { label: "Coverage", value: "All LK", hint: "District-level price lanes" },
          { label: "Hybrid lens", value: "Tax bands", hint: "Excise cliff intelligence" },
          { label: "History", value: "Monthly", hint: "Median price trajectories" },
        ]}
      />

      <PageBody className="space-y-6">
        {/* Controls */}
        <motion.div variants={revealItem} className="rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <label htmlFor="t-make" className={fieldLabelClass}>{t("common.make", "Make")}</label>
              <Select value={selectedMake} onValueChange={setSelectedMake}>
                <SelectTrigger id="t-make" className={selectTriggerClass}><SelectValue placeholder={t("common.selectMake", "Select make")} /></SelectTrigger>
                <SelectContent className={selectContentClass}>
                  {makes.map((m) => <SelectItem key={m.make} value={m.make}>{m.make}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="t-model" className={fieldLabelClass}>{t("common.model", "Model")}</label>
              <Select value={selectedModel} onValueChange={setSelectedModel} disabled={!selectedMake || !modelsList.length}>
                <SelectTrigger id="t-model" className={selectTriggerClass}><SelectValue placeholder={t("common.selectModel", "Select model")} /></SelectTrigger>
                <SelectContent className={selectContentClass}>
                  {modelsList.map((m) => <SelectItem key={m.model} value={m.model}>{m.model}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="t-cond" className={fieldLabelClass}>{t("common.condition", "Condition")}</label>
              {fullAccess ? (
                <Select value={condition} onValueChange={setCondition}>
                  <SelectTrigger id="t-cond" className={selectTriggerClass}><SelectValue /></SelectTrigger>
                  <SelectContent className={selectContentClass}>
                    <SelectItem value="all">{t("common.any", "Any")}</SelectItem>
                    <SelectItem value="used">{t("condition.used", "Used")}</SelectItem>
                    <SelectItem value="reconditioned">{t("condition.reconditioned", "Reconditioned")}</SelectItem>
                    <SelectItem value="brand_new">{t("condition.brandNew", "Brand New")}</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <ProFeatureLock
                  density="compact"
                  label={t("pro.lock.short", "Pro")}
                  className="min-h-[2.75rem] rounded-full"
                >
                  <div className={`${selectTriggerClass} flex h-10 items-center px-3 text-sm text-muted-foreground`}>
                    {t("common.any", "Any")}
                  </div>
                </ProFeatureLock>
              )}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="t-dist" className={fieldLabelClass}>{t("common.district", "District")}</label>
              {fullAccess ? (
                <Select value={district} onValueChange={setDistrict}>
                  <SelectTrigger id="t-dist" className={selectTriggerClass}><SelectValue /></SelectTrigger>
                  <SelectContent className={selectContentClass}>
                    <SelectItem value="all">{t("common.allDistricts", "All districts")}</SelectItem>
                    {SRI_LANKA_DISTRICTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <ProFeatureLock
                  density="compact"
                  label={t("pro.lock.short", "Pro")}
                  className="min-h-[2.75rem] rounded-full"
                >
                  <div className={`${selectTriggerClass} flex h-10 items-center px-3 text-sm text-muted-foreground`}>
                    {t("common.allDistricts", "All districts")}
                  </div>
                </ProFeatureLock>
              )}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <span className={fieldLabelClass}>{t("trends.lane", "Lane:")}</span>
            {[
              { id: "make", label: selectedMake || "—" },
              { id: "model", label: selectedModel || "—" },
              { id: "condition", label: conditionLabel(condition) },
              { id: "district", label: district === "all" ? "All LK" : district },
            ].map((chip) => (
              <span key={chip.id} className="rounded-full border border-border bg-surface px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">{chip.label}</span>
            ))}
            {hasNarrow && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setDistrict("all"); setCondition("all"); }}
                className="ml-auto h-8 gap-1.5 px-3 text-xs font-semibold text-muted-foreground"
              >
                <RotateCcw aria-hidden /> {t("trends.resetFilters", "Reset filters")}
              </Button>
            )}
          </div>
        </motion.div>

        {/* KPI strip — Tremor cards + sparklines from the real series (#7 UI review) */}
        <motion.div variants={revealItem}>
          <TrendKpis points={visibleTrendData} />
        </motion.div>

        {/* Chart — PriceHistoryChart owns its own theme-aware surface + Recharts */}
        <motion.div variants={revealItem}>
          <PriceHistoryChart title={chartTitle} points={visibleTrendData} isLoading={loading} coverageNote={coverageNote} emptyMessage={emptyMessage} emptyActionLabel={hasNarrow ? t("trends.broadenFilters", "Broaden filters") : undefined} onEmptyAction={hasNarrow ? () => { setDistrict("all"); setCondition("all"); } : undefined} />
          {!fullAccess ? (
            <UpgradePrompt
              className="mt-4"
              title={freePlanCopy.trendsTitle}
              body={freePlanCopy.trendsBody}
              variant="strip"
            />
          ) : null}
        </motion.div>

        <motion.div variants={revealItem} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
          <p className="text-[11px] font-medium text-muted-foreground">
            {selectedMake && selectedModel
              ? t("trends.medianNote", "Median advertised prices grouped by month from the public Sri Lanka snapshot.")
              : t("trends.chooseLane", "Choose a make and model to render the trajectory.")}
          </p>
          <span className="shrink-0 text-[10px] font-semibold text-primary-bright num">{t("common.publicData", "Public data")}</span>
        </motion.div>

        {/* ── HYBRID TAX ARBITRAGE (Pro depth) ─────────────────── */}
        <motion.div variants={revealItem}>
          {fullAccess ? (
            <HybridTaxArbitrageSection
              data={hybridBands}
              loading={hybridLoading}
              error={hybridError}
            />
          ) : (
            <ProFeatureLock
              label={t("pro.lock.hybridTitle", "Hybrid tax bands — Pro")}
              className="min-h-[12rem] rounded-xl"
            >
              <div className="rounded-xl border border-border bg-surface p-6">
                <p className="font-display text-lg font-bold text-foreground">{t("trends.hybridTitle", "Hybrid Tax Arbitrage")}</p>
                <p className="mt-2 text-sm text-muted-foreground">{t("pro.lock.preview", "Preview locked on Free")}</p>
              </div>
            </ProFeatureLock>
          )}
        </motion.div>

        <motion.div variants={revealItem}>
          <ImportEraPublicSection />
        </motion.div>
      </PageBody>
    </PageCanvas>
  );
}

// ─── Hybrid Tax Arbitrage Section ─────────────────────────────────────────────

interface HybridTaxArbitrageSectionProps {
  data: HybridBandsData | null;
  loading: boolean;
  error: string | null;
}

function HybridTaxArbitrageSection({ data, loading, error }: HybridTaxArbitrageSectionProps) {
  const { t } = useAppPreferences();
  const cliffInsight = getHybridExciseCliffInsight();

  const bands = data?.bands ?? [];
  const maxMedian = Math.max(...bands.map((b) => b.median_price_lkr ?? 0), 1);

  return (
    <section
      aria-labelledby="hybrid-tax-heading"
      className="rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6"
    >
      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="max-w-2xl">
          <p className="inline-flex items-center gap-2 text-[0.6875rem] font-medium tracking-tight text-primary-bright">
            <span aria-hidden className="h-1 w-1 rounded-full bg-primary-bright" />
            {t("trends.hybridEyebrow", "Import tax intelligence")}
          </p>
          <h2
            id="hybrid-tax-heading"
            className="display-2 mt-2 text-foreground"
          >
            {t("trends.hybridTitle", "Hybrid tax arbitrage bands")}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {t("trends.hybridBody", "Median market prices vs excise duty across three engine-cc bands. The 1,500 cc cliff creates a pricing discontinuity worth exploiting.")}
          </p>
        </div>
      </div>

      {loading && (
        <div
          aria-busy="true"
          aria-label={t("trends.hybridLoadingAria", "Loading hybrid band data")}
          className="space-y-3"
        >
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-foreground/[0.04]" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-border bg-surface px-4 py-6 text-center">
          <p className="text-[12px] text-muted-foreground">{error}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t("trends.hybridErrorHint", "Excise cliff insight is still available below from the static tax model.")}
          </p>
        </div>
      )}

      {!loading && !error && bands.length === 0 && (
        <div className="rounded-2xl border border-border bg-surface px-4 py-6 text-center">
          <p className="text-[12px] text-muted-foreground">{t("trends.hybridEmpty", "No hybrid band data available yet.")}</p>
        </div>
      )}

      {!loading && !error && bands.length > 0 && (
        <div className="space-y-4" role="list" aria-label="Hybrid engine bands">
          {bands.map((band, idx) => {
            const colors = bandColor(idx);
            const barPct = band.median_price_lkr
              ? Math.round((band.median_price_lkr / maxMedian) * 100)
              : 0;
            const isCliffBand = band.cc_max !== null && band.cc_max <= HYBRID_EXCISE_CLIFF_CC;

            return (
              <div
                key={band.label}
                role="listitem"
                aria-label={`${band.label} hybrid band`}
                className="rounded-xl border border-border bg-surface p-4"
              >
                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${colors.badge} ${colors.text}`}>
                      {band.label}
                    </span>
                    {isCliffBand && (
                      <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                        {t("trends.taxCliff", "Tax cliff ↓")}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    <span className="text-[11px] text-muted-foreground num">
                      {band.count.toLocaleString()} {t("common.listings", "listings")}
                    </span>
                    {band.median_price_lkr !== null && (
                      <span className="text-[13px] font-bold text-foreground num">
                        {formatPrice(band.median_price_lkr)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Bar */}
                <div className="mb-2.5 h-3 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
                  <div
                    role="img"
                    aria-label={`${band.label} median price bar ${barPct}%`}
                    className={`h-full rounded-full transition-all duration-500 ${colors.bar}`}
                    style={{ width: `${barPct}%` }}
                  />
                </div>

                {/* Excise note */}
                <p className="text-[11px] text-muted-foreground">
                  {t("trends.exciseDuty", "Excise duty:")}{" "}
                  <span className={`font-semibold ${colors.text}`}>
                    {exciseLabelFor(band.cc_max)}
                  </span>
                  {isCliffBand && (
                    <span className="ml-2 text-emerald-700 dark:text-emerald-400">
                      {t("trends.lowestHybridRate", "· lowest hybrid rate")}
                    </span>
                  )}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Cliff insight card ── */}
      <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] p-4">
        <div className="mb-2 flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />
          <p className="text-[12px] font-semibold text-amber-700 dark:text-amber-400">
            {t("trends.cliffTitle", "1,500 cc excise cliff")}
          </p>
        </div>
        <p className="text-[13px] text-muted-foreground leading-relaxed">
          At exactly{" "}
          <span className="font-semibold text-foreground num">
            {cliffInsight.cliffCc.toLocaleString()} cc
          </span>{" "}
          the hybrid excise rate jumps from{" "}
          <span className="font-semibold text-foreground num">
            Rs. {cliffInsight.rateAtOrBelowCliff.toLocaleString()}/cc
          </span>{" "}
          to{" "}
          <span className="font-semibold text-foreground num">
            Rs. {cliffInsight.rateAboveCliff.toLocaleString()}/cc
          </span>
          , adding{" "}
          <span className="font-semibold text-amber-700 dark:text-amber-300 num">
            Rs. {cliffInsight.exciseStepUp.toLocaleString()}
          </span>{" "}
          in excise duty crossing one cc. Buyers sourcing ≤ 1,500 cc hybrids
          also save{" "}
          <span className="font-semibold text-emerald-700 dark:text-emerald-300 num">
            Rs. {cliffInsight.exciseSavingVsPetrolAtCliff.toLocaleString()}
          </span>{" "}
          in excise versus the equivalent petrol band at this capacity.
        </p>
        <p className="mt-2 text-[10px] font-medium text-muted-foreground">
          Rates from the indicative 2025–2026 Sri Lanka excise schedule ·{" "}
          verify against the latest gazette before transacting.
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-[11px] text-muted-foreground">
          Median prices from live market snapshot · excise rates from the 2025–2026 import tax model.
        </p>
        <span className="shrink-0 text-[10px] font-semibold text-amber-700 dark:text-amber-400 num">{t("trends.taxModel", "Tax model")}</span>
      </div>
    </section>
  );
}
