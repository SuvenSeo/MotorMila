import type { ReactNode } from "react";
import { ArrowRight, RotateCw, Search, X, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, cardVariants } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";

/**
 * Admin kit — the console's pieces, built from the app's primitives.
 *
 * Cards are `Card`, chips are `Badge`, KPI tiles are `StatTile`; type is the
 * shared scale (page title `text-title1`, card titles `text-body`, body copy
 * `text-footnote`/`text-caption`) and colour is semantic tokens only, so the
 * console follows the same light/dark theme as the rest of Motormila. Chart
 * accents use `brand` (Motormila Blue, decoration only) and `deal-*` signals;
 * Deal Green is never an admin accent. Missing data renders as "—", never as
 * a plausible 0.
 */

/** Bar/line accent: Motormila Blue as a fill — decoration, never text. */
const ACCENT_FILL = "bg-brand";

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString();
}

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Colombo",
  });
}

export function formatDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00+05:30`) : new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Colombo" });
}

/** "Just now", "12 min ago", "3 h ago", "Yesterday", "5 days ago", then the date. */
export function formatRelative(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const minutes = Math.round((now.getTime() - d.getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const colomboDay = (x: Date) => new Date(x.getTime() + 330 * 60_000).toISOString().slice(0, 10);
  const days = Math.round((Date.parse(colomboDay(now)) - Date.parse(colomboDay(d))) / 86_400_000);
  if (days === 0) return `${Math.floor(minutes / 60)} h ago`;
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return formatDay(iso);
}

export function adminGreeting(now = new Date()): string {
  const hour = Number(now.toLocaleString("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Colombo" }));
  const date = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Colombo" });
  return `${hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"} · ${date}`;
}

export function AdminHeader({
  title,
  description,
  actions,
  greeting,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  greeting?: boolean;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {greeting ? <p className="mb-1.5 text-footnote font-medium text-label-2">{adminGreeting()}</p> : null}
        <h1 className="font-display text-title1 font-semibold text-foreground [text-wrap:balance]">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-body text-label-2 [text-wrap:pretty]">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** The one card shell in the console — the `Card` primitive, unpadded. */
export const adminCardClass = cn(cardVariants({ padding: "none" }), "min-w-0 overflow-hidden");

export function AdminCard({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Card padding="none" className={cn("overflow-hidden", className)}>
      {title ? (
        <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
          <div className="min-w-0">
            <h2 className="text-body font-semibold text-foreground">{title}</h2>
            {description ? <p className="mt-0.5 text-caption text-label-2">{description}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </Card>
  );
}

export function AdminCardLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 rounded-control text-caption font-medium text-label-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
      <ArrowRight aria-hidden className="h-3.5 w-3.5" />
    </Link>
  );
}

/** Change against the previous period: a small tinted Badge with an arrow. */
export function AdminDelta({ current, previous, label }: { current: number; previous: number; label: string }) {
  const diff = current - previous;
  const tone = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
  const pct = previous > 0 ? Math.round((diff / previous) * 100) : null;
  const text = tone === "flat" ? "No change" : pct !== null ? `${pct > 0 ? "+" : ""}${pct}%` : `${diff > 0 ? "+" : ""}${diff}`;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-caption text-label-2">
      <Badge
        variant={tone === "up" ? "info" : tone === "down" ? "danger" : "neutral"}
        className="h-5 gap-1 px-1.5 font-medium tabular-nums"
      >
        {tone === "up" ? "↑" : tone === "down" ? "↓" : "—"} {text}
      </Badge>
      <span>{label}</span>
    </span>
  );
}

export function AdminKpiCard({
  label,
  value,
  icon: Icon,
  footer,
  to,
  className,
}: {
  label: string;
  value: string | number | null | undefined;
  icon?: LucideIcon;
  footer?: ReactNode;
  to?: string;
  className?: string;
}) {
  const formatted =
    value === null || value === undefined || value === ""
      ? "—"
      : typeof value === "number"
        ? value.toLocaleString("en-GB")
        : value;
  const tile = (
    <StatTile
      label={
        <span className="flex items-center justify-between gap-2">
          <span className="truncate">{label}</span>
          {Icon ? (
            <span className="hidden size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-label-2 sm:flex">
              <Icon aria-hidden className="size-3.5" />
            </span>
          ) : null}
        </span>
      }
      value={formatted}
      className={cn("px-4 pt-3.5 pb-3.5 sm:px-5 sm:pt-4 sm:pb-4", className)}
    >
      <div className="mt-3 min-h-5">{footer}</div>
    </StatTile>
  );
  return to ? (
    <Link
      to={to}
      className="group block rounded-card transition-shadow duration-short ease-standard hover:shadow-e2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {tile}
    </Link>
  ) : (
    tile
  );
}

export function AdminStatBars({ rows }: { rows: Array<{ label: string; count: number }> }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  if (rows.length === 0) return <p className="text-footnote text-label-2">No data yet.</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="mb-1 flex items-center justify-between gap-2 text-caption">
            <span className="truncate font-medium text-foreground">{row.label}</span>
            <span className="text-label-2 tabular-nums">{row.count.toLocaleString()}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className={cn("h-full rounded-full", ACCENT_FILL)} style={{ width: `${(row.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function AdminShare({ part, whole, noun = "of all users" }: { part: number | null | undefined; whole: number | null | undefined; noun?: string }) {
  if (whole === null || whole === undefined || whole === 0 || part === null || part === undefined) {
    return <span className="text-caption text-label-2">—</span>;
  }
  const pct = Math.round((part / whole) * 100);
  return (
    <span className="flex items-center gap-2 text-caption text-label-2">
      <span aria-hidden className="relative hidden h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-surface-2 sm:block">
        <span className={cn("absolute inset-y-0 left-0 rounded-full", ACCENT_FILL)} style={{ width: `${pct}%` }} />
      </span>
      <span>
        <span className="font-medium text-foreground tabular-nums">{pct}%</span> {noun}
      </span>
    </span>
  );
}

export function AdminSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("rounded-control", className)} />;
}

export function AdminListSkeleton({ rows = 5, avatar = true }: { rows?: number; avatar?: boolean }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="divide-y divide-border">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-3.5">
          {avatar ? <AdminSkeleton className="size-8 shrink-0 rounded-full" /> : null}
          <div className="flex-1 space-y-2">
            <AdminSkeleton className="h-3 w-1/3" />
            <AdminSkeleton className="h-2.5 w-1/2" />
          </div>
          <AdminSkeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function AdminEmptyNote({
  icon: Icon,
  title,
  body,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      <span className="relative flex size-12 items-center justify-center">
        <span aria-hidden className="absolute inset-0 rounded-card bg-surface-2" />
        <span aria-hidden className="absolute inset-[5px] rounded-control border border-border bg-card shadow-e1" />
        <Icon aria-hidden className="relative size-[1.125rem] text-label-2" strokeWidth={1.8} />
      </span>
      <p className="mt-4 text-body font-medium text-foreground">{title}</p>
      {body ? <p className="mt-1 max-w-xs text-footnote text-label-2">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function AdminErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className={cn(adminCardClass, "flex flex-wrap items-center justify-between gap-3 border-deal-high/25 bg-deal-high/5 px-5 py-4")}>
      <p className="text-footnote text-deal-high-text">{message}</p>
      {onRetry ? (
        <Button type="button" variant="outline" size="sm" className="h-8 rounded-full" onClick={onRetry}>
          <RotateCw aria-hidden className="size-3.5" /> Try again
        </Button>
      ) : null}
    </div>
  );
}

export type AdminDotTone = "ok" | "warn" | "bad" | "idle";
const DOT: Record<AdminDotTone, string> = {
  ok: "bg-brand",
  warn: "bg-deal-caution",
  bad: "bg-deal-high",
  idle: "bg-label-3",
};

export function AdminStatusDot({ tone, className }: { tone: AdminDotTone; className?: string }) {
  return (
    <span aria-hidden className={cn("relative inline-flex size-2.5 shrink-0", className)}>
      {tone === "ok" || tone === "bad" ? (
        <span className={cn("absolute inset-0 animate-ping rounded-full opacity-30 [animation-duration:2.4s] motion-reduce:hidden", DOT[tone])} />
      ) : null}
      <span className={cn("relative inline-flex size-2.5 rounded-full", DOT[tone])} />
    </span>
  );
}

export function AdminSearchField({
  value,
  onChange,
  placeholder,
  label,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("relative min-w-0", className)}>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-label-2" />
      <Input
        type="search"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 rounded-full pr-8 pl-8 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute top-1/2 right-2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full bg-surface-2 text-label-2 hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X aria-hidden className="size-3" />
        </button>
      ) : null}
    </div>
  );
}

/** Initials avatar (Motormila accounts have no profile pictures). */
export function AdminAvatar({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-foreground font-semibold text-background",
        size === "sm" ? "size-6 text-caption" : size === "lg" ? "size-10 text-footnote" : "size-8 text-caption",
        className,
      )}
    >
      {initials || "?"}
    </span>
  );
}

export const adminThClass = "h-10 px-3 text-left text-caption font-medium tracking-[0.06em] whitespace-nowrap text-label-2 uppercase first:pl-5 last:pr-5";
export const adminTdClass = "px-3 py-3 align-middle first:pl-5 last:pr-5";

export const capitalise = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
