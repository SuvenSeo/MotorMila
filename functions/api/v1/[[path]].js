// Transparent proxy for /api/v1/* -> the Hugging Face FastAPI backend.
//
// This replaces the vercel.json / _redirects `/api/v1/* ... 200` rewrite.
// (A plain _redirects proxy rule for this path proved unreliable on Pages —
// requests fell through to the SPA fallback — so the proxy lives here where
// its behavior is deterministic and verifiable.)
//
// Behavior mirrors the old rewrite exactly: same-origin to the browser, so
// no CORS changes; method, query string, headers and body are forwarded and
// the upstream status/headers/body are returned untouched.

const BACKEND = "https://seo292-vehicle-platform-backend.hf.space/api/v1";

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const segments = context.params?.path;
  const splat = Array.isArray(segments) ? segments.join("/") : String(segments || "");
  const target = new URL(`${BACKEND}/${splat}${url.search}`);

  const headers = new Headers(request.headers);
  headers.delete("host");

  const init = { method: request.method, headers, redirect: "manual" };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    // Required by the Workers runtime when forwarding a stream body.
    init.duplex = "half";
  }

  const upstream = await fetch(target.toString(), init);
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  });
}
