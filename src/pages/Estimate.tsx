import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ArrowRight, Car, Check, Gauge, Info, RotateCcw, SearchX, ShieldCheck } from "lucide-react";
import { AnimatePresence, m, type Variants } from "motion/react";
import { estimatePrice, getMakes, getModels, getSnapshotModelComps } from "@/services/api";
import { SRI_LANKA_DISTRICTS } from "@/data/districts";
import { SellerFairAskCard } from "@/components/SellerFairAskCard";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { SimpleSelect } from "@/components/ui/select";
import { AdornedInput, AnimatedLkr, ChoiceChips, Field, Notice, ToolGrid, ToolPage } from "@/components/tools/ToolKit";
import { useAppPreferences } from "@/lib/appPreferences";
import { useAuth } from "@/lib/authContext";
import { hasFullPlatformAccess } from "@/lib/planLimits";
import { howWePriceHref } from "@/lib/howWePrice";
import { cn } from "@/lib/utils";
import { duration, ease, spring, useReducedMotionOrLowData } from "@/lib/motion";
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
 * /estimate — valuation as a short quiz (ui/features; kit + tool template in web/p1-tools).
 * Car → mileage/registration → 5 one-tap condition questions → range.
 * No sign-up. The estimate request starts as soon as step 2 is done, so the
 * result is ready by the time the quiz ends. Live estimate API first, then
 * saved snapshot comps through the offline FMV engine. On desktop a sticky
 * summary shows the car and, once ready, the range.
 */

type Step = 0 | 1 | 2 | 3;

const NOW_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: NOW_YEAR + 1 - 1990 + 1 }, (_, i) => NOW_YEAR + 1 - i);

function slug(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Direction-aware horizontal step slide (dir 1 = forward, -1 = back). */
const stepSlide: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 24 }),
  center: { opacity: 1, x: 0, transition: { duration: duration.medium, ease: ease.decelerate } },
  exit: (dir: number) => ({ opacity: 0, x: dir * -24, transition: { duration: duration.short, ease: ease.accelerate } }),
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
  const [makesState, setMakesState] = useState<"loading" | "ready" | "error">("loading");
  const [makesAttempt, setMakesAttempt] = useState(0);
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
    let cancelled = false;
    setMakesState("loading");
    getMakes()
      .then((list) => {
        if (cancelled) return;
        setMakes(list);
        setMakesState(list.length ? "ready" : "error");
      })
      .catch(() => {
        if (cancelled) return;
        setMakes([]);
        setMakesState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [makesAttempt]);
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

  const registrationOptions: Array<{ value: Registration; label: string }> = [
    { value: "used", label: t("quiz.reg.used", "Registered (used)") },
    { value: "reconditioned", label: t("quiz.reg.recon", "Unregistered (recondition)") },
    { value: "brand_new", label: t("quiz.reg.new", "Brand new") },
  ];
  const registrationLabel = registrationOptions.find((o) => o.value === registration)?.label;
  const answeredCount = QUIZ_QUESTIONS.filter((q) => answers[q]).length;
  const carLabel = [step0Valid ? year : null, make, model].filter(Boolean).join(" ");

  const stepHeading = (text: string) => (
    <h2 ref={headingRef} tabIndex={-1} className="text-title3 font-semibold text-foreground outline-none">
      {text}
    </h2>
  );

  const quizCard = (
    <Card padding="none" className="overflow-hidden">
      {/* Progress */}
      <div className="border-b border-separator px-5 pb-4 pt-5 sm:px-6" aria-label={t("quiz.progressAria", "Progress")}>
        <ol className="mb-2.5 flex justify-between gap-2 text-caption font-medium text-label-2">
          {stepLabels.map((label, i) => (
            <li
              key={label}
              aria-current={i === step ? "step" : undefined}
              className={cn("inline-flex items-center gap-1.5 transition-colors duration-short ease-standard", i <= step && "text-foreground")}
            >
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full border text-caption tabular-nums transition-colors duration-short ease-standard",
                  i < step ? "border-transparent bg-primary text-primary-foreground" : i === step ? "border-primary text-primary" : "border-border",
                )}
                aria-hidden
              >
                {i < step ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span className={cn(i === step ? "inline" : "hidden sm:inline")}>{label}</span>
            </li>
          ))}
        </ol>
        <div
          className="h-1 overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progressPct)}
        >
          {/* scaleX (transform-only) with a spring instead of animating width. */}
          <m.div
            className="h-full w-full origin-left rounded-full bg-primary"
            initial={false}
            animate={{ scaleX: progressPct / 100 }}
            transition={motionStill ? { duration: 0 } : spring.smooth}
          />
        </div>
      </div>

      <div className="overflow-hidden p-5 sm:p-6">
        <AnimatePresence mode="wait" initial={false} custom={nav.dir}>
          <m.div key={navPos} custom={nav.dir} variants={motionStill ? stepFade : stepSlide} initial="enter" animate="center" exit="exit">
            {step === 0 && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (step0Valid) setStep(1);
                }}
                className="space-y-4"
              >
                {stepHeading(t("quiz.s0.title", "Which car?"))}
                <Field label={t("common.make", "Make")} htmlFor="q-make">
                  <SimpleSelect
                    id="q-make"
                    value={make}
                    onValueChange={(v) => {
                      setMake(v);
                      setModel("");
                    }}
                    disabled={makesState === "loading" && makes.length === 0}
                    placeholder={makesState === "loading" ? t("tools.est.loadingMakes", "Loading makes…") : t("common.selectMake", "Select make")}
                    options={makes.map((mk) => ({ value: mk.make, label: mk.make }))}
                  />
                </Field>
                {makesState === "error" ? (
                  <Notice
                    tone="caution"
                    role="alert"
                    title={t("tools.est.makesError", "We couldn't load the list of makes.")}
                    action={
                      <Button type="button" variant="secondary" size="sm" onClick={() => setMakesAttempt((n) => n + 1)}>
                        <RotateCcw aria-hidden />
                        {t("ui.error.retry", "Try again")}
                      </Button>
                    }
                  />
                ) : null}
                <Field label={t("common.model", "Model")} htmlFor="q-model">
                  <SimpleSelect
                    id="q-model"
                    value={model}
                    onValueChange={setModel}
                    disabled={!make}
                    placeholder={make && models.length === 0 ? t("quiz.loadingModels", "Loading models…") : t("common.selectModel", "Select model")}
                    options={models.map((md) => ({ value: md.model, label: md.model }))}
                  />
                </Field>
                <Field label={t("quiz.year", "Year of manufacture")} htmlFor="q-year">
                  <SimpleSelect
                    id="q-year"
                    value={String(year)}
                    onValueChange={(v) => setYear(Number(v))}
                    options={YEARS.map((y) => ({ value: String(y), label: y }))}
                  />
                </Field>
                <Button type="submit" size="lg" disabled={!step0Valid} className="w-full">
                  {t("quiz.next", "Next")} <ArrowRight aria-hidden />
                </Button>
              </form>
            )}

            {step === 1 && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  goToQuiz();
                }}
                className="space-y-5"
              >
                {stepHeading(t("quiz.s1.title", "Mileage and registration"))}
                <ChoiceChips label={t("quiz.registration", "Registration")} value={registration as Registration} options={registrationOptions} onChange={setRegistration} />
                <Field label={t("quiz.mileage", "Mileage (km)")} htmlFor="q-km">
                  <AdornedInput
                    id="q-km"
                    inputMode="numeric"
                    autoComplete="off"
                    suffix="km"
                    placeholder={t("quiz.mileagePh", "e.g. 65000")}
                    value={mileage}
                    onChange={(e) => setMileage(e.target.value.replace(/[^\d,]/g, ""))}
                  />
                </Field>
                <Field label={t("quiz.district", "District")} htmlFor="q-district">
                  <SimpleSelect
                    id="q-district"
                    value={district}
                    onValueChange={setDistrict}
                    options={SRI_LANKA_DISTRICTS.map((d) => ({ value: d, label: d }))}
                  />
                </Field>
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" size="lg" onClick={() => setStep(0)}>
                    <ArrowLeft aria-hidden /> {t("quiz.back", "Back")}
                  </Button>
                  <Button type="submit" size="lg" disabled={!step1Valid} className="flex-1">
                    {t("quiz.next", "Next")} <ArrowRight aria-hidden />
                  </Button>
                </div>
              </form>
            )}

            {step === 2 &&
              (() => {
                const q = QUIZ_QUESTIONS[qIndex];
                const def = QUESTIONS[q];
                return (
                  <div className="space-y-4">
                    <p className="text-footnote font-medium text-label-2">
                      {t("quiz.qCount", "Question {n} of {total}", { n: qIndex + 1, total: QUIZ_QUESTIONS.length })}
                    </p>
                    {stepHeading(def.title)}
                    <div className="grid gap-2" role="group" aria-label={def.title}>
                      {def.options.map((o) => {
                        const selected = answers[q] === o.value;
                        return (
                          <Chip
                            key={o.value}
                            selected={selected}
                            onClick={() => answer(q, o.value)}
                            className="h-12 w-full justify-between rounded-control px-4 text-body"
                          >
                            {o.label}
                            {selected ? (
                              <m.span
                                initial={motionStill ? false : { scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={spring.expressive}
                                className="inline-flex"
                              >
                                <Check aria-hidden />
                              </m.span>
                            ) : null}
                          </Chip>
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-between">
                      <Button type="button" variant="ghost" onClick={() => (qIndex === 0 ? setStep(1) : setQIndex((i) => i - 1))}>
                        <ArrowLeft aria-hidden /> {t("quiz.back", "Back")}
                      </Button>
                      <Button type="button" variant="ghost" onClick={skipQuestion}>
                        {t("quiz.skip", "Skip")}
                      </Button>
                    </div>
                  </div>
                );
              })()}

            {step === 3 && (
              <div className="space-y-4" aria-live="polite">
                {stepHeading(`${year} ${make} ${model}`)}

                {loading && (
                  <div className="space-y-3" aria-busy="true">
                    <p className="text-footnote text-label-2">{t("quiz.loading", "Checking comparable listings…")}</p>
                    <Skeleton className="h-28 w-full" />
                    <Skeleton className="h-24 w-full" />
                  </div>
                )}

                {!loading && failed && (
                  <EmptyState
                    icon={SearchX}
                    className="py-8"
                    title={t("tools.est.noDataTitle", "Not enough comparable ads")}
                    body={t(
                      "quiz.noData",
                      "We don't have enough comparable ads for this car to give an honest range. Try a nearby year, or check similar listings.",
                    )}
                  />
                )}

                {!loading && result && band && (
                  <div className="content-in space-y-4">
                    <div className="rounded-card border border-primary/20 bg-primary/5 p-4 sm:p-5">
                      <p className="text-footnote font-semibold text-primary">{t("quiz.rangeLabel", "Typical asking range for similar cars")}</p>
                      <p className="mt-1.5 font-display text-title1 font-semibold text-foreground">
                        <AnimatedLkr value={result.low} /> <span className="text-label-2">–</span> <AnimatedLkr value={result.high} />
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <Badge variant="info">
                          <ShieldCheck aria-hidden /> {confidenceLabel}
                        </Badge>
                        <Badge variant="neutral">{t("quiz.comps", "{n} comparable ads", { n: result.comparable_count.toLocaleString() })}</Badge>
                        {result.source === "snapshot" && <Badge variant="warning">{t("quiz.snapshot", "From saved data — live service unavailable")}</Badge>}
                      </div>
                    </div>

                    {/* Where this car sits in the range */}
                    <div className="rounded-card border border-border bg-surface-2 p-4">
                      <p className="text-footnote font-semibold text-foreground">
                        {position === "upper"
                          ? t("quiz.pos.upper", "Your answers point to the upper part of the range")
                          : position === "lower"
                            ? t("quiz.pos.lower", "Your answers point to the lower part of the range")
                            : t("quiz.pos.middle", "Your answers point to the middle of the range")}
                      </p>
                      <div className="relative mt-3 h-2 rounded-full bg-surface-3" aria-hidden>
                        <m.div
                          className="absolute inset-y-0 origin-left rounded-full bg-primary"
                          initial={motionStill ? false : { opacity: 0, scaleX: 0.2 }}
                          animate={{ opacity: 1, scaleX: 1 }}
                          transition={{ ...spring.smooth, delay: 0.15 }}
                          style={{
                            left: `${((band.from - result.low) / Math.max(1, result.high - result.low)) * 100}%`,
                            width: `${((band.to - band.from) / Math.max(1, result.high - result.low)) * 100}%`,
                          }}
                        />
                      </div>
                      <p className="mt-2 text-footnote font-semibold tabular-nums text-foreground">
                        ≈ <AnimatedLkr value={band.from} /> – <AnimatedLkr value={band.to} />
                      </p>
                      <p className="mt-1 text-caption text-label-2">
                        {t("quiz.posNote", "A rule of thumb from your answers. It doesn't change the market range, which comes from real ads.")}
                      </p>
                    </div>

                    {flags.length > 0 && (
                      <ul className="space-y-2">
                        {flags.map((f) => (
                          <li key={f.key}>
                            <Notice tone={f.severity === "high" ? "danger" : "caution"} icon={AlertTriangle}>
                              {FLAG_TEXT[f.key]}
                            </Notice>
                          </li>
                        ))}
                      </ul>
                    )}

                    <p className="flex items-start gap-1.5 text-caption text-label-2">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span>
                        {t("quiz.honesty", "These are asking prices. Final sale prices are usually lower after negotiation.")}{" "}
                        <a href={howWePriceHref("askingVsSale")} className="font-semibold text-primary">
                          {t("quiz.howLink", "How we score prices")}
                        </a>
                      </span>
                    </p>

                    {fullAccess && <SellerFairAskCard marketMedian={result.median} make={make} model={model} year={year} />}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button asChild>
                    <Link to={hubHref}>
                      {t("quiz.seeSimilar", "See similar listings")} <ArrowRight aria-hidden />
                    </Link>
                  </Button>
                  <Button type="button" variant="secondary" onClick={restart}>
                    <RotateCcw aria-hidden /> {t("quiz.restart", "Start over")}
                  </Button>
                </div>
              </div>
            )}
          </m.div>
        </AnimatePresence>
      </div>
    </Card>
  );

  const summaryRow = (label: string, value: React.ReactNode, done: boolean) => (
    <div className="flex items-baseline justify-between gap-4 text-footnote">
      <dt className="text-label-2">{label}</dt>
      <dd className={cn("text-right font-semibold", done ? "text-foreground" : "text-label-3")}>{value}</dd>
    </div>
  );

  /** Desktop-only sticky summary: what we're valuing, and the range once it's ready. */
  const summary = (
    <Card className="hidden lg:block" aria-label={t("tools.est.summary", "Your car")}>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-control bg-primary/10 text-primary">
          <Car className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-footnote font-semibold text-primary">{t("tools.est.summary", "Your car")}</p>
          <p className="truncate text-callout font-semibold text-foreground">{carLabel || t("tools.est.pickCar", "Pick a make and model")}</p>
        </div>
      </div>
      <dl className="mt-5 space-y-2.5 border-t border-separator pt-4">
        {summaryRow(t("quiz.registration", "Registration"), registrationLabel ?? "—", Boolean(registrationLabel))}
        {summaryRow(
          t("quiz.mileage", "Mileage (km)"),
          mileage ? `${Number(mileage.replace(/[^\d]/g, "")).toLocaleString("en-US")} km` : "—",
          Boolean(mileage),
        )}
        {summaryRow(t("quiz.district", "District"), district, step > 0)}
        {summaryRow(
          t("quiz.step.condition", "Condition"),
          t("tools.est.answered", "{n} of {total} answered", { n: answeredCount, total: QUIZ_QUESTIONS.length }),
          answeredCount > 0,
        )}
      </dl>
      <div className="mt-5 border-t border-separator pt-4">
        <p className="text-footnote font-semibold text-label-2">{t("quiz.rangeLabel", "Typical asking range for similar cars")}</p>
        {step >= 2 && loading ? (
          <Skeleton className="mt-2 h-9 w-4/5 rounded-control" />
        ) : result && step >= 2 ? (
          <p className="content-in mt-1.5 font-display text-title2 font-semibold text-foreground">
            <AnimatedLkr value={result.low} /> <span className="text-label-2">–</span> <AnimatedLkr value={result.high} />
          </p>
        ) : (
          <p className="mt-1.5 text-footnote text-label-2">{t("tools.est.rangeLater", "Ready after the car and mileage steps.")}</p>
        )}
      </div>
    </Card>
  );

  return (
    <ToolPage
      header={
        <PageHeader eyebrow={t("quiz.eyebrow", "Free valuation · no sign-up")} eyebrowIcon={Gauge} title={t("quiz.title", "What's your car worth?")} />
      }
    >
      <ToolGrid form={quizCard} result={summary} />
    </ToolPage>
  );
}
