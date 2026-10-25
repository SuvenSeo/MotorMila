import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { m } from "motion/react";
import { Check, Crown, Download, FileText, Lock, Sparkles } from "lucide-react";
import { PageCanvas } from "@/components/PageCanvas";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fadeUp, listItem, listStagger } from "@/lib/motion";
import { useAppPreferences } from "@/lib/appPreferences";
import { formatPriceLkrMillions } from "@/lib/formatting";
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


function LockedOverlay({ label }: { label?: string }) {
  const { t } = useAppPreferences();
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] bg-surface-1/85">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-footnote font-semibold text-primary">
        <Lock aria-hidden className="h-3.5 w-3.5" />
        {label ?? t("pro.unlockWithPro", "Unlock with Pro")}
      </span>
    </div>
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
  const unlocks = [
    t("acct.proPreview.unlock1", "Pro dashboard with deal scores"),
    t("acct.proPreview.unlock2", "District detail and full price history"),
    t("acct.proPreview.unlock3", "Exports: PDF, Word, CSV, JSON"),
  ];
  const reports = [
    t("acct.proPreview.report1", "Executive PDF"),
    t("acct.proPreview.report2", "Editable Word brief"),
    t("acct.proPreview.report3", "CSV data pack"),
  ];

  return (
    <PageCanvas ambient="none">
      <PageHeader
        size="compact"
        eyebrow={t("pro.previewEyebrow", "Pro Preview")}
        eyebrowIcon={Crown}
        title={t("pro.previewTitle", "Pro workspace preview")}
        description={t(
          "pro.previewBody",
          "See the depth of lane drill-downs, district profiles, and export packs before you sign in.",
        )}
        actions={
          <>
            <Button asChild>
              <Link to={trialCtaTo}>
                <Sparkles aria-hidden /> {t("shell.pro.notify", "Notify me")}
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/pricing">{t("pro.seePricing", "See pricing")}</Link>
            </Button>
          </>
        }
      />

      <div className="layout-shell pb-20">
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="min-w-0 space-y-6">
            {/* Sample lane — the single unlocked preview item */}
            <m.div variants={fadeUp}>
              <Card>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-callout font-semibold text-foreground">{t("acct.proPreview.sampleLane", "Sample lane")}</h2>
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
                  <div className="space-y-2" aria-busy="true">
                    <Skeleton className="h-10 w-full rounded-control" />
                    <Skeleton className="h-12 w-full rounded-control" />
                    <Skeleton shape="text" className="mt-3 w-4/5" />
                  </div>
                ) : (
                  <div className="content-in">
                    <TableContainer>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t("acct.proPreview.colVehicle", "Vehicle")}</TableHead>
                            <TableHead numeric>{t("acct.proPreview.colListings", "Listings")}</TableHead>
                            <TableHead numeric>{t("acct.proPreview.colMedian", "Median")}</TableHead>
                            {/* Phones: the area is already in the sentence below, so drop the column instead of clipping it. */}
                            <TableHead className="hidden sm:table-cell">{t("acct.proPreview.colArea", "Top area")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell className="font-semibold">{lane.name}</TableCell>
                            <TableCell numeric className="text-label-2">
                              <AnimatedNumber value={lane.listings} />
                            </TableCell>
                            <TableCell numeric className="font-semibold text-primary">{lane.median}</TableCell>
                            <TableCell className="hidden text-label-2 sm:table-cell">{lane.district}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TableContainer>
                    <p className="mt-3 text-footnote text-label-2">
                      {t(
                        "acct.proPreview.showing",
                        "Showing {visible} of {total} {name} listings in {district}. The full lane, district splits and history unlock with Pro.",
                        { visible: String(lane.visibleCount), total: String(lane.listings), name: lane.name, district: lane.district },
                      )}
                    </p>
                  </div>
                )}
              </Card>
            </m.div>

            {/* 3 locked gaps — props-driven placeholders */}
            <m.div className="grid gap-4 sm:grid-cols-3" variants={listStagger}>
              {gapCards.slice(0, 3).map((gap, i) => (
                <m.div key={gap.title} variants={listItem} custom={i}>
                  <Card padding="sm" className="relative h-full min-h-[11rem] overflow-hidden">
                    <LockedOverlay />
                    <p className="text-caption font-semibold text-primary">{gap.meta}</p>
                    <h3 className="mt-2 text-body font-semibold text-foreground">{gap.title}</h3>
                    <p className="mt-1.5 text-footnote text-label-2">{gap.body}</p>
                  </Card>
                </m.div>
              ))}
            </m.div>
          </div>

          <aside className="space-y-6">
            <m.div variants={fadeUp}>
              <Card>
                <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-control bg-primary/10 text-primary">
                  <Sparkles aria-hidden className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <h2 className="text-callout font-semibold text-foreground">{t("acct.proPreview.unlocksTitle", "What Pro unlocks")}</h2>
                <ul className="mt-4 space-y-2.5">
                  {unlocks.map((i) => (
                    <li key={i} className="flex items-start gap-2.5 text-body text-label-1">
                      <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {i}
                    </li>
                  ))}
                </ul>
                <Button asChild className="mt-6 w-full">
                  <Link to={trialCtaTo}>
                    <Sparkles aria-hidden /> {t("shell.pro.notify", "Notify me")}
                  </Link>
                </Button>
                <p className="mt-3 text-center text-footnote text-label-2">
                  {t("shell.pro.previewNote", "Pro is coming soon. MotorMila is free during beta.")}
                </p>
              </Card>
            </m.div>

            <m.div variants={fadeUp}>
              <Card>
                <div className="mb-3 flex items-center gap-2">
                  <FileText aria-hidden className="h-4 w-4 text-primary" />
                  <h2 className="text-callout font-semibold text-foreground">{t("acct.proPreview.reportFormats", "Report formats")}</h2>
                </div>
                <ul className="divide-y divide-separator">
                  {reports.map((r) => (
                    <li key={r} className="flex h-11 items-center justify-between text-body text-label-1">
                      <span>{r}</span>
                      <Download aria-hidden className="h-4 w-4 text-label-3" />
                    </li>
                  ))}
                </ul>
              </Card>
            </m.div>
          </aside>
        </div>
      </div>
    </PageCanvas>
  );
}
