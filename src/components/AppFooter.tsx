import { scrollBehavior } from "@/lib/motion";
import { useAppPreferences } from "@/lib/appPreferences";
import { ArrowRight, ArrowUpRight, ExternalLink, Gauge, Laptop, Moon, Smartphone, Sun } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import { PrefetchLink } from "@/components/PrefetchLink";
import { LOCALE_OPTIONS } from "@/components/LocaleSwitcher";
import { openFeedbackDialog } from "@/lib/feedbackEvents";
import { HOW_WE_PRICE_PATH, howWePriceHref } from "@/lib/howWePrice";
import { LISTING_SOURCES } from "@/lib/listingSources";
import "@/styles/cinematic-footer.css";

type FooterLink = { label: string; to: string; external?: boolean };

function FooterColumn({ index, title, links }: { index: string; title: string; links: FooterLink[] }) {
  return (
    <div className="min-w-0">
      <p className="cine-footer__col-title">
        <span aria-hidden className="cine-footer__col-no">{index}</span>
        <span className="min-w-0">{title}</span>
      </p>
      <ul className="mt-3 space-y-1">
        {links.map((link) => (
          <li key={link.label}>
            {link.external ? (
              <a href={link.to} target="_blank" rel="noopener noreferrer" className="cine-footer__link">
                {link.label}
                <ArrowUpRight className="h-3 w-3" aria-hidden />
              </a>
            ) : (
              <PrefetchLink to={link.to} className="cine-footer__link">
                {link.label}
              </PrefetchLink>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Language + theme as two small radio groups (same settings as the navbar / Settings). */
function FooterPreferences() {
  const { language, setLanguage, themeMode, setThemeMode, t } = useAppPreferences();
  const themes = [
    { mode: "light" as const, label: t("theme.light", "Light"), icon: Sun },
    { mode: "dark" as const, label: t("theme.dark", "Dark"), icon: Moon },
    { mode: "system" as const, label: t("theme.auto", "Auto"), icon: Laptop },
  ];
  const languageLabel = t("shell.nav.language", "Language");
  const themeLabel = t("ui.theme", "Theme");
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
      <div className="flex items-center gap-3">
        <span className="text-caption font-medium text-white/55" aria-hidden>{languageLabel}</span>
        <div role="radiogroup" aria-label={languageLabel} className="cine-footer__seg">
          {LOCALE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={language === opt.value}
              aria-label={opt.english}
              title={opt.label}
              lang={opt.value}
              onClick={() => setLanguage(opt.value)}
              className={cn(opt.script && "locale-script-label")}
            >
              {opt.shortLabel}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-caption font-medium text-white/55" aria-hidden>{themeLabel}</span>
        <div role="radiogroup" aria-label={themeLabel} className="cine-footer__seg">
          {themes.map(({ mode, label, icon: Icon }) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={themeMode === mode}
              aria-label={label}
              title={label}
              onClick={() => setThemeMode(mode)}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AppFooter() {
  const year = new Date().getFullYear();
  const { t } = useAppPreferences();

  // Six numbered columns (2×3 on phones, 3×2 from tablets up); every link kept.
  const platformLinks = useMemo(
    () => [
      { label: t("nav.home", "Home"), to: "/" },
      { label: t("nav.market", "Market"), to: "/#market" },
      { label: t("nav.trends", "Trends"), to: "/trends" },
      { label: t("nav.bestPicks", "Best Picks"), to: "/best-picks" },
      { label: t("nav.compare", "Compare"), to: "/compare" },
      { label: t("nav.officialPulse", "Official Pulse"), to: "/official-pulse" },
    ],
    [t],
  );

  const toolLinks = useMemo(
    () => [
      { label: t("nav.calculator", "Calculator"), to: "/calculator" },
      { label: t("nav.afford", "What can I afford?"), to: "/afford" },
      { label: t("nav.valuation", "Valuation"), to: "/estimate" },
      { label: t("nav.evHub", "EV Hub"), to: "/ev-hub" },
      { label: t("shell.nav.permits", "Import permit prices"), to: "/permits" },
      { label: t("nav.safeTransfer", "Safe-Transfer Kit"), to: "/safe-transfer" },
    ],
    [t],
  );

  const serviceLinks = useMemo(
    () => [
      { label: t("shell.nav.sellVehicle", "Sell your vehicle"), to: "/sell" },
      { label: t("nav.dealer", "Dealer"), to: "/dealer" },
      { label: t("nav.leasing", "Leasing quotes"), to: "/finance" },
      { label: t("nav.inspection", "Book an inspection"), to: "/inspection" },
      { label: t("shell.nav.insurance", "Insurance quotes"), to: "/insurance" },
      { label: t("nav.mobileApp", "Mobile App"), to: "/mobile-app" },
    ],
    [t],
  );

  const accountLinks = useMemo(
    () => [
      { label: t("nav.myListings", "My listings"), to: "/profile" },
      { label: t("shell.nav.saved", "Saved"), to: "/alerts" },
      { label: t("nav.settings", "Settings"), to: "/settings" },
      { label: t("nav.pricing", "Pricing"), to: "/pricing" },
      { label: t("nav.proPreview", "Pro Preview"), to: "/pro-preview" },
      { label: t("nav.docs", "Docs"), to: "/docs" },
      { label: t("footer.howWePrice", "How we score prices"), to: HOW_WE_PRICE_PATH },
    ],
    [t],
  );

  const legalLinks = useMemo(
    () => [
      { label: t("footer.privacy", "Privacy Policy"), to: "/privacy" },
      { label: t("footer.terms", "Terms of Use"), to: "/terms" },
      { label: t("footer.cookies", "Cookie notice"), to: "/cookies" },
      { label: t("footer.removal", "Remove a listing"), to: "/removal" },
      { label: t("footer.deleteAccount", "Delete my account"), to: "/delete-account" },
    ],
    [t],
  );

  const studioLinks = useMemo(
    () => [{ label: t("footer.ardenoStudio", "Ardeno Studio"), to: "https://ardeno-studio-website.vercel.app/", external: true }],
    [t],
  );

  // The source line names the first three listing sites and counts the rest
  // (straight from LISTING_SOURCES, so it never drifts from the explainer).
  const leadSources = LISTING_SOURCES.slice(0, 3).map((s) => s.name).join(", ");
  const moreSources = Math.max(0, LISTING_SOURCES.length - 3);

  return (
    <footer
      className="app-footer cv-auto cine-footer theme-dark relative z-10 mt-16 text-foreground"
      aria-labelledby="platform-footer-title"
    >
      <div aria-hidden className="cine-footer__light" />
      <div aria-hidden className="cine-footer__grain" />

      <div className="layout-shell pb-32 pt-16 sm:pb-36 md:pb-10 md:pt-24">
        <h2 id="platform-footer-title" className="sr-only">
          Motormila
        </h2>

        {/* The closing statement */}
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-16">
          <div className="min-w-0">
            <p className="cine-footer__eyebrow">{t("footer.tagline", "Market Intelligence")}</p>
            <p className="cine-footer__title mt-5">
              {t("footer.cine.lead", "Know the fair price")}{" "}
              <em>{t("footer.cine.accent", "before you call the seller.")}</em>
            </p>
            <p className="mt-6 max-w-xl text-body leading-relaxed text-white/70 [text-wrap:pretty]">
              {t(
                "footer.body",
                "Sri Lanka vehicle market intelligence — live listings, fair-value signals, and tools built for buyers and dealers.",
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 lg:justify-end lg:pb-2">
            <Button asChild size="lg">
              <PrefetchLink to="/pricing" className="no-underline">
                {t("footer.explorePro", "Explore Pro")}
                <ArrowUpRight aria-hidden />
              </PrefetchLink>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <PrefetchLink to="/estimate" className="no-underline">
                <Gauge aria-hidden />
                {t("howPrice.cta.estimate", "Estimate my car")}
              </PrefetchLink>
            </Button>
          </div>
        </div>

        <div className="cine-footer__rule mt-14 md:mt-20" aria-hidden />

        {/* Directory */}
        <div className="grid gap-12 pt-10 md:pt-14 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,2.2fr)] lg:gap-16">
          <div className="min-w-0 space-y-7">
            <PrefetchLink
              to="/"
              className="inline-flex rounded-sm no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t("footer.homeAria", "Go to Motormila home")}
            >
              <BrandLogo size="default" showTagline={false} />
            </PrefetchLink>

            <p className="max-w-sm text-footnote leading-relaxed text-white/60">
              {t("footer.cine.sources", "Prices read from public ads on {names} and {count} more sites.", {
                names: leadSources,
                count: moreSources,
              })}{" "}
              <PrefetchLink
                to={howWePriceHref("sources")}
                className="font-semibold text-white/85 underline decoration-white/30 underline-offset-4 hover:text-white hover:decoration-white/70"
              >
                {t("footer.howWePrice", "How we score prices")}
              </PrefetchLink>
            </p>

            <PrefetchLink to="/mobile-app" className="cine-footer__app max-w-sm">
              <span className="cine-footer__app-icon" aria-hidden>
                <Smartphone className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-footnote font-semibold text-white">{t("mapp.eyebrow", "Motormila for Android")}</span>
                <span className="block text-caption text-white/60">{t("mapp.fact.android", "Android 8.0 and up")}</span>
              </span>
              <ArrowRight aria-hidden className="cine-footer__app-arrow h-4 w-4 text-white/70" />
            </PrefetchLink>

            <FooterPreferences />
          </div>

          <nav
            aria-label={t("footer.navAria", "Footer navigation")}
            className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 sm:gap-x-8 lg:gap-x-10 lg:gap-y-12"
          >
            <FooterColumn index="01" title={t("footer.platform", "Platform")} links={platformLinks} />
            <FooterColumn index="02" title={t("footer.tools", "Tools")} links={toolLinks} />
            <FooterColumn index="03" title={t("footer.services", "Sell & services")} links={serviceLinks} />
            <FooterColumn index="04" title={t("footer.account", "Account & help")} links={accountLinks} />
            <FooterColumn index="05" title={t("footer.legal", "Legal")} links={legalLinks} />
            <FooterColumn index="06" title={t("footer.studio", "Studio")} links={studioLinks} />
          </nav>
        </div>

        {/* Credits */}
        <div className="cine-footer__credits mt-14 flex flex-col gap-4 pt-6 md:mt-20 md:flex-row md:items-center md:justify-between">
          <p className="text-caption text-white/55">
            {t("footer.copyright", "© {year} Ardeno Studio. Built in Sri Lanka.", { year })}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="https://ardeno-studio-website.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("footer.ardenoStudio", "Ardeno Studio")}
              className="cine-footer__quiet w-8 justify-center px-0"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
            <button type="button" onClick={() => openFeedbackDialog()} className="cine-footer__quiet">
              {t("shell.nav.feedback", "Send feedback")}
            </button>
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: scrollBehavior() })}
              className="cine-footer__quiet"
            >
              {t("footer.backToTop", "Back to top")}
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
