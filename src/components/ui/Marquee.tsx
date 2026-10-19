import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Marquee (#11 UI review) — a lightweight, dependency-free horizontal
 * scroller. Content is duplicated once for a seamless loop; the animation
 * is pure CSS so it stays cheap on mobile. Pauses on hover/focus and
 * freezes entirely under prefers-reduced-motion.
 */
export interface MarqueeProps {
  children: ReactNode;
  className?: string;
  /** seconds per loop; higher = slower */
  duration?: number;
  reverse?: boolean;
  ariaLabel?: string;
}

export function Marquee({ children, className, duration = 40, reverse = false, ariaLabel }: MarqueeProps) {
  return (
    <div
      role="marquee"
      aria-label={ariaLabel}
      className={cn("marquee group relative flex overflow-hidden", className)}
    >
      <div
        aria-hidden={ariaLabel ? false : undefined}
        className="marquee__track flex w-max shrink-0 items-center"
        style={{ "--marquee-duration": `${duration}s`, "--marquee-direction": reverse ? "reverse" : "normal" } as CSSProperties}
      >
        {children}
      </div>
      {/* duplicate for a seamless loop */}
      <div aria-hidden className="marquee__track flex w-max shrink-0 items-center" style={{ "--marquee-duration": `${duration}s`, "--marquee-direction": reverse ? "reverse" : "normal" } as CSSProperties}>
        {children}
      </div>
    </div>
  );
}
