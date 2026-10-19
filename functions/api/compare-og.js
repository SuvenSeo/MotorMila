// OG preview for canonical /compare/{slug} pages (TRACK B2-C SEO rescue).
//
// Social crawlers never execute the SPA. Two modes in one file (no new deps):
//   /api/compare-og?slug=12-vs-45            -> HTML with OG meta (crawlers)
//   /api/compare-og?slug=12-vs-45&format=image -> SVG card (og:image target)
// Dark terminal card spec: 1200x630, #09090b bg, mono type, blue accent.

const COMPARE_SLUG_PATTERN = /^\d+(?:-vs-\d+){0,3}$/;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeXml(value) {
  return escapeHtml(value);
}

function parseIds(slug) {
  if (!COMPARE_SLUG_PATTERN.test(String(slug || "").trim())) return [];
  return String(slug)
    .trim()
    .split("-vs-")
    .map((s) => Number.parseInt(s, 10))
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 4);
}

function renderCard(ids, siteOrigin) {
  const label = ids.length >= 2 ? ids.join("  vs  ") : "vehicles";
  const columns = ids
    .map(
      (id, i) => `
      <g font-family="ui-monospace,Menlo,Consolas,monospace">
        <rect x="${60 + i * 270}" y="250" width="240" height="220" rx="12" fill="#101014" stroke="#27272a" stroke-width="2"/>
        <text x="${80 + i * 270}" y="300" fill="#0a7aff" font-size="22">#${
          i + 1
        } · ID ${id}</text>
        <text x="${80 + i * 270}" y="345" fill="#f4f4f5" font-size="30">Rs. — M</text>
        <text x="${80 + i * 270}" y="385" fill="#a1a1aa" font-size="20">LKR · live ask</text>
        <text x="${80 + i * 270}" y="425" fill="#52525b" font-size="18">see page for specs</text>
      </g>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#09090b"/>
  <rect x="0" y="0" width="1200" height="8" fill="#0a7aff"/>
  <g font-family="ui-monospace,Menlo,Consolas,monospace">
    <text x="60" y="90" fill="#52525b" font-size="26">MOTORMILA // COMPARE</text>
    <text x="60" y="160" fill="#f4f4f5" font-size="52">${escapeXml(label)}</text>
    <text x="60" y="205" fill="#a1a1aa" font-size="24">side-by-side prices &amp; specs · Sri Lanka</text>
  </g>
  ${columns}
  <g font-family="ui-monospace,Menlo,Consolas,monospace">
    <text x="60" y="560" fill="#52525b" font-size="22">$ motormila compare --fair-value --lkr</text>
    <text x="60" y="595" fill="#3f3f46" font-size="20">${escapeXml(siteOrigin.replace(/^https?:\/\//, ""))}</text>
  </g>
</svg>`;
}

function renderPage({ title, description, image, url }) {
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const img = escapeHtml(image);
  const u = escapeHtml(url);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${t}</title>
<meta name="description" content="${d}" />
<link rel="canonical" href="${u}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Motormila" />
<meta property="og:title" content="${t}" />
<meta property="og:description" content="${d}" />
<meta property="og:url" content="${u}" />
<meta property="og:image" content="${img}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${t}" />
<meta name="twitter:description" content="${d}" />
<meta name="twitter:image" content="${img}" />
<meta http-equiv="refresh" content="0;url=${u}" />
</head>
<body>
<p><a href="${u}">${t}</a></p>
</body>
</html>`;
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const siteOrigin = url.origin;
  const slug = String(url.searchParams.get("slug") || "").trim();
  const ids = parseIds(slug);
  const compareUrl = ids.length
    ? `${siteOrigin}/compare/${ids.join("-vs-")}`
    : `${siteOrigin}/compare`;
  const label = ids.length >= 2 ? ids.join(" vs ") : "vehicles";

  if (String(url.searchParams.get("format") || "") === "image") {
    if (ids.length < 2) {
      return new Response("invalid compare slug", { status: 400 });
    }
    return new Response(renderCard(ids, siteOrigin), {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  }

  const title = `Compare ${label} — Side-by-Side Prices & Specs | Motormila`;
  const description =
    `Side-by-side comparison of listings ${label}: price (LKR), mileage, ` +
    `district, fuel and fair-value verdict on Motormila.`;
  return new Response(
    renderPage({
      title,
      description,
      image: ids.length
        ? `${siteOrigin}/api/compare-og?slug=${ids.join("-vs-")}&format=image`
        : `${siteOrigin}/og-card.jpg`,
      url: compareUrl,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
