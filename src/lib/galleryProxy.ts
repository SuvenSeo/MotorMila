/**
 * Same-origin gallery image proxy (`GET /img?u=…`, a Pages Function).
 *
 * MorphSlider loads photos into WebGL textures, which needs CORS from the
 * image host — and the marketplaces send none. The proxy re-serves the photo
 * from our own origin, so the texture loads. Only the MorphSlider textures
 * go through it: cards, thumbnails and the lightbox are plain `<img>` tags
 * and don't need CORS, so they keep the direct source URL.
 *
 * The Function itself owns the host allowlist; this helper only decides
 * *whether* a URL needs proxying. Anything the Function refuses (odd host,
 * bot, upstream error) fails as a texture and the gallery falls back to the
 * plain filmstrip — never a black slide.
 */
export function getGalleryImageProxyUrl(src: string | null | undefined): string | null {
  if (!src) return null;
  if (src.startsWith("/img?u=")) return src;
  if (!/^https?:\/\//i.test(src)) return null;
  try {
    const parsed = new URL(src);
    // Same-origin photos need no proxy — CORS is already satisfied.
    if (typeof window !== "undefined" && parsed.origin === window.location.origin) return src;
  } catch {
    return null;
  }
  return `/img?u=${encodeURIComponent(src)}`;
}
