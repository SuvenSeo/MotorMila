/**
 * Card → listing handoff.
 *
 * A listing card already holds the listing and has its photo decoded. On the
 * tap we hand both to the detail page so it can paint its header and hero
 * right away (and the View Transition can morph the card photo into a hero
 * that is already there) instead of a skeleton while the detail data loads.
 * The data bundle itself starts on pointerdown, ~100 ms before the click.
 *
 * Seeds expire after 30 s; the bundle promise is taken (once) by the page.
 */
import {
  getListing,
  getListingFmv,
  getListingPriceHistory,
  getSimilarListings,
} from "@/services/api";
import type { ListingFmvDetail } from "@/services/api";
import type { CarListing, PriceHistoryInfo } from "@/types/car";

export type ListingBundle = [CarListing | null, CarListing[], PriceHistoryInfo | null, ListingFmvDetail | null];

type Seed = { listing: CarListing; heroSrc: string | null; at: number };

const SEED_TTL_MS = 30_000;
const BUNDLE_TTL_MS = 15_000;
const seeds = new Map<string, Seed>();
const bundles = new Map<string, { promise: Promise<ListingBundle>; at: number }>();
/**
 * The last few bundles a detail page showed, kept for Back/forward: returning
 * to a listing (listing → similar listing → Back) paints it straight away at
 * full height, so the scroll restore lands on the link the visitor tapped
 * instead of a skeleton that is still loading.
 */
const RECENT_TTL_MS = 10 * 60_000;
const RECENT_MAX = 12;
const recent = new Map<string, { bundle: ListingBundle; at: number }>();

function remember(id: string, bundle: ListingBundle): ListingBundle {
  if (bundle[0]) {
    recent.delete(id);
    recent.set(id, { bundle, at: Date.now() });
    while (recent.size > RECENT_MAX) recent.delete(recent.keys().next().value as string);
  }
  return bundle;
}

/** A bundle this tab showed for `id` in the last few minutes (Back/forward). */
export function peekRecentBundle(id: string | undefined): ListingBundle | null {
  if (!id) return null;
  const hit = recent.get(id);
  if (!hit) return null;
  if (Date.now() - hit.at > RECENT_TTL_MS) {
    recent.delete(id);
    return null;
  }
  return hit.bundle;
}

function fetchBundle(id: string): Promise<ListingBundle> {
  return Promise.all([
    getListing(id).catch(() => null),
    getSimilarListings(id).catch(() => [] as CarListing[]),
    getListingPriceHistory(id).catch(() => null),
    getListingFmv(id).catch(() => null),
  ]);
}

/** Start loading a listing's detail data (pointerdown on its card). */
export function prefetchListingBundle(id: string | number | null | undefined): void {
  if (id == null) return;
  const key = String(id);
  const hit = bundles.get(key);
  if (hit && Date.now() - hit.at < BUNDLE_TTL_MS) return;
  bundles.set(key, { promise: fetchBundle(key), at: Date.now() });
}

/** The prefetched bundle for `id` if one is fresh (consumed), else a new fetch. */
export function takeListingBundle(id: string): Promise<ListingBundle> {
  const hit = bundles.get(id);
  bundles.delete(id);
  const promise = hit && Date.now() - hit.at < BUNDLE_TTL_MS ? hit.promise : fetchBundle(id);
  return promise.then((b) => remember(id, b));
}

/** Remember the card's listing + the photo it is showing, for the detail page. */
export function seedListing(listing: CarListing, heroSrc: string | null): void {
  if (listing.id == null) return;
  seeds.set(String(listing.id), { listing, heroSrc, at: Date.now() });
}

export function peekListingSeed(id: string | undefined): Seed | null {
  if (!id) return null;
  const seed = seeds.get(id);
  if (!seed) return null;
  if (Date.now() - seed.at > SEED_TTL_MS) {
    seeds.delete(id);
    return null;
  }
  return seed;
}
