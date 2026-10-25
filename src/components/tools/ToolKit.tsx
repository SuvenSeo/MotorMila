/**
 * Tool-page building blocks (web/p1-tools): one form + result template for
 * Calculator, Estimate, Afford, Safe-transfer, Sell, Finance/Inspection/
 * Insurance and Removal. Composed only from the kit in src/components/ui —
 * Card, Input, Select, Chip, Checkbox, Badge, Skeleton, AnimatedNumber — plus
 * type-scale names, semantic tokens and the motion tokens.
 *
 *   ToolPage      plain canvas (no orbs) + compact PageHeader slot + body shell
 *   ToolGrid      form column + result column; the result sticks on desktop
 *   FormCard      Card with an icon/title header for one group of inputs
 *   Field         label + control + hint/error, consistent spacing
 *   NumberField   Input with a prefix/suffix adornment and tabular figures
 *   ChoiceChips   single-select Chip row (radiogroup semantics)
 *   CheckRow      kit Checkbox + label, 40px hit target
 *   ResultCard    the hero number card (AnimatedNumber inside)
 *   ResultRow     one breakdown line (label · value)
 *   AnimatedLkr   LKR amount that rolls (compact "Rs 8.5 Mn" / full / monthly)
 *   Notice        info / caution / danger / success callout
 *   ResultSkeleton layout-true placeholder for a ResultCard
 */
import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { PageCanvas } from "@/components/PageCanvas";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { compactLkrParts } from "@/components/motion/FlowNumber";
import { formatLkrCompact, formatLkrFull, formatLkrMonthly } from "@/lib/price";

/* ── Page frame ──────────────────────────────────────────────────────────── */

/** Plain tool canvas: no ambient orbs, compact header, body on the layout shell. */
export function ToolPage({ header, children, className }: { header: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <PageCanvas ambient="none">
      {header}
      <div className={cn("layout-shell pb-24 lg:pb-20", className)}>{children}</div>
    </PageCanvas>
  );
}

/**
 * Form column + result column. On lg+ the result column is sticky under the
 * nav so the answer stays in view while the form scrolls; on mobile the
 * result follows the form (or precedes it with `resultFirst`).
 */
export function ToolGrid({
  form,
  result,
  after,
  className,
  wideResult = false,
}: {
  form: React.ReactNode;
  result: React.ReactNode;
  /**
   * Secondary inputs (assumptions, extras). Desktop: under the form, beside
   * the sticky result. Mobile: after the result, so the answer sits right
   * under the primary inputs.
   */
  after?: React.ReactNode;
  className?: string;
  /** Give the result column more room (breakdown-heavy tools). */
  wideResult?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid items-start gap-5 lg:gap-6",
        wideResult ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : "lg:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]",
        className,
      )}
    >
      <div className="min-w-0 space-y-5 lg:col-start-1 lg:row-start-1">{form}</div>
      <aside
        className={cn(
          "min-w-0 space-y-4 lg:sticky lg:top-[calc(var(--nav-offset)+1.5rem)] lg:col-start-2 lg:row-start-1",
          after ? "lg:row-span-2" : "",
        )}
      >
        {result}
      </aside>
      {after ? <div className="min-w-0 space-y-5 lg:col-start-1 lg:row-start-2">{after}</div> : null}
    </div>
  );
}

/* ── Form pieces ─────────────────────────────────────────────────────────── */

export function FormCard({
  icon: Icon,
  title,
  description,
  action,
  children,
  className,
  as: Heading = "h2",
}: {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  as?: "h2" | "h3";
}) {
  return (
    <Card className={cn("space-y-5", className)}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        {Icon ? (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary">
            <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
        ) : null}
        <div className="min-w-0 flex-1 basis-40">
          <Heading className="text-callout font-semibold text-foreground">{title}</Heading>
          {description ? <p className="mt-0.5 text-footnote text-label-2">{description}</p> : null}
        </div>
        {action ? <div className="-my-1 shrink-0">{action}</div> : null}
      </div>
      {children}
    </Card>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  optional,
  optionalLabel = "optional",
  aside,
  children,
  className,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  optional?: boolean;
  optionalLabel?: React.ReactNode;
  /** Right-aligned text on the label row (e.g. the live value of a slider). */
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const hintId = htmlFor && (hint || error) ? `${htmlFor}-hint` : undefined;
  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-footnote font-medium text-foreground">
          {label}
          {optional ? <span className="ml-1 font-normal text-label-2">({optionalLabel})</span> : null}
        </label>
        {aside ? <span className="shrink-0 text-footnote font-medium tabular-nums text-label-2">{aside}</span> : null}
      </div>
      {children}
      {error ? (
        <p id={hintId} className="mt-1.5 text-caption font-medium text-deal-high-text">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-caption text-label-2">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Kit Input with an inline prefix/suffix (e.g. "Rs", "%", "km"). */
export const AdornedInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<"input">, "prefix"> & { prefix?: React.ReactNode; suffix?: React.ReactNode }
>(({ prefix, suffix, className, ...props }, ref) => (
  <div className="relative">
    {prefix ? (
      <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-body text-label-2">{prefix}</span>
    ) : null}
    <Input ref={ref} className={cn("tabular-nums", prefix ? "pl-10" : "", suffix ? "pr-14" : "", className)} {...props} />
    {suffix ? (
      <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-footnote text-label-2">{suffix}</span>
    ) : null}
  </div>
));
AdornedInput.displayName = "AdornedInput";

/** Numeric input bound to a number. Empty input keeps the field empty instead of showing a stray "0". */
export function NumberField({
  id,
  label,
  value,
  onChange,
  prefix,
  suffix,
  step,
  min = 0,
  max,
  hint,
  optional,
  optionalLabel,
  className,
  placeholder,
  inputMode = "decimal",
  emptyWhenZero = false,
}: {
  id: string;
  label: React.ReactNode;
  value: number;
  onChange: (v: number) => void;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  step?: number;
  min?: number;
  max?: number;
  hint?: React.ReactNode;
  optional?: boolean;
  optionalLabel?: React.ReactNode;
  className?: string;
  placeholder?: string;
  inputMode?: "decimal" | "numeric";
  /** Optional fields: 0 means "not set" and shows the placeholder, not a stray 0. */
  emptyWhenZero?: boolean;
}) {
  const [text, setText] = React.useState(() =>
    !Number.isFinite(value) || (emptyWhenZero && value === 0) ? "" : String(value),
  );
  // Follow external changes (reset, URL seed) without fighting the user's typing.
  React.useEffect(() => {
    setText((prev) => {
      if (prev === "" && value === 0) return prev; // user cleared the field
      if (emptyWhenZero && value === 0 && Number(prev) !== 0) return "";
      if (prev !== "" && Number(prev) === value) return prev; // "1.50" stays as typed
      return Number.isFinite(value) ? String(value) : "";
    });
  }, [value, emptyWhenZero]);
  return (
    <Field label={label} htmlFor={id} hint={hint} optional={optional} optionalLabel={optionalLabel} className={className}>
      <AdornedInput
        id={id}
        type="number"
        inputMode={inputMode}
        min={min}
        max={max}
        step={step}
        value={text}
        placeholder={placeholder}
        prefix={prefix}
        suffix={suffix}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => {
          setText(e.target.value);
          const next = Number(e.target.value);
          if (e.target.value === "" || !Number.isFinite(next)) return onChange(0);
          // Typed values are clamped to min/max (the HTML attributes only bound the spinner),
          // so "-500" can't produce negative duty lines.
          onChange(Math.min(max ?? Infinity, Math.max(min, next)));
        }}
        onBlur={() => {
          // Show the clamped value once the user leaves the field: when the state was
          // already at the bound (e.g. 0), a typed "-500" never re-renders the text.
          if (text === "") return;
          const n = Number(text);
          const clamped = Number.isFinite(n) ? Math.min(max ?? Infinity, Math.max(min, n)) : value;
          if (!Number.isFinite(n) || clamped !== n) setText(emptyWhenZero && clamped === 0 ? "" : String(clamped));
        }}
      />
    </Field>
  );
}

/** Single-select chip row. Arrow keys move between options (radiogroup). */
export function ChoiceChips<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
  fill = false,
}: {
  label: React.ReactNode;
  value: T;
  options: ReadonlyArray<{ value: NoInfer<T>; label: React.ReactNode }>;
  onChange: (v: NoInfer<T>) => void;
  className?: string;
  /** Stretch chips to share the row equally. */
  fill?: boolean;
}) {
  const labelId = React.useId();
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (i + dir + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div className={cn("min-w-0", className)}>
      <p id={labelId} className="mb-1.5 text-footnote font-medium text-foreground">
        {label}
      </p>
      <div role="radiogroup" aria-labelledby={labelId} className={cn("flex flex-wrap gap-2", fill && "grid grid-flow-col auto-cols-fr")}>
        {options.map((o, i) => {
          const selected = o.value === value;
          const focusable = selected || (i === 0 && !options.some((x) => x.value === value));
          return (
            <Chip
              key={o.value}
              ref={(el) => (refs.current[i] = el)}
              role="radio"
              aria-checked={selected}
              aria-pressed={undefined}
              tabIndex={focusable ? 0 : -1}
              selected={selected}
              onClick={() => onChange(o.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn("h-10 justify-center px-4", fill && "w-full min-w-0 px-2")}
            >
              {o.label}
            </Chip>
          );
        })}
      </div>
    </div>
  );
}

export function CheckRow({
  id,
  checked,
  onCheckedChange,
  children,
  className,
  muted = false,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  children: React.ReactNode;
  className?: string;
  /** Strike-through + muted label when checked (checklists). */
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-h-10 items-start gap-3 rounded-control px-2 py-2 transition-colors duration-short ease-standard hover:bg-surface-2",
        className,
      )}
    >
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onCheckedChange(v === true)} className="mt-0.5 h-5 w-5" />
      <label
        htmlFor={id}
        className={cn(
          "flex-1 cursor-pointer text-body text-foreground transition-colors duration-short ease-standard",
          muted && checked && "text-label-2 line-through",
        )}
      >
        {children}
      </label>
    </div>
  );
}

/* ── Results ─────────────────────────────────────────────────────────────── */

type AnimatedLkrMode = "compact" | "full" | "monthly";

/** An LKR amount that rolls its digits; screen readers get the formatted text. */
export function AnimatedLkr({
  value,
  mode = "compact",
  plus = false,
  className,
}: {
  value: number | null | undefined;
  mode?: AnimatedLkrMode;
  plus?: boolean;
  className?: string;
}) {
  if (value == null || !Number.isFinite(value)) return <span className={className}>—</span>;
  const label =
    (plus ? "+" : "") + (mode === "full" ? formatLkrFull(value) : mode === "monthly" ? formatLkrMonthly(value) : formatLkrCompact(value));
  const prefix = plus ? "+Rs " : "Rs ";
  let inner: React.ReactNode;
  if (mode === "compact") {
    const parts = compactLkrParts(value);
    inner = <AnimatedNumber value={parts.value} prefix={prefix} suffix={parts.suffix} format={parts.format} locales="en-US" />;
  } else {
    inner = (
      <AnimatedNumber
        value={Math.round(value)}
        prefix={prefix}
        suffix={mode === "monthly" ? "/mo" : undefined}
        format={{ maximumFractionDigits: 0, useGrouping: true }}
        locales="en-US"
      />
    );
  }
  return (
    <span className={cn("tabular-nums", className)} aria-label={label}>
      <span aria-hidden>{inner}</span>
    </span>
  );
}

/** The answer: a label, one big number, an optional caption and breakdown. */
export function ResultCard({
  label,
  value,
  caption,
  badge,
  children,
  footer,
  busy = false,
  className,
  emphasis = true,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  caption?: React.ReactNode;
  badge?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  /** Recalculating: dim slightly, keep the old numbers on screen. */
  busy?: boolean;
  className?: string;
  /** Tinted primary surface for the one hero result on a page. */
  emphasis?: boolean;
}) {
  return (
    <Card
      aria-live="polite"
      aria-busy={busy || undefined}
      className={cn("content-in overflow-hidden", emphasis && "border-primary/20", className)}
    >
      <div className={cn("transition-opacity duration-short ease-standard", busy && "opacity-60")}>
        {/* Wraps so a long Tamil/Sinhala badge drops under the label instead of overflowing the card on phones. */}
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
          <p className="min-w-0 text-footnote font-semibold text-primary">{label}</p>
          {badge ? <div className="min-w-0 max-w-full">{badge}</div> : null}
        </div>
        <p className="mt-2 font-display text-large font-semibold text-foreground">{value}</p>
        {caption ? <p className="mt-1 text-footnote text-label-2">{caption}</p> : null}
        {children ? <div className="mt-5 border-t border-separator pt-4">{children}</div> : null}
      </div>
      {footer ? <div className="mt-5">{footer}</div> : null}
    </Card>
  );
}

export function ResultRows({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dl className={cn("space-y-2.5", className)}>{children}</dl>;
}

export function ResultRow({
  label,
  value,
  strong = false,
  tone,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  strong?: boolean;
  tone?: "danger" | "good";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 text-footnote",
        strong && "border-t border-separator pt-2.5",
        tone === "danger" && "text-deal-high-text",
        tone === "good" && "text-deal-good-text",
        className,
      )}
    >
      <dt className={cn(tone ? "" : "text-label-2", strong && "font-semibold text-foreground")}>{label}</dt>
      <dd className={cn("shrink-0 text-right font-semibold tabular-nums", !tone && "text-foreground")}>{value}</dd>
    </div>
  );
}

/** Small stat inside a card grid (label over value). */
export function Stat({ label, value, emphasis = false }: { label: React.ReactNode; value: React.ReactNode; emphasis?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-caption text-label-2">{label}</p>
      <p className={cn("mt-0.5 text-callout font-semibold tabular-nums", emphasis ? "text-primary" : "text-foreground")}>{value}</p>
    </div>
  );
}

const NOTICE_TONES = {
  info: { box: "border-primary/20 bg-primary/5", icon: "text-primary", Icon: Info },
  caution: { box: "border-deal-caution/30 bg-deal-caution/10", icon: "text-deal-caution-text", Icon: AlertTriangle },
  danger: { box: "border-deal-high/30 bg-deal-high/10", icon: "text-deal-high-text", Icon: ShieldAlert },
  success: { box: "border-deal-good/30 bg-deal-good/10", icon: "text-deal-good-text", Icon: CheckCircle2 },
  neutral: { box: "border-border bg-surface-2", icon: "text-label-2", Icon: Info },
} as const;

export function Notice({
  tone = "info",
  icon,
  title,
  children,
  action,
  className,
  role,
}: {
  tone?: keyof typeof NOTICE_TONES;
  icon?: LucideIcon;
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  role?: "note" | "status" | "alert";
}) {
  const t = NOTICE_TONES[tone];
  const Icon = icon ?? t.Icon;
  return (
    <div role={role} className={cn("flex items-start gap-3 rounded-card border p-4", t.box, className)}>
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", t.icon)} strokeWidth={1.75} aria-hidden />
      <div className="min-w-0 flex-1">
        {title ? <p className="text-footnote font-semibold text-foreground">{title}</p> : null}
        {children ? <div className={cn("text-footnote text-label-1", title && "mt-1")}>{children}</div> : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </div>
  );
}

/** Same footprint as a ResultCard with a 4-row breakdown, so the swap doesn't shift layout. */
export function ResultSkeleton({ rows = 4, label }: { rows?: number; label?: string }) {
  return (
    <Card role="status" aria-label={label} aria-busy="true">
      <Skeleton shape="text" className="w-1/3" />
      <Skeleton className="mt-3 h-12 w-3/4 rounded-control" />
      <Skeleton shape="text" className="mt-3 w-1/2" />
      <div className="mt-5 space-y-3 border-t border-separator pt-4">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex justify-between gap-4">
            <Skeleton shape="text" className="w-2/5" />
            <Skeleton shape="text" className="w-1/4" />
          </div>
        ))}
      </div>
    </Card>
  );
}
