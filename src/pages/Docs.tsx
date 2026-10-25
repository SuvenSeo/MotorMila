import { Link } from "react-router-dom";
import { m } from "motion/react";
import { ArrowRight, ArrowUpRight, BookOpen, Radio } from "lucide-react";
import { DOCS_SECTIONS } from "@/lib/docsContent";
import { PageCanvas } from "@/components/PageCanvas";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Toc, useScrollSpy } from "@/components/ui/toc";
import { fadeUp } from "@/lib/motion";
import { useAppPreferences } from "@/lib/appPreferences";

const routeKey = (label: string) => `docs.route.${label.toLowerCase().replace(/[^a-z]+/g, "_")}`;

export default function Docs() {
  const { t } = useAppPreferences();
  const active = useScrollSpy(DOCS_SECTIONS.map((s) => s.id));
  // English lives in docsContent.ts; si/ta come from locales/content.ts by position.
  const sections = DOCS_SECTIONS.map((s) => {
    const k = `docs.s.${s.id}`;
    return {
      ...s,
      title: t(`${k}.title`, s.title),
      summary: t(`${k}.summary`, s.summary),
      body: s.body.map((p, i) => t(`${k}.body.${i}`, p)),
      bullets: s.bullets?.map((b, i) => t(`${k}.bullet.${i}`, b)),
      relatedRoutes: s.relatedRoutes?.map((r) => ({ ...r, label: t(routeKey(r.label), r.label) })),
    };
  });
  return (
    <PageCanvas ambient="none">
      <PageHeader
        size="compact"
        eyebrow={t("docs.eyebrow", "Documentation")}
        eyebrowIcon={BookOpen}
        title={t("docs.title", "Platform docs.")}
        description={t("docs.description", "How Motormila works — data sources, deal scores, Official Pulse, workspaces, and access tiers.")}
        actions={
          <>
            <Button asChild>
              <Link to="/pricing">
                {t("common.viewPricing", "View pricing")}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/official-pulse">
                <Radio aria-hidden />
                {t("nav.officialPulse", "Official Pulse")}
              </Link>
            </Button>
          </>
        }
      />

      <div className="layout-shell pb-20">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-16">
          <aside className="min-w-0 lg:sticky lg:top-28 lg:self-start">
            {/* Mobile: a horizontal row of jump links. Desktop: scroll-spy list. */}
            <nav
              aria-label={t("docs.sectionsAria", "Documentation sections")}
              className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:-mx-6 sm:px-6 lg:hidden"
            >
              {sections.map((section) => (
                <Button key={section.id} asChild variant="secondary" size="sm" className="shrink-0 font-medium">
                  <a href={`#${section.id}`} className="no-underline">
                    {section.title}
                  </a>
                </Button>
              ))}
            </nav>
            <Toc
              className="hidden lg:block"
              items={sections.map((s) => ({ id: s.id, title: s.title }))}
              active={active}
              label={t("docs.sectionsAria", "Documentation sections")}
              heading={t("docs.onThisPage", "On this page")}
            />
          </aside>

          <div className="min-w-0 space-y-6">
            {sections.map((section) => (
              <m.section key={section.id} id={section.id} variants={fadeUp} className="scroll-mt-28">
                <Card padding="lg">
                  <h2 className="font-display text-title2 font-semibold text-foreground">{section.title}</h2>
                  <p className="mt-2 max-w-prose text-callout text-label-2">{section.summary}</p>

                  <div className="mt-5 max-w-prose space-y-4">
                    {section.body.map((paragraph, pi) => (
                      <p key={`${section.id}-p${pi}`} className="text-body text-label-1 [text-wrap:pretty]">
                        {paragraph}
                      </p>
                    ))}
                  </div>

                  {section.bullets && section.bullets.length > 0 && (
                    <ul className="mt-6 max-w-prose space-y-2 border-t border-separator pt-5">
                      {section.bullets.map((bullet, bi) => (
                        <li key={`${section.id}-b${bi}`} className="flex gap-3 text-body text-label-2">
                          <span aria-hidden className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {section.relatedRoutes && section.relatedRoutes.length > 0 && (
                    <div className="mt-6 flex flex-wrap gap-2">
                      {section.relatedRoutes.map((route) => (
                        <Button key={route.to} asChild variant="secondary" size="sm" className="font-medium">
                          <Link to={route.to}>
                            {route.label}
                            <ArrowUpRight aria-hidden className="text-label-2" />
                          </Link>
                        </Button>
                      ))}
                    </div>
                  )}
                </Card>
              </m.section>
            ))}

            <m.div variants={fadeUp}>
              <Card padding="lg" className="flex flex-col gap-5 border-primary/25 bg-primary/5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-footnote font-semibold text-primary">{t("docs.nextStep", "Next step")}</p>
                  <h3 className="mt-1 text-callout font-semibold text-foreground">{t("docs.ctaTitle", "Ready for Pulse depth or Dealer seats?")}</h3>
                  <p className="mt-1 max-w-md text-footnote text-label-2">
                    {t("docs.ctaBody", "Compare tiers, then open Official Pulse or the dealer workspace.")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild>
                    <Link to="/pricing">{t("nav.pricing", "Pricing")}</Link>
                  </Button>
                  <Button asChild variant="secondary">
                    <Link to="/official-pulse">{t("nav.officialPulse", "Official Pulse")}</Link>
                  </Button>
                </div>
              </Card>
            </m.div>
          </div>
        </div>
      </div>
    </PageCanvas>
  );
}
