import { useEffect, useMemo, useRef, useState } from "react";
import { SimpleSelect } from "@/components/ui/select";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Gauge, Info, RotateCcw, ShieldCheck } from "lucide-react";
import { estimatePrice, getMakes, getModels, getSnapshotModelComps } from "@/services/api";
import { SRI_LANKA_DISTRICTS } from "@/data/districts";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { SellerFairAskCard } from "@/components/SellerFairAskCard";
import { useAppPreferences } from "@/lib/appPreferences";
import { useAuth } from "@/lib/authContext";
import { hasFullPlatformAccess } from "@/lib/planLimits";
import { howWePriceHref } from "@/lib/howWePrice";
import { cn } from "@/lib/utils";
import { AnimatePresence, m, type Variants } from "motion/react";
import { duration, ease, press, spring, useReducedMotionOrLowData } from "@/lib/motion";
import { formatLkrCompact } from "@/lib/price";
import {
  QUIZ_QUESTIONS,
  estimateFromComps,
  isUsableEstimate,
  positionBand,
  quizFlags,
  rangePosition,
  type EstimateProfile,
  type QuizAnswers,
  type QuizEstimate,
  type QuizQuestion,
  type Registration,
} from "@/lib/estimateQuiz";

/**
 * /estimate — valuation as a short quiz (ui/features).
 * Car → mileage/registration → 5 one-tap condition questions → range.
 * No sign-up. The estimate request starts as soon as step 2 is done, so the
 * result is ready by the time the quiz ends. Live estimate API first, then
 * saved snapshot comps through the offline FMV engine.
 */

type Step = 0 | 1 | 2 | 3;

const NOW_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: NOW_YEAR + 1 - 1990 + 1 }, (_, i) => NOW_YEAR + 1 - i);

const fieldClass =
  "h-12 w-full rounded-xl border border-border bg-surface px-3 text-body text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50";
const chipBase =
  "inline-flex min-h-12 items-center justify-center rounded-xl border px-4 text-body font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

function slug(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Compact, millions-only (site-wide rule): "Rs 6.85 Mn". */
function lkr(n: number): string {
  return formatLkrCompact(n);
}

/** Direction-aware horizontal step slide (dir 1 = forward, -1 = back). */
const stepSlide: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 28 }),
  center: { opacity: 1, x: 0, transition: { duration: duration.medium, ease: ease.decelerate } },
  exit: (dir: number) => ({ opacity: 0, x: dir * -28, transition: { duration: duration.short, ease: ease.accelerate } }),
};
const stepFade: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: { duration: duration.short } },
  exit: { opacity: 0, transition: { duration: duration.micro } },
};

export default function Estimate() {
  const { t } = useAppPreferences();
  const motionStill = useReducedMotionOrLowData();
  const { hasProAccess, isAdmin } = useAuth();
  const fullAccess = hasFullPlatformAccess({ hasProAccess, isAdmin });

  const [step, setStep] = useState<Step>(0);
  const [qIndex, setQIndex] = useState(0);
  const [makes, setMakes] = useState<{ make: string; count: number }[]>([]);
  const [models, setModels] = useState<{ model: string; count: number }[]>([]);
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState<number>(NOW_YEAR - 6);
  const [mileage, setMileage] = useState<string>("");
  const [registration, setRegistration] = useState<Registration | "">("");
  const [district, setDistrict] = useState("Colombo");
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [result, setResult] = useState<QuizEstimate | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const requestId = useRef(0);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    getMakes().then(setMakes).catch(() => setMakes([]));
  }, []);
  useEffect(() => {
    setModels([]);
    if (!make) return;
    getModels(make).then(setModels).catch(() => setModels([]));
  }, [make]);

  // Move focus to the step heading for screen readers / keyboard users.
  useEffect(() => {
    headingRef.current?.focus();
  }, [step, qIndex]);

  const mileageNum = Number(mileage.replace(/[^\d]/g, ""));
  const step0Valid = Boolean(make && model && year);
  const step1Valid = Boolean(registration) && (registration === "brand_new" || (Number.isFinite(mileageNum) && mileage !== ""));

  const runEstimate = async () => {
    const id = ++requestId.current;
    const profile: EstimateProfile = {
      make,
      model,
      year,
      mileage_km: registration === "brand_new" && mileage === "" ? 0 : mileageNum,
      condition: registration as Registration,
      district,
    };
    setLoading(true);
    setFailed(false);
    setResult(null);
    let estimate: QuizEstimate | null = null;
    try {
      const live = await estimatePrice({ ...profile });
      if (isUsableEstimate(live)) estimate = { ...live, source: "live" };
    } catch {
      // Live API down or no match: fall through to the snapshot.
    }
    if (!estimate) {
      try {
        const comps = await getSnapshotModelComps(make, model);
        estimate = estimateFromComps(comps, profile);
      } catch {
        estimate = null;
      }
    }
    if (id !== requestId.current) return;
    setResult(estimate);
    setFailed(!estimate);
    setLoading(false);
  };

  const goToQuiz = () => {
    if (!step1Valid) return;
    void runEstimate();
    setQIndex(0);
    setStep(2);
  };

  const answer = (q: QuizQuestion, value: string) => {
    setAnswers((prev) => ({ ...prev, [q]: value }));
    if (qIndex < QUIZ_QUESTIONS.length - 1) setQIndex((i) => i + 1);
    else setStep(3);
  };

  const skipQuestion = () => {
    if (qIndex < QUIZ_QUESTIONS.length - 1) setQIndex((i) => i + 1);
    else setStep(3);
  };

  const restart = () => {
    requestId.current += 1;
    setStep(0);
    setQIndex(0);
    setAnswers({});
    setResult(null);
    setFailed(false);
    setLoading(false);
  };

  const QUESTIONS: Record<QuizQuestion, { title: string; options: Array<{ value: string; label: string }> }> = {
    accidents: {
      title: t("quiz.q.accidents", "Any accident repairs?"),
      options: [
        { value: "none", label: t("quiz.a.accidents.none", "None") },
        { value: "minor", label: t("quiz.a.accidents.minor", "Minor (paint, panels)") },
        { value: "major", label: t("quiz.a.accidents.major", "Major (structural, airbags)") },
      ],
    },
    service: {
      title: t("quiz.q.service", "Service records?"),
      options: [
        { value: "full", label: t("quiz.a.service.full", "Full history") },
        { value: "partial", label: t("quiz.a.service.partial", "Some receipts") },
        { value: "none", label: t("quiz.a.service.none", "None") },
      ],
    },
    owners: {
      title: t("quiz.q.owners", "Owners in Sri Lanka (on the CR)?"),
      options: [
        { value: "1", label: t("quiz.a.owners.1", "1st owner") },
        { value: "2", label: t("quiz.a.owners.2", "2 owners") },
        { value: "3plus", label: t("quiz.a.owners.3plus", "3 or more") },
      ],
    },
    flood: {
      title: t("quiz.q.flood", "Ever in a flood?"),
      options: [
        { value: "no", label: t("quiz.a.flood.no", "No") },
        { value: "unsure", label: t("quiz.a.flood.unsure", "Not sure") },
        { value: "yes", label: t("quiz.a.flood.yes", "Yes") },
      ],
    },
    mods: {
      title: t("quiz.q.mods", "Modifications?"),
      options: [
        { value: "none", label: t("quiz.a.mods.none", "Stock") },
        { value: "minor", label: t("quiz.a.mods.minor", "Minor (wheels, audio)") },
        { value: "major", label: t("quiz.a.mods.major", "Major (engine, body, suspension)") },
      ],
    },
  };

  const FLAG_TEXT: Record<QuizQuestion, string> = {
    flood: t("quiz.flag.flood", "Flood exposure: buyers will discount heavily and many won't buy. Get a written inspection before you set a price."),
    accidents: t("quiz.flag.accidents", "Accident repairs: keep repair invoices handy. Buyers will check panel gaps and paint depth."),
    service: t("quiz.flag.service", "No service records: an independent inspection report helps make up for it."),
    mods: t("quiz.flag.mods", "Major modifications narrow the buyer pool. Keep the original parts if you have them."),
    owners: t("quiz.flag.owners", "Several owners: expect questions. A clean CR and receipts help."),
  };

  const position = rangePosition(answers);
  const flags = quizFlags(answers);
  const band = result ? positionBand(result.low, result.high, position) : null;
  const confidenceLabel = result
    ? {
        high: t("quiz.conf.high", "High confidence"),
        medium: t("quiz.conf.medium", "Medium confidence"),
        low: t("quiz.conf.low", "Low confidence — rough guide"),
      }[result.confidence]
    : "";

  const stepLabels = [
    t("quiz.step.car", "Car"),
    t("quiz.step.details", "Details"),
    t("quiz.step.condition", "Condition"),
    t("quiz.step.result", "Result"),
  ];
  // Track navigation direction for the slide (forward vs back).
  const navPos = step * 10 + (step === 2 ? qIndex : 0);
  const [nav, setNav] = useState({ pos: navPos, dir: 1 });
  if (nav.pos !== navPos) setNav({ pos: navPos, dir: navPos > nav.pos ? 1 : -1 });
  const progressPct = step === 2 ? ((2 + qIndex / QUIZ_QUESTIONS.length) / 3) * 100 : (step / 3) * 100;

  const hubHref = useMemo(
    () => (make && model ? `/cars/${encodeURIComponent(slug(make))}/${encodeURIComponent(slug(model))}` : "/"),
    [make, model],
  );

  return (
    <PageCanvas ambient="subtle">
      <PageBody narrow className="max-w-xl py-8 sm:py-12">
        <div className="mb-5">
          <p className="inline-flex items-center gap-1.5 text-caption font-semibold text-primary-bright">
            <Gauge className="h-3.5 w-3.5" aria-hidden />
            {t("quiz.eyebrow", "Free valuation · no sign-up")}
          </p>
          <h1 className="mt-1 font-display text-title2 font-semibold tracking-tight text-foreground sm:text-title1">
            {t("quiz.title", "What's your car worth?")}
          </h1>
        </div>

        {/* Progress */}
        <div className="mb-5" aria-label={t("quiz.progressAria", "Progress")}>
          <ol className="mb-2 flex justify-between text-caption font-semibold text-muted-foreground">
            {stepLabels.map((label, i) => (
              <li key={label} aria-current={i === step ? "step" : undefined} className={cn(i <= step && "text-foreground")}>
                {label}
              </li>
            ))}
          </ol>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressPct)}>
            {/* scaleX (transform-only) with a spring instead of animating width. */}
            <m.div
              className="h-full w-full origin-left rounded-full bg-primary"
              initial={false}
              animate={{ scaleX: progressPct / 100 }}
              transition={motionStill ? { duration: 0 } : spring.smooth}
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6">
          <AnimatePresence mode="wait" initial={false} custom={nav.dir}>
          <m.div
            key={navPos}
            custom={nav.dir}
            variants={motionStill ? stepFade : stepSlide}
            initial="enter"
            animate="center"
            exit="exit"
          >
          {step === 0 && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (step0Valid) setStep(1);
              }}
              className="space-y-4"
            >
              <h2 ref={headingRef} tabIndex={-1} className="text-callout font-semibold text-foreground outline-none">
                {t("quiz.s0.title", "Which car?")}
              </h2>
              <div>
                <label htmlFor="q-make" className="mb-1.5 block text-footnote font-semibold text-muted-foreground">{t("common.make", "Make")}</label>
                <SimpleSelect
                  id="q-make"
                  value={make}
                  onValueChange={(v) => { setMake(v); setModel(""); }}
                  placeholder={t("common.selectMake", "Select make")}
                  options={makes.map((m) => ({ value: m.make, label: m.make }))}
                />
              </div>
              <div>
                <label htmlFor="q-model" className="mb-1.5 block text-footnote font-semibold text-muted-foreground">{t("common.model", "Model")}</label>
                <SimpleSelect
                  id="q-model"
                  value={model}
                  onValueChange={setModel}
                  disabled={!make}
                  placeholder={make && models.length === 0 ? t("quiz.loadingModels", "Loading models…") : t("common.selectModel", "Select model")}
                  options={models.map((m) => ({ value: m.model, label: m.model }))}
                />
              </div>
              <div>
                <label htmlFor="q-year" className="mb-1.5 block text-footnote font-semibold text-muted-foreground">{t("quiz.year", "Year of manufacture")}</label>
                <SimpleSelect
                  id="q-year"
                  value={String(year)}
                  onValueChange={(v) => setYear(Number(v))}
                  options={YEARS.map((y) => ({ value: String(y), label: y }))}
                />
              </div>
              <button type="submit" disabled={!step0Valid} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-body font-semibold text-primary-foreground disabled:opacity-40">
                {t("quiz.next", "Next")} <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            </form>
          )}

          {step === 1 && (
            <form onSubmit={(e) => { e.preventDefault(); goToQuiz(); }} className="space-y-5">
              <h2 ref={headingRef} tabIndex={-1} className="text-callout font-semibold text-foreground outline-none">
                {t("quiz.s1.title", "Mileage and registration")}
              </h2>
              <fieldset>
                <legend className="mb-2 text-footnote font-semibold text-muted-foreground">{t("quiz.registration", "Registration")}</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {([
                    ["used", t("quiz.reg.used", "Registered (used)")],
                    ["reconditioned", t("quiz.reg.recon", "Unregistered (recondition)")],
                    ["brand_new", t("quiz.reg.new", "Brand new")],
                  ] as Array<[Registration, string]>).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={registration === value}
                      onClick={() => setRegistration(value)}
                      className={cn(chipBase, registration === value ? "border-primary bg-primary/15 text-foreground" : "border-border bg-surface text-foreground hover:border-primary/40")}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div>
                <label htmlFor="q-km" className="mb-1.5 block text-footnote font-semibold text-muted-foreground">{t("quiz.mileage", "Mileage (km)")}</label>
                <input
                  id="q-km"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={t("quiz.mileagePh", "e.g. 65000")}
                  className={cn(fieldClass, "num")}
                  value={mileage}
                  onChange={(e) => setMileage(e.target.value.replace(/[^\d,]/g, ""))}
                />
              </div>
              <div>
                <label htmlFor="q-district" className="mb-1.5 block text-footnote font-semibold text-muted-foreground">{t("quiz.district", "District")}</label>
                <SimpleSelect
                  id="q-district"
                  value={district}
                  onValueChange={setDistrict}
                  options={SRI_LANKA_DISTRICTS.map((d) => ({ value: d, label: d }))}
                />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setStep(0)} className="inline-flex h-12 items-center justify-center gap-1.5 rounded-full border border-border bg-card px-5 text-body font-semibold text-foreground">
                  <ArrowLeft className="h-4 w-4" aria-hidden /> {t("quiz.back", "Back")}
                </button>
                <button type="submit" disabled={!step1Valid} className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-primary text-body font-semibold text-primary-foreground disabled:opacity-40">
                  {t("quiz.next", "Next")} <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </form>
          )}

          {step === 2 && (() => {
            const q = QUIZ_QUESTIONS[qIndex];
            const def = QUESTIONS[q];
            return (
              <div className="space-y-4">
                <p className="text-caption font-semibold text-muted-foreground">
                  {t("quiz.qCount", "Question {n} of {total}", { n: qIndex + 1, total: QUIZ_QUESTIONS.length })}
                </p>
                <h2 ref={headingRef} tabIndex={-1} className="text-callout font-semibold text-foreground outline-none">{def.title}</h2>
                <div className="grid gap-2">
                  {def.options.map((o) => (
                    <m.button
                      key={o.value}
                      type="button"
                      {...(motionStill ? {} : press)}
                      onClick={() => answer(q, o.value)}
                      aria-pressed={answers[q] === o.value}
                      className={cn(chipBase, "justify-between", answers[q] === o.value ? "border-primary bg-primary/15" : "border-border bg-surface hover:border-primary/40", "text-foreground")}
                    >
                      {o.label}
                      {answers[q] === o.value ? (
                        <m.span
                          initial={motionStill ? false : { scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={spring.expressive}
                          className="inline-flex"
                        >
                          <Check className="h-4 w-4 text-primary" aria-hidden />
                        </m.span>
                      ) : null}
                    </m.button>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => (qIndex === 0 ? setStep(1) : setQIndex((i) => i - 1))}
                    className="inline-flex min-h-11 items-center gap-1.5 text-footnote font-semibold text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden /> {t("quiz.back", "Back")}
                  </button>
                  <button type="button" onClick={skipQuestion} className="inline-flex min-h-11 items-center text-footnote font-semibold text-muted-foreground hover:text-foreground">
                    {t("quiz.skip", "Skip")}
                  </button>
                </div>
              </div>
            );
          })()}

          {step === 3 && (
            <div className="space-y-4" aria-live="polite">
              <h2 ref={headingRef} tabIndex={-1} className="text-callout font-semibold text-foreground outline-none">
                {year} {make} {model}
              </h2>

              {loading && (
                <div className="space-y-2" aria-busy="true">
                  <p className="text-footnote text-muted-foreground">{t("quiz.loading", "Checking comparable listings…")}</p>
                  <div className="h-20 animate-pulse rounded-xl bg-surface" />
                </div>
              )}

              {!loading && failed && (
                <div role="alert" className="flex items-start gap-2 rounded-xl border border-deal-caution/30 bg-deal-caution/10 p-3 text-footnote text-foreground">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-deal-caution-text" aria-hidden />
                  <span>
                    {t("quiz.noData", "We don't have enough comparable ads for this car to give an honest range. Try a nearby year, or check similar listings.")}
                  </span>
                </div>
              )}

              {!loading && result && band && (
                <>
                  <div className="rounded-2xl border border-primary/20 bg-surface p-4">
                    <p className="text-caption font-semibold text-muted-foreground">{t("quiz.rangeLabel", "Typical asking range for similar cars")}</p>
                    <p className="num mt-1 text-title1 font-bold leading-tight tracking-tight text-foreground">
                      {lkr(result.low)} – {lkr(result.high)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5 text-caption font-semibold">
                      <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-primary-bright">
                        <ShieldCheck className="h-3 w-3" aria-hidden /> {confidenceLabel}
                      </span>
                      <span className="rounded-full border border-border bg-card px-2.5 py-1 text-muted-foreground">
                        {t("quiz.comps", "{n} comparable ads", { n: result.comparable_count.toLocaleString() })}
                      </span>
                      {result.source === "snapshot" && (
                        <span className="rounded-full border border-deal-caution/30 bg-deal-caution/10 px-2.5 py-1 text-deal-caution-text">
                          {t("quiz.snapshot", "From saved data — live service unavailable")}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Where this car sits in the range */}
                  <div className="rounded-xl border border-border bg-surface p-4">
                    <p className="text-footnote font-semibold text-foreground">
                      {position === "upper"
                        ? t("quiz.pos.upper", "Your answers point to the upper part of the range")
                        : position === "lower"
                          ? t("quiz.pos.lower", "Your answers point to the lower part of the range")
                          : t("quiz.pos.middle", "Your answers point to the middle of the range")}
                    </p>
                    <div className="relative mt-3 h-2 rounded-full bg-muted" aria-hidden>
                      <m.div
                        className="absolute inset-y-0 rounded-full bg-primary"
                        initial={motionStill ? false : { opacity: 0, scaleX: 0.2 }}
                        animate={{ opacity: 1, scaleX: 1 }}
                        transition={{ ...spring.smooth, delay: 0.15 }}
                        style={{
                          left: `${((band.from - result.low) / Math.max(1, result.high - result.low)) * 100}%`,
                          width: `${((band.to - band.from) / Math.max(1, result.high - result.low)) * 100}%`,
                        }}
                      />
                    </div>
                    <p className="num mt-2 text-footnote font-semibold text-foreground">
                      ≈ {lkr(band.from)} – {lkr(band.to)}
                    </p>
                    <p className="mt-1 text-caption text-muted-foreground">
                      {t("quiz.posNote", "A rule of thumb from your answers. It doesn't change the market range, which comes from real ads.")}
                    </p>
                  </div>

                  {flags.length > 0 && (
                    <ul className="space-y-2">
                      {flags.map((f) => (
                        <li key={f.key} className={cn("flex items-start gap-2 rounded-xl border p-3 text-footnote", f.severity === "high" ? "border-deal-high/30 bg-deal-high/10" : "border-deal-caution/30 bg-deal-caution/10")}>
                          <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", f.severity === "high" ? "text-deal-high-text" : "text-deal-caution-text")} aria-hidden />
                          <span className="text-foreground">{FLAG_TEXT[f.key]}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <p className="flex items-start gap-1.5 text-caption text-muted-foreground">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>
                      {t("quiz.honesty", "These are asking prices. Final sale prices are usually lower after negotiation.")}{" "}
                      <a href={howWePriceHref("askingVsSale")} className="font-semibold text-primary-bright">{t("quiz.howLink", "How we score prices")}</a>
                    </span>
                  </p>

                  {fullAccess && (
                    <SellerFairAskCard marketMedian={result.median} make={make} model={model} year={year} />
                  )}
                </>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <Link to={hubHref} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-5 text-footnote font-semibold text-primary-foreground no-underline hover:bg-primary/90">
                  {t("quiz.seeSimilar", "See similar listings")} <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <button type="button" onClick={restart} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-5 text-footnote font-semibold text-foreground">
                  <RotateCcw className="h-4 w-4" aria-hidden /> {t("quiz.restart", "Start over")}
                </button>
              </div>
            </div>
          )}
          </m.div>
          </AnimatePresence>
        </div>
      </PageBody>
    </PageCanvas>
  );
}
