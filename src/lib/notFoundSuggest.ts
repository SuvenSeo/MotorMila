/**
 * "Did you mean…" for the 404: match the dead URL's words against the real
 * pages' keywords (exact, prefix, or a small typo distance), best first.
 * Pure and synchronous: no index to load, a few dozen comparisons.
 */

export type SuggestPage = {
  to: string;
  /** i18n key + English fallback for the label. */
  labelKey: string;
  fallback: string;
  keywords: string[];
};

export const SUGGEST_PAGES: SuggestPage[] = [
  { to: "/#market", labelKey: "notFound.s.market", fallback: "Browse all vehicles", keywords: ["buy", "browse", "listings", "listing", "cars", "car", "vehicles", "search", "market", "ads", "inventory", "bikes", "vans"] },
  { to: "/trends", labelKey: "notFound.s.trends", fallback: "Price trends", keywords: ["prices", "price", "trends", "trend", "market", "index", "history", "chart", "charts"] },
  { to: "/estimate", labelKey: "notFound.s.estimate", fallback: "What's my vehicle worth?", keywords: ["estimate", "value", "valuation", "worth", "fmv", "appraise", "appraisal"] },
  { to: "/calculator", labelKey: "notFound.s.calculator", fallback: "Import tax calculator", keywords: ["tools", "tool", "calculator", "calculators", "calc", "tax", "duty", "import", "customs", "landed", "excise", "vat"] },
  { to: "/afford", labelKey: "notFound.s.afford", fallback: "What can I afford?", keywords: ["afford", "budget", "loan", "monthly", "emi", "affordability"] },
  { to: "/finance", labelKey: "notFound.s.finance", fallback: "Leasing quotes", keywords: ["finance", "leasing", "lease", "loan", "loans", "bank"] },
  { to: "/sell", labelKey: "notFound.s.sell", fallback: "Sell your vehicle", keywords: ["sell", "sale", "post", "advertise", "listmycar", "seller", "publish"] },
  { to: "/compare", labelKey: "notFound.s.compare", fallback: "Compare vehicles", keywords: ["compare", "comparison", "versus", "vs"] },
  { to: "/best-picks", labelKey: "notFound.s.bestPicks", fallback: "Best deals", keywords: ["deals", "deal", "best", "picks", "cheap", "bargain", "offers"] },
  { to: "/ev-hub", labelKey: "notFound.s.ev", fallback: "Electric & hybrid", keywords: ["ev", "electric", "hybrid", "evs", "charging", "chargers", "battery"] },
  { to: "/alerts", labelKey: "notFound.s.alerts", fallback: "Saved vehicles & alerts", keywords: ["saved", "save", "watchlist", "alerts", "alert", "favourites", "favorites", "notifications"] },
  { to: "/pricing", labelKey: "notFound.s.pricing", fallback: "Plans & pricing", keywords: ["pricing", "plans", "plan", "pro", "subscribe", "subscription", "premium", "upgrade"] },
  { to: "/safe-transfer", labelKey: "notFound.s.transfer", fallback: "Ownership transfer checklist", keywords: ["transfer", "ownership", "dmt", "cr", "papers", "agreement", "safe"] },
  { to: "/permits", labelKey: "notFound.s.permits", fallback: "Import permit prices", keywords: ["permit", "permits", "license", "licence"] },
  { to: "/official-pulse", labelKey: "notFound.s.official", fallback: "Tax & customs updates", keywords: ["gazette", "news", "updates", "official", "customs", "pulse"] },
  { to: "/mobile-app", labelKey: "notFound.s.app", fallback: "Mobile app", keywords: ["app", "android", "apk", "mobile", "download"] },
  { to: "/docs", labelKey: "notFound.s.docs", fallback: "How it works", keywords: ["docs", "help", "faq", "about", "how", "methodology"] },
  { to: "/sign-in", labelKey: "notFound.s.signIn", fallback: "Sign in", keywords: ["login", "signin", "sign", "account", "log"] },
];

/** Words in a dead URL ("/Price-Trend/x.html" → ["price", "trend", "x"]). */
export function pathWords(pathname: string): string[] {
  let raw = pathname;
  try {
    raw = decodeURIComponent(pathname);
  } catch {
    /* keep raw */
  }
  return raw
    .toLowerCase()
    .replace(/\.(html?|php|aspx?)$/i, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1);
}

/** Levenshtein distance with an early exit above `max`. */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

function wordScore(word: string, keyword: string): number {
  if (word === keyword) return 3;
  if (word.length >= 3 && (keyword.startsWith(word) || word.startsWith(keyword))) return 2;
  const max = keyword.length >= 7 ? 2 : keyword.length >= 4 ? 1 : 0;
  return max > 0 && distance(word, keyword, max) <= max ? 1 : 0;
}

/** Up to `limit` real pages that best match the dead URL (empty when nothing fits). */
export function suggestPages(pathname: string, limit = 3): SuggestPage[] {
  const words = pathWords(pathname);
  if (!words.length) return [];
  return SUGGEST_PAGES.map((page, order) => {
    let score = 0;
    for (const w of words) score += Math.max(0, ...page.keywords.map((k) => wordScore(w, k)));
    return { page, score, order };
  })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map((r) => r.page);
}
