import { useState, useEffect } from "react";
import { m } from "motion/react";
import { getMakes, getModels, getPriceTrendSeries, getHybridBands, formatPrice } from "@/services/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { SRI_LANKA_DISTRICTS } from "@/data/districts";
import { PriceHistoryChart } from "@/components/PriceHistoryChart";
import { TrendKpis } from "@/components/TrendKpis";
import { ImportEraPublicSection } from "@/components/ImportEraPublicSection";
import { RotateCcw, Zap, BarChart3 } from "lucide-react";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { FreePlanBanner } from "@/components/FreePlanBanner";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { ProFeatureLock } from "@/components/ProFeatureLock";
import { revealItem, staggerDelay, tween } from "@/lib/motion";
import { useAppPreferences } from "@/lib/appPreferences";
import { useAuth } from "@/lib/authContext";
import {
  FREE_TRENDS_MONTHS,
  freePlanText,
  hasFullPlatformAccess,
  takeLastMonths,
} from "@/lib/planLimits";
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

/** Band colour from low to high tax burden (deal tokens; text meets contrast in both themes). */
function bandColor(index: number): { bar: string; badge: "success" | "warning" | "danger"; text: string } {
  const palette = [
    { bar: "bg-deal-good", badge: "success" as const, text: "text-deal-good-text" },
    { bar: "bg-deal-caution", badge: "warning" as const, text: "text-deal-caution-text" },
    { bar: "bg-deal-high", badge: "danger" as const, text: "text-deal-high-text" },
  ];
  return palette[Math.min(index, palette.length - 1)];
}

export default function Trends() {
  const { t, language } = useAppPreferences();
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

  const fieldLabelClass = "text-footnote font-medium text-label-2";
  const lanes = [
    { id: "make", label: selectedMake || "—" },
    { id: "model", label: selectedModel || "—" },
    { id: "condition", label: conditionLabel(condition) },
    { id: "district", label: district === "all" ? t("trends.allLk", "All Sri Lanka") : district },
  ];

  return (
    <PageCanvas ambient="none">
      <FreePlanBanner />
      <PageHeader
        eyebrow={t("trends.eyebrow", "Trend studio")}
        eyebrowIcon={BarChart3}
        title={t("trends.title", "Price trends.")}
        description={t("trends.description", "Track median price movement for any vehicle lane across Sri Lanka.")}
        stats={[
          { label: t("trends.stat.coverage", "Coverage"), value: t("trends.allLk", "All Sri Lanka"), hint: t("trends.stat.coverageHint", "District-level price lanes") },
          { label: t("trends.stat.hybrid", "Hybrid lens"), value: t("trends.stat.hybridValue", "Tax bands"), hint: t("trends.stat.hybridHint", "Excise cliff insight") },
          { label: t("trends.stat.history", "History"), value: t("trends.stat.historyValue", "Monthly"), hint: t("trends.stat.historyHint", "Median price over time") },
        ]}
      />

      <PageBody className="space-y-6 pt-0 lg:pt-0">
        {/* Controls */}
        <m.div variants={revealItem}>
          <Card padding="md">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <label htmlFor="t-make" className={fieldLabelClass}>{t("common.make", "Make")}</label>
                <Select value={selectedMake} onValueChange={setSelectedMake}>
                  <SelectTrigger id="t-make"><SelectValue placeholder={t("common.selectMake", "Select make")} /></SelectTrigger>
                  <SelectContent>
                    {makes.map((m) => <SelectItem key={m.make} value={m.make}>{m.make}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="t-model" className={fieldLabelClass}>{t("common.model", "Model")}</label>
                <Select value={selectedModel} onValueChange={setSelectedModel} disabled={!selectedMake || !modelsList.length}>
                  <SelectTrigger id="t-model"><SelectValue placeholder={t("common.selectModel", "Select model")} /></SelectTrigger>
                  <SelectContent>
                    {modelsList.map((m) => <SelectItem key={m.model} value={m.model}>{m.model}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="t-cond" className={fieldLabelClass}>{t("common.condition", "Condition")}</label>
                {fullAccess ? (
                  <Select value={condition} onValueChange={setCondition}>
                    <SelectTrigger id="t-cond"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("common.any", "Any")}</SelectItem>
                      <SelectItem value="used">{t("condition.used", "Used")}</SelectItem>
                      <SelectItem value="reconditioned">{t("condition.reconditioned", "Reconditioned")}</SelectItem>
                      <SelectItem value="brand_new">{t("condition.brandNew", "Brand New")}</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <ProFeatureLock
                    density="compact"
                    label={t("trends.lock.conditionFilter", "Condition filter")}
                    className="h-10 w-full justify-start rounded-control"
                  >
                    <span />
                  </ProFeatureLock>
                )}
              </div>
              <div className="space-y-1.5">
                <label htmlFor="t-dist" className={fieldLabelClass}>{t("common.district", "District")}</label>
                {fullAccess ? (
                  <Select value={district} onValueChange={setDistrict}>
                    <SelectTrigger id="t-dist"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("common.allDistricts", "All districts")}</SelectItem>
                      {SRI_LANKA_DISTRICTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <ProFeatureLock
                    density="compact"
                    label={t("trends.lock.districtFilter", "District filter")}
                    className="h-10 w-full justify-start rounded-control"
                  >
                    <span />
                  </ProFeatureLock>
                )}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-separator pt-4">
              <span className="text-footnote font-medium text-label-2">{t("trends.lane", "Lane:")}</span>
              {lanes.map((chip) => (
                <Badge key={chip.id} variant="neutral">{chip.label}</Badge>
              ))}
              {hasNarrow && (
                <Button
                  type="button"
                  variant="tertiary"
                  size="sm"
                  onClick={() => { setDistrict("all"); setCondition("all"); }}
                  className="ml-auto"
                >
                  <RotateCcw aria-hidden /> {t("trends.resetFilters", "Reset filters")}
                </Button>
              )}
            </div>
          </Card>
        </m.div>

        {/* KPI strip — token sparklines from the real series */}
        <m.div variants={revealItem}>
          <TrendKpis points={visibleTrendData} loading={loading && visibleTrendData.length === 0} />
        </m.div>

        <m.div variants={revealItem}>
          <PriceHistoryChart title={chartTitle} points={visibleTrendData} isLoading={loading} coverageNote={language !== "en" && trendData.length > 1 && coverageNote && coverageNote.startsWith("Monthly medians") ? t("trends.coverageNote", coverageNote, { from: trendData[0].month, to: trendData[trendData.length - 1].month }) : coverageNote} emptyMessage={emptyMessage} emptyActionLabel={hasNarrow ? t("trends.broadenFilters", "Broaden filters") : undefined} onEmptyAction={hasNarrow ? () => { setDistrict("all"); setCondition("all"); } : undefined} />
          {!fullAccess ? (
            <UpgradePrompt
              className="mt-4"
              title={freePlanText(t, "trendsTitle")}
              body={freePlanText(t, "trendsBody")}
              variant="strip"
            />
          ) : null}
        </m.div>

        <m.div variants={revealItem}>
          <Card padding="sm" className="flex flex-wrap items-center justify-between gap-3 shadow-none">
            <p className="text-footnote text-label-2">
              {selectedMake && selectedModel
                ? t("trends.medianNote", "Median advertised prices grouped by month from the public Sri Lanka snapshot.")
                : t("trends.chooseLane", "Choose a make and model to render the trajectory.")}
            </p>
            <Badge variant="info">{t("common.publicData", "Public data")}</Badge>
          </Card>
        </m.div>

        {/* ── HYBRID TAX ARBITRAGE (Pro depth) ─────────────────── */}
        <m.div variants={revealItem}>
          {fullAccess ? (
            <HybridTaxArbitrageSection
              data={hybridBands}
              loading={hybridLoading}
              error={hybridError}
            />
          ) : (
            <Card padding="md">
              <p className="font-display text-title3 font-semibold text-foreground">{t("trends.hybridTitle", "Hybrid tax arbitrage bands")}</p>
              <p className="mt-1 text-footnote text-label-2">{t("pro.lock.preview", "Preview locked on Free")}</p>
              <ProFeatureLock label={t("pro.lock.hybridTitle", "Hybrid tax bands — Pro")} className="mt-4">
                <span />
              </ProFeatureLock>
            </Card>
          )}
        </m.div>

        <m.div variants={revealItem}>
          <ImportEraPublicSection />
        </m.div>
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
  const rs = (n: number) => `Rs. ${n.toLocaleString()}`;

  return (
    <Card padding="md" aria-labelledby="hybrid-tax-heading" role="region">
      <SectionHeading
        id="hybrid-tax-heading"
        eyebrow={t("trends.hybridEyebrow", "Import tax intelligence")}
        title={t("trends.hybridTitle", "Hybrid tax arbitrage bands")}
        description={t("trends.hybridBody", "Median market prices vs excise duty across three engine-cc bands. The 1,500 cc cliff creates a pricing discontinuity worth exploiting.")}
      />

      {loading && (
        <div
          role="status"
          aria-busy="true"
          aria-label={t("trends.hybridLoadingAria", "Loading hybrid band data")}
          className="space-y-3"
        >
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} shape="row" className="h-24" />
          ))}
        </div>
      )}

      {!loading && error && (
        <ErrorState
          className="py-8"
          title={error}
          body={t("trends.hybridErrorHint", "Excise cliff insight is still available below from the static tax model.")}
        />
      )}

      {!loading && !error && bands.length === 0 && (
        <EmptyState
          className="py-8"
          icon={BarChart3}
          title={t("trends.hybridEmpty", "No hybrid band data available yet.")}
          body={t("trends.hybridEmptyBody", "Bands fill in once enough hybrid listings carry an engine size.")}
        />
      )}

      {!loading && !error && bands.length > 0 && (
        <ul className="content-in space-y-3" aria-label={t("trends.hybridListAria", "Hybrid engine bands")}>
          {bands.map((band, idx) => {
            const colors = bandColor(idx);
            const barPct = band.median_price_lkr
              ? Math.round((band.median_price_lkr / maxMedian) * 100)
              : 0;
            const isCliffBand = band.cc_max !== null && band.cc_max <= HYBRID_EXCISE_CLIFF_CC;

            return (
              <li
                key={band.label}
                aria-label={`${band.label} hybrid band`}
                className="rounded-card border border-border bg-surface-2 p-4"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={colors.badge}>{band.label}</Badge>
                    {isCliffBand && (
                      <Badge variant="success">{t("trends.taxCliff", "Tax cliff ↓")}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    <span className="text-caption tabular-nums text-label-2">
                      {band.count.toLocaleString()} {t("common.listings", "listings")}
                    </span>
                    {band.median_price_lkr !== null && (
                      <span className="text-callout font-semibold tabular-nums text-foreground">
                        {formatPrice(band.median_price_lkr)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Bar: transform-only draw-in (scaleX from the left), capped at the long token */}
                <div className="mb-3 h-2.5 w-full overflow-hidden rounded-full bg-surface-3">
                  <m.div
                    role="img"
                    aria-label={`${band.label} median price bar ${barPct}%`}
                    data-pct={barPct}
                    className={`h-full w-full origin-left rounded-full ${colors.bar}`}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: barPct / 100 }}
                    transition={{ ...tween.long, delay: staggerDelay(idx) }}
                  />
                </div>

                <p className="text-caption text-label-2">
                  {t("trends.exciseDuty", "Excise duty:")}{" "}
                  <span className={`font-semibold tabular-nums ${colors.text}`}>
                    {exciseLabelFor(band.cc_max)}
                  </span>
                  {isCliffBand && (
                    <span className="ml-2 text-deal-good-text">
                      {t("trends.lowestHybridRate", "· lowest hybrid rate")}
                    </span>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {/* ── Cliff insight ── */}
      <div className="mt-5 rounded-card border border-deal-caution/30 bg-deal-caution/10 p-4">
        <div className="mb-2 flex items-center gap-2">
          <Zap className="h-4 w-4 text-deal-caution-text" aria-hidden />
          <p className="text-footnote font-semibold text-deal-caution-text">
            {t("trends.cliffTitle", "1,500 cc excise cliff")}
          </p>
        </div>
        <p className="text-footnote tabular-nums text-foreground">
          {t(
            "trends.cliffBody",
            "At exactly {cc} cc the hybrid excise rate jumps from {low}/cc to {high}/cc, adding {step} in excise duty for one extra cc. Buyers sourcing hybrids of 1,500 cc or less also save {saving} in excise versus the equivalent petrol band at this capacity.",
            {
              cc: cliffInsight.cliffCc.toLocaleString(),
              low: rs(cliffInsight.rateAtOrBelowCliff),
              high: rs(cliffInsight.rateAboveCliff),
              step: rs(cliffInsight.exciseStepUp),
              saving: rs(cliffInsight.exciseSavingVsPetrolAtCliff),
            },
          )}
        </p>
        <p className="mt-2 text-caption text-label-2">
          {t("trends.cliffSource", "Rates from the indicative 2025–2026 Sri Lanka excise schedule · verify against the latest gazette before transacting.")}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-separator pt-4">
        <p className="text-caption text-label-2">
          {t("trends.hybridFoot", "Median prices from the live market snapshot · excise rates from the 2025–2026 import tax model.")}
        </p>
        <Badge variant="warning">{t("trends.taxModel", "Tax model")}</Badge>
      </div>
    </Card>
  );
}
