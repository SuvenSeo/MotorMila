import { useState } from "react";
import { Link } from "react-router-dom";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { ChevronDown } from "lucide-react";
import { prefetchRoute } from "@/lib/routePrefetch";
import { openFeedbackDialog } from "@/lib/feedbackEvents";
import { FEEDBACK_LINK, MORE_LINKS, NAV_DESTINATIONS, type NavIcon, type NavLinkItem } from "@/lib/siteNav";
import { cn } from "@/lib/utils";

type T = (key: string, fallback?: string) => string;

const byKey = (key: string) => MORE_LINKS.find((item) => item.key === key);

/** What "More" holds: only routes no other header item reaches. */
const PLAN_KEYS = ["pricing", "pro-preview"];
const HELP_KEYS = ["docs", "mobile-app"];

const SAVED_DEST = NAV_DESTINATIONS.find((d) => d.id === "saved");

/** "Saved" leaves the header on narrow desktops (collapse step 4); show it here then. */
function savedLinkHidden(): boolean {
  if (typeof document === "undefined") return false;
  const link = document.querySelector<HTMLElement>('.site-nav__link[data-dest="saved"]');
  return !!link && link.offsetParent === null;
}

/**
 * Desktop "More" dropdown (lg+). A compact menu anchored to the More pill,
 * built on Radix DropdownMenu: button aria-expanded/aria-haspopup, role=menu
 * with menuitems, arrow keys + typeahead, Esc / click-outside close, focus
 * moves in on open and returns to the pill on close.
 */
export function NavMoreMenu({ pathname, t }: { pathname: string; t: T }) {
  const [open, setOpen] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  const onOpenChange = (next: boolean) => {
    if (next) setShowSaved(savedLinkHidden());
    setOpen(next);
  };

  const plans = PLAN_KEYS.map(byKey).filter(Boolean) as NavLinkItem[];
  const help = HELP_KEYS.map(byKey).filter(Boolean) as NavLinkItem[];
  const settings = byKey("settings");
  const savedItem = SAVED_DEST?.items[0];

  return (
    <Menu.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <Menu.Trigger asChild>
        <button type="button" className="site-nav__link gap-1" data-active={false} data-nav-more>
          <span className="relative z-10">{t("nav.more", "More")}</span>
          <ChevronDown
            className={cn("relative z-10 h-3.5 w-3.5 opacity-70 transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")}
            aria-hidden
          />
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="center"
          side="bottom"
          sideOffset={12}
          collisionPadding={12}
          loop
          aria-label={t("nav.more", "More")}
          className="nav-more mm-pop [--mm-origin:var(--radix-dropdown-menu-content-transform-origin)] z-header"
        >
          {showSaved && savedItem ? (
            <>
              <Menu.Group>
                <MoreItem item={savedItem} pathname={pathname} t={t} />
              </Menu.Group>
              <Menu.Separator className="nav-more__sep" />
            </>
          ) : null}

          <Menu.Group>
            <Menu.Label className="nav-more__label">{t("nav.moreGroupPlans", "Plans")}</Menu.Label>
            {plans.map((item) => (
              <MoreItem key={item.key} item={item} pathname={pathname} t={t} />
            ))}
          </Menu.Group>

          <Menu.Separator className="nav-more__sep" />

          <Menu.Group>
            <Menu.Label className="nav-more__label">{t("nav.moreGroupHelp", "Help")}</Menu.Label>
            {help.map((item) => (
              <MoreItem key={item.key} item={item} pathname={pathname} t={t} />
            ))}
            <Menu.Item className="nav-more__item" onSelect={() => openFeedbackDialog()}>
              <ItemBody
                icon={FEEDBACK_LINK.icon}
                title={t(FEEDBACK_LINK.labelKey, FEEDBACK_LINK.fallback)}
                detail={t("shell.nav.feedbackDetail", "Report a problem or suggest an idea")}
              />
            </Menu.Item>
          </Menu.Group>

          <div className="nav-more__foot">
            {settings ? (
              <Menu.Item asChild>
                <Link to={settings.href} className="nav-more__foot-link" onPointerEnter={() => prefetchRoute(settings.href)}>
                  {t(settings.labelKey, settings.fallback)}
                </Link>
              </Menu.Item>
            ) : null}
            <Menu.Item asChild>
              <Link to="/privacy" className="nav-more__foot-link">
                {t("footer.privacyShort", "Privacy")}
              </Link>
            </Menu.Item>
            <Menu.Item asChild>
              <Link to="/terms" className="nav-more__foot-link">
                {t("footer.termsShort", "Terms")}
              </Link>
            </Menu.Item>
          </div>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

function MoreItem({ item, pathname, t }: { item: NavLinkItem; pathname: string; t: T }) {
  const active = pathname === item.href;
  return (
    <Menu.Item asChild>
      <Link
        to={item.href}
        className="nav-more__item"
        data-current={active}
        aria-current={active ? "page" : undefined}
        onPointerEnter={() => prefetchRoute(item.href)}
        onFocus={() => prefetchRoute(item.href)}
      >
        <ItemBody
          icon={item.icon}
          title={t(item.labelKey, item.fallback)}
          detail={item.detailKey ? t(item.detailKey, item.detailFallback) : undefined}
        />
      </Link>
    </Menu.Item>
  );
}

function ItemBody({ icon: Icon, title, detail }: { icon: NavIcon; title: string; detail?: string }) {
  return (
    <>
      <span className="nav-more__icon" aria-hidden>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="nav-more__title">{title}</span>
        {detail ? <span className="nav-more__detail">{detail}</span> : null}
      </span>
    </>
  );
}
