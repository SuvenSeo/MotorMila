import { BellRing, Gauge } from "lucide-react";
import { useRef } from "react";
import { AnimatedBeam } from "@/components/AnimatedBeam";
import { SectionHeader } from "@/components/SectionHeader";
import { useAppPreferences } from "@/lib/appPreferences";

function Node({
  nodeRef,
  icon,
  title,
  sub,
}: {
  nodeRef: React.Ref<HTMLDivElement>;
  icon: React.ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        ref={nodeRef}
        className="flex h-20 w-20 items-center justify-center rounded-3xl border border-border bg-card shadow-soft"
      >
        {icon}
      </div>
      <div className="text-center">
        <p className="text-footnote font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 max-w-[180px] text-caption leading-relaxed text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}

const SOURCE_COLORS: Record<string, string> = {
  ikman: "bg-[#E53935]/10 text-[#C62828]",
  riyasewana: "bg-[#1565C0]/10 text-[#0D47A1]",
  patpat: "bg-[#6A1B9A]/10 text-[#4A148C]",
};

const SOURCES = ["ikman", "riyasewana", "patpat"];

/**
 * Homepage "How it works" band — sources → fair-value engine → alerts,
 * joined by Magic UI-style animated beams on desktop, static stack on mobile.
 */
export function HowItWorksBand() {
  const { t } = useAppPreferences();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sourcesRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<HTMLDivElement | null>(null);
  const alertsRef = useRef<HTMLDivElement | null>(null);

  return (
    <section className="border-b border-border bg-background">
      <div className="mx-auto max-w-[1560px] px-5 py-10 sm:px-6 lg:py-14">
        <SectionHeader
          eyebrow={t("howItWorks.eyebrow", "How it works")}
          title={t("howItWorks.title", "From listing to deal alert in three steps")}
          description={t(
            "howItWorks.blurb",
            "We watch the island's biggest marketplaces around the clock, score every listing against fair value, and ping you the moment something is priced to move.",
          )}
        />
        {/* Desktop: beam diagram */}
        <div ref={containerRef} className="relative hidden md:block">
          <div className="relative z-10 flex items-start justify-between gap-6 px-8 py-6">
            <Node
              nodeRef={sourcesRef}
              icon={
                <div className="flex flex-col gap-1">
                  {SOURCES.map((s) => (
                    <span
                      key={s}
                      className={`rounded-md px-2 py-0.5 text-caption font-bold ${SOURCE_COLORS[s]}`}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              }
              title={t("howItWorks.step1", "1 · We watch")}
              sub={t("howItWorks.step1d", "ikman, riyasewana and patpat scanned daily")}
            />
            <Node
              nodeRef={engineRef}
              icon={<Gauge className="h-8 w-8 text-primary" aria-hidden />}
              title={t("howItWorks.step2", "2 · We score")}
              sub={t("howItWorks.step2d", "Fair-value engine prices every spec")}
            />
            <Node
              nodeRef={alertsRef}
              icon={<BellRing className="h-8 w-8 text-deal-green" aria-hidden />}
              title={t("howItWorks.step3", "3 · You pounce")}
              sub={t("howItWorks.step3d", "Alerts the moment a deal appears")}
            />
          </div>
          <AnimatedBeam containerRef={containerRef} fromRef={sourcesRef} toRef={engineRef} curvature={-50} />
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={engineRef}
            toRef={alertsRef}
            curvature={-50}
            duration={2.6}
          />
        </div>

        {/* Mobile: static vertical stack (no beams) */}
        <ol className="flex flex-col gap-4 md:hidden">
          {[
            { n: "1", t: t("howItWorks.step1t", "We watch"), d: t("howItWorks.step1d", "ikman, riyasewana and patpat scanned daily"), c: "text-primary" },
            { n: "2", t: t("howItWorks.step2t", "We score"), d: t("howItWorks.step2d", "Fair-value engine prices every spec"), c: "text-primary" },
            { n: "3", t: t("howItWorks.step3t", "You pounce"), d: t("howItWorks.step3d", "Alerts the moment a deal appears"), c: "text-deal-green" },
          ].map((s) => (
            <li
              key={s.n}
              className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-soft"
            >
              <span className={`font-display text-title2 font-semibold ${s.c}`}>{s.n}</span>
              <div>
                <p className="text-footnote font-semibold text-foreground">{s.t}</p>
                <p className="text-caption text-muted-foreground">{s.d}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
