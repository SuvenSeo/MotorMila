import type { ReactNode } from "react";
import { ArrowRight, RotateCw, Search, X, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Admin kit — CeyFi Admin's pieces, translated to Motormila.
 *
 * Same language as CeyFi's kit.tsx: white rounded-2xl cards with hairline
 * borders on the inset sheet, font-display for page titles and big figures,
 * tabular numbers, colour only where it means something. Accent is
 * Motormila Blue #0A7AFF (chart line, share bar, links); the active nav
 * pill is Ink #09090B, and Deal Green is never used as an admin accent.
 * Missing data renders as "—", never as a plausible 0.
 */

export const ADMIN_BLUE = "#0A7AFF";
export const ADMIN_INK = "#09090B";

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
        {greeting ? <p className="mb-1.5 text-[0.8125rem] font-medium text-label-2">{adminGreeting()}</p> : null}
        <h1 className="font-display text-[1.875rem] leading-[1.1] tracking-[-0.01em] text-foreground sm:text-[2.25rem]">
          {title}
        </h1>
        {description ? <p className="mt-1.5 max-w-2xl text-[0.875rem] leading-5 text-label-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export const adminCardClass =
  "min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.04)]";

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
    <section className={cn(adminCardClass, className)}>
      {title ? (
        <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
          <div className="min-w-0">
            <h2 className="text-[0.9375rem] font-semibold tracking-[-0.01em] text-foreground">{title}</h2>
            {description ? <p className="mt-0.5 text-[0.75rem] leading-4 text-label-2">{description}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function AdminCardLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 rounded-md text-[0.75rem] font-medium text-label-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      {children}
      <ArrowRight aria-hidden className="h-3.5 w-3.5" />
    </Link>
  );
}

/** Change against the previous period: a small tinted chip with an arrow. */
export function AdminDelta({ current, previous, label }: { current: number; previous: number; label: string }) {
  const diff = current - previous;
  const tone = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
  const pct = previous > 0 ? Math.round((diff / previous) * 100) : null;
  const text = tone === "flat" ? "No change" : pct !== null ? `${pct > 0 ? "+" : ""}${pct}%` : `${diff > 0 ? "+" : ""}${diff}`;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[0.75rem] text-label-2">
      <span
        className={cn(
          "inline-flex h-5 items-center gap-0.5 rounded-full px-1.5 font-medium tabular-nums",
          tone === "up" && "bg-[#0A7AFF]/10 text-[#0A7AFF]",
          tone === "down" && "bg-red-500/10 text-red-600",
          tone === "flat" && "bg-surface-2 text-label-2",
        )}
      >
        {tone === "up" ? "↑" : tone === "down" ? "↓" : "—"} {text}
      </span>
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
  value: number | null | undefined;
  icon?: LucideIcon;
  footer?: ReactNode;
  to?: string;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[0.8125rem] font-medium text-label-2">{label}</span>
        {Icon ? (
          <span className="hidden size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-label-2 transition-colors group-hover:bg-[#09090B] group-hover:text-white sm:flex">
            <Icon aria-hidden className="size-3.5" />
          </span>
        ) : null}
      </div>
      <p className="mt-2.5 font-display text-[2rem] leading-none tracking-[-0.02em] text-foreground tabular-nums sm:mt-3 sm:text-[2.5rem]">
        {value === null || value === undefined ? "—" : value.toLocaleString("en-GB")}
      </p>
      <div className="mt-3 min-h-5">{footer}</div>
    </>
  );
  const classes = cn(adminCardClass, "group block px-4 pt-3.5 pb-3.5 sm:px-5 sm:pt-4 sm:pb-4", className);
  return to ? (
    <Link to={to} className={cn(classes, "transition-[border-color,box-shadow] hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40")}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}

export function AdminShare({ part, whole, noun = "of all users" }: { part: number | null | undefined; whole: number | null | undefined; noun?: string }) {
  if (whole === null || whole === undefined || whole === 0 || part === null || part === undefined) {
    return <span className="text-[0.75rem] text-label-2">—</span>;
  }
  const pct = Math.round((part / whole) * 100);
  return (
    <span className="flex items-center gap-2 text-[0.75rem] text-label-2">
      <span aria-hidden className="relative hidden h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-surface-2 sm:block">
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: ADMIN_BLUE }} />
      </span>
      <span>
        <span className="font-medium text-foreground tabular-nums">{pct}%</span> {noun}
      </span>
    </span>
  );
}

export function AdminSkeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block animate-pulse rounded-md bg-surface-2", className)} />;
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
        <span aria-hidden className="absolute inset-0 rounded-2xl bg-surface-2" />
        <span aria-hidden className="absolute inset-[5px] rounded-[0.8rem] border border-border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.05)]" />
        <Icon aria-hidden className="relative size-[1.125rem] text-label-2" strokeWidth={1.8} />
      </span>
      <p className="mt-4 text-[0.875rem] font-medium text-foreground">{title}</p>
      {body ? <p className="mt-1 max-w-xs text-[0.8125rem] leading-5 text-label-2">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function AdminErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className={cn(adminCardClass, "flex flex-wrap items-center justify-between gap-3 border-red-500/25 bg-red-500/5 px-5 py-4")}>
      <p className="text-[0.8125rem] text-red-600">{message}</p>
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
  ok: "bg-[#0A7AFF]",
  warn: "bg-amber-600",
  bad: "bg-red-500",
  idle: "bg-zinc-400",
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
          className="absolute top-1/2 right-2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full bg-surface-2 text-label-2 hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
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
        "flex shrink-0 items-center justify-center rounded-full bg-[#09090B] font-semibold text-white",
        size === "sm" ? "size-6 text-[0.625rem]" : size === "lg" ? "size-10 text-[0.8125rem]" : "size-8 text-[0.6875rem]",
        className,
      )}
    >
      {initials || "?"}
    </span>
  );
}

export const adminThClass = "h-10 px-3 text-left text-[0.6875rem] font-medium tracking-[0.06em] whitespace-nowrap text-label-2 uppercase first:pl-5 last:pr-5";
export const adminTdClass = "px-3 py-3 align-middle first:pl-5 last:pr-5";

export const capitalise = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
