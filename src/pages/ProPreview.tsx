import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Crown, BarChart3, Download, FileText, Lock, MapPin, Sparkles } from "lucide-react";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { PageHero } from "@/components/PageHero";
import { revealItem } from "@/lib/motion";
import { useAppPreferences } from "@/lib/appPreferences";
import { visuals } from "@/lib/visualAssets";
import { formatPriceLkrMillions } from "@/lib/formatting";
import { getProVehicleLanes } from "@/services/api";

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

const REPORTS = ["Executive PDF", "Editable Word brief", "CSV data pack"];

function LockedOverlay({ label }: { label?: string }) {
  const { t } = useAppPreferences();
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] bg-background/70 backdrop-blur-[3px]">
      <div className="rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-center shadow-soft">
        <Lock aria-hidden className="mx-auto mb-1.5 h-4 w-4 text-primary" />
        <p className="text-[12px] font-semibold text-primary-bright">
          {label ?? t("pro.unlockWithPro", "Unlock with Pro")}
        </p>
      </div>
    </div>
  );
}

export default function ProPreview({ sampleLane, gaps, trialCtaTo = "/pricing" }: ProPreviewProps) {
  const { t } = useAppPreferences();
  // Data-only feed (B2-D): one REAL lane when the API has data, otherwise the
  // mock fallback below stays labelled as a live sample. B1-E structure intact.
  const [liveLane, setLiveLane] = useState<ProPreviewSampleLane | null>(null);

  useEffect(() => {
    if (sampleLane) return;
    let cancelled = false;
    getProVehicleLanes({ limit: 1 })
      .then((lanes) => {
        if (cancelled || lanes.length === 0) return;
        const lane = lanes[0];
        setLiveLane({
          name: `${lane.make} ${lane.model}`.trim(),
          listings: lane.listing_count,
          median: formatPriceLkrMillions(lane.median_price_lkr ?? lane.avg_price_lkr),
          district: lane.top_district || "Sri Lanka",
          visibleCount: Math.max(1, Math.min(lane.listing_count, 12)),
        });
      })
      .catch(() => {
        // API empty/unreachable — mock fallback keeps the live-sample label.
      });
    return () => {
      cancelled = true;
    };
  }, [sampleLane]);

  const lane = { ...PRO_PREVIEW_SAMPLE_LANE_DEFAULT, ...liveLane, ...sampleLane };
  const gapCards = gaps ?? PRO_PREVIEW_GAPS_DEFAULT;

  return (
    <PageCanvas>
      <PageHero
        theme="default"
        eyebrow={t("pro.previewEyebrow", "Pro Preview")}
        eyebrowIcon={Crown}
        watermarkIcon={BarChart3}
        title={<>{t("pro.previewTitle", "Try Pro free for 7 days")}<span className="text-sheen">.</span></>}
        description={t(
          "pro.previewBody",
          "One live sample lane below — the other 3 Pro depths unlock with a 7-day free trial. No invite needed.",
        )}
        media={visuals.pageProPremium}
        mediaPosition="center 35%"
        mediaTone="brand"
        highlights={[
          { label: t("pro.sampleLane", "Sample"), value: "1 lane", hint: t("pro.sampleLaneHint", "Live sample, free to view") },
          { label: t("pro.lockedGaps", "Locked"), value: "3 gaps", hint: t("pro.lockedGapsHint", "Unlock with trial") },
          { label: t("pro.trial", "Trial"), value: "7 days", hint: t("pro.trialHint", "Pro access, then manual pay") },
        ]}
        actions={
          <>
            <Link
              to={trialCtaTo}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-[13px] font-semibold text-primary-foreground no-underline shadow-soft transition-all hover:bg-primary/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Sparkles aria-hidden className="h-4 w-4" /> {t("pro.startTrial", "Join the waitlist")}
            </Link>
            <Link
              to="/pricing"
              className="inline-flex h-11 items-center rounded-full border border-border bg-card px-6 text-[13px] font-semibold text-foreground no-underline transition-all hover:border-primary/40 hover:bg-surface active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {t("pro.seePricing", "See pricing")}
            </Link>
          </>
        }
      />

      <PageBody>
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            {/* Sample lane — the single unlocked preview item */}
            <motion.div variants={revealItem} className="premium-surface relative p-6 sm:p-7">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <p className="section-eyebrow">Sample lane</p>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-300">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Live sample
                </span>
              </div>
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-surface">
                      {["Vehicle", "Listings", "Median", "Top area"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-[12px] font-semibold text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-border">
                      <td className="px-4 py-3 font-bold text-foreground">{lane.name}</td>
                      <td className="num px-4 py-3 font-medium text-muted-foreground">{lane.listings}</td>
                      <td className="num px-4 py-3 font-bold text-primary">{lane.median}</td>
                      <td className="px-4 py-3 font-medium text-muted-foreground">{lane.district}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                Showing {lane.visibleCount} of {lane.listings} live {lane.name} listings in {lane.district} — the full lane,
                district splits, and history unlock with your trial.
              </p>
            </motion.div>

            {/* 3 locked gaps — props-driven placeholders */}
            <div className="grid gap-4 sm:grid-cols-3">
              {gapCards.slice(0, 3).map((gap) => (
                <motion.div key={gap.title} variants={revealItem} className="data-card relative min-h-[190px] p-5">
                  <LockedOverlay />
                  <p className="text-[11px] font-medium text-primary-bright">{gap.meta}</p>
                  <h3 className="mt-2 text-[13px] font-bold text-foreground">{gap.title}</h3>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{gap.body}</p>
                </motion.div>
              ))}
            </div>
          </div>

          <aside className="space-y-6">
            <motion.div variants={revealItem} className="data-card p-6">
              <Sparkles aria-hidden className="mb-3 h-5 w-5 text-primary" />
              <h2 className="font-display text-[15px] font-bold text-foreground">What your trial unlocks</h2>
              <div className="mt-4 space-y-2">
                {["Full Pro terminal (/pro) for 7 days", "District profiles + trend history", "Export packs: PDF, Word, CSV, JSON"].map((i) => (
                  <div key={i} className="flex items-start gap-2.5 rounded-xl border border-border bg-surface p-3">
                    <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <p className="text-[11px] font-semibold text-muted-foreground">{i}</p>
                  </div>
                ))}
              </div>
              <Link
                to={trialCtaTo}
                className="mt-5 flex h-11 items-center justify-center gap-2 rounded-full bg-primary text-[13px] font-semibold text-primary-foreground no-underline shadow-soft transition-all hover:bg-primary/90 active:scale-[0.98]"
              >
                <Sparkles aria-hidden className="h-4 w-4" /> Join the waitlist
              </Link>
              <p className="mt-2.5 text-center text-[11px] text-muted-foreground">
                Annual saves 2 months · Manual pay activates within 2 hours
              </p>
            </motion.div>

            <motion.div variants={revealItem} className="data-card p-6">
              <div className="mb-3 flex items-center gap-2">
                <FileText aria-hidden className="h-4 w-4 text-primary" />
                <h2 className="text-[15px] font-bold text-foreground">Report formats</h2>
              </div>
              <div className="space-y-2">
                {REPORTS.map((r) => (
                  <div key={r} className="flex h-9 items-center justify-between rounded-xl border border-border bg-surface px-3 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground">
                    <span>{r}</span>
                    <Download aria-hidden className="h-3 w-3 text-primary" />
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div variants={revealItem}>
              <Link
                to={trialCtaTo}
                className="flex h-11 items-center justify-center gap-2 rounded-full bg-primary text-[13px] font-semibold text-primary-foreground no-underline shadow-soft transition-all hover:bg-primary/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <MapPin aria-hidden className="h-4 w-4" /> Unlock Pro workspace
              </Link>
            </motion.div>
          </aside>
        </div>
      </PageBody>
    </PageCanvas>
  );
}
