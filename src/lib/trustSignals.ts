/**
 * Trust Check — client-side risk signals for one listing.
 *
 * Everything here is phrased as a *signal to check*, never a verdict: we see
 * asking prices and ad text, not the car or its papers. Inputs are data the
 * page already has (the listing row, its snapshot price history, the optional
 * history report with cross-site links). No extra network calls.
 */
import { parseFlexibleTime } from "@/lib/parseTime";
import { formatLkrCompact } from "@/lib/price";
import { englishT, type TranslateFn } from "@/lib/translate";

export type SignalLevel = "high" | "medium" | "info" | "ok";

export interface TrustSignal {
  id: string;
  level: SignalLevel;
  title: string;
  detail: string;
}

export interface TrustListingInput {
  id?: number | string;
  price_lkr?: number | null;
  market_median_lkr?: number | null;
  mileage_km?: number | null;
  year?: number | null;
  title?: string | null;
  description?: string | null;
  source?: string | null;
  first_seen_at?: string | null;
  images?: unknown[] | null;
  thumbnail_url?: string | null;
}

export interface TrustRelatedListing {
  id: number;
  source: string;
  price_lkr: number | null;
  mileage: number | null;
  first_seen_at: string | null;
  is_active?: boolean;
  confidence?: string;
}

export interface TrustInput {
  listing: TrustListingInput;
  pricePoints?: Array<{ price_lkr: number; scraped_at: string }> | null;
  /** Linked listings for the same vehicle (cross-site / relists). `null` = data unavailable. */
  related?: TrustRelatedListing[] | null;
  now?: number;
  /** Translator (useAppPreferences().t); English when omitted. */
  t?: TranslateFn;
}

export interface TrustReport {
  signals: TrustSignal[];
  highCount: number;
  mediumCount: number;
  summary: string;
  /** False when the cross-site graph could not be loaded (backend down); UI says so. */
  crossSiteAvailable: boolean;
}

/** Below-market thresholds (fraction under the market median). */
export const FAR_BELOW_MARKET = 0.3;
export const BELOW_MARKET = 0.15;
export const ABOVE_MARKET = 0.2;

/**
 * Advance-payment / absent-seller wording seen in vehicle scams (police and
 * CMTA advisories). Matched case-insensitively against title + description.
 */
const SCAM_PATTERNS: Array<{ re: RegExp; label: readonly [string, string] }> = [
  { re: /\b(advance|deposit|booking fee|token amount)\b.{0,40}\b(pay|send|transfer|required|first)\b|\b(pay|send|transfer)\b.{0,30}\b(advance|deposit)\b/i, label: ["trust.sig.scam.advance", "asks for an advance or deposit"] },
  { re: /\b(going|leaving|migrating|moving)\s+(abroad|overseas)\b|\b(abroad|overseas)\b.{0,30}\b(sale|urgent|owner|leaving)\b|\b(i am|currently|now)\s+(in|at)\s+(dubai|qatar|saudi|kuwait|oman|uae|italy|korea|japan|australia|canada|uk)\b/i, label: ["trust.sig.scam.abroad", "seller says they are abroad or leaving the country"] },
  { re: /\b(western union|money ?gram|crypto|bitcoin|usdt|gift card)\b/i, label: ["trust.sig.scam.untraceable", "mentions untraceable payment methods"] },
  { re: /\b(courier|ship|deliver)\b.{0,30}\b(the )?(vehicle|car|van|bike)\b.{0,30}\b(after|once)\b.{0,20}\b(pay|payment)\b/i, label: ["trust.sig.scam.delivery", "offers delivery after payment, without a viewing"] },
  { re: /\b(no (inspection|viewing|test drive)|without (inspection|viewing))\b/i, label: ["trust.sig.scam.noInspection", "discourages inspection or a test drive"] },
  { re: /\bopen (papers|transfer|documents)\b/i, label: ["trust.sig.scam.openPapers", "mentions 'open papers' (unregistered transfer)"] },
];

function fmtLkr(n: number): string {
  return formatLkrCompact(n);
}

export function buildTrustReport(input: TrustInput): TrustReport {
  const { listing } = input;
  const t = input.t ?? englishT;
  const now = input.now ?? Date.now();
  const signals: TrustSignal[] = [];

  const price = Number(listing.price_lkr);
  const marketMedian = Number(listing.market_median_lkr);
  const hasPrice = Number.isFinite(price) && price >= 100_000;
  const hasMarket = Number.isFinite(marketMedian) && marketMedian > 0;

  // 1) Price vs market band
  if (hasPrice && hasMarket) {
    const delta = (price - marketMedian) / marketMedian;
    const pct = Math.round(Math.abs(delta) * 100);
    if (delta <= -FAR_BELOW_MARKET) {
      signals.push({
        id: "price-far-below",
        level: "high",
        title: t("trust.sig.below.title", "Priced {pct}% below similar cars", { pct }),
        detail: t("trust.sig.farBelow.detail", "Market median for comparable ads is about {median}. Prices this far under market are a common bait pattern. It can also mean damage, missing papers or a typo. See the car and the documents before paying anything.", { median: fmtLkr(marketMedian) }),
      });
    } else if (delta <= -BELOW_MARKET) {
      signals.push({
        id: "price-below",
        level: "medium",
        title: t("trust.sig.below.title", "Priced {pct}% below similar cars", { pct }),
        detail: t("trust.sig.below.detail", "Could be a genuine deal. Ask why it's cheaper (accident history, repainting, overdue licence) and check it in person."),
      });
    } else if (delta >= ABOVE_MARKET) {
      signals.push({
        id: "price-above",
        level: "info",
        title: t("trust.sig.above.title", "Priced {pct}% above similar cars", { pct }),
        detail: t("trust.sig.above.detail", "Not a risk on its own. Expect room to negotiate unless the spec or condition is unusually good."),
      });
    } else {
      signals.push({
        id: "price-in-band",
        level: "ok",
        title: t("trust.sig.inBand.title", "Price is in the normal market range"),
        detail: t("trust.sig.inBand.detail", "Within about ±{band}% of the median for comparable ads ({median}).", { band: Math.round(BELOW_MARKET * 100), median: fmtLkr(marketMedian) }),
      });
    }
  } else {
    signals.push({
      id: "price-no-band",
      level: "info",
      title: t("trust.sig.noBand.title", "Not enough comparable ads to judge the price"),
      detail: t("trust.sig.noBand.detail", "Treat the asking price with care and compare a few similar ads yourself."),
    });
  }

  // 2) Scam wording
  const text = `${listing.title || ""}\n${listing.description || ""}`;
  const hits = SCAM_PATTERNS.filter((p) => p.re.test(text)).map((p) => t(p.label[0], p.label[1]));
  if (hits.length) {
    signals.push({
      id: "scam-wording",
      level: hits.length > 1 || (hasPrice && hasMarket && price < marketMedian * (1 - BELOW_MARKET)) ? "high" : "medium",
      title: t("trust.sig.scam.title", "Ad wording matches common scam patterns"),
      detail: t("trust.sig.scam.detail", "The ad {hits}. Never send an advance, deposit or \"booking fee\" before you've seen the car and its registration (CR) in person.", { hits: hits.join("; ") }),
    });
  }

  // 3) Cross-site identity, relists and odometer consistency
  const related = input.related;
  const crossSiteAvailable = Array.isArray(related);
  if (crossSiteAvailable) {
    const others = related!.filter((r) => String(r.id) !== String(listing.id));
    if (others.length) {
      const sources = new Set(others.map((r) => String(r.source || "").toLowerCase()).filter(Boolean));
      if (listing.source) sources.add(String(listing.source).toLowerCase());
      const otherPrices = others.map((r) => Number(r.price_lkr)).filter((p) => Number.isFinite(p) && p >= 100_000);
      const spread = hasPrice && otherPrices.length ? Math.max(...otherPrices.map((p) => Math.abs(p - price) / price)) : 0;
      signals.push({
        id: "cross-site",
        level: spread >= 0.15 ? "medium" : "info",
        title:
          sources.size === 1
            ? t("trust.sig.cross.titleOne", "Seen {n} times on 1 site", { n: others.length + 1 })
            : t("trust.sig.cross.title", "Seen {n} times across {sites} sites", { n: others.length + 1, sites: sources.size }),
        detail:
          spread >= 0.15
            ? t("trust.sig.cross.spread", "Linked ads for what looks like the same car show prices up to {pct}% apart. Ask the seller which price is current.", { pct: Math.round(spread * 100) })
            : t("trust.sig.cross.same", "Same car, likely relisted or cross-posted. Normal for dealers. Check that the seller name matches across ads."),
      });

      // Odometer going down between observations of the same car
      const ownKm = Number(listing.mileage_km);
      const ownAt = parseFlexibleTime(listing.first_seen_at) ?? now;
      const observations = [
        ...others.map((r) => ({ km: Number(r.mileage), at: parseFlexibleTime(r.first_seen_at) })),
        { km: ownKm, at: ownAt },
      ]
        .filter((o): o is { km: number; at: number } => Number.isFinite(o.km) && o.km > 0 && o.at !== null)
        .sort((a, b) => a.at - b.at);
      let worstDrop = 0;
      let dropFrom = 0;
      let dropTo = 0;
      let peak = 0;
      for (const o of observations) {
        if (o.km > peak) peak = o.km;
        const drop = peak - o.km;
        // Ignore small reversals (typos, rounding): need ≥ 5,000 km and ≥ 10%.
        if (drop >= 5_000 && drop / peak >= 0.1 && drop > worstDrop) {
          worstDrop = drop;
          dropFrom = peak;
          dropTo = o.km;
        }
      }
      if (worstDrop > 0) {
        signals.push({
          id: "odometer-drop",
          level: "high",
          title: t("trust.sig.odoDrop.title", "Mileage went down between linked ads"),
          detail: t("trust.sig.odoDrop.detail", "An earlier ad for what looks like the same car showed {from} km. A later one shows {to} km. That can be a typo, a mismatched link or a rolled-back odometer. Ask for service records and emission-test reports, which log mileage.", { from: dropFrom.toLocaleString("en-LK"), to: dropTo.toLocaleString("en-LK") }),
        });
      }
    } else {
      signals.push({
        id: "cross-site-none",
        level: "ok",
        title: t("trust.sig.crossNone.title", "No duplicate ads found on other sites"),
        detail: t("trust.sig.crossNone.detail", "We haven't linked this car to other ads in the sites we track."),
      });
    }
  }

  // 4) Mileage plausibility for age (single listing)
  const km = Number(listing.mileage_km);
  const year = Number(listing.year);
  const nowYear = new Date(now).getUTCFullYear();
  if (Number.isFinite(km) && km > 0 && Number.isFinite(year) && year > 1980) {
    const age = Math.max(1, nowYear - year);
    const perYear = km / age;
    if (age >= 5 && perYear < 3_000) {
      signals.push({
        id: "mileage-low",
        level: "medium",
        title: t("trust.sig.lowKm.title", "Very low mileage for its age"),
        detail: t("trust.sig.lowKm.detail", "About {km} km a year over {age} years. That's possible, but it's also the pattern you'd see after an odometer rollback. Check wear on the pedals, seats and steering wheel against the stated mileage.", { km: Math.round(perYear).toLocaleString("en-LK"), age }),
      });
    }
  } else if (!(Number.isFinite(km) && km > 0)) {
    signals.push({
      id: "mileage-missing",
      level: "info",
      title: t("trust.sig.noKm.title", "Mileage not stated"),
      detail: t("trust.sig.noKm.detail", "Ask for the odometer reading and a recent photo of the dashboard."),
    });
  }

  // 5) Time on market and price path
  const points = (input.pricePoints || []).filter((p) => Number.isFinite(p.price_lkr) && p.price_lkr > 0);
  const firstSeen = parseFlexibleTime(listing.first_seen_at);
  const days = firstSeen !== null ? Math.max(0, Math.floor((now - firstSeen) / 86_400_000)) : null;
  if (points.length >= 2) {
    const cuts = points.slice(1).filter((p, i) => p.price_lkr < points[i].price_lkr).length;
    if (cuts > 0) {
      const first = points[0].price_lkr;
      const last = points[points.length - 1].price_lkr;
      const change = ((last - first) / first) * 100;
      signals.push({
        id: "price-cuts",
        level: "info",
        title: t("trust.sig.cuts.title", "Price cut {n}× since first seen", { n: cuts }),
        detail: t("trust.sig.cuts.detail", "{from} → {to} ({change}%). The seller may be motivated, which is useful when you negotiate.", { from: fmtLkr(first), to: fmtLkr(last), change: change.toFixed(1) }),
      });
    }
  }
  if (days !== null && days >= 60) {
    signals.push({
      id: "long-on-market",
      level: "info",
      title: t("trust.sig.long.title", "On the market for {n} days", { n: days }),
      detail: t("trust.sig.long.detail", "Long listings often accept lower offers. It's also worth asking why it hasn't sold."),
    });
  }

  // 6) No photos
  const hasPhoto = Boolean(listing.thumbnail_url) || (Array.isArray(listing.images) && listing.images.length > 0);
  if (!hasPhoto) {
    signals.push({
      id: "no-photos",
      level: "info",
      title: t("trust.sig.noPhotos.title", "No photos in the ad"),
      detail: t("trust.sig.noPhotos.detail", "Ask for recent photos, including the chassis-number plate and the registration document."),
    });
  }

  const highCount = signals.filter((s) => s.level === "high").length;
  const mediumCount = signals.filter((s) => s.level === "medium").length;
  const summary =
    highCount > 0
      ? highCount + mediumCount === 1
        ? t("trust.summary.riskOne", "1 risk signal to check before you pay")
        : t("trust.summary.risk", "{n} risk signals to check before you pay", { n: highCount + mediumCount })
      : mediumCount > 0
        ? mediumCount === 1
          ? t("trust.summary.checkOne", "1 thing worth checking")
          : t("trust.summary.check", "{n} things worth checking", { n: mediumCount })
        : t("trust.summary.none", "No major risk signals in the data we have");

  const order: Record<SignalLevel, number> = { high: 0, medium: 1, info: 2, ok: 3 };
  signals.sort((a, b) => order[a.level] - order[b.level]);

  return { signals, highCount, mediumCount, summary, crossSiteAvailable };
}
