import { memo, useEffect, useMemo, useRef, useState } from "react";
import { formatSourceName } from "@/lib/sourceAttribution";
import { imageHostBlocked, isRemoteImage, marketplaceSrcSet, noteImageResult } from "@/lib/listingImage";

interface VehicleThumbnailProps {
  src?: string | null;
  listingId?: number;
  alt: string;
  /** Source marketplace (e.g. "riyasewana"); shown on the placeholder so a missing photo still says where the ad lives. */
  source?: string | null;
  className?: string;
  /** Kept for API compatibility; the branded SVG placeholder is used for every empty state. */
  placeholderClassName?: string;
  /** First-screen images should load eagerly to protect LCP. */
  priority?: boolean;
  sizes?: string;
  /** Fade the real photo in once decoded (neutral shimmer shows underneath). Skipped for priority images (LCP). */
  fadeIn?: boolean;
  /** Motion hooks: "card" = card photo (view-transition source), "hero" = detail hero (target). */
  marker?: "card" | "hero";
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Branded placeholder (brand bible: Ink ground, Motormila Blue accent, no car
 * clip-art). Used as the final image when a listing has no photo or the source
 * refuses to serve it (riyasewana hot-link 403s). While a photo loads, a
 * neutral skeleton shimmer shows instead.
 *
 * Everything sits inside a crop-safe box (x 180–780, y 70–530 of 960×600), so
 * the Apex M mark and the full "Motormila" wordmark survive `object-cover`
 * from 1:1 squares up to 2:1 banners. Text widths are pinned with textLength
 * because a data-URI SVG can't use the page's web fonts (system fallback).
 */
function createFallbackThumbnailDataUri(label: string, source?: string | null): string {
  const rawLabel = String(label || "Vehicle").trim().slice(0, 40) || "Vehicle";
  const safeLabel = escapeSvgText(rawLabel);
  const sourceName = formatSourceName(source);
  const sourceLine = escapeSvgText(sourceName ? `Photos on ${sourceName}` : "Photo unavailable");
  // Layout keeps everything in the top ~60% of the 16:10 frame: card/detail
  // overlays (price, deal badge, source credit) sit along the bottom edge and
  // used to clip a bottom-anchored wordmark down to "RMILA".
  // Lockup = Apex M vector (same geometry as the Android adaptive icon) + "otormila",
  // mirroring /logo-wordmark.png (brand bible: the M *is* the first letter).
  // textLength pins the word width because web fonts don't load inside <img> SVGs.
  // ~0.58em average glyph width: shrink long titles to the 560px safe width,
  // and pin it with textLength as a backstop for wide fallback fonts.
  const labelSize = Math.max(20, Math.min(34, Math.floor(560 / (rawLabel.length * 0.6))));
  const labelFit = rawLabel.length * labelSize * 0.58 > 520 ? ' textLength="560" lengthAdjust="spacingAndGlyphs"' : "";
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600" viewBox="0 0 960 600">
  <rect width="960" height="600" fill="#09090B"/>
  <g stroke="#ffffff" stroke-opacity="0.05">
    <path d="M0 150h960M0 300h960M0 450h960M240 0v600M480 0v600M720 0v600"/>
  </g>
  <g transform="translate(276 107) scale(1.2)" fill="none" stroke="#0A7AFF" stroke-width="8.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M30,76 L30,34 L54,58 L78,34 L78,62"/>
    <path d="M78,62 L97,43"/>
    <path d="M97,43 L87.5,43 M97,43 L97,52.5"/>
  </g>
  <text x="402" y="198" textLength="246" lengthAdjust="spacingAndGlyphs" fill="#FFFFFF" font-family="Cal Sans,Arial,sans-serif" font-weight="700" font-size="62">otormila</text>
  <text x="480" y="282" fill="#FFFFFF" fill-opacity="0.86" font-family="Cal Sans,Arial,sans-serif" font-weight="700" font-size="${labelSize}" text-anchor="middle"${labelFit}>${safeLabel}</text>
  <text x="480" y="326" fill="#FFFFFF" fill-opacity="0.55" font-family="Cal Sans Text,Arial,sans-serif" font-size="24" text-anchor="middle">${sourceLine}</text>
</svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export const VehicleThumbnail = memo(function VehicleThumbnail({
  src,
  listingId,
  alt,
  source,
  className,
  priority = false,
  sizes = "(max-width: 768px) 100vw, 33vw",
  fadeIn = false,
  marker,
}: VehicleThumbnailProps) {
  const fallbackSrc = useMemo(() => createFallbackThumbnailDataUri(alt, source), [alt, source]);
  // The thumbnail proxy is retired (410) - photos are only hotlinked with
  // source credit, so there is no proxy candidate any more.
  const proxyUrl: string | null = null;

  // Ordered candidates: direct photo, then proxy, then the branded placeholder.
  const candidates = useMemo(() => {
    const list: string[] = [];
    // Direct first: riyasewana 403s seen from datacenter IPs may not apply to
    // Sri Lankan residential visitors, so the original is always tried unless
    // this session already watched its host refuse several photos in a row.
    if (src && !imageHostBlocked(src)) list.push(src);
    if (proxyUrl) list.push(proxyUrl);
    list.push(fallbackSrc);
    return list;
  }, [src, proxyUrl, fallbackSrc]);

  const [attempt, setAttempt] = useState(0);
  useEffect(() => setAttempt(0), [candidates]);

  const imageSrc = candidates[Math.min(attempt, candidates.length - 1)];
  const isPlaceholder = imageSrc === fallbackSrc;
  const fade = fadeIn && !priority && !isPlaceholder;
  const srcSet = isPlaceholder ? undefined : marketplaceSrcSet(imageSrc);
  const remote = !isPlaceholder && isRemoteImage(imageSrc);
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  // React 18 drops camelCase fetchPriority; set the real attribute so the LCP
  // photo (detail hero / first cards) is fetched ahead of everything else.
  useEffect(() => {
    if (priority) imgRef.current?.setAttribute("fetchpriority", "high");
    else imgRef.current?.removeAttribute("fetchpriority");
  }, [priority]);
  useEffect(() => {
    // Cached photos can finish before React attaches onLoad.
    const el = imgRef.current;
    setLoaded(Boolean(el && el.complete && el.naturalWidth > 0));
  }, [imageSrc]);

  return (
    <img
      ref={imgRef}
      src={imageSrc}
      alt={alt}
      width={480}
      height={300}
      className={className}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      referrerPolicy={remote ? "no-referrer" : undefined}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      data-placeholder={isPlaceholder ? "true" : undefined}
      data-fade-in={fade ? "" : undefined}
      data-loaded={fade ? String(loaded) : undefined}
      data-pending={!isPlaceholder && !loaded ? "true" : undefined}
      data-card-photo={marker === "card" ? "" : undefined}
      data-listing-hero={marker === "hero" ? "" : undefined}
      onLoad={() => {
        setLoaded(true);
        if (remote) noteImageResult(imageSrc, true);
      }}
      // While the photo is in flight a neutral shimmer shows (img[data-pending],
      // listing-motion.css). The branded lockup is only the final state for a
      // listing with no usable photo; flashing it before every photo read as broken.
      onError={() => {
        if (isPlaceholder) return;
        if (remote) noteImageResult(imageSrc, false);
        setAttempt((a) => a + 1);
      }}
    />
  );
});

VehicleThumbnail.displayName = "VehicleThumbnail";
