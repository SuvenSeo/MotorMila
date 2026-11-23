import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Crown, LogOut, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DeltaChip } from "@/components/pro/DeltaChip";
import { useAppPreferences } from "@/lib/appPreferences";

export type DeskMode = "market" | "lanes" | "geographies" | "movement" | "sources";

export type DeskModeConfig = {
  id: DeskMode;
  label: string;
  /** The page's own headline, one step above the section titles. */
  title: string;
  hint: string;
  icon: React.ElementType;
};

export type TapeStat = {
  key: string;
  label: string;
  value: string;
  /** Signed percentage; omitted for pure counts. */
  delta?: number | null;
  polarity?: "price" | "volume" | "score" | "neutral";
  period?: string;
};

/**
 * The Pro desk shell: one ink command bar, a market tape under it, and a fixed
 * rail on desktop. The bar carries scope and freshness; the rail carries mode.
 * Everything below is data.
 */
export function ProShell({
  modes,
  mode,
  onMode,
  filters,
  freshness,
  onRefresh,
  refreshing,
  actions,
  tape,
  account,
  children,
}: {
  modes: DeskModeConfig[];
  mode: DeskMode;
  onMode: (mode: DeskMode) => void;
  /** Global scope controls rendered in the command bar. */
  filters?: ReactNode;
  /** "Live · 3h" style status line. */
  freshness: ReactNode;
  onRefresh: () => void;
  refreshing: boolean;
  /** Export menu, report drawer trigger, and anything else on the right. */
  actions?: ReactNode;
  tape: TapeStat[];
  account: { email?: string | null; plan?: string | null; onLogout: () => void };
  children: ReactNode;
}) {
  const { t } = useAppPreferences();
  return (
    <div className="min-h-screen bg-background">
      <header className="theme-dark sticky top-0 z-40 text-foreground">
        <div className="border-b border-white/10 cine-ink-surface">
          <div className="mx-auto flex min-h-14 max-w-[1640px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 sm:px-5">
            <Link to="/" className="flex shrink-0 items-center gap-2 no-underline">
              <img src="/logo.png" alt="Motormila" className="h-7 w-7 rounded-full ring-1 ring-white/15" />
              <span className="hidden sm:block">
                <span className="block text-footnote font-semibold leading-tight text-white">Motormila</span>
                <span className="tech-label block text-white/55">{t("pro.desk", "Pro desk")}</span>
              </span>
            </Link>

            {/* Mode switcher lives in the bar on small screens, in the rail from lg. */}
            <nav aria-label={t("pro.modeAria", "Pro workspace mode")} className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto lg:hidden">
              {modes.map((item) => {
                const Icon = item.icon;
                const active = item.id === mode;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onMode(item.id)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-caption font-semibold transition-colors duration-short",
                      active ? "bg-white/12 text-white" : "text-white/60 hover:text-white",
                    )}
                  >
                    <Icon aria-hidden className="h-3.5 w-3.5" />
                    {item.label}
                  </button>
                );
              })}
            </nav>

            <div className="hidden min-w-0 flex-1 items-center gap-2 lg:flex">{filters}</div>

            <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
              <span className="hidden items-center gap-1.5 text-caption font-medium text-white/60 sm:inline-flex">{freshness}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onRefresh}
                disabled={refreshing}
                aria-label={t("common.refresh", "Refresh")}
                className="text-white/70 hover:text-white"
              >
                <RefreshCw className={refreshing ? "animate-spin motion-reduce:animate-none" : undefined} aria-hidden />
              </Button>
              {actions}
              <Badge variant="info" className="hidden md:inline-flex">
                <Crown aria-hidden /> {account.plan || "Pro"}
              </Badge>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={account.onLogout}
                aria-label={t("nav.signOut", "Sign out")}
                className="text-white/60 hover:text-white"
              >
                <LogOut aria-hidden />
              </Button>
            </div>
          </div>

          <div className="mx-auto flex max-w-[1640px] flex-wrap items-center gap-2 border-t border-white/10 px-4 py-1.5 lg:hidden sm:px-5">
            {filters}
          </div>
        </div>

        <MarketTape stats={tape} />
      </header>

      <div className="mx-auto flex max-w-[1640px] items-start gap-0 px-0 sm:px-5">
        <nav
          aria-label={t("pro.sections", "Pro sections")}
          className="sticky top-[5.75rem] hidden w-[13rem] shrink-0 flex-col gap-0.5 self-start py-6 pr-4 lg:flex"
        >
          {modes.map((item) => {
            const Icon = item.icon;
            const active = item.id === mode;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onMode(item.id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex items-start gap-3 rounded-control px-3 py-2 text-left transition-colors duration-short",
                  active ? "bg-surface-2" : "hover:bg-surface-2/60",
                )}
              >
                <Icon
                  aria-hidden
                  className={cn("mt-0.5 h-4 w-4 shrink-0", active ? "text-primary" : "text-label-3 group-hover:text-label-2")}
                />
                <span className="min-w-0">
                  <span className={cn("block text-footnote font-semibold", active ? "text-foreground" : "text-label-2")}>
                    {item.label}
                  </span>
                  <span className="mt-0.5 block text-caption leading-snug text-label-3">{item.hint}</span>
                </span>
              </button>
            );
          })}
          <div className="mt-6 border-t border-separator pt-4">
            <p className="tech-label text-label-3">{t("pro.workspace", "Pro Workspace")}</p>
            <p className="mt-1 truncate text-caption text-label-2" title={account.email ?? undefined}>
              {account.email}
            </p>
          </div>
        </nav>

        <main className="min-w-0 flex-1 pb-16 pt-4 sm:pt-6">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div>
              <p className="tech-label text-label-3">{t("pro.desk", "Pro desk")}</p>
              <h1 className="mt-1 font-display text-title1 font-semibold tracking-tight text-foreground">
                {modes.find((item) => item.id === mode)?.title ?? modes[0]?.title}
              </h1>
            </div>
            <p className="max-w-md text-caption leading-snug text-label-3 sm:text-right">
              {modes.find((item) => item.id === mode)?.hint}
            </p>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

/** The tape: the five numbers you want visible at every scroll position. */
function MarketTape({ stats }: { stats: TapeStat[] }) {
  return (
    <div className="border-b border-white/10 cine-ink-surface">
      <dl className="mx-auto flex max-w-[1640px] items-center gap-x-5 gap-y-1 overflow-x-auto px-4 py-1.5 sm:px-5">
        {stats.map((stat) => (
          <div key={stat.key} className="flex shrink-0 items-baseline gap-1.5">
            <dt className="tech-label whitespace-nowrap text-white/45">{stat.label}</dt>
            <dd className="whitespace-nowrap text-caption font-semibold tabular-nums text-white">{stat.value}</dd>
            {stat.delta != null ? (
              <DeltaChip
                pct={stat.delta}
                polarity={stat.polarity}
                period={stat.period}
                className="border-white/15 bg-white/5 text-white/80"
              />
            ) : null}
          </div>
        ))}
      </dl>
    </div>
  );
}
