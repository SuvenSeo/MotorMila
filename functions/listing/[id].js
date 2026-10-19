// Bot user-agent split for /listing/:id (mirrors the vercel.json rewrite).
//
// Crawlers (WhatsApp/Facebook/Twitter/LinkedIn/...) get server-rendered OG
// meta via the shared listing-og helper; humans get the SPA (index.html)
// exactly as the old rewrite-to-/index.html fallback did.

import { listingOgResponse, apiBase } from "../api/listing-og.js";

const BOT_UA =
  /(facebookexternalhit|WhatsApp|Twitterbot|LinkedInBot|TelegramBot|Slackbot|Discordbot|Viber|Pinterest|vkShare)/i;

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const id = String(context.params?.id || "").trim();
  const ua = request.headers.get("user-agent") || "";

  if (BOT_UA.test(ua)) {
    return listingOgResponse({ id, apiBaseUrl: apiBase(env), siteOrigin: url.origin });
  }

  // Humans: serve the SPA shell; client-side routing takes over.
  return env.ASSETS.fetch(new URL("/index.html", url.origin));
}
