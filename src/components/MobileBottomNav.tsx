import { BarChart2, Bell, Crown, Home, Star, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { useLocation } from "react-router-dom";
import { PrefetchLink } from "@/components/PrefetchLink";
import { useAppPreferences } from "@/lib/appPreferences";
import { springSnappy } from "@/lib/motion";

type NavTab = {
  labelKey: string;
  fallback: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  matchHash?: string;
};

const TABS: NavTab[] = [
  { labelKey: "nav.home", fallback: "Home", href: "/", icon: Home },
  { labelKey: "nav.market", fallback: "Market", href: "/#market", icon: TrendingUp, matchHash: "market" },
  { labelKey: "nav.alerts", fallback: "Alerts", href: "/alerts", icon: Bell },
  { labelKey: "nav.trends", fallback: "Trends", href: "/trends", icon: BarChart2 },
  { labelKey: "nav.bestPicks", fallback: "Best Picks", href: "/best-picks", icon: Star },
  { labelKey: "nav.pro", fallback: "Pro", href: "/pro", icon: Crown },
];

function useIsTabActive(tab: NavTab): boolean {
  const { pathname, hash } = useLocation();

  if (tab.matchHash) {
    return pathname === "/" && hash === `#${tab.matchHash}`;
  }

  if (tab.href === "/") {
    return pathname === "/" && !hash;
  }

  return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
}

function TabItem({ tab }: { tab: NavTab }) {
  const isActive = useIsTabActive(tab);
  const { t } = useAppPreferences();
  const Icon = tab.icon;
  const label = t(tab.labelKey, tab.fallback);

  return (
    <PrefetchLink
      to={tab.href}
      aria-label={label}
      aria-current={isActive ? "page" : undefined}
      data-active={isActive}
      className={`group relative flex flex-1 flex-col items-center justify-center gap-1 py-2 no-underline outline-none transition-colors duration-200 ease-apple focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-[0.96] ${
        isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <span className="relative flex h-7 w-7 items-center justify-center">
        {isActive && (
          <motion.span
            layoutId="mobile-nav-pill"
            className="absolute inset-0 rounded-full bg-primary/12"
            transition={springSnappy}
            aria-hidden
          />
        )}
        <Icon
          className={`relative z-10 h-4 w-4 transition-transform duration-200 ease-apple ${
            isActive ? "scale-110" : "group-hover:scale-105"
          }`}
        />
      </span>
      <span
        className={`whitespace-nowrap text-[10px] font-semibold tracking-tight leading-none ${
          isActive ? "text-primary" : "text-muted-foreground"
        }`}
      >
        {label}
      </span>
    </PrefetchLink>
  );
}

export function MobileBottomNav() {
  const { t } = useAppPreferences();

  return (
    <nav
      aria-label={t("nav.mobileNavigation", "Mobile bottom navigation")}
      className="md:hidden fixed inset-x-3 bottom-3 z-[999] pointer-events-auto"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="nav-glass overflow-hidden rounded-full">
        <div className="flex min-h-16 items-stretch px-1">
          {TABS.map((tab) => (
            <TabItem key={tab.href} tab={tab} />
          ))}
        </div>
      </div>
    </nav>
  );
}
