import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, BookOpen, ExternalLink, FileText, Radio } from "lucide-react";
import { DOCS_SECTIONS } from "@/lib/docsContent";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { PageHero } from "@/components/PageHero";
import { revealItem } from "@/lib/motion";
import { useAppPreferences } from "@/lib/appPreferences";
import { visuals } from "@/lib/visualAssets";

export default function Docs() {
  const { t } = useAppPreferences();
  return (
    <PageCanvas>
      <PageHero
        theme="docs"
        eyebrow={t("docs.eyebrow", "Documentation")}
        eyebrowIcon={BookOpen}
        watermarkIcon={FileText}
        title={<>{t("docs.title", "Platform docs.")}</>}
        description={t("docs.description", "How Motormila works — data sources, deal scores, Official Pulse, workspaces, and access tiers.")}
        media={visuals.pageBlogHeader}
        mediaPosition="center 40%"
        mediaTone="brand"
        highlights={[
          { label: "Sections", value: String(DOCS_SECTIONS.length), hint: "Platform methodology" },
          { label: "Pulse", value: "Live", hint: "Government import signals" },
          { label: "Access", value: "Tiers", hint: "Free through enterprise" },
        ]}
        actions={
          <>
            <Link
              to="/pricing"
              className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-[13px] font-semibold text-primary-foreground no-underline shadow-soft transition-all hover:bg-primary/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {t("common.viewPricing", "View pricing")}
              <ArrowRight aria-hidden className="h-4 w-4" />
            </Link>
            <Link
              to="/official-pulse"
              className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-card px-6 text-[13px] font-semibold text-foreground no-underline transition-all hover:border-primary/40 hover:bg-surface active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Radio aria-hidden className="h-4 w-4" />
              {t("nav.officialPulse", "Official Pulse")}
            </Link>
          </>
        }
      />

      <PageBody>
        <div className="grid gap-10 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-14">
          <motion.aside variants={revealItem} className="lg:sticky lg:top-24 lg:self-start">
            <p className="section-eyebrow mb-4">{t("docs.onThisPage", "On this page")}</p>
            <nav aria-label={t("docs.sectionsAria", "Documentation sections")} className="flex flex-row gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
              {DOCS_SECTIONS.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="shrink-0 rounded-2xl border border-border bg-surface px-3 py-2 text-[12px] font-semibold text-muted-foreground no-underline transition-colors hover:border-primary/30 hover:text-foreground lg:border-transparent lg:bg-transparent lg:px-0 lg:py-1.5"
                >
                  {section.title}
                </a>
              ))}
            </nav>
          </motion.aside>

          <div className="space-y-12 lg:space-y-16">
            {DOCS_SECTIONS.map((section) => (
              <motion.section
                key={section.id}
                id={section.id}
                variants={revealItem}
                className="scroll-mt-28 rounded-2xl border border-border bg-card/40 p-6 sm:p-8"
              >
                <div className="mb-2 inline-flex items-center gap-2">
                  <FileText aria-hidden className="h-3.5 w-3.5 text-primary" />
                  <span className="num text-[12px] font-semibold text-muted-foreground">
                    {section.id}
                  </span>
                </div>
                <h2 className="display-2 text-foreground">{section.title}</h2>
                <p className="mt-3 max-w-2xl text-[15px] font-medium leading-relaxed text-muted-foreground">
                  {section.summary}
                </p>

                <div className="mt-6 space-y-4">
                  {section.body.map((paragraph) => (
                    <p key={paragraph.slice(0, 48)} className="max-w-2xl text-[14px] leading-relaxed text-foreground/85">
                      {paragraph}
                    </p>
                  ))}
                </div>

                {section.bullets && section.bullets.length > 0 && (
                  <ul className="mt-6 space-y-2 border-t border-border pt-6">
                    {section.bullets.map((bullet) => (
                      <li key={bullet} className="flex gap-2.5 text-[13px] leading-relaxed text-muted-foreground">
                        <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {section.relatedRoutes && section.relatedRoutes.length > 0 && (
                  <div className="mt-6 flex flex-wrap gap-2">
                    {section.relatedRoutes.map((route) => (
                      <Link
                        key={route.to + route.label}
                        to={route.to}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-1.5 text-[11px] font-semibold text-foreground no-underline transition-colors hover:border-primary/35 hover:text-primary-bright"
                      >
                        {route.label}
                        <ExternalLink aria-hidden className="h-3 w-3 text-muted-foreground" />
                      </Link>
                    ))}
                  </div>
                )}
              </motion.section>
            ))}

            <motion.div
              variants={revealItem}
              className="flex flex-col gap-4 rounded-2xl border border-primary/25 bg-primary/[0.06] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8"
            >
              <div>
                <p className="section-eyebrow mb-2">{t("docs.nextStep", "Next step")}</p>
                <h3 className="text-lg font-bold text-foreground">{t("docs.ctaTitle", "Ready for Pulse depth or Dealer seats?")}</h3>
                <p className="mt-1 max-w-md text-[13px] text-muted-foreground">
                  {t("docs.ctaBody", "Compare tiers, then open Official Pulse or the dealer workspace.")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  to="/pricing"
                  className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-[12px] font-semibold text-primary-foreground no-underline"
                >
                  {t("nav.pricing", "Pricing")}
                </Link>
                <Link
                  to="/official-pulse"
                  className="inline-flex h-10 items-center rounded-full border border-border bg-card px-5 text-[12px] font-semibold text-foreground no-underline"
                >
                  {t("nav.officialPulse", "Official Pulse")}
                </Link>
              </div>
            </motion.div>
          </div>
        </div>
      </PageBody>
    </PageCanvas>
  );
}
