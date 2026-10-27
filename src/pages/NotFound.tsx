import { type CSSProperties } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, ArrowRight, BarChart3, Calculator, CornerDownRight, TrendingUp } from "lucide-react";
import { AtmosphericImage } from "@/components/AtmosphericImage";
import { NotFoundSearch } from "@/components/notFound/NotFoundSearch";
import { useAppPreferences } from "@/lib/appPreferences";
import { suggestPages } from "@/lib/notFoundSuggest";
import { visuals } from "@/lib/visualAssets";
import "@/styles/cinematic-pages.css";

/**
 * 404 — "Wrong turn." A night road forking into the dark (dark in both
 * themes), the search box prefilled from the dead URL, "did you mean" pages
 * matched from its words (lib/notFoundSuggest), then three popular routes.
 */
const NotFound = () => {
  const { t } = useAppPreferences();
  const { pathname } = useLocation();
  const suggestions = suggestPages(pathname);

  const links = [
    { to: "/", label: t("notFound.inventory", "Inventory"), description: t("notFound.inventoryDesc", "Browse every live listing, ranked against the market."), icon: TrendingUp },
    { to: "/trends", label: t("notFound.trends", "Price trends"), description: t("notFound.trendsDesc", "Track how values move, week over week."), icon: BarChart3 },
    { to: "/calculator", label: t("notFound.calculator", "Import calculator"), description: t("notFound.calculatorDesc", "Break down duty, tax, and landed cost."), icon: Calculator },
  ];

  return (
    <div className="bg-background">
      <section className="cine-stage cine-404 theme-dark relative -mt-[var(--nav-offset)] flex flex-col overflow-hidden pt-[var(--nav-offset)] text-foreground">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <AtmosphericImage
            src={visuals.page404Night.src}
            srcSm={visuals.page404Night.srcSm}
            className="cine-404__img"
            priority
            sizes="100vw"
          />
          <div className="cine-404__scrim" />
          <div className="cine-grain-static" />
        </div>

        <div className="relative z-10 mx-auto flex w-full max-w-[1320px] flex-1 flex-col justify-end px-5 pb-10 pt-[14svh] sm:px-6 lg:justify-center lg:pb-20 lg:pt-16">
          <div className="max-w-xl">
            <p aria-hidden className="cine-404__code cine-rise select-none" style={{ "--i": 0 } as CSSProperties}>404</p>
            <p className="cine-eyebrow cine-rise mt-6 text-white/70" style={{ "--i": 1 } as CSSProperties}>
              {t("notFound.eyebrow", "404")} · {t("notFound.title", "Page not found.")}
            </p>
            <h1 className="cine-display cine-rise mt-4 text-[clamp(2.125rem,1.4rem+3.2vw,4.25rem)] text-white" style={{ "--i": 2 } as CSSProperties}>
              {t("notFound.cine.lead", "Wrong turn.")}{" "}
              <em>{t("notFound.cine.accent", "Let's get you back on the road.")}</em>
            </h1>
            <p className="cine-rise mt-4 max-w-md text-footnote sm:text-body leading-relaxed text-white/75" style={{ "--i": 3 } as CSSProperties}>
              {t(
                "notFound.descriptionSearch",
                "We couldn't find that page. It may have moved, or the ad may have been removed. Search for the car or pick a link below.",
              )}
            </p>

            {suggestions.length > 0 && (
              <div className="cine-rise mt-7" style={{ "--i": 4 } as CSSProperties}>
                <p className="text-caption font-semibold text-white/60">{t("notFound.didYouMean", "Did you mean")}</p>
                <ul className="mt-2 grid gap-1.5">
                  {suggestions.map((s) => (
                    <li key={s.to}>
                      <Link
                        to={s.to}
                        className="group inline-flex min-h-10 items-center gap-2 text-callout font-semibold text-white no-underline hover:text-[hsl(213_100%_74%)]"
                      >
                        <CornerDownRight aria-hidden className="h-4 w-4 text-[hsl(213_100%_70%)]" />
                        {t(s.labelKey, s.fallback)}
                        <span className="text-caption font-medium text-white/45">{s.to.replace("/#market", "/")}</span>
                        <ArrowRight aria-hidden className="h-4 w-4 opacity-0 transition-[opacity,transform] duration-short group-hover:translate-x-0.5 group-hover:opacity-100" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="cine-rise mt-8" style={{ "--i": 5 } as CSSProperties}>
              <NotFoundSearch />
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1320px] px-5 pb-20 pt-12 sm:px-6 lg:pb-28">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="cine-eyebrow text-muted-foreground">{t("notFound.pickUp", "Pick up where you left off")}</h2>
          <Link to="/" className="inline-flex items-center gap-1.5 text-footnote font-semibold text-primary no-underline hover:underline">
            <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
            {t("common.backToDashboard", "Back to dashboard")}
          </Link>
        </div>
        <ul className="mt-5 grid gap-px overflow-hidden rounded-card border border-border bg-border md:grid-cols-3">
          {links.map((l) => {
            const Icon = l.icon;
            return (
              <li key={l.to} className="bg-card">
                <Link
                  to={l.to}
                  className="group flex h-full flex-col gap-4 p-5 no-underline transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:p-6"
                >
                  <Icon className="h-5 w-5 text-primary" strokeWidth={1.75} aria-hidden />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 font-display text-title3 font-semibold text-foreground">
                      {l.label}
                      <ArrowRight aria-hidden className="h-4 w-4 shrink-0 text-label-2 transition-transform duration-short group-hover:translate-x-0.5 group-hover:text-primary" />
                    </span>
                    <span className="mt-1 block text-footnote text-label-2">{l.description}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

export default NotFound;
