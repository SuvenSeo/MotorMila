import { relativeAgo } from "@/lib/parseTime";
import { safeExternalUrl } from "@/lib/safeExternalUrl";

/** Display names for scraped marketplaces (lowercase key → brand spelling). */
const SOURCE_NAMES: Record<string, string> = {
  ikman: "ikman",
  riyasewana: "riyasewana",
  patpat: "patpat",
  autolanka: "AutoLanka",
  autodirect: "AutoDirect",
  autostream: "AutoStream",
  carshop: "Carshop",
  saleme: "SaleMe",
  riyahub: "Riyahub",
  dimo: "DIMO",
  hitad: "Hitad",
  cartivate: "Cartivate",
  revcar: "RevCar",
};

export function formatSourceName(source: string | null | undefined): string {
  const raw = String(source || "").trim();
  if (!raw) return "";
  const key = raw.toLowerCase().replace(/\.(lk|com)$/, "").replace(/[^a-z]/g, "");
  if (SOURCE_NAMES[key]) return SOURCE_NAMES[key];
  for (const k of Object.keys(SOURCE_NAMES)) {
    if (key.startsWith(k)) return SOURCE_NAMES[k];
  }
  return raw;
}

type AttributableListing = {
  source?: string | null;
  url?: string | null;
  detail_url?: string | null;
  external_url?: string | null;
  last_seen_at?: string | null;
  scraped_at?: string | null;
};

export interface SourceAttribution {
  sourceName: string;
  /** "last checked 2h ago" style, or null when the pipeline timestamp is missing. */
  checkedAgo: string | null;
  /** Safe http(s) link to the original ad, or null. */
  href: string | null;
}

export function getSourceAttribution(listing: AttributableListing, now: number = Date.now()): SourceAttribution {
  return {
    sourceName: formatSourceName(listing.source) || "source site",
    checkedAgo: relativeAgo(listing.last_seen_at || listing.scraped_at, now),
    href: [listing.url, listing.detail_url, listing.external_url].map((u) => safeExternalUrl(u)).find(Boolean) ?? null,
  };
}
