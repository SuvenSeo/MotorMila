// /cars/:make[/:model] on Cloudflare Pages.
//
// scripts/prerender-seo.mjs writes route shells at slugified, lowercase paths
// (/cars/toyota/aqua). The app links with the raw make/model case
// (/cars/Toyota/Aqua), which Vercel covers with a rewrite to the SPA. Pages
// has no case-insensitive fallback and a "/cars/* / 200" _redirects rule would
// shadow the shells, so this serves: the exact shell if it exists, else the
// slugified shell, else the SPA shell (client routing renders the hub).

const slugify = (v) =>
  String(v ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export async function serveCarsShell(context, segments) {
  const { request, env } = context;
  const url = new URL(request.url);

  const exact = await env.ASSETS.fetch(request);
  if (exact.status < 400) return exact;

  const slugPath = "/cars/" + segments.map((s) => slugify(decodeURIComponent(s))).join("/");
  if (slugPath !== url.pathname.replace(/\/+$/, "")) {
    const shell = await env.ASSETS.fetch(new URL(slugPath, url.origin));
    if (shell.status < 400) {
      return new Response(shell.body, { status: 200, headers: shell.headers });
    }
  }

  const spa = await env.ASSETS.fetch(new URL("/", url.origin));
  return new Response(spa.body, { status: 200, headers: spa.headers });
}
