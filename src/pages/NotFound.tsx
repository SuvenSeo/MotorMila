import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowLeft, ArrowUpRight, BarChart3, MapPin, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/SectionHeader";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { PageHero } from "@/components/PageHero";
import { fadeUp, hoverLift, listStagger, press, revealItem, useReducedMotionOrLowData } from "@/lib/motion";
import { useAppPreferences } from "@/lib/appPreferences";
import { visuals } from "@/lib/visualAssets";
import { NotFoundSearch } from "@/components/notFound/NotFoundSearch";

const NotFound = () => {
  const { t } = useAppPreferences();
  const motionStill = useReducedMotionOrLowData();

  const links = [
    {
      to: "/",
      label: t("notFound.inventory", "Inventory"),
      description: t("notFound.inventoryDesc", "Browse every live listing, ranked against the market."),
      icon: TrendingUp,
      featured: true,
    },
    {
      to: "/trends",
      label: t("notFound.trends", "Price trends"),
      description: t("notFound.trendsDesc", "Track how values move, week over week."),
      icon: BarChart3,
      featured: false,
    },
    {
      to: "/calculator",
      label: t("notFound.calculator", "Import calculator"),
      description: t("notFound.calculatorDesc", "Break down duty, tax, and landed cost."),
      icon: MapPin,
      featured: false,
    },
  ] as const;

  return (
    <PageCanvas ambient="subtle">
      <PageHero
        theme="default"
        eyebrow={t("notFound.eyebrow", "404")}
        title={<>{t("notFound.title", "Page not found.")}</>}
        description={t("notFound.descriptionSearch", "We couldn't find that page. It may have moved, or the ad may have been removed. Search for the car or pick a link below.")}
        media={visuals.lostCarFork404}
        mediaPosition="center"
        mediaTone="brand"
        highlights={[
          { label: t("notFound.inventory", "Inventory"), value: t("common.live", "Live"), hint: t("notFound.inventoryDesc", "Browse every live listing, ranked against the market.") },
          { label: t("notFound.trends", "Price trends"), value: "Open", hint: t("notFound.trendsDesc", "Track how values move, week over week.") },
          { label: t("notFound.calculator", "Import calculator"), value: "Ready", hint: t("notFound.calculatorDesc", "Break down duty, tax, and landed cost.") },
        ]}
        actions={
          <Button asChild size="lg" variant="outline">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              {t("common.backToDashboard", "Back to dashboard")}
            </Link>
          </Button>
        }
      />

      <PageBody className="pb-20 lg:pb-28">
          <NotFoundSearch />
          <motion.div variants={revealItem}>
            <SectionHeader
              eyebrow={t("notFound.destinations", "Popular destinations")}
              title={t("notFound.pickUp", "Pick up where you left off")}
            />
          </motion.div>

          <motion.div
            className="mt-8 grid gap-4 lg:grid-cols-3"
            inherit={false}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.1 }}
            variants={listStagger}
          >
            {links.map((l) => {
              const Icon = l.icon;
              return (
                <motion.div
                  key={l.to}
                  variants={fadeUp}
                  {...(motionStill ? {} : { ...hoverLift, whileTap: press.whileTap })}
                  className={l.featured ? "lg:col-span-3" : ""}
                >
                  <Link
                    to={l.to}
                    className={
                      l.featured
                        ? "group flex items-center gap-5 rounded-2xl border border-border bg-card p-6 no-underline shadow-soft transition-colors hover:border-primary/40 sm:p-8"
                        : "group flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-6 no-underline shadow-soft transition-colors hover:border-primary/40"
                    }
                  >
                    <div
                      className={
                        l.featured
                          ? "flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-border bg-surface"
                          : "flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface"
                      }
                    >
                      <Icon
                        className={l.featured ? "h-6 w-6 text-primary" : "h-5 w-5 text-primary"}
                        aria-hidden
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            l.featured
                              ? "text-callout font-semibold text-foreground"
                              : "text-body font-semibold text-foreground"
                          }
                        >
                          {l.label}
                        </span>
                        <ArrowUpRight
                          className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
                          aria-hidden
                        />
                      </div>
                      <p className="mt-1 text-footnote leading-relaxed text-muted-foreground">
                        {l.description}
                      </p>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </motion.div>
      </PageBody>
    </PageCanvas>
  );
};

export default NotFound;
