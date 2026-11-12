import { useEffect, useRef, useState } from "react";
import { useReducedMotionOrLowData } from "@/lib/motion";
import { cn } from "@/lib/utils";
import "@/styles/flip-words.css";

export interface HeroFlipWordsProps {
  /** First word is the resting/static word (shown alone under reduced motion / low data). */
  words: string[];
  /** Milliseconds each word stays on screen. */
  interval?: number;
  /** Where shorter words sit inside the reserved (widest-word) box. */
  align?: "start" | "center";
  className?: string;
}

/** True while the document tab is visible. */
function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return visible;
}

/** True while at least 20% of the element is on screen. */
function useOnScreen(ref: React.RefObject<Element>): boolean {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return on;
}

/** ms between letters. */
const LETTER_STAGGER = 28;
/** Outgoing word's exit (matches --dur-short in flip-words.css). */
const EXIT_MS = 180;
/** Sinhala (U+0D80–0DFF) and Tamil (U+0B80–0BFF). */
const COMPLEX_SCRIPT = /[\u0B80-\u0BFF\u0D80-\u0DFF]/;

/**
 * Rotating accent word for the home hero. Every word is laid into the same
 * grid cell (invisible sizers), so the box is always as wide as the widest
 * word and the surrounding headline never reflows. Letters rise + fade in on
 * staggered CSS keyframes (transform/opacity only, so the compositor runs
 * them and the main thread only pays one tiny React commit per word); the
 * outgoing word lifts and fades out. Pauses when the tab is hidden or the
 * hero is off screen. Reduced motion / low-data: the first word, static.
 */
export function HeroFlipWords({ words, interval = 2800, align = "start", className }: HeroFlipWordsProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const still = useReducedMotionOrLowData();
  const pageVisible = usePageVisible();
  const inView = useOnScreen(ref);
  const [state, setState] = useState<{ index: number; prev: string | null; moved: boolean }>({ index: 0, prev: null, moved: false });
  const list = words.filter(Boolean);
  const running = !still && pageVisible && inView && list.length > 1;
  const current = list[state.index % Math.max(1, list.length)] ?? "";

  useEffect(() => {
    if (!running) return;
    const id = window.setTimeout(
      () => setState((s) => ({ index: (s.index + 1) % list.length, prev: list[s.index % list.length] ?? null, moved: true })),
      interval,
    );
    return () => window.clearTimeout(id);
    // `list` is derived from `words`; its length is the only part the timer needs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, state.index, interval, list.length]);

  // Drop the outgoing word once its exit has played.
  useEffect(() => {
    if (!state.prev) return;
    const id = window.setTimeout(() => setState((s) => (s.prev ? { ...s, prev: null } : s)), EXIT_MS + 40);
    return () => window.clearTimeout(id);
  }, [state.prev]);

  // Snap back to the resting word when motion gets switched off.
  useEffect(() => {
    if (still) setState({ index: 0, prev: null, moved: false });
  }, [still]);

  const resting = list[0] ?? "";
  if (still || list.length < 2) {
    return <span className={className}>{resting}</span>;
  }

  const cell = "[grid-area:1/1]";

  return (
    <span
      ref={ref}
      className={cn("relative inline-grid align-baseline", align === "center" ? "justify-items-center" : "justify-items-start", className)}
    >
      {/* Screen readers get one stable word, not a live-changing headline. */}
      <span className="sr-only">{resting}</span>
      {list.map((w) => (
        <span key={`sizer-${w}`} aria-hidden className={cn(cell, "invisible whitespace-nowrap pr-[0.08em]")}>
          {w}
        </span>
      ))}
      {state.prev && state.prev !== current ? (
        <span key={`out-${state.prev}`} aria-hidden className={cn(cell, "flip-word-out whitespace-nowrap pr-[0.08em]")}>
          {state.prev}
        </span>
      ) : null}
      <span key={current} aria-hidden className={cn(cell, "whitespace-nowrap pr-[0.08em]", state.moved && "flip-word-in")}>
        {/* Sinhala/Tamil letters are built from several code points (virama, ZWJ,
            vowel signs); splitting them breaks the conjuncts, so those words
            animate as one unit. */}
        {(COMPLEX_SCRIPT.test(current) ? [current] : Array.from(current)).map((ch, i) => (
          <span key={`${ch}-${i}`} className="flip-letter inline-block" style={state.moved ? { animationDelay: `${i * LETTER_STAGGER}ms` } : undefined}>
            {ch === " " ? "\u00a0" : ch}
          </span>
        ))}
      </span>
    </span>
  );
}
