// Bot user-agent split for /listing/:id (mirrors the vercel.json rewrite).
//
// Crawlers (WhatsApp/Facebook/Twitter/LinkedIn/...) get server-rendered OG
// meta via the shared listing-og helper; humans get the SPA (index.html)
// exactly as the old rewrite-to-/index.html fallback did.
//
// 2026-10-28 SEO fix: the old regex covered social bots only, so Googlebot
// and Bingbot on Cloudflare Pages got the generic SPA shell (title
// "Motormila — The fair mila for every motor.") for all 100k+ listing URLs
// in the sitemap, while Vercel's rewrite gave them real OG meta. Search and
// AI-answer bots are now included here, matching vercel.json plus the AI
// crawlers allowed in robots.txt.

import { listingOgResponse, apiBase } from "../api/listing-og.js";

const BOT_UA =
  /(facebookexternalhit|WhatsApp|Twitterbot|LinkedInBot|TelegramBot|Slackbot|Discordbot|Viber|Pinterest|vkShare|Googlebot|bingbot|DuckDuckBot|YandexBot|Applebot|Baiduspider|Google-InspectionTool|GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|anthropic-ai|PerplexityBot|Google-Extended|Applebot-Extended|Meta-ExternalAgent|Meta-ExternalFetcher|Bytespider|YouBot)/i;

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const id = String(context.params?.id || "").trim();
  const ua = request.headers.get("user-agent") || "";

  if (BOT_UA.test(ua)) {
    return listingOgResponse({ id, apiBaseUrl: apiBase(env, url.origin), siteOrigin: url.origin });
  }

  // Humans: serve the SPA shell; client-side routing takes over.
  return env.ASSETS.fetch(new URL("/index.html", url.origin));
}
