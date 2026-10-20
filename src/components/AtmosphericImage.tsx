import { type CSSProperties, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type AtmosphericImageProps = {
  src: string;
  /** Optional mobile / narrow src (served via srcSet). */
  srcSm?: string;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  /** LCP / above-the-fold hero: high priority, eager. Default lazy. */
  priority?: boolean;
  sizes?: string;
};

/**
 * Full-bleed atmosphere photo with responsive srcSet + decode hints.
 */
export function AtmosphericImage({
  src,
  srcSm,
  alt = "",
  className,
  style,
  priority = false,
  sizes = "(max-width: 768px) 100vw, 1600px",
}: AtmosphericImageProps) {
  const srcSet = srcSm ? `${srcSm} 960w, ${src} 1920w` : undefined;
  const imgRef = useRef<HTMLImageElement>(null);

  // React 18 does not recognise camelCase `fetchPriority` on <img> — it drops
  // the attribute and logs a "React does not recognize the `fetchPriority`
  // prop" warning (visible in vitest stderr on every hero-image page), while
  // its JSX types have no lowercase `fetchpriority` member either. Set the
  // real HTML attribute imperatively so the browser hint applies warning-free.
  useEffect(() => {
    imgRef.current?.setAttribute("fetchpriority", priority ? "high" : "low");
  }, [priority]);

  return (
    <img
      ref={imgRef}
      src={src}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      alt={alt}
      className={cn(className)}
      style={style}
      loading={priority ? "eager" : "lazy"}
      decoding={priority ? "sync" : "async"}
      draggable={false}
    />
  );
}
