import PushpinTearFooter, { type FooterAnchorProps } from "@/components/ui/pushpin-tear-footer";
import { PrefetchLink } from "@/components/PrefetchLink";
import { useAppPreferences } from "@/lib/appPreferences";
import { BRAND } from "@/lib/brand";
import { HOW_WE_PRICE_PATH } from "@/lib/howWePrice";
import "@/styles/pushpin-footer.css";

function FooterRouterLink({ href, ...props }: FooterAnchorProps) {
  return <PrefetchLink to={href} {...props} />;
}

/** The site footer: Motormila's take on the pushpin tear-off poster. */
export default function MotormilaTearFooter() {
  const { t } = useAppPreferences();

  return (
    <PushpinTearFooter
      className="tpf-motormila theme-dark"
      brand={<img src={BRAND.logo.wordmarkDarkTheme} alt="" width={1016} height={170} draggable={false} />}
      name={BRAND.name}
      paperCaption={t("footer.tagline", "Market Intelligence")}
      logo={
        <img src={BRAND.logo.icon} alt="" width={48} height={48} draggable={false} />
      }
      logoHref="/"
      internalLink={FooterRouterLink}
      email={BRAND.contactEmail}
      newsletter={null}
      posterAction={{
        caption: t("mapp.title", "Know the fair price"),
        label: t("nav.trends", "Trends"),
        href: "/trends",
      }}
      status={{ label: t("footer.howWePrice", "How we score prices"), href: HOW_WE_PRICE_PATH }}
      mark="COLOMBO / LK"
      timeZone="Asia/Colombo"
      timeLabel="SLST"
      socials={[
        { icon: "doc", label: t("nav.docs", "Docs"), href: "/docs" },
      ]}
      columns={[
        {
          title: t("footer.platform", "Platform"),
          links: [
            { label: t("nav.market", "Market"), href: "/#market" },
            { label: t("nav.compare", "Compare"), href: "/compare" },
            { label: t("nav.bestPicks", "Best Picks"), href: "/best-picks" },
          ],
          cta: { label: t("footer.explorePro", "Explore Pro"), href: "/pricing" },
        },
        {
          title: t("footer.tools", "Tools"),
          links: [
            { label: t("nav.calculator", "Calculator"), href: "/calculator" },
            { label: t("nav.valuation", "Valuation"), href: "/estimate" },
            { label: t("nav.evHub", "EV Hub"), href: "/ev-hub" },
          ],
          cta: { label: t("nav.mobileApp", "Mobile App"), href: "/mobile-app" },
        },
      ]}
      chat={{ label: t("common.messageUs", "Message us") }}
      sideLinks={[
        { icon: "shield", label: t("footer.privacyShort", "Privacy"), href: "/privacy" },
        { icon: "doc", label: t("footer.termsShort", "Terms"), href: "/terms" },
      ]}
      copyright={t("footer.copyright", "© {year} Ardeno Studio. Built in Sri Lanka.", {
        year: new Date().getFullYear(),
      })}
      credit=""
      handle={{ label: "Ardeno Studio", href: "https://www.ardenostudio.online/" }}
      sheet="var(--mm-poster-sheet)"
      sheetInk="hsl(var(--foreground))"
      pinColor={BRAND.colors.blue}
      pinHint={t("footer.pullPin", "Pull the pin")}
      paper="hsl(var(--background))"
      paperInk="hsl(var(--foreground))"
      fontSans="var(--font-body)"
      seed={7}
      height="clamp(620px, calc(100svh - var(--nav-offset) - var(--dock-bottom, 0px)), 900px)"
    />
  );
}
