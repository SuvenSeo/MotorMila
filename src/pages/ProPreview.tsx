import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Download, Lock, Sparkles } from "lucide-react";
import { PageCanvas } from "@/components/PageCanvas";
import { PageBody } from "@/components/PageBody";
import { CineHeader } from "@/components/CineHeader";
import { CineFigure, CineSection } from "@/components/CineSection";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppPreferences } from "@/lib/appPreferences";
import { formatPriceLkrMillions } from "@/lib/formatting";
import { PLAN_PRICES, formatLkr } from "@/lib/pricingContent";
import { visuals } from "@/lib/visualAssets";
import { getProVehicleLanes } from "@/services/api";
import { getStoredAuthToken } from "@/lib/authToken";

export type ProPreviewSampleLane = {
  name: string;
  listings: number;
  median: string;
  district: string;
  /** Rows visible in the sample (free teaser depth). */
  visibleCount: number;
};

export type ProPreviewGap = {
  title: string;
  body: string;
  meta: string;
};

export type ProPreviewProps = {
  sampleLane?: ProPreviewSampleLane;
  gaps?: ProPreviewGap[];
  /** Destination for the trial CTA (self-serve signup). */
  trialCtaTo?: string;
};

export const PRO_PREVIEW_SAMPLE_LANE_DEFAULT: ProPreviewSampleLane = {
  name: "Toyota Aqua",
  listings: 824,
  median: "Rs. 7.8M",
  district: "Colombo",
  visibleCount: 12,
};

export const PRO_PREVIEW_GAPS_DEFAULT: ProPreviewGap[] = [
  {
    title: "District opportunity profiles",
    body: "25 districts ranked by demand, velocity, and price gaps — locked until your trial.",
    meta: "25 districts",
  },
  {
    title: "Trend studio + full history",
    body: "Full price-index history beyond the 6-month free window, with exportable series.",
    meta: "Full history",
  },
  {
    title: "Export packs",
    body: "Executive PDF, Word brief, CSV data pack, and JSON snapshot generated from live lanes.",
    meta: "PDF · Word · CSV · JSON",
  },
];

/** The lock tag on a gated card: says what it takes, never hides the content. */
function LockTag({ label }: { label?: string }) {
  const { t } = useAppPreferences();
  return (
    <span className="inline-flex items-center gap-1.5 text-caption font-semibold text-primary">
      <Lock aria-hidden className="h-3.5 w-3.5" />
      {label ?? t("pro.unlockWithPro", "Unlock with Pro")}
    </span>
  );
}

export default function ProPreview({ sampleLane, gaps, trialCtaTo = "/pricing#get-started" }: ProPreviewProps) {
  const { t } = useAppPreferences();
  // Data-only feed (B2-D): one REAL lane when the API has data. Until it
  // answers we show a skeleton; if it can't, the default lane is labelled as
  // an example (never as live data).
  const [liveLane, setLiveLane] = useState<ProPreviewSampleLane | null>(null);
  const [laneState, setLaneState] = useState<"loading" | "live" | "example">(sampleLane ? "live" : "loading");

  useEffect(() => {
    if (sampleLane) return;
    // Pro lanes need a session: signed-out visitors (most preview traffic) get the
    // labelled example straight away instead of a guaranteed 401.
    if (!getStoredAuthToken()) {
      setLaneState("example");
      return;
    }
    let cancelled = false;
    getProVehicleLanes({ limit: 1 })
      .then((lanes) => {
        if (cancelled) return;
        if (lanes.length === 0) {
          setLaneState("example");
          return;
        }
        const lane = lanes[0];
        setLiveLane({
          name: `${lane.make} ${lane.model}`.trim(),
          listings: lane.listing_count,
          median: formatPriceLkrMillions(lane.median_price_lkr ?? lane.avg_price_lkr),
          district: lane.top_district || "Sri Lanka",
          visibleCount: Math.max(1, Math.min(lane.listing_count, 12)),
        });
        setLaneState("live");
      })
      .catch(() => {
        if (!cancelled) setLaneState("example");
      });
    return () => {
      cancelled = true;
    };
  }, [sampleLane]);

  const lane = { ...PRO_PREVIEW_SAMPLE_LANE_DEFAULT, ...liveLane, ...sampleLane };
  // Default cards are translated; caller-supplied gaps render as given.
  const gapCards =
    gaps ??
    PRO_PREVIEW_GAPS_DEFAULT.map((gap, i) => {
      const keys = [
        ["acct.proPreview.gapDistricts.title", "acct.proPreview.gapDistricts.body", "acct.proPreview.gapDistricts.meta"],
        ["acct.proPreview.gapHistory.title", "acct.proPreview.gapHistory.body", "acct.proPreview.gapHistory.meta"],
        ["acct.proPreview.gapExports.title", "acct.proPreview.gapExports.body", "acct.proPreview.gapExports.meta"],
      ][i];
      return keys ? { title: t(keys[0], gap.title), body: t(keys[1], gap.body), meta: t(keys[2], gap.meta) } : gap;
    });
  // What Pro unlocks: this page's three, plus the two Pro plan features on
  // /pricing that they don't already cover (same copy, same keys).
  const unlocks = [
    t("acct.proPreview.unlock1", "Pro dashboard with deal scores"),
    t("acct.proPreview.unlock2", "District detail and full price history"),
    t("acct.proPreview.unlock3", "Exports: PDF, Word, CSV, JSON"),
    t("pricing.tier.pro.f.allTaxCustomsUpdates", "All tax & customs updates"),
    t("pricing.tier.pro.f.moreAlertsIncludingWhatsapp", "More alerts, including WhatsApp"),
  ];
  const reports = [
    t("acct.proPreview.report1", "Executive PDF"),
    t("acct.proPreview.report2", "Editable Word brief"),
    t("acct.proPreview.report3", "CSV data pack"),
  ];
  const monthly = PLAN_PRICES.pro.monthly;
  const yearly = PLAN_PRICES.pro.yearly;

  return (
    <PageCanvas ambient="none">
      <CineHeader
        eyebrow={t("pro.previewEyebrow", "Pro Preview")}
        lead={t("proPreview.cine.lead", "Pro workspace")}
        accent={t("proPreview.cine.accent", "preview.")}
        body={t(
          "pro.previewBody",
          "See the depth of lane drill-downs, district profiles, and export packs before you sign in.",
        )}
        image={visuals.darkGarageSilhouette}
        imagePosition="80% 70%"
      >
        <CineFigure
          label={t("proPreview.cine.priceKicker", "Planned Pro price")}
          value={
            <>
              <span className="sr-only">{formatLkr(monthly)} {t("pricing.tier.free.priceNote", "/mo")}</span>
              <span aria-hidden>
                {formatLkr(monthly)}
                <span className="ml-1.5 align-baseline font-sans text-body font-medium tracking-normal text-white/60">
                  {t("pricing.tier.free.priceNote", "/mo")}
                </span>
              </span>
            </>
          }
          caption={t("proPreview.cine.priceCaption", "Or {yearly} a year, two months free. Free during beta, and we'll email you before it starts.", {
            yearly: formatLkr(yearly),
          })}
        />
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button asChild size="lg">
            <Link to={trialCtaTo}>
              <Sparkles aria-hidden /> {t("shell.pro.notify", "Notify me")}
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link to="/pricing">{t("pro.seePricing", "See pricing")}</Link>
          </Button>
        </div>
      </CineHeader>

      <PageBody className="space-y-14 pb-20 pt-8 lg:space-y-20 lg:pt-12">
        {/* 01 — the one unlocked item: a sample lane as Pro shows it */}
        <CineSection
          index="01"
          id="pro-preview-lane"
          title={t("acct.proPreview.sampleLane", "Sample lane")}
          body={t("proPreview.cine.laneBody", "One make-and-model lane, the way Pro shows every lane.")}
        >
          <div className="cine-panel theme-dark p-6 text-foreground sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-callout font-semibold text-white">{laneState === "loading" ? "\u00a0" : lane.name}</p>
              {laneState === "live" ? (
                <Badge variant="success" className="content-in">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-deal-good" />
                  {t("acct.proPreview.liveSample", "Live sample")}
                </Badge>
              ) : laneState === "example" ? (
                <Badge variant="neutral" className="content-in">{t("acct.proPreview.example", "Example")}</Badge>
              ) : null}
            </div>
            {laneState === "loading" ? (
              <div className="mt-6 space-y-3" aria-busy="true">
                <Skeleton shape="text" className="h-10 w-48 bg-foreground/10" />
                <Skeleton shape="text" className="h-4 w-4/5 bg-foreground/10" />
              </div>
            ) : (
              <div className="content-in">
                <dl className="mt-6 grid grid-cols-2 gap-5 border-t border-foreground/10 pt-5 sm:grid-cols-3 sm:gap-6">
                  <div className="col-span-2 sm:col-span-1">
                    <dt className="text-caption text-white/55">{t("acct.proPreview.colMedian", "Median")}</dt>
                    <dd className="cine-card__price mt-1.5 text-[clamp(1.75rem,1.4rem+1.2vw,2.5rem)] leading-none text-white">{lane.median}</dd>
                  </div>
                  <div>
                    <dt className="text-caption text-white/55">{t("acct.proPreview.colListings", "Listings")}</dt>
                    <dd className="cine-card__price mt-1.5 text-title2 leading-none text-white">
                      <AnimatedNumber value={lane.listings} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-caption text-white/55">{t("acct.proPreview.colArea", "Top area")}</dt>
                    <dd className="mt-1.5 text-title3 font-semibold leading-tight text-white">{lane.district}</dd>
                  </div>
                </dl>
                <p className="mt-6 max-w-2xl text-footnote leading-relaxed text-white/70">
                  {t(
                    "acct.proPreview.showing",
                    "Showing {visible} of {total} {name} listings in {district}. The full lane, district splits and history unlock with Pro.",
                    { visible: String(lane.visibleCount), total: String(lane.listings), name: lane.name, district: lane.district },
                  )}
                </p>
              </div>
            )}
          </div>
        </CineSection>

        {/* 02 — the three views that stay locked until Pro */}
        <CineSection
          index="02"
          id="pro-preview-locked"
          title={t("proPreview.cine.lockedTitle", "Locked until Pro")}
          body={t("proPreview.cine.lockedBody", "Three deeper views that open when Pro launches.")}
        >
          <ul className="grid gap-3 md:grid-cols-3">
            {gapCards.slice(0, 3).map((gap, i) => (
              <li
                key={gap.title}
                className="cine-rise flex h-full list-none flex-col justify-between gap-6 rounded-card border border-border bg-card p-5"
                style={{ "--i": i } as CSSProperties}
              >
                <div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-caption font-semibold tabular-nums text-primary">{String(i + 1).padStart(2, "0")}</span>
                    <span className="text-right text-caption font-semibold text-label-2">{gap.meta}</span>
                  </div>
                  <h3 className="mt-3 text-callout font-semibold text-foreground">{gap.title}</h3>
                  <p className="mt-1.5 text-footnote leading-relaxed text-label-2">{gap.body}</p>
                </div>
                <LockTag />
              </li>
            ))}
          </ul>
        </CineSection>

        {/* 03 — everything Pro unlocks + the report formats */}
        <CineSection index="03" id="pro-preview-unlocks" title={t("acct.proPreview.unlocksTitle", "What Pro unlocks")}>
          <div className="grid gap-10 lg:grid-cols-[1.25fr_0.75fr] lg:gap-16">
            <ul className="cine-list border-y border-border">
              {unlocks.map((item) => (
                <li key={item} className="flex items-start gap-3 py-3.5 text-body text-label-1">
                  <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {item}
                </li>
              ))}
            </ul>
            <div>
              <h3 className="cine-eyebrow text-label-2">{t("acct.proPreview.reportFormats", "Report formats")}</h3>
              <ul className="cine-list mt-3 border-y border-border">
                {reports.map((r) => (
                  <li key={r} className="flex h-12 items-center justify-between text-body text-label-1">
                    <span>{r}</span>
                    <Download aria-hidden className="h-4 w-4 text-label-3" />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </CineSection>

        {/* Close: one clear next step */}
        <div className="cine-panel theme-dark flex flex-col gap-6 p-6 text-foreground sm:p-8 md:flex-row md:items-end md:justify-between">
          <div className="max-w-xl">
            <h2 className="cine-display text-[clamp(1.5rem,1.2rem+1vw,2.25rem)] text-white">
              {t("shell.pricing.ctaTitle", "Get an email when Pro launches.")}
            </h2>
            <p className="mt-3 text-footnote text-white/70">
              {t("shell.pro.previewNote", "Pro is coming soon. MotorMila is free during beta.")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link to={trialCtaTo}>
                <Sparkles aria-hidden /> {t("shell.pro.notify", "Notify me")}
              </Link>
            </Button>
            <Link
              to="/pricing"
              className="group inline-flex items-center gap-1.5 text-footnote font-semibold text-white/80 no-underline hover:text-white"
            >
              {t("pro.seePricing", "See pricing")}
              <ArrowRight aria-hidden className="cine-row__arrow h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </PageBody>
    </PageCanvas>
  );
}
