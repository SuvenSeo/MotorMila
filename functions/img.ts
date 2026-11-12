/**
 * Same-origin gallery image proxy: `GET /img?u=<absolute image URL>`.
 *
 * Why it exists: MorphSlider loads listing photos into WebGL textures with
 * `crossOrigin="anonymous"`, which needs `Access-Control-Allow-Origin` from
 * the image host — and ikman / Riyasewana / Saleme send none. This Function
 * re-serves the photo from motormila.pages.dev itself (same origin, so no
 * CORS issue at all) with `Access-Control-Allow-Origin: *` for good measure.
 * Only the MorphSlider textures go through it; cards, thumbnails and the
 * lightbox keep loading the source URL directly in `<img>` tags.
 *
 * History (read before touching this): Pages Functions were removed on
 * 1 Nov 2026 after a bot crawl of 107k listing URLs burned the 100k/day
 * Workers quota. This route was re-added on 12 Nov 2026 on Suven's explicit
 * word, with three guards that the old OG-card Function did not have:
 *   1. Bot user-agents get 403 (bots never need a WebGL texture — the
 *      gallery falls back to the plain filmstrip for them).
 *   2. Only marketplace image hosts are fetchable (allowlist below) — this
 *      is not an open proxy, and no internal address can be reached.
 *   3. Responses cache at the edge for 24h (`Cache-Control: public`), so a
 *      repeat view of the same photo costs no Function invocation.
 * The proxy URLs are built client-side in JS only — they appear in no HTML,
 * sitemap or prerendered shell, so crawlers have nothing to enumerate.
 * Watch the meter after launch (Cloudflare Workers invocations for the
 * account; cap 100k/day): if it ever climbs toward the cap, remove this
 * file and the gallery degrades to the filmstrip automatically.
 */

const MAX_BYTES = 8_000_000;
const FETCH_TIMEOUT_MS = 10_000;

/** Exact image hosts (CDNs that don't live under a marketplace domain). */
const EXACT_HOSTS = new Set(["i.ikman-st.com"]);

/**
 * Marketplace domains whose own host (or any subdomain) may serve photos,
 * e.g. riyasewana.com/uploads/… and www.riyasewana.com/images/….
 */
const SUFFIX_DOMAINS = [
  "riyasewana.com",
  "saleme.lk",
  "patpat.lk",
  "autolanka.lk",
  "hitad.lk",
  "cartivate.lk",
  "autodirect.lk",
  "ikman.lk",
];

/** Crawlers and scrapers: they get 403 and the filmstrip fallback instead. */
const BOT_UA_RE =
  /bot|crawl|spider|slurp|googlebot|bingbot|duckduckbot|baiduspider|yandexbot|sogou|exabot|facebot|ia_archiver|facebookexternalhit|twitterbot|linkedinbot|pinterestbot|applebot|semrushbot|ahrefsbot|mj12bot|dotbot|petalbot/i;

function isBot(userAgent: string | null): boolean {
  return userAgent !== null && BOT_UA_RE.test(userAgent);
}

function normalizeHost(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

export function isAllowedImageHost(hostname: string): boolean {
  const host = normalizeHost(hostname);
  if (!host) return false;
  if (EXACT_HOSTS.has(host)) return true;
  return SUFFIX_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function parseTarget(raw: string | null): { url: URL } | { error: Response } {
  if (!raw || raw.length > 2048) {
    return {
      error: json({ error: "missing_or_invalid_u" }, 400),
    };
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { error: json({ error: "missing_or_invalid_u" }, 400) };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { error: json({ error: "only_http_https" }, 400) };
  }
  if (url.username || url.password) {
    return { error: json({ error: "credentials_not_allowed" }, 400) };
  }
  if (url.port !== "" && url.port !== "80" && url.port !== "443") {
    return { error: json({ error: "port_not_allowed" }, 400) };
  }
  if (!isAllowedImageHost(url.hostname)) {
    return { error: json({ error: "host_not_allowed" }, 403) };
  }
  return { url };
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
}

function timeoutError(): Error {
  const err = new Error("upstream fetch timed out");
  err.name = "TimeoutError";
  return err;
}

/**
 * fetch with a hard timeout. `AbortSignal.timeout` is the modern path; the
 * manual AbortController fallback covers runtimes that don't have it yet
 * (older jsdom in tests, older Workers compat dates).
 */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  if (typeof AbortSignal.timeout === "function") {
    return fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(timeoutError()), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchImage(start: URL): Promise<Response> {
  let current = start;
  // Follow redirects manually so each hop is re-checked against the
  // allowlist — an upstream 302 must never smuggle in another host.
  for (let hop = 0; hop <= 3; hop++) {
    let upstream: Response;
    try {
      upstream = await fetchWithTimeout(current.toString(), {
        redirect: "manual",
        headers: {
          Accept: "image/*",
          "User-Agent": "Motormila-Image-Proxy/1.0 (+https://motormila.pages.dev)",
        },
      });
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        return json({ error: "upstream_timeout" }, 504);
      }
      return json({ error: "upstream_fetch_failed" }, 502);
    }

    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get("location");
      if (!location) return new Response(null, { status: upstream.status });
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        return json({ error: "bad_redirect" }, 502);
      }
      const checked = parseTarget(next.toString());
      if ("error" in checked) return checked.error;
      current = checked.url;
      continue;
    }

    if (!upstream.ok) {
      // Pass the status through (404/403/…) with no body: the gallery treats
      // any failed texture as a signal to fall back to the filmstrip.
      return new Response(null, { status: upstream.status });
    }

    const contentType = (upstream.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!contentType.startsWith("image/")) {
      return json({ error: "not_an_image" }, 502);
    }
    const declared = Number(upstream.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > MAX_BYTES) {
      return json({ error: "image_too_large" }, 413);
    }
    const bytes = new Uint8Array(await upstream.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) {
      return json({ error: "image_too_large" }, 413);
    }
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(bytes.byteLength),
        // Same origin, so CORS is already satisfied; ACAO:* also lets the
        // preview project and any other Motormila surface use the photo.
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  return json({ error: "too_many_redirects" }, 502);
}

export interface ImageProxyContext {
  request: Request;
}

export async function onRequestGet(context: ImageProxyContext): Promise<Response> {
  const { request } = context;
  if (isBot(request.headers.get("user-agent"))) {
    return json({ error: "not_available_to_bots" }, 403);
  }
  const target = parseTarget(new URL(request.url).searchParams.get("u"));
  if ("error" in target) return target.error;
  return fetchImage(target.url);
}

export async function onRequest(context: ImageProxyContext): Promise<Response> {
  return json({ error: "method_not_allowed" }, 405);
}
