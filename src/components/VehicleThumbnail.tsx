import { memo, useEffect, useMemo, useState } from "react";
import { formatSourceName } from "@/lib/sourceAttribution";

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
 * clip-art). Used both as the `<img>` background while the photo loads (so a
 * slow or blocked source never shows a blank tile) and as the final image when
 * the source refuses to serve it (riyasewana hot-link 403s, proxy 401s).
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
  <g transform="translate(378.4 92) scale(1.6)" fill="none" stroke="#0A7AFF" stroke-width="8.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M30 76V34l24 24 24-24v28l19-19M97 43h-9.5M97 43v9.5"/>
  </g>
  <text x="480" y="286" font-family="Space Grotesk,Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif" font-weight="700" font-size="46" letter-spacing="-1.6" text-anchor="middle" textLength="250" lengthAdjust="spacingAndGlyphs"><tspan fill="#FFFFFF">Motor</tspan><tspan fill="#3D94FF">mila</tspan></text>
  <text x="480" y="384" fill="#FFFFFF" fill-opacity="0.86" font-family="Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif" font-weight="600" font-size="${labelSize}" text-anchor="middle"${labelFit}>${safeLabel}</text>
  <text x="480" y="432" fill="#FFFFFF" fill-opacity="0.6" font-family="Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif" font-size="24" text-anchor="middle">${sourceLine}</text>
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
}: VehicleThumbnailProps) {
  const fallbackSrc = useMemo(() => createFallbackThumbnailDataUri(alt, source), [alt, source]);
  // The thumbnail proxy is retired (410) - photos are only hotlinked with
  // source credit, so there is no proxy candidate any more.
  const proxyUrl: string | null = null;

  // Ordered candidates: direct photo, then proxy, then the branded placeholder.
  const candidates = useMemo(() => {
    const list: string[] = [];
    // Direct first: riyasewana 403s seen from datacenter IPs may not apply to
    // Sri Lankan residential visitors, so never skip the original.
    if (src) list.push(src);
    if (proxyUrl) list.push(proxyUrl);
    list.push(fallbackSrc);
    return list;
  }, [src, proxyUrl, fallbackSrc]);

  const [attempt, setAttempt] = useState(0);
  useEffect(() => setAttempt(0), [candidates]);

  const imageSrc = candidates[Math.min(attempt, candidates.length - 1)];
  const isPlaceholder = imageSrc === fallbackSrc;

  return (
    <img
      src={imageSrc}
      alt={alt}
      width={480}
      height={300}
      className={className}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      sizes={sizes}
      data-placeholder={isPlaceholder ? "true" : undefined}
      // The placeholder paints underneath until the real photo arrives: no blank tiles.
      style={isPlaceholder ? undefined : { backgroundImage: `url("${fallbackSrc}")`, backgroundSize: "cover", backgroundPosition: "center" }}
      onError={() => {
        if (!isPlaceholder) setAttempt((a) => a + 1);
      }}
    />
  );
});

VehicleThumbnail.displayName = "VehicleThumbnail";
