import type { ComponentType } from "react";
import {
  BarChart3,
  Bell,
  BookOpen,
  Bookmark,
  Calculator,
  ClipboardCheck,
  Crown,
  FileText,
  Gauge,
  Landmark,
  LayoutGrid,
  MessageSquare,
  Scale,
  Search,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  Store,
  Tag,
  TrendingUp,
  UserCircle2,
  Wallet,
  Zap,
} from "lucide-react";

/**
 * Site information architecture (ui/shell).
 *
 * Five primary destinations — Buy, Prices, Tools, Sell, Saved — used by the
 * desktop header, the mobile bottom nav, the mobile menu and the footer. Every
 * public route is listed under one of them (or under `MORE_LINKS`) so nothing
 * becomes unreachable when it leaves the header.
 */

export type NavIcon = ComponentType<{ className?: string }>;

export type NavLinkItem = {
  key: string;
  labelKey: string;
  fallback: string;
  detailKey?: string;
  detailFallback?: string;
  href: string;
  icon: NavIcon;
  /** Route sits behind sign-in (tap still works; RequireAuth sends them to /sign-in). */
  requiresAuth?: boolean;
};

export type NavDestinationId = "buy" | "prices" | "tools" | "sell" | "saved";

export type NavDestination = {
  id: NavDestinationId;
  labelKey: string;
  fallback: string;
  href: string;
  icon: NavIcon;
  /** Path prefixes that light this destination up. "/" matches only the home page. */
  activePrefixes: string[];
  requiresAuth?: boolean;
  items: NavLinkItem[];
};

export const NAV_DESTINATIONS: NavDestination[] = [
  {
    id: "buy",
    labelKey: "shell.nav.buy",
    fallback: "Buy",
    href: "/",
    icon: Search,
    activePrefixes: ["/", "/cars", "/listing", "/locations", "/best-picks", "/ev-hub", "/ev-chargers", "/compare"],
    items: [
      { key: "browse", labelKey: "shell.nav.browseAll", fallback: "Browse all vehicles", detailKey: "shell.nav.browseAllDetail", detailFallback: "Cars, bikes, three-wheelers, vans", href: "/#market", icon: LayoutGrid },
      { key: "best-picks", labelKey: "shell.nav.bestDeals", fallback: "Best deals", detailKey: "shell.nav.bestDealsDetail", detailFallback: "Priced below similar ads", href: "/best-picks", icon: Star },
      { key: "ev-hub", labelKey: "shell.nav.electric", fallback: "Electric & hybrid", detailKey: "shell.nav.electricDetail", detailFallback: "EV prices and running costs", href: "/ev-hub", icon: Zap },
      { key: "compare", labelKey: "nav.compare", fallback: "Compare", detailKey: "shell.nav.compareDetail", detailFallback: "Up to three vehicles side by side", href: "/compare", icon: Scale },
    ],
  },
  {
    id: "prices",
    labelKey: "shell.nav.prices",
    fallback: "Prices",
    href: "/trends",
    icon: TrendingUp,
    activePrefixes: ["/trends", "/estimate", "/official-pulse", "/permits", "/price-index", "/valuation"],
    items: [
      { key: "trends", labelKey: "shell.nav.priceTrends", fallback: "Price trends", detailKey: "shell.nav.priceTrendsDetail", detailFallback: "Asking prices by model over time", href: "/trends", icon: BarChart3 },
      { key: "estimate", labelKey: "shell.nav.valueMyVehicle", fallback: "What's my vehicle worth?", detailKey: "shell.nav.valueMyVehicleDetail", detailFallback: "Price range from similar ads", href: "/estimate", icon: Gauge },
      { key: "official-pulse", labelKey: "shell.nav.officialUpdates", fallback: "Tax & customs updates", detailKey: "shell.nav.officialUpdatesDetail", detailFallback: "Gazettes, DMT and Customs news", href: "/official-pulse", icon: Landmark },
      { key: "permits", labelKey: "shell.nav.permits", fallback: "Import permit prices", detailKey: "shell.nav.permitsDetail", detailFallback: "What permits are selling for", href: "/permits", icon: FileText },
    ],
  },
  {
    id: "tools",
    labelKey: "shell.nav.tools",
    fallback: "Tools",
    href: "/calculator",
    icon: Calculator,
    activePrefixes: ["/calculator", "/afford", "/safe-transfer", "/finance", "/leasing", "/inspection", "/insurance"],
    items: [
      { key: "calculator", labelKey: "shell.nav.importTax", fallback: "Import tax calculator", detailKey: "shell.nav.importTaxDetail", detailFallback: "Landed cost with duty and VAT", href: "/calculator", icon: Calculator },
      { key: "afford", labelKey: "nav.afford", fallback: "What can I afford?", detailKey: "shell.nav.affordDetail", detailFallback: "Search by cash and monthly budget", href: "/afford", icon: Wallet },
      { key: "safe-transfer", labelKey: "shell.nav.safeTransfer", fallback: "Ownership transfer checklist", detailKey: "shell.nav.safeTransferDetail", detailFallback: "CR book, DMT forms, sale agreement", href: "/safe-transfer", icon: ShieldCheck },
      { key: "finance", labelKey: "shell.nav.leasing", fallback: "Leasing quotes", detailKey: "shell.nav.leasingDetail", detailFallback: "Ask lenders for a quote", href: "/finance", icon: Landmark },
      { key: "inspection", labelKey: "shell.nav.inspection", fallback: "Book an inspection", detailKey: "shell.nav.inspectionDetail", detailFallback: "Have a mechanic check the vehicle", href: "/inspection", icon: ClipboardCheck },
      { key: "insurance", labelKey: "shell.nav.insurance", fallback: "Insurance quotes", detailKey: "shell.nav.insuranceDetail", detailFallback: "Through a licensed broker", href: "/insurance", icon: ShieldCheck },
    ],
  },
  {
    id: "sell",
    labelKey: "shell.nav.sell",
    fallback: "Sell",
    href: "/sell",
    icon: Tag,
    activePrefixes: ["/sell", "/profile", "/dealer"],
    items: [
      { key: "sell", labelKey: "shell.nav.sellVehicle", fallback: "Sell your vehicle", detailKey: "shell.nav.sellVehicleDetail", detailFallback: "See a fair asking price first", href: "/sell", icon: Tag },
      { key: "profile", labelKey: "nav.myListings", fallback: "My listings", detailKey: "nav.myListingsDetail", detailFallback: "Manage your vehicle ads", href: "/profile", icon: UserCircle2, requiresAuth: true },
      { key: "dealer", labelKey: "shell.nav.dealer", fallback: "Dealer workspace", detailKey: "shell.nav.dealerDetail", detailFallback: "Price your stock against the market", href: "/dealer", icon: Store, requiresAuth: true },
    ],
  },
  {
    id: "saved",
    labelKey: "shell.nav.saved",
    fallback: "Saved",
    href: "/alerts",
    icon: Bookmark,
    activePrefixes: ["/alerts"],
    requiresAuth: true,
    items: [
      { key: "alerts", labelKey: "shell.nav.savedAlerts", fallback: "Saved vehicles & alerts", detailKey: "shell.nav.savedAlertsDetail", detailFallback: "Price-drop alerts on what you follow", href: "/alerts", icon: Bell, requiresAuth: true },
    ],
  },
];

/** Secondary links: header "More" dropdown (NavMoreMenu), mobile menu and footer. */
export const MORE_LINKS: NavLinkItem[] = [
  { key: "pricing", labelKey: "nav.pricing", fallback: "Pricing", detailKey: "shell.nav.pricingDetail", detailFallback: "Free during beta", href: "/pricing", icon: Crown },
  { key: "pro-preview", labelKey: "shell.nav.proPreview", fallback: "Pro preview", detailKey: "shell.nav.proPreviewDetail", detailFallback: "What Pro will include", href: "/pro-preview", icon: Sparkles },
  { key: "docs", labelKey: "shell.nav.howItWorks", fallback: "How it works", detailKey: "shell.nav.howItWorksDetail", detailFallback: "Where prices and scores come from", href: "/docs", icon: BookOpen },
  { key: "mobile-app", labelKey: "nav.mobileApp", fallback: "Mobile App", detailKey: "shell.nav.mobileAppDetail", detailFallback: "Android app, coming soon", href: "/mobile-app", icon: Smartphone },
  { key: "settings", labelKey: "nav.settings", fallback: "Settings", detailKey: "nav.settingsDetail", detailFallback: "Language, theme and preferences", href: "/settings", icon: Settings, requiresAuth: true },
];

export const FEEDBACK_LINK = { labelKey: "shell.nav.feedback", fallback: "Send feedback", icon: MessageSquare } as const;

/** Whether `pathname` (+hash) belongs to a destination. Buy owns "/" exactly. */
export function isDestinationActive(dest: NavDestination, pathname: string): boolean {
  return dest.activePrefixes.some((prefix) =>
    prefix === "/" ? pathname === "/" : pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function activeDestinationId(pathname: string): NavDestinationId | null {
  return NAV_DESTINATIONS.find((d) => isDestinationActive(d, pathname))?.id ?? null;
}
