import { Link } from "react-router-dom";
import { m } from "motion/react";
import { ArrowLeft, ArrowUpRight, BarChart3, Calculator, Compass, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PageCanvas } from "@/components/PageCanvas";
import { fadeUp, listItem, listStagger } from "@/lib/motion";
import { useAppPreferences } from "@/lib/appPreferences";
import { NotFoundSearch } from "@/components/notFound/NotFoundSearch";

const NotFound = () => {
  const { t } = useAppPreferences();

  const links = [
    {
      to: "/",
      label: t("notFound.inventory", "Inventory"),
      description: t("notFound.inventoryDesc", "Browse every live listing, ranked against the market."),
      icon: TrendingUp,
    },
    {
      to: "/trends",
      label: t("notFound.trends", "Price trends"),
      description: t("notFound.trendsDesc", "Track how values move, week over week."),
      icon: BarChart3,
    },
    {
      to: "/calculator",
      label: t("notFound.calculator", "Import calculator"),
      description: t("notFound.calculatorDesc", "Break down duty, tax, and landed cost."),
      icon: Calculator,
    },
  ] as const;

  return (
    <PageCanvas ambient="none">
      <PageHeader
        size="compact"
        eyebrow={t("notFound.eyebrow", "404")}
        eyebrowIcon={Compass}
        title={t("notFound.title", "Page not found.")}
        description={t(
          "notFound.descriptionSearch",
          "We couldn't find that page. It may have moved, or the ad may have been removed. Search for the car or pick a link below.",
        )}
        actions={
          <Button asChild variant="secondary">
            <Link to="/">
              <ArrowLeft aria-hidden />
              {t("common.backToDashboard", "Back to dashboard")}
            </Link>
          </Button>
        }
      />

      <div className="layout-shell pb-20 lg:pb-28">
        <m.div variants={fadeUp}>
          <NotFoundSearch />
        </m.div>

        <h2 className="mb-4 mt-12 font-display text-title3 font-semibold text-foreground">
          {t("notFound.pickUp", "Pick up where you left off")}
        </h2>
        <m.ul className="grid gap-4 md:grid-cols-3" variants={listStagger}>
          {links.map((l, i) => {
            const Icon = l.icon;
            return (
              <m.li key={l.to} variants={listItem} custom={i}>
                <Card variant="interactive" padding="none" className="group h-full">
                  <Link
                    to={l.to}
                    className="flex h-full flex-col gap-4 rounded-card p-5 no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-6"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-control bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-body font-semibold text-foreground">
                        {l.label}
                        <ArrowUpRight
                          className="h-4 w-4 shrink-0 text-label-2 transition-transform duration-short ease-standard group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary"
                          aria-hidden
                        />
                      </span>
                      <span className="mt-1 block text-footnote text-label-2">{l.description}</span>
                    </span>
                  </Link>
                </Card>
              </m.li>
            );
          })}
        </m.ul>
      </div>
    </PageCanvas>
  );
};

export default NotFound;
