import { createElement, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type RevealTag = "div" | "section" | "header" | "li" | "h2";

export interface RevealProps {
  children: ReactNode;
  className?: string;
  as?: RevealTag;
  /** Seconds. */
  delay?: number;
  id?: string;
  "aria-labelledby"?: string;
}

/* One IntersectionObserver for every Reveal on the page (cheaper than one
   per block), unobserving each target the first time it shows. */
type Cb = () => void;
let shared: IntersectionObserver | null = null;
const callbacks = new WeakMap<Element, Cb>();
function observe(el: Element, cb: Cb): () => void {
  if (typeof IntersectionObserver === "undefined") {
    cb();
    return () => {};
  }
  if (!shared) {
    shared = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const fn = callbacks.get(e.target);
          shared?.unobserve(e.target);
          callbacks.delete(e.target);
          fn?.();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -6% 0px" },
    );
  }
  callbacks.set(el, cb);
  shared.observe(el);
  return () => {
    callbacks.delete(el);
    shared?.unobserve(el);
  };
}

/**
 * Fade + 8px rise the first time the block scrolls into view (once).
 * A CSS keyframe on transform/opacity (compositor); the main thread only flips
 * one attribute. Opacity-only under reduced motion / low-data mode (CSS).
 */
export function Reveal({ children, className, as = "div", delay = 0, id, "aria-labelledby": labelledBy }: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || shown) return;
    return observe(el, () => setShown(true));
  }, [shown]);
  return createElement(
    as,
    {
      ref,
      id,
      "aria-labelledby": labelledBy,
      className: cn("mm-reveal", className),
      "data-shown": shown ? "true" : undefined,
      style: delay ? { animationDelay: `${delay}s` } : undefined,
    },
    children,
  );
}
