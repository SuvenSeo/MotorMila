// Chunked dynamic sitemap for /listing/:id pages.
// Without ?page= returns a sitemap index; ?page=N returns one urlset chunk.

const DEFAULT_BACKEND = "https://seo292-vehicle-platform-backend.hf.space/api/v1";
const PAGE_SIZE = 5000;
const FETCH_TIMEOUT_MS = 9000;

function apiBase(env) {
  const configured = String(env?.VITE_API_URL || "").trim().replace(/\/+$/, "");
  if (!configured) return DEFAULT_BACKEND;
  if (configured.endsWith("/api") || configured.endsWith("/api/v1")) return configured;
  return `${configured}/api/v1`;
}

async function fetchJson(base, path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${base}${path}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchListingIds(base, page) {
  const offset = (page - 1) * PAGE_SIZE;
  const rows = await fetchJson(base, `/listings/sitemap-ids?limit=${PAGE_SIZE}&offset=${offset}`);
  return Array.isArray(rows) ? rows : [];
}

async function fetchSitemapMeta(base) {
  const meta = await fetchJson(base, "/listings/sitemap-count");
  const total = Number(meta?.total || 0);
  const pageSize = Number(meta?.page_size || PAGE_SIZE);
  const pages = total > 0 ? Math.ceil(total / pageSize) : 1;
  return { total, pageSize, pages };
}

function toLastmod(value) {
  const parsed = new Date(String(value || ""));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function renderUrlset(rows, siteOrigin) {
  const urls = rows
    .filter((row) => Number.isInteger(Number(row?.id)) && Number(row.id) > 0)
    .map((row) => {
      // Prefer content_updated_at (price/status change) over re-sight last_seen_at
      // so Google only re-crawls when the page meaningfully changed.
      const lastmod = toLastmod(
        row.content_updated_at || row.first_seen_at || row.last_seen_at,
      );
      return [
        "  <url>",
        `    <loc>${siteOrigin}/listing/${Number(row.id)}</loc>`,
        lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
        "  </url>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

function renderSitemapIndex(pages, siteOrigin) {
  const entries = Array.from({ length: pages }, (_, index) => {
    const page = index + 1;
    return [
      "  <sitemap>",
      `    <loc>${siteOrigin}/api/sitemap-listings?page=${page}</loc>`,
      "  </sitemap>",
    ].join("\n");
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</sitemapindex>`;
}

const XML_HEADERS = { "Content-Type": "application/xml; charset=utf-8" };

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const siteOrigin = url.origin;
  const base = apiBase(env);
  const rawPage = String(url.searchParams.get("page") || "").trim();
  const page = rawPage ? Number.parseInt(rawPage, 10) : 0;

  if (!rawPage || !Number.isFinite(page) || page < 1) {
    const { pages } = await fetchSitemapMeta(base);
    const xml = renderSitemapIndex(Math.max(1, pages), siteOrigin);
    return new Response(xml, {
      status: 200,
      headers: {
        ...XML_HEADERS,
        "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
      },
    });
  }

  const rows = await fetchListingIds(base, page);
  const xml = renderUrlset(rows, siteOrigin);
  return new Response(xml, {
    status: 200,
    headers: {
      ...XML_HEADERS,
      "Cache-Control":
        rows.length > 0 ? "public, s-maxage=21600, stale-while-revalidate=86400" : "public, s-maxage=300",
    },
  });
}
