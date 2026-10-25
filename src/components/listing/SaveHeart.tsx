import { useEffect, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { Check, Heart, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { duration, ease, spring, useReducedMotionOrLowData } from "@/lib/motion";
import { haptic } from "./listingMotion";
import "@/styles/listing-motion.css";

/** True only after the value flips (not on first render), so mounts never animate. */
function useFlipped(value: boolean): boolean {
  const first = useRef(true);
  const [flipped, setFlipped] = useState(false);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setFlipped(true);
  }, [value]);
  return flipped;
}

/**
 * Save heart: outline → filled with a bouncy spring pop and a CSS burst ring
 * (no particles). Haptic tick when it becomes saved. Drop into any button.
 */
export function SaveHeartIcon({ saved, className }: { saved: boolean; className?: string }) {
  const calm = useReducedMotionOrLowData();
  const flipped = useFlipped(saved);
  const [burst, setBurst] = useState(0);
  const prev = useRef(saved);

  useEffect(() => {
    if (saved && !prev.current) {
      haptic(8);
      if (!calm) setBurst((n) => n + 1);
    }
    prev.current = saved;
  }, [saved, calm]);

  return (
    <span className="relative inline-flex items-center justify-center" aria-hidden>
      {burst > 0 && <span key={burst} className="save-burst" data-play="true" />}
      <m.span
        key={saved ? "on" : "off"}
        className="inline-flex"
        initial={flipped && !calm ? { scale: saved ? 0.55 : 0.85 } : false}
        animate={{ scale: 1 }}
        transition={spring.expressive}
      >
        <Heart className={cn(className, saved && "fill-current")} />
      </m.span>
    </span>
  );
}

/** Add-to-compare glyph: plus morphs into a check (rotate + scale cross-fade). */
export function CompareGlyph({
  active,
  className,
  idle: Idle = Plus,
}: {
  active: boolean;
  className?: string;
  idle?: typeof Plus;
}) {
  const calm = useReducedMotionOrLowData();
  const prev = useRef(active);
  useEffect(() => {
    if (active && !prev.current) haptic(8);
    prev.current = active;
  }, [active]);
  const t = calm ? { duration: 0 } : { duration: duration.short, ease: ease.standard };
  return (
    <span className="relative inline-flex items-center justify-center" aria-hidden>
      <AnimatePresence mode="popLayout" initial={false}>
        {active ? (
          <m.span
            key="check"
            className="inline-flex"
            initial={{ opacity: 0, scale: 0.4, rotate: -45 }}
            animate={{ opacity: 1, scale: 1, rotate: 0, transition: calm ? { duration: 0 } : spring.expressive }}
            exit={{ opacity: 0, scale: 0.4, transition: t }}
          >
            <Check className={className} />
          </m.span>
        ) : (
          <m.span
            key="idle"
            className="inline-flex"
            initial={{ opacity: 0, scale: 0.4, rotate: 45 }}
            animate={{ opacity: 1, scale: 1, rotate: 0, transition: t }}
            exit={{ opacity: 0, scale: 0.4, transition: t }}
          >
            <Idle className={className} />
          </m.span>
        )}
      </AnimatePresence>
    </span>
  );
}
