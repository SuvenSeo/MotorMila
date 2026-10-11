import { useEffect, useId, useState, type RefObject } from "react";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * Magic UI "Animated Beam" pattern, hand-rolled with SMIL <animateMotion> —
 * no animation runtime needed. Draws a curved beam between two DOM elements
 * (via refs) inside a positioned container. Renders a static line under
 * prefers-reduced-motion.
 */
export function AnimatedBeam({
  containerRef,
  fromRef,
  toRef,
  curvature = -40,
  duration = 3.2,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  fromRef: RefObject<HTMLDivElement | null>;
  toRef: RefObject<HTMLDivElement | null>;
  curvature?: number;
  duration?: number;
}) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [d, setD] = useState("");
  const reduced = prefersReducedMotion();

  useEffect(() => {
    const update = () => {
      const c = containerRef.current;
      const f = fromRef.current;
      const t = toRef.current;
      if (!c || !f || !t) return;
      const cr = c.getBoundingClientRect();
      const fr = f.getBoundingClientRect();
      const tr = t.getBoundingClientRect();
      const sx = fr.left - cr.left + fr.width / 2;
      const sy = fr.top - cr.top + fr.height / 2;
      const ex = tr.left - cr.left + tr.width / 2;
      const ey = tr.top - cr.top + tr.height / 2;
      const mx = (sx + ex) / 2;
      const my = (sy + ey) / 2 + curvature;
      setD(`M ${sx} ${sy} Q ${mx} ${my} ${ex} ${ey}`);
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", update);
    // fonts/layout can shift positions after first paint
    const t1 = setTimeout(update, 300);
    const t2 = setTimeout(update, 1200);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [containerRef, fromRef, toRef, curvature]);

  if (!d) return null;

  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <linearGradient id={`apexBeamGradient-${gid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#00C853" />
          <stop offset="100%" stopColor="#0A7AFF" />
        </linearGradient>
      </defs>
      <path d={d} className="apex-beam-path" />
      {!reduced && (
        <>
          <path d={d} className="apex-beam-glow" stroke={`url(#apexBeamGradient-${gid})`} />
          <circle r="4.5" className="apex-beam-dot">
            <animateMotion dur={`${duration}s`} repeatCount="indefinite" path={d} />
          </circle>
        </>
      )}
    </svg>
  );
}
