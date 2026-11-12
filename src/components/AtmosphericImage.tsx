import { type CSSProperties, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { HERO_AVIF } from "@/lib/visualAssets";

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
  /** Intrinsic size; defaults to the known hero dimensions when available. */
  width?: number;
  height?: number;
};

/**
 * Full-bleed atmosphere photo with responsive srcSet + decode hints.
 * Hero photos registered in HERO_AVIF are served as AVIF (960w/1920w) through
 * <picture>, with the WebP srcSet as fallback and intrinsic width/height set.
 * The <picture> is `display: contents`, so layout/CSS still target the <img>.
 */
export function AtmosphericImage({
  src,
  srcSm,
  alt = "",
  className,
  style,
  priority = false,
  sizes = "(max-width: 768px) 100vw, 1600px",
  width,
  height,
}: AtmosphericImageProps) {
  const srcSet = srcSm ? `${srcSm} 960w, ${src} 1920w` : undefined;
  const hero = HERO_AVIF[src];
  const imgRef = useRef<HTMLImageElement>(null);

  // React 18 does not recognise camelCase `fetchPriority` on <img> — it drops
  // the attribute and logs a "React does not recognize the `fetchPriority`
  // prop" warning (visible in vitest stderr on every hero-image page), while
  // its JSX types have no lowercase `fetchpriority` member either. Set the
  // real HTML attribute imperatively so the browser hint applies warning-free.
  useEffect(() => {
    imgRef.current?.setAttribute("fetchpriority", priority ? "high" : "low");
  }, [priority]);

  const img = (
    <img
      ref={imgRef}
      src={src}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      alt={alt}
      width={width ?? hero?.width}
      height={height ?? hero?.height}
      className={cn(className)}
      style={style}
      loading={priority ? "eager" : "lazy"}
      decoding={priority ? "sync" : "async"}
      draggable={false}
    />
  );

  if (!hero) return img;

  return (
    <picture className="contents">
      <source type="image/avif" srcSet={`${hero.avifSm} 960w, ${hero.avif} 1920w`} sizes={sizes} />
      {img}
    </picture>
  );
}
