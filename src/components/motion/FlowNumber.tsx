import { lazy, Suspense, useRef, type ComponentProps } from "react";
import { useInView } from "motion/react";
import { useReducedMotionOrLowData } from "@/lib/motion";
import { LAKH, LAKH_TO_MN_THRESHOLD, MILLION } from "@/lib/price";

// number-flow is a small custom element, but keep it off the critical path:
// the plain formatted text is the Suspense fallback (and the SSR/test output).
const NumberFlow = lazy(() => import("@number-flow/react"));
type NumberFlowFormat = NonNullable<ComponentProps<typeof NumberFlow>["format"]>;

export interface FlowNumberProps {
  value: number;
  prefix?: string;
  suffix?: string;
  /** Intl.NumberFormat options; defaults to whole numbers with grouping. */
  format?: NumberFlowFormat;
  className?: string;
  /** Text shown before number-flow loads, and read by screen readers. */
  label: string;
}

const DEFAULT_FORMAT: NumberFlowFormat = { maximumFractionDigits: 0, useGrouping: true };

/**
 * A number that rolls its digits when `value` changes (number-flow).
 * Static under reduced motion or low-data mode.
 */
export function FlowNumber({ value, prefix, suffix, format = DEFAULT_FORMAT, className, label }: FlowNumberProps) {
  const still = useReducedMotionOrLowData();
  const fallback = <span className={className}>{label}</span>;
  if (!Number.isFinite(value)) return fallback;
  return (
    <Suspense fallback={fallback}>
      <span className={className} aria-label={label}>
        <NumberFlow
          value={value}
          prefix={prefix}
          suffix={suffix}
          locales="en-US"
          format={format}
          animated={!still}
          respectMotionPreference
          aria-hidden
        />
      </span>
    </Suspense>
  );
}

/**
 * Counts up from 0 to `value` the first time it scrolls into view, then
 * behaves like FlowNumber (rolls on later changes). Reduced motion / low data:
 * shows the final value immediately.
 */
export function CountUpOnView(props: FlowNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const still = useReducedMotionOrLowData();
  const shown = inView || still ? props.value : 0;
  return (
    <span ref={ref} className="inline-block">
      <FlowNumber {...props} value={shown} />
    </span>
  );
}

/** Split an LKR amount the way formatLkrCompact does ("Rs 72.5 L", "Rs 12.5 Mn")
 * so number-flow can animate the numeric part. */
export function compactLkrParts(n: number): { value: number; suffix: string; format: NumberFlowFormat } {
  const abs = Math.abs(n);
  if (abs < LAKH) return { value: Math.round(n), suffix: "", format: { maximumFractionDigits: 0, useGrouping: true } };
  const lakhs = abs / LAKH;
  if (abs < LAKH_TO_MN_THRESHOLD && Number(lakhs.toFixed(1)) < 100) {
    return { value: Math.sign(n) * Number(lakhs.toFixed(1)), suffix: " L", format: { maximumFractionDigits: 1 } };
  }
  return { value: Math.sign(n) * Number((abs / MILLION).toFixed(2)), suffix: " Mn", format: { maximumFractionDigits: 2 } };
}

/** Compact LKR price that rolls on change. */
export function FlowLkr({ value, className, label, countUp = false }: { value: number; className?: string; label: string; countUp?: boolean }) {
  const parts = compactLkrParts(value);
  const Comp = countUp ? CountUpOnView : FlowNumber;
  return <Comp value={parts.value} prefix="Rs " suffix={parts.suffix} format={parts.format} className={className} label={label} />;
}
