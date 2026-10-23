import { scrollBehavior } from "@/lib/motion";
import { useAppPreferences } from "@/lib/appPreferences";
import { ArrowUpRight, ExternalLink } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import { PrefetchLink } from "@/components/PrefetchLink";
import { openFeedbackDialog } from "@/lib/feedbackEvents";
import { HOW_WE_PRICE_PATH } from "@/lib/howWePrice";


function FooterColumn({ title, links }: { title: string; links: Array<{ label: string; to: string }> }) {
  return (
    <div>
      <p className="text-footnote font-semibold text-foreground">{title}</p>
      <ul className="mt-3 space-y-2.5">
        {links.map((link) => (
          <li key={link.label}>
            <PrefetchLink
              to={link.to}
              className="text-footnote text-label-2 no-underline transition-colors duration-short hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            >
              {link.label}
            </PrefetchLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AppFooter() {
  const year = new Date().getFullYear();
  const { t } = useAppPreferences();

  const platformLinks = useMemo(
    () => [
      { label: t("nav.home", "Home"), to: "/" },
      { label: t("nav.market", "Market"), to: "/#market" },
      { label: t("nav.trends", "Trends"), to: "/trends" },
      { label: t("nav.calculator", "Calculator"), to: "/calculator" },
    ],
    [t],
  );

  const toolLinks = useMemo(
    () => [
      { label: t("nav.afford", "What can I afford?"), to: "/afford" },
      { label: t("nav.safeTransfer", "Safe-Transfer Kit"), to: "/safe-transfer" },
      { label: t("nav.evHub", "EV Hub"), to: "/ev-hub" },
      { label: t("nav.valuation", "Valuation"), to: "/estimate" },
      { label: t("nav.pricing", "Pricing"), to: "/pricing" },
      { label: t("nav.docs", "Docs"), to: "/docs" },
      { label: t("footer.howWePrice", "How we score prices"), to: HOW_WE_PRICE_PATH },
    ],
    [t],
  );

  const moreLinks = useMemo(
    () => [
      { label: t("nav.mobileApp", "Mobile App"), to: "/mobile-app" },
      { label: t("nav.officialPulse", "Official Pulse"), to: "/official-pulse" },
      { label: t("nav.dealer", "Dealer"), to: "/dealer" },
      { label: t("nav.bestPicks", "Best Picks"), to: "/best-picks" },
      { label: t("nav.compare", "Compare"), to: "/compare" },
      { label: t("nav.leasing", "Leasing quotes"), to: "/finance" },
      { label: t("nav.inspection", "Book an inspection"), to: "/inspection" },
      { label: t("shell.nav.insurance", "Insurance quotes"), to: "/insurance" },
      { label: t("shell.nav.permits", "Import permit prices"), to: "/permits" },
      { label: t("shell.nav.sellVehicle", "Sell your vehicle"), to: "/sell" },
      { label: t("nav.myListings", "My listings"), to: "/profile" },
      { label: t("nav.proPreview", "Pro Preview"), to: "/pro-preview" },
      { label: t("shell.nav.saved", "Saved"), to: "/alerts" },
      { label: t("nav.settings", "Settings"), to: "/settings" },
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
    () => [
      { label: t("footer.ardenoStudio", "Ardeno Studio"), href: "https://ardeno-studio-website.vercel.app/", external: true },
    ],
    [t],
  );

  const socialLinks = useMemo(
    () => [
      {
        label: t("footer.ardenoStudio", "Ardeno Studio"),
        href: "https://ardeno-studio-website.vercel.app/",
        icon: ExternalLink,
      },
    ],
    [t],
  );

  const quietButton =
    "inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface-1 px-3 text-caption font-medium text-label-2 transition-ui duration-short hover:bg-surface-2 hover:text-foreground active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <footer
      className="app-footer relative z-10 mt-16 border-t border-separator bg-surface-2/50 pb-32 pt-12 sm:pb-36 md:pb-10 md:pt-14"
      aria-labelledby="platform-footer-title"
    >
      <div className="layout-shell">
        <div className="grid gap-10 lg:grid-cols-[minmax(240px,0.8fr)_minmax(0,2fr)] lg:gap-16">
          <div className="max-w-sm">
            <h2 id="platform-footer-title" className="sr-only">
              Motormila
            </h2>
            <PrefetchLink
              to="/"
              className="inline-flex rounded-sm no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t("footer.homeAria", "Go to Motormila home")}
            >
              <BrandLogo size="compact" showTagline={false} />
            </PrefetchLink>
            <p className="mt-4 text-footnote text-label-2">
              {t(
                "footer.body",
                "Sri Lanka vehicle market intelligence — live listings, fair-value signals, and tools built for buyers and dealers.",
              )}
            </p>
            <Button asChild size="sm" className="mt-5">
              <PrefetchLink to="/pricing" className="no-underline">
                {t("footer.explorePro", "Explore Pro")}
                <ArrowUpRight aria-hidden />
              </PrefetchLink>
            </Button>
          </div>

          <nav aria-label={t("footer.navAria", "Footer navigation")} className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 xl:grid-cols-5">
            <FooterColumn title={t("footer.platform", "Platform")} links={platformLinks} />
            <FooterColumn title={t("footer.tools", "Tools")} links={toolLinks} />
            <FooterColumn title={t("footer.more", "More")} links={moreLinks} />
            <FooterColumn title={t("footer.legal", "Legal")} links={legalLinks} />
            <div>
              <p className="text-footnote font-semibold text-foreground">{t("footer.studio", "Studio")}</p>
              <ul className="mt-3 space-y-2.5">
                {studioLinks.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-sm text-footnote text-label-2 no-underline transition-colors duration-short hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {link.label}
                      <ArrowUpRight className="h-3 w-3" aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-separator pt-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-caption text-label-2">
              {t("footer.copyright", "© {year} Ardeno Studio. Built in Sri Lanka.", { year })}
            </p>
            <p className="text-caption text-label-2">
              {t("footer.fontCredit", "Set in Cal Sans by Mark Davis, under the SIL Open Font License.")}{" "}
              <a href="/fonts/cal-sans/OFL.txt" className="underline decoration-border underline-offset-2 hover:text-foreground">
                {t("footer.fontLicence", "Licence")}
              </a>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {socialLinks.map(({ icon: Icon, label, href }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className={cn(quietButton, "w-8 justify-center px-0")}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
              </a>
            ))}
            <button type="button" onClick={() => openFeedbackDialog()} className={quietButton}>
              {t("shell.nav.feedback", "Send feedback")}
            </button>
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: scrollBehavior() })}
              className={quietButton}
            >
              {t("footer.backToTop", "Back to top")}
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
