import { memo, useEffect, useMemo, useState } from "react";
import { getListingThumbnailProxyUrl } from "@/services/api";
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
 */
function createFallbackThumbnailDataUri(label: string, source?: string | null): string {
  const safeLabel = escapeSvgText(String(label || "Vehicle").trim().slice(0, 32) || "Vehicle");
  const sourceName = formatSourceName(source);
  const sourceLine = escapeSvgText(sourceName ? `Photos on ${sourceName}` : "Photo unavailable");
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600" viewBox="0 0 960 600">
  <rect width="960" height="600" fill="#09090B"/>
  <g stroke="#ffffff" stroke-opacity="0.05">
    <path d="M0 150h960M0 300h960M0 450h960M240 0v600M480 0v600M720 0v600"/>
  </g>
  <rect x="440" y="226" width="80" height="6" rx="3" fill="#0A7AFF"/>
  <text x="480" y="300" fill="#FFFFFF" fill-opacity="0.86" font-family="Space Grotesk,Inter,system-ui,sans-serif" font-weight="700" font-size="40" text-anchor="middle">${safeLabel}</text>
  <text x="480" y="350" fill="#FFFFFF" fill-opacity="0.55" font-family="Inter,system-ui,sans-serif" font-size="26" text-anchor="middle">${sourceLine}</text>
  <text x="480" y="548" fill="#0A7AFF" fill-opacity="0.75" font-family="Space Grotesk,Inter,system-ui,sans-serif" font-weight="700" font-size="20" letter-spacing="4" text-anchor="middle">MOTORMILA</text>
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
  const proxyUrl = useMemo(() => {
    if (!src || !Number.isFinite(listingId)) return null;
    return getListingThumbnailProxyUrl(Number(listingId));
  }, [src, listingId]);

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
