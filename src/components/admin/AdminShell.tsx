import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "motion/react";
import {
  Activity,
  BarChart3,
  ClipboardCheck,
  Crown,
  Database,
  Inbox,
  LayoutGrid,
  Lock,
  MailPlus,
  Menu,
  MessageSquareText,
  ScrollText,
  ShieldCheck,
  Store,
  UsersRound,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/authContext";
import { getAdminOverview } from "@/services/api";
import { getAdminLeads, getModerationQueue } from "@/lib/adminQueuesApi";
import { AdminAvatar } from "@/components/admin/AdminKit";

/**
 * AdminShell — CeyFi Admin's frame, Motormila-branded.
 *
 * Fixed 15.5rem sidebar on desktop, the page inset as one white rounded
 * sheet that scrolls on its own, a black active pill with a spring
 * layoutId, badge counts on Leads / Feedback / Moderation, and an account
 * area with the session time left and a Lock button.
 *
 * Mobile differs from CeyFi on purpose: CeyFi's 8-item bottom tab bar
 * cannot fit 14 sections, so phones get a top bar plus a drawer with the
 * full nav (no bottom bar).
 *
 * The shell forces the light theme for its whole subtree by overriding
 * the app's light token values inline: the admin stays light even when
 * the rest of the site is in dark mode, and token-based panels
 * (e.g. the queue panels) render light too.
 */

export interface AdminNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: "leads" | "feedback" | "moderation";
}

export interface AdminNavSection {
  label: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV: AdminNavSection[] = [
  {
    label: "Manage",
    items: [
      { to: "/motormila/admin", label: "Overview", icon: LayoutGrid },
      { to: "/motormila/admin/analytics", label: "Analytics", icon: BarChart3 },
      { to: "/motormila/admin/users", label: "Users", icon: UsersRound },
      { to: "/motormila/admin/leads", label: "Leads", icon: Inbox, badge: "leads" },
      { to: "/motormila/admin/feedback", label: "Feedback", icon: MessageSquareText, badge: "feedback" },
      { to: "/motormila/admin/logs", label: "Logs", icon: ScrollText },
      { to: "/motormila/admin/health", label: "Health", icon: Activity },
      { to: "/motormila/admin/data-requests", label: "Data requests", icon: ShieldCheck },
    ],
  },
  {
    label: "Platform",
    items: [
      { to: "/motormila/admin/invites", label: "Invites", icon: MailPlus },
      { to: "/motormila/admin/pipeline", label: "Pipeline", icon: Database },
      { to: "/motormila/admin/dealers", label: "Dealers", icon: Store },
      { to: "/motormila/admin/permits", label: "Permits", icon: Crown },
      { to: "/motormila/admin/moderation", label: "Moderation", icon: ClipboardCheck, badge: "moderation" },
      { to: "/motormila/admin/system", label: "System", icon: Wrench },
    ],
  },
];

const PILL = { type: "spring", visualDuration: 0.45, bounce: 0.04 } as const;

/** Light token values from the app's :root, pinned so dark mode can't leak in. */
const LIGHT_VARS = {
  "--background": "36 28% 97.2%",
  "--foreground": "24 16% 9%",
  "--card": "40 40% 99%",
  "--card-foreground": "24 16% 9%",
  "--popover": "40 40% 99%",
  "--popover-foreground": "24 16% 9%",
  "--surface": "36 20% 94.6%",
  "--surface-foreground": "24 16% 9%",
  "--surface-1": "40 40% 99%",
  "--surface-2": "240 20% 96%",
  "--surface-3": "240 20% 96%",
  "--primary": "213 100% 45%",
  "--primary-foreground": "0 0% 100%",
  "--secondary": "240 20% 96%",
  "--secondary-foreground": "240 6% 14%",
  "--muted": "240 20% 96%",
  "--muted-foreground": "240 4% 42%",
  "--accent": "240 20% 95%",
  "--accent-foreground": "240 6% 12%",
  "--destructive": "4 72% 47%",
  "--destructive-foreground": "0 0% 100%",
  "--border": "240 6% 10% / 0.10",
  "--input": "240 6% 10% / 0.14",
  "--ring": "213 100% 45%",
  colorScheme: "light",
} as CSSProperties;

function isActive(pathname: string, to: string): boolean {
  const base = "/motormila/admin";
  if (to === base) return pathname === base || pathname === `${base}/`;
  return pathname === to || pathname.startsWith(`${to}/`);
}

function useBadges() {
  const overview = useQuery({ queryKey: ["admin", "overview"], queryFn: getAdminOverview, staleTime: 30_000 });
  const leads = useQuery({
    queryKey: ["admin", "leads", "new-count"],
    queryFn: () => getAdminLeads({ status: "new" }),
    staleTime: 30_000,
  });
  const moderation = useQuery({
    queryKey: ["admin", "moderation", "pending-count"],
    queryFn: () => getModerationQueue("pending"),
    staleTime: 30_000,
  });
  return {
    leads: leads.data?.count ?? 0,
    feedback: overview.data?.feedback.open ?? 0,
    moderation: moderation.data?.count ?? 0,
  };
}

function NavList({ badges, onNavigate }: { badges: Record<string, number>; onNavigate?: () => void }) {
  const { pathname } = useLocation();
  return (
    <div className="space-y-6">
      {ADMIN_NAV.map((section) => (
        <nav key={section.label} aria-label={`${section.label} admin pages`}>
          <p className="mb-1.5 px-3 text-[0.625rem] font-semibold tracking-[0.16em] text-label-2 uppercase">{section.label}</p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = isActive(pathname, item.to);
              const Icon = item.icon;
              const count = item.badge ? badges[item.badge] ?? 0 : 0;
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    aria-current={active ? "page" : undefined}
                    onClick={onNavigate}
                    className={cn(
                      "group relative isolate flex h-9 items-center gap-3 rounded-lg px-3 text-[0.8125rem] no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                      active
                        ? "font-medium text-white transition-colors delay-75 duration-150"
                        : "text-label-2 transition-colors duration-200 hover:bg-black/5 hover:text-foreground",
                    )}
                  >
                    {active ? (
                      <motion.span
                        layoutId="admin-nav-pill"
                        transition={PILL}
                        className="absolute inset-0 -z-10 rounded-lg bg-[#09090B] shadow-[0_1px_2px_rgb(0_0_0/0.14)]"
                      />
                    ) : null}
                    <Icon
                      aria-hidden
                      className={cn("size-4 shrink-0", active ? "text-white" : "text-label-2 group-hover:text-foreground")}
                      strokeWidth={active ? 2.2 : 1.8}
                    />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {count > 0 ? (
                      <span
                        className={cn(
                          "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[0.6875rem] font-semibold tabular-nums",
                          active ? "bg-white/20 text-white" : "bg-black/5 text-foreground",
                        )}
                      >
                        {count}
                        <span className="sr-only"> {item.badge === "leads" ? "new" : item.badge === "feedback" ? "open" : "pending"}</span>
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ))}
    </div>
  );
}

function AccountArea({ minutesLeft, onLock }: { minutesLeft: number; onLock: () => void }) {
  const { user } = useAuth();
  const name = user?.name || user?.email || "Admin";
  const email = user?.email || "";
  return (
    <div className="border-t border-border pt-3">
      <div className="flex items-center gap-2.5 px-2 py-1.5">
        <AdminAvatar name={name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.8125rem] font-medium text-foreground">{name}</span>
          <span className="block truncate text-[0.6875rem] text-label-2">{email}</span>
        </span>
        <button
          type="button"
          onClick={onLock}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[0.75rem] font-medium text-foreground hover:border-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <Lock aria-hidden className="size-3.5" />
          Lock{minutesLeft > 0 ? ` · ${minutesLeft}m` : ""}
        </button>
      </div>
      <p className="mt-2 flex items-center gap-1.5 px-2 text-[0.6875rem] leading-4 text-label-2">
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-[#0A7AFF]" />
        Motormila Admin · listings, users and counts only
      </p>
    </div>
  );
}

export function AdminShell({
  children,
  minutesLeft,
  onLock,
}: {
  children: ReactNode;
  minutesLeft: number;
  onLock: () => void;
}) {
  const { pathname } = useLocation();
  const badges = useBadges();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [pathname]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <div style={LIGHT_VARS} className="min-h-svh bg-[#f4f4f2] text-foreground lg:h-svh lg:overflow-hidden">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-lg focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow-lg"
      >
        Skip to content
      </a>

      {/* Sidebar */}
      <aside aria-label="Motormila Admin" className="fixed inset-y-0 left-0 z-40 hidden w-[15.5rem] flex-col px-3 py-4 lg:flex">
        <Link to="/motormila/admin" aria-label="Motormila Admin, overview" className="flex h-8 items-center gap-2.5 self-start rounded-md pl-2 text-foreground no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
          <img src="/logo-mark.svg" alt="" aria-hidden className="h-6 w-6 shrink-0 object-contain" />
          <span className="font-display text-[1.0625rem] font-semibold tracking-tight">Motormila</span>
          <span className="rounded-full bg-[#09090B] px-2 py-0.5 text-[0.6875rem] font-medium tracking-[0.01em] text-white">Admin</span>
        </Link>
        <div className="mt-7 flex-1 overflow-y-auto">
          <NavList badges={badges} />
        </div>
        <AccountArea minutesLeft={minutesLeft} onLock={onLock} />
      </aside>

      {/* Phone: top bar */}
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b border-border bg-[#f4f4f2]/90 px-4 backdrop-blur-xl lg:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open admin menu"
          className="flex size-9 items-center justify-center rounded-full border border-border bg-card text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <Menu aria-hidden className="size-4" />
        </button>
        <Link to="/motormila/admin" aria-label="Motormila Admin, overview" className="flex items-center gap-2 text-foreground no-underline">
          <img src="/logo-mark.svg" alt="" aria-hidden className="h-5 w-5 shrink-0 object-contain" />
          <span className="font-display text-[1rem] font-semibold tracking-tight">Motormila</span>
          <span className="rounded-full bg-[#09090B] px-2 py-0.5 text-[0.6875rem] font-medium text-white">Admin</span>
        </Link>
        <span className="w-9" aria-hidden />
      </div>

      {/* Phone: drawer with the full nav (no bottom tab bar — 14 items won't fit one) */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Admin menu">
          <button type="button" aria-label="Close menu" onClick={() => setDrawerOpen(false)} className="absolute inset-0 bg-black/40" />
          <div className="absolute inset-y-0 left-0 flex w-[19rem] max-w-[85vw] flex-col bg-[#f4f4f2] px-3 py-4 shadow-2xl">
            <div className="mb-6 flex items-center justify-between pl-2">
              <span className="flex items-center gap-2">
                <img src="/logo-mark.svg" alt="" aria-hidden className="h-6 w-6 object-contain" />
                <span className="font-display text-[1.0625rem] font-semibold">Motormila</span>
                <span className="rounded-full bg-[#09090B] px-2 py-0.5 text-[0.6875rem] font-medium text-white">Admin</span>
              </span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="flex size-9 items-center justify-center rounded-full border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <NavList badges={badges} onNavigate={() => setDrawerOpen(false)} />
            </div>
            <AccountArea minutesLeft={minutesLeft} onLock={onLock} />
          </div>
        </div>
      ) : null}

      {/* The page, inset as one rounded sheet that scrolls on its own */}
      <div className="lg:h-svh lg:py-2.5 lg:pr-2.5 lg:pl-[15.5rem]">
        <div
          ref={scroller}
          className="min-h-[calc(100svh-3.5rem)] rounded-t-[1.5rem] bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.06)] max-lg:overflow-x-clip lg:h-full lg:min-h-0 lg:overflow-y-auto lg:rounded-[1.5rem] lg:shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_1px_3px_rgb(0_0_0/0.04)]"
        >
          <main id="admin-main" tabIndex={-1} className="mx-auto w-full max-w-[76rem] px-4 pt-6 pb-16 outline-none sm:px-6 lg:px-10 lg:pt-9">
            <div key={pathname} className="space-y-6">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
