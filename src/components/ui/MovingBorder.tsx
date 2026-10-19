import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type MovingBorderProps = {
  children: ReactNode;
  className?: string;
  /** Corner radius of the beam frame (matches the inner control). */
  radius?: string;
  /** Rotation period, e.g. "4s". */
  duration?: string;
  style?: CSSProperties;
};

/**
 * Moving Border (#10 UI review).
 * A thin conic-gradient beam that travels around the wrapped control.
 * Pure CSS (`@property --mb-angle` + keyframes, see index.css) — no JS,
 * no new dependencies. Static under prefers-reduced-motion.
 */
export function MovingBorder({ children, className, radius, duration, style }: MovingBorderProps) {
  return (
    <span
      className={cn("moving-border", className)}
      style={{ ...style, ...(radius ? { "--mb-radius": radius } : null), ...(duration ? { "--mb-duration": duration } : null) } as CSSProperties}
    >
      {children}
    </span>
  );
}
