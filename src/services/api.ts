import {
  CarListing,
  StatsOverview,
  PriceEstimate,
  PriceTrendPoint,
  PriceTrendSeries,
  DistrictPrice,
  FilterState,
  PipelineStatusResponse,
  PipelineRunsResponse,
  PipelineRunRecord,
  PipelineTriggerJob,
  PipelineTriggerResponse,
  DashboardInsights,
  DistrictQuickInsight,
  LiveMarketSnapshot,
  MarketSignal,
  MakeModelInsight,
  MakeInsight,
  ModelPriceHistory,
  SellerTrustProfile,
  PriceDropItem,
  PriceHistoryInfo,
  HistoryReport,
  PriceIndex,
  FuelMixData,
  HybridBandsData,
  SourceQualityResponse,
  DistrictVelocityData,
  DistrictVelocityPoint,
  EvInsightData,
  ImportEraSplitData,
  ImportEraEntry,
  ImportEraMakeRow,
} from "@/types/car";
import type {
  ProArbitrageGap,
  ProDetailPayload,
  ProDistrictProfile,
  ProMarketSnapshot,
  ProVehicleLane,
  ProVehicleLaneFilters,
} from "@/types/pro";
import { canonicalizeMake, canonicalizeModel, isJunkMake, modelContainsForeignMake } from "@/lib/makeNormalization";
import { normalizeVehicleImageUrlWithBase, pickVehicleImageUrl } from "@/lib/listingImage";
import { formatPriceLkrMillions } from "@/lib/formatting";
import { authHeaders } from "@/lib/authToken";
import { districtCoords, normalizeDistrictName } from "@/data/districts";
import { QUERY_STALE } from "@/lib/queryPolicy";
import type { ListingFmvDetail } from "@/types/fmv";
import { cleanDistrict, computedDropPct, isPlausiblePriceDrop } from "@/lib/dataSanity";

const DEFAULT_PRODUCTION_API = "https://seo292-vehicle-platform-backend.hf.space/api/v1";
const HF_COLD_START_TIMEOUT_MS = 60_000;

type JsonRecord = Record<string, unknown>;
type QueryParams = Record<string, string | number | boolean | undefined | null>;
type EstimateParams = QueryParams;

function asJsonRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null ? (value as JsonRecord) : {};
}

function normalizeApiBasePath(raw: string): string {
  const trimmed = raw.replace(/\/+$/, "");
  if (trimmed.endsWith("/api") || trimmed.endsWith("/api/v1")) return trimmed;
  return `${trimmed}/api/v1`;
}

function resolveApiBase() {
  const configured = String(import.meta.env.VITE_API_URL || "").trim();

  if (import.meta.env.DEV) {
    return normalizeApiBasePath(configured || "/api/v1");
  }

  if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
    return normalizeApiBasePath(configured || "/api/v1");
  }

  if (!configured) {
    return normalizeApiBasePath(DEFAULT_PRODUCTION_API);
  }

  return normalizeApiBasePath(configured);
}

export const API_BASE = resolveApiBase();
export const LISTINGS_PAGE_SIZE = 12;
const USE_MOCK = false;
const REQUEST_TIMEOUT_MS = 25000;
const MIN_REASONABLE_PRICE_LKR = 100_000;

/**
 * Cookie credentials only work when the API is same-origin.
 * Cross-origin calls to Hugging Face Spaces fail in the browser because HF's
 * edge answers CORS preflight without Access-Control-Allow-Credentials, so
 * `credentials: "include"` makes POSTs (calculator, login) throw
 * TypeError "Failed to fetch". Bearer auth still works with "omit".
 */
export function resolveFetchCredentials(apiBase: string = API_BASE): RequestCredentials {
  if (typeof window === "undefined") return "omit";
  try {
    const apiOrigin = new URL(apiBase, window.location.origin).origin;
    return apiOrigin === window.location.origin ? "include" : "omit";
  } catch {
    return "omit";
  }
}

function resolveSnapshotBase() {
  const configured = String(import.meta.env.VITE_SNAPSHOT_BASE_URL || "").trim();
  // "off" disables snapshot reads entirely (live API only; used by unit tests).
  if (/^(off|none|false|0)$/i.test(configured)) return "";
  // Same-origin snapshots are the natural default: every deployment bundles
  // public/snapshots/latest, so snapshot reads must not require an explicit base.
  return configured ? configured.replace(/\/+$/, "") : "/snapshots/latest";
}

function resolveSnapshotOnly(): boolean {
  const raw = String(import.meta.env.VITE_SNAPSHOT_ONLY || "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

export const SNAPSHOT_BASE = resolveSnapshotBase();

/** When true, public reads never fall back to the live Postgres-backed API. */
export const SNAPSHOT_ONLY = resolveSnapshotOnly();

const SOURCE_LABELS: Record<string, string> = {
  ikman: "Ikman",
  riyasewana: "Riyasewana",
  autolanka: "AutoLanka",
  autodirect: "AutoDirect",
  patpat: "Patpat",
  autostream: "AutoStream",
  carshop: "Carshop",
  saleme: "SaleMe",
  riyahub: "Riyahub",
  dimo: "Cars at DIMO",
};

export class APIError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(`API error ${status}: ${detail || "Request failed"}`);
    this.name = "APIError";
    this.status = status;
    this.detail = detail;
  }
}

function refuseLiveApiFallback(context: string): never {
  throw new APIError(
    503,
    `Snapshot-only mode: ${context} is unavailable from CDN. ` +
      "Check VITE_SNAPSHOT_BASE_URL / R2 objects, or unset VITE_SNAPSHOT_ONLY.",
  );
}

export interface CustomVehicleComparable {
  id: number;
  title: string;
  price_lkr: number | null;
  district?: string | null;
  deal_score?: number | null;
  detail_url?: string | null;
  external_url?: string | null;
}

export interface CustomVehicleEstimateResult {
  vehicle_label: string;
  estimated_low_lkr: number;
  estimated_median_lkr: number;
  estimated_high_lkr: number;
  comparable_count: number;
  confidence: "high" | "medium" | "low";
  verdict: string;
  verdict_label: string;
  delta_pct?: number | null;
  methodology: string;
  comparables: CustomVehicleComparable[];
}

export interface CustomVehicleEstimateInput {
  make: string;
  model: string;
  year: number;
  mileage_km?: number;
  condition?: string;
  transmission?: string;
  fuel_type?: string;
  body_type?: string;
  district?: string;
  asking_price_lkr?: number;
}

export interface ListingSourceStat {
  source: string;
  label: string;
  count: number;
}

export interface NhtsaModel {
  make: string;
  model: string;
  make_id: number | null;
  model_id: number | null;
  source: string;
}

export interface NhtsaModelsResult {
  make: string;
  count: number;
  models: NhtsaModel[];
}

export interface EnrichmentEnvelope<T = unknown> {
  available: boolean;
  provider: string;
  market_scope: string;
  license_note?: string | null;
  fetched_at: string;
  match_confidence: number | null;
  source_url?: string | null;
  limitation: string;
  unavailable_reason?: string | null;
  data: T | null;
}

export interface SafetyResearchResponse {
  listing_id?: number | null;
  year?: number | string | null;
  make: string;
  model: string;
  vehicle_key?: string | null;
  safety: EnrichmentEnvelope;
  reliability: EnrichmentEnvelope;
}

export interface ChargingStationConnector {
  type?: string | number | null;
  power_kw?: number | null;
  level?: string | null;
}

export interface ChargingStation {
  ocm_id: number;
  name: string | null;
  operator: string | null;
  lat: number;
  lng: number;
  address: string | null;
  town?: string | null;
  status?: string | null;
  connectors: ChargingStationConnector[];
  power_kw?: number | null;
  distance_km: number;
  data_provider?: string | null;
  attribution?: string | null;
}

export interface ChargingStationsResponse {
  count: number;
  lat?: number;
  lng?: number;
  radius_km: number;
  attribution: string;
  limitation?: string;
  stations: ChargingStation[];
}

export interface ListingSearchSuggestion {
  id: number;
  make: string;
  model: string;
  year: number;
  district?: string;
  price_lkr?: number | null;
  source: string;
  thumbnail_url?: string;
  url?: string;
}

export interface FeedbackInput {
  category: "bug" | "idea" | "data" | "ux" | "general";
  route?: string;
  message: string;
  email?: string;
}

export interface FeedbackReceipt {
  id: number;
  category: string;
  route?: string | null;
  status: string;
  created_at: string;
}

function canonicalSource(value: unknown): string | null {
  const compact = String(value || "").trim().toLowerCase().replace(/[-_.\s]/g, "");
  if (!compact) return null;
  if (compact.startsWith("ikman")) return "ikman";
  if (compact.startsWith("riyasewana")) return "riyasewana";
  if (["autolanka", "autolankacom", "autolankalk", "autolankasite"].includes(compact)) return "autolanka";
  if (compact.startsWith("autodirect")) return "autodirect";
  if (compact.startsWith("patpat")) return "patpat";
  if (compact.startsWith("autostream")) return "autostream";
  if (compact.startsWith("carshop")) return "carshop";
  if (["saleme", "salemelk"].includes(compact)) return "saleme";
  if (["riyahub", "riyahublk"].includes(compact)) return "riyahub";
  if (["dimo", "carsatdimo", "dimoautomobiles"].includes(compact)) return "dimo";
  return compact;
}

function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] || source.replace(/[-_.]/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function normalizeConditionFilter(condition?: string): string | undefined {
  const compact = String(condition || "").trim().toLowerCase().replace(/[-_\s]/g, "");
  if (!compact || compact === "all") return undefined;
  if (["brandnew", "new", "unregistered", "zeromileage"].includes(compact)) return "new";
  if (["reconditioned", "recon"].includes(compact)) return "reconditioned";
  if (["used", "preowned", "secondowner"].includes(compact)) return "used";
  return String(condition || "").trim().toLowerCase();
}

async function parseApiError(response: Response): Promise<APIError> {
  const raw = await response.text().catch(() => "");
  let detail = raw || response.statusText || "Request failed";

  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.detail === "string") {
        detail = parsed.detail;
      } else if (Array.isArray(parsed?.detail)) {
        detail = parsed.detail
          .map((item: JsonRecord) => (typeof item?.msg === "string" ? item.msg : JSON.stringify(item)))
          .join("; ");
      }
    } catch {
      // Keep original text payload as API detail when JSON parsing fails.
    }
  }

  return new APIError(response.status, detail);
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeConditionValue(value: unknown): string | undefined {
  const compact = String(value || "").trim().toLowerCase().replace(/[-_\s]/g, "");
  if (!compact) return undefined;
  if (["brandnew", "new", "unregistered", "zerokm", "zeromileage"].includes(compact)) return "brand_new";
  if (["reconditioned", "recon", "recondition"].includes(compact)) return "reconditioned";
  if (["used", "preowned", "secondowner"].includes(compact)) return "used";
  return undefined;
}

function normalizeTransmissionValue(value: unknown): string | undefined {
  const compact = String(value || "").trim().toLowerCase().replace(/[-_\s]/g, "");
  if (!compact) return undefined;
  if (compact.includes("tiptronic")) return "tiptronic";
  if (compact.includes("cvt")) return "cvt";
  if (compact.includes("manual")) return "manual";
  if (compact.includes("auto")) return "automatic";
  return undefined;
}

function normalizeFuelValue(value: unknown): string | undefined {
  const compact = String(value || "").trim().toLowerCase().replace(/[-_\s]/g, "");
  if (!compact) return undefined;
  if (compact.includes("pluginhybrid") || compact.includes("phev")) return "plugin_hybrid";
  if (compact.includes("hybrid")) return "hybrid";
  if (compact.includes("diesel")) return "diesel";
  if (compact.includes("petrol") || compact.includes("gasoline")) return "petrol";
  if (compact.includes("electric") || compact.includes("ev")) return "electric";
  return undefined;
}

function normalizeBodyTypeValue(value: unknown): string | undefined {
  const compact = String(value || "").trim().toLowerCase().replace(/[-_\s]/g, "");
  if (!compact) return undefined;
  if (compact.includes("hatchback") || compact === "hatch") return "hatchback";
  if (compact.includes("crossover") || compact === "cuv") return "crossover";
  if (compact.includes("suv") || compact.includes("sportutility")) return "suv";
  if (compact.includes("pickup") || compact.includes("doublecab") || compact.includes("singlecab")) return "pickup";
  if (compact.includes("truck") && !compact.includes("pickup")) return "truck";
  if (compact === "mpv" || compact.includes("minivan")) return "mpv";
  if (compact.includes("van")) return "van";
  if (compact.includes("wagon") || compact.includes("estate")) return "wagon";
  if (compact.includes("coupe")) return "coupe";
  if (compact.includes("convertible") || compact.includes("cabriolet")) return "convertible";
  if (compact.includes("sedan") || compact.includes("saloon")) return "sedan";
  if (compact.includes("jeep") || compact === "4x4" || compact.includes("fourwheel")) return "jeep";
  if (compact.includes("luxury") || compact === "premium") return "luxury";
  if (
    compact === "mini" ||
    compact.includes("minicooper") ||
    compact.includes("keicar") ||
    compact.includes("citycar") ||
    compact.includes("microcar")
  ) {
    return "mini";
  }
  if (compact.includes("motorcycl") || compact.includes("motorbike") || compact.includes("scooter")) {
    return "motorcycle";
  }
  return undefined;
}

const NON_CAR_CATEGORIES = new Set([
  "motorbikes",
  "motorcycles",
  "bike",
  "bikes",
  "three-wheelers",
  "three-wheels",
  "threewheeler",
  "vans",
  "van",
  "buses",
  "bus",
  "lorries",
  "lorries-trucks",
  "trucks",
  "truck",
  "tipper",
  "heavy-duty",
  "heavy-duties",
  "heavy",
  "tractors",
  "tractor",
  "bicycles",
  "bicycle",
  "push-cycles",
  "boats",
  "boats-water-transport",
  "others",
]);

const BROWSE_CATEGORY_ALIASES: Record<string, Set<string>> = {
  cars: new Set(["cars", "car", "suvs", "suv", "jeeps", "wagons", "pickups", "pickup", "crew-cabs", "crew-cab", "sports"]),
  motorbikes: new Set(["motorbikes", "motorcycles", "bike", "bikes"]),
  "three-wheelers": new Set(["three-wheelers", "three-wheels", "threewheeler"]),
  vans: new Set(["vans", "van"]),
  buses: new Set(["buses", "bus"]),
  lorries: new Set(["lorries", "lorries-trucks", "trucks", "truck", "tipper"]),
  "heavy-duty": new Set(["heavy-duty", "heavy-duties", "heavy"]),
  tractors: new Set(["tractors", "tractor"]),
  bicycles: new Set(["bicycles", "bicycle", "push-cycles"]),
  boats: new Set(["boats", "boats-water-transport"]),
  others: new Set(["others"]),
};

const LUXURY_MAKES = new Set([
  "mercedes",
  "mercedesbenz",
  "bmw",
  "audi",
  "lexus",
  "landrover",
  "porsche",
  "jaguar",
  "bentley",
  "maserati",
  "ferrari",
  "lamborghini",
  "rollsroyce",
  "astonmartin",
  "cadillac",
  "infiniti",
  "genesis",
]);

function normalizeVehicleCategoryValue(value: unknown): string | undefined {
  const token = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]+/g, "");
  return token || undefined;
}

function matchesBrowseCategory(listingCategory: string | undefined, browse: string): boolean {
  if (browse === "cars") {
    if (listingCategory && NON_CAR_CATEGORIES.has(listingCategory)) return false;
    return true;
  }
  const aliases = BROWSE_CATEGORY_ALIASES[browse];
  if (!aliases) return listingCategory === browse;
  return Boolean(listingCategory && aliases.has(listingCategory));
}

function matchesBodyTypeFilter(listing: CarListing, bodyType: string): boolean {
  const wanted = normalizeBodyTypeValue(bodyType) || bodyType;
  const listingBody = normalizeBodyTypeValue(listing.body_type);
  if (listingBody && listingBody === wanted) return true;

  if (wanted === "luxury") {
    const make = String(listing.make || "")
      .toLowerCase()
      .replace(/[-_\s.]/g, "");
    if (LUXURY_MAKES.has(make)) return true;
    const hay = `${listing.title || ""}`.toLowerCase();
    return /luxury|premium/.test(hay);
  }
  if (wanted === "jeep") {
    const category = normalizeVehicleCategoryValue(
      (listing as CarListing & { vehicle_category?: string }).vehicle_category,
    );
    if (category === "jeeps" || category === "jeep") return true;
    return /\bjeep\b|4[\s-]?x[\s-]?4/i.test(`${listing.title || ""}`);
  }
  if (wanted === "mini") {
    const make = String(listing.make || "").toLowerCase();
    if (make === "mini" || make === "micro") return true;
    return /mini\s*cooper|city\s*car|kei\s*car/i.test(`${listing.title || ""}`);
  }
  return false;
}

function normalizeListing(raw: JsonRecord): CarListing {
  const sourceUrls = [raw?.url, raw?.detail_url, raw?.external_url];
  const images = Array.isArray(raw?.images)
    ? raw.images
        .map((url: unknown) => normalizeVehicleImageUrlWithBase(url, sourceUrls))
        .filter((url: string | null): url is string => Boolean(url))
    : undefined;
  const thumbnailUrl = pickVehicleImageUrl([raw?.thumbnail_url, ...(images || [])], sourceUrls) || undefined;
  const listingUrl = String(raw?.url || raw?.detail_url || raw?.external_url || "").trim() || undefined;
  const detailUrl = String(raw?.detail_url || listingUrl || "").trim() || undefined;
  const externalUrl = String(raw?.external_url || listingUrl || "").trim() || undefined;

  const condition = normalizeConditionValue(raw?.condition);
  const transmission = normalizeTransmissionValue(raw?.transmission);
  const fuelType = normalizeFuelValue(raw?.fuel_type);
  const bodyType = normalizeBodyTypeValue(raw?.body_type);
  // Collapse duplicate/typo/junk make spellings at the ingest boundary so the
  // combobox, model pickers, and filters all see one brand.
  const make = canonicalizeMake(raw?.make);
  const model = canonicalizeModel(raw?.model);

  return {
    ...raw,
    make,
    model,
    url: listingUrl,
    detail_url: detailUrl,
    external_url: externalUrl,
    year: Number(raw?.year) || 0,
    mileage_km: toNumberOrNull(raw?.mileage_km ?? raw?.mileage),
    engine_cc: toNumberOrNull(raw?.engine_cc ?? raw?.engine_capacity) ?? undefined,
    price_lkr: toNumberOrNull(raw?.price_lkr),
    deal_score: toNumberOrNull(raw?.deal_score),
    market_median_lkr: toNumberOrNull(raw?.market_median_lkr) ?? undefined,
    condition,
    transmission,
    fuel_type: fuelType,
    body_type: bodyType,
    thumbnail_url: thumbnailUrl,
    images,
    // "Sri Lanka" / "Island-wide" is the country, not a district — unknown.
    district: cleanDistrict(raw?.district) ?? undefined,
    // Snapshot payloads predate the lifecycle flag — default to active so
    // only an explicit backend false renders the possibly-sold state.
    is_active: raw?.is_active === undefined ? true : Boolean(raw.is_active),
    last_seen_at: raw?.last_seen_at ? String(raw.last_seen_at) : undefined,
  } as CarListing;
}

/**
 * Collapse duplicate rows before they reach the UI.
 *
 * Duplicates creep in three ways:
 *  1. the same row id repeats across snapshot catalog parts (or the incoming
 *     live overlay re-lists an id that is already in the catalog),
 *  2. the same source re-publishes one car under two ids — same detail URL,
 *  3. near-identical scrapes with no URL at all — same source + make + model +
 *     year + price + district.
 *
 * First occurrence wins, so callers that overlay the freshest rows first
 * (see overlayIncomingListings) keep the newest copy.
 */
export function dedupeListings(rows: CarListing[]): CarListing[] {
  if (!Array.isArray(rows) || rows.length < 2) return Array.isArray(rows) ? rows : [];

  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  const seenFingerprints = new Set<string>();
  const out: CarListing[] = [];

  for (const row of rows) {
    if (!row) continue;

    const id = Number(row.id);
    const idKey = Number.isFinite(id) && id > 0 ? String(id) : null;
    if (idKey && seenIds.has(idKey)) continue;

    const source = String(row.source || "").trim().toLowerCase();
    const url = String(row.detail_url || row.url || row.external_url || "")
      .trim()
      .toLowerCase()
      .replace(/[#?].*$/, "")
      .replace(/\/+$/, "");
    if (url) {
      const urlKey = `${source}|${url}`;
      if (seenUrls.has(urlKey)) continue;
      seenUrls.add(urlKey);
    } else {
      const fingerprint = [
        source,
        String(row.make || "").trim().toLowerCase(),
        String(row.model || "").trim().toLowerCase(),
        String(row.year || ""),
        String(row.price_lkr ?? ""),
        String(row.district || "").trim().toLowerCase(),
      ].join("|");
      if (seenFingerprints.has(fingerprint)) continue;
      seenFingerprints.add(fingerprint);
    }

    if (idKey) seenIds.add(idKey);
    out.push(row);
  }

  return out;
}

const snapshotJsonCache = new Map<string, Promise<unknown>>();
let snapshotCatalogPromise: Promise<CarListing[] | null> | null = null;
let snapshotCatalogFetchedAt = 0;
/** Refresh the offline catalog at most this often (ms). */
const SNAPSHOT_CATALOG_TTL_MS = 15 * 60 * 1000;

export async function fetchSnapshotJSON<T>(fileName: string): Promise<T> {
  const normalizedFile = fileName.replace(/^\/+/, "");
  // Primary: the configured snapshot base (usually the production CDN, so
  // previews read fresh data). Fallback: the same-origin bundled snapshots,
  // so a deployment keeps working when the CDN doesn't have a file yet
  // (e.g. a newly added export that the pipeline hasn't published).
  const primaryUrl = new URL(`${SNAPSHOT_BASE}/${normalizedFile}`, window.location.origin).toString();
  const sameOriginUrl = new URL(`/snapshots/latest/${normalizedFile}`, window.location.origin).toString();
  const urls = sameOriginUrl === primaryUrl ? [primaryUrl] : [primaryUrl, sameOriginUrl];

  const cached = snapshotJsonCache.get(primaryUrl);
  if (cached) return cached as Promise<T>;

  const request = (async (): Promise<T> => {
    let lastError: unknown = new Error(`Snapshot ${normalizedFile} unavailable`);
    for (const url of urls) {
      try {
        const response = await fetch(url, {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          throw new Error(`Snapshot ${normalizedFile} failed with ${response.status}`);
        }
        return (await response.json()) as T;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  })().catch((error) => {
    snapshotJsonCache.delete(primaryUrl);
    throw error;
  });

  snapshotJsonCache.set(primaryUrl, request);
  return request as Promise<T>;
}

async function readSnapshot<T>(fileName: string): Promise<T | null> {
  if (!SNAPSHOT_BASE) return null;
  try {
    return await fetchSnapshotJSON<T>(fileName);
  } catch {
    return null;
  }
}

function overlayIncomingListings(catalog: CarListing[], incoming: CarListing[]): CarListing[] {
  if (!incoming.length) return catalog;
  const incomingIds = new Set(incoming.map((row) => Number(row.id)));
  return dedupeListings([...incoming, ...catalog.filter((row) => !incomingIds.has(Number(row.id)))]);
}

async function getIncomingSnapshotListings(): Promise<CarListing[]> {
  const snapshot = await readSnapshot<JsonRecord>("live-market.json");
  if (!snapshot) return [];
  const rows = Array.isArray(snapshot.latest_listings) ? snapshot.latest_listings : [];
  return dedupeListings(
    rows
      .map((item) => normalizeListing(asJsonRecord(item)))
      .filter((row) => Number(row.id) > 0),
  );
}

/**
 * LEGACY full-catalogue loader (tens of MB). Only used when the idx/ layout
 * is not published; once idx/manifest.json exists it always resolves null so
 * no code path can pull the whole catalogue into the browser.
 */
async function getSnapshotListingCatalog(): Promise<CarListing[] | null> {
  if (!SNAPSHOT_BASE) return null;
  if (await hasSnapshotIndex()) return null;
  return loadLegacySnapshotCatalog();
}

function loadLegacySnapshotCatalog(): Promise<CarListing[] | null> {
  // TTL: the catalog was previously cached forever, so a long session never
  // saw refreshed snapshot data.
  const now = Date.now();
  if (
    snapshotCatalogPromise &&
    (!snapshotCatalogFetchedAt || now - snapshotCatalogFetchedAt >= SNAPSHOT_CATALOG_TTL_MS)
  ) {
    snapshotCatalogPromise = null;
  }
  if (!snapshotCatalogPromise) {
    snapshotCatalogFetchedAt = now;
    snapshotCatalogPromise = readSnapshot<{
      items?: unknown[];
      parts?: string[];
      listing_count?: number;
    }>("listing-catalog.json").then(async (snapshot) => {
      if (!snapshot) return null;

      // Multi-part catalog (Vercel 100MB file limit).
      if (Array.isArray(snapshot.parts) && snapshot.parts.length > 0) {
        const chunks = await Promise.all(
          snapshot.parts.map((part) =>
            readSnapshot<{ items?: unknown[] }>(String(part).replace(/^\/+/, "")),
          ),
        );
        if (chunks.some((chunk) => !chunk || !Array.isArray(chunk.items))) {
          return null;
        }
        const items = chunks.flatMap((chunk) => chunk!.items as unknown[]);
        if (
          typeof snapshot.listing_count === "number" &&
          snapshot.listing_count >= 0 &&
          items.length !== snapshot.listing_count
        ) {
          return null;
        }
        if (items.length === 0) return null;
        // Parts can overlap (a re-split catalog, a row that grew past a page
        // boundary) — dedupe before the overlay so totals stay honest.
        const catalog = dedupeListings(items.map(normalizeListing));
        const overlaid = overlayIncomingListings(catalog, await getIncomingSnapshotListings());
        return overlaid.length > 0 ? overlaid : null;
      }

      if (!Array.isArray(snapshot.items)) return null;
      const finalCatalog = dedupeListings(snapshot.items.map(normalizeListing));
      const finalOverlaid = overlayIncomingListings(finalCatalog, await getIncomingSnapshotListings());
      return finalOverlaid.length > 0 ? finalOverlaid : null;
    });
  }
  return snapshotCatalogPromise;
}

// ── Per-entity snapshot index (idx/) ─────────────────────────────────────────
// scripts/build-snapshot-indexes.mjs splits the catalogue into per-listing
// shards and make/model/district indexes so a page view downloads a few KB
// instead of the whole catalogue (~38 MB br). When idx/ is absent (export not
// yet run with the index step) we fall back to the legacy full catalogue.

interface SnapshotIndexManifest {
  version: number;
  shard_size: number;
  listing_count: number;
}

interface SnapshotScopedIndex {
  total: number;
  items: CarListing[];
  /** Compact rows for every listing in scope (model indexes only). */
  comps?: CarListing[];
  raw: JsonRecord;
}

let snapshotIndexManifestPromise: Promise<SnapshotIndexManifest | null> | null = null;
let snapshotIndexManifestAt = 0;

/** Same compact key as scripts/build-snapshot-indexes.mjs. */
export function snapshotIndexKey(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function makeIndexKey(make: unknown): string {
  return snapshotIndexKey(canonicalizeMake(make) || make);
}

function modelIndexKey(model: unknown): string {
  return snapshotIndexKey(canonicalizeModel(model) || model);
}

function districtIndexKey(district: unknown): string {
  return snapshotIndexKey(normalizeDistrictName(String(district ?? "")) || district);
}

function getSnapshotIndexManifest(): Promise<SnapshotIndexManifest | null> {
  if (!SNAPSHOT_BASE) return Promise.resolve(null);
  const now = Date.now();
  if (snapshotIndexManifestPromise && now - snapshotIndexManifestAt >= SNAPSHOT_CATALOG_TTL_MS) {
    snapshotIndexManifestPromise = null;
  }
  if (!snapshotIndexManifestPromise) {
    snapshotIndexManifestAt = now;
    snapshotIndexManifestPromise = readSnapshot<JsonRecord>("idx/manifest.json").then((raw) => {
      if (!raw || Number(raw.version) !== 1 || !(Number(raw.shard_size) > 0)) return null;
      return {
        version: 1,
        shard_size: Number(raw.shard_size),
        listing_count: Number(raw.listing_count || 0),
      };
    });
  }
  return snapshotIndexManifestPromise;
}

async function readIndexFile<T>(relPath: string): Promise<T | null> {
  const manifest = await getSnapshotIndexManifest();
  if (!manifest) return null;
  return readSnapshot<T>(`idx/${relPath}`);
}

function normalizeIndexRows(rows: unknown): CarListing[] {
  return Array.isArray(rows)
    ? rows.map((row) => normalizeListing(asJsonRecord(row))).filter((row) => Number(row.id) > 0)
    : [];
}

/** True when the idx/ layout is published; callers then never touch the full catalogue. */
async function hasSnapshotIndex(): Promise<boolean> {
  return (await getSnapshotIndexManifest()) !== null;
}

async function getSnapshotListingById(id: string | number): Promise<CarListing | null> {
  const numeric = Number(id);
  if (!Number.isInteger(numeric) || numeric <= 0) return null;
  const manifest = await getSnapshotIndexManifest();
  if (!manifest) return null;
  const incoming = await getIncomingSnapshotListings();
  const fresh = incoming.find((row) => Number(row.id) === numeric);
  if (fresh) return fresh;
  const shard = await readSnapshot<{ items?: unknown[] }>(
    `idx/listings/${Math.floor(numeric / manifest.shard_size)}.json`,
  );
  const row = Array.isArray(shard?.items)
    ? shard!.items.find((item) => Number(asJsonRecord(item).id) === numeric)
    : undefined;
  return row ? normalizeListing(asJsonRecord(row)) : null;
}

function compsToListings(raw: JsonRecord, make: string, model: string): CarListing[] {
  const fields = Array.isArray(raw.comp_fields) ? (raw.comp_fields as string[]) : [];
  const rows = Array.isArray(raw.comps) ? (raw.comps as unknown[][]) : [];
  return rows.map((tuple) => {
    const record: JsonRecord = { make, model };
    fields.forEach((field, index) => {
      const value = tuple[index];
      if (value !== null && value !== undefined) record[field] = value;
    });
    return record as unknown as CarListing;
  });
}

async function getSnapshotModelIndex(make: string, model: string): Promise<SnapshotScopedIndex | null> {
  const mk = makeIndexKey(make);
  const mo = modelIndexKey(model);
  if (!mk || !mo) return null;
  const raw = await readIndexFile<JsonRecord>(`models/${mk}/${mo}.json`);
  if (!raw) return null;
  const displayMake = String(raw.make || make);
  const displayModel = String(raw.model || model);
  return {
    total: Number(raw.total || 0),
    items: normalizeIndexRows(raw.items),
    comps: compsToListings(raw, displayMake, displayModel),
    raw,
  };
}

async function getSnapshotMakeIndex(make: string): Promise<SnapshotScopedIndex | null> {
  const mk = makeIndexKey(make);
  if (!mk) return null;
  const raw = await readIndexFile<JsonRecord>(`makes/${mk}.json`);
  if (!raw) return null;
  return { total: Number(raw.total || 0), items: normalizeIndexRows(raw.items), raw };
}

async function getSnapshotDistrictIndex(district: string): Promise<SnapshotScopedIndex | null> {
  const dk = districtIndexKey(district);
  if (!dk) return null;
  const raw = await readIndexFile<JsonRecord>(`districts/${dk}.json`);
  if (!raw) return null;
  return { total: Number(raw.listing_count || 0), items: normalizeIndexRows(raw.items), raw };
}

async function getSnapshotLatestIndex(): Promise<SnapshotScopedIndex | null> {
  const raw = await readIndexFile<JsonRecord>("latest.json");
  if (!raw) return null;
  const items = overlayIncomingListings(normalizeIndexRows(raw.items), await getIncomingSnapshotListings());
  return { total: Number(raw.total || items.length), items, raw };
}

async function getSnapshotAggregates(): Promise<JsonRecord | null> {
  return readIndexFile<JsonRecord>("aggregates.json");
}

/**
 * Narrowest published index for a filter set: make+model, then make, then
 * district, then the newest-N market index. Returns null when idx/ is absent.
 */
async function getScopedSnapshotIndex(filters: Partial<FilterState>): Promise<SnapshotScopedIndex | null> {
  if (!(await hasSnapshotIndex())) return null;
  const make = String(filters.make || "").trim();
  const model = String(filters.model || "").trim();
  const district = String(filters.district || "").trim();
  if (make && model) {
    const idx = await getSnapshotModelIndex(make, model);
    return idx ?? { total: 0, items: [], comps: [], raw: {} };
  }
  if (make) {
    const idx = await getSnapshotMakeIndex(make);
    return idx ?? { total: 0, items: [], raw: {} };
  }
  if (district) {
    const idx = await getSnapshotDistrictIndex(district);
    if (idx) return idx;
  }
  return getSnapshotLatestIndex();
}

/** Filter + paginate inside a scoped index; scales the total when the index is a capped sample. */
function filterScopedSnapshot(
  index: SnapshotScopedIndex,
  filters: FilterState,
  pageSize = LISTINGS_PAGE_SIZE,
): { listings: CarListing[]; total: number } {
  const result = filterSnapshotListings(index.items, filters, pageSize);
  if (index.items.length > 0 && index.total > index.items.length) {
    // The index holds the newest N rows; estimate the full count from the
    // sample's match rate instead of under-reporting.
    const matchedSample = index.items.filter((listing) => matchesSnapshotFilters(listing, filters)).length;
    const estimated = Math.round((matchedSample / index.items.length) * index.total);
    return { listings: result.listings, total: Math.max(result.total, estimated) };
  }
  return result;
}

async function searchSuggestionsFromIndex(q: string, limit: number): Promise<ListingSearchSuggestion[]> {
  const index = await readIndexFile<{ rows?: unknown[][] }>("search.json");
  const rows = Array.isArray(index?.rows) ? index!.rows : [];
  const tokens = String(q || "").toLowerCase().split(/\s+/).map(snapshotIndexKey).filter(Boolean);
  if (!tokens.length) return [];
  const out: ListingSearchSuggestion[] = [];
  for (const row of rows) {
    const [make, model, , maxYear, medianPrice] = row as [string, string, number, number | null, number | null];
    const hay = `${snapshotIndexKey(make)} ${snapshotIndexKey(model)} ${snapshotIndexKey(`${make}${model}`)}`;
    if (!tokens.every((token) => hay.includes(token))) continue;
    out.push({
      id: 0,
      make: String(make),
      model: String(model),
      year: Number(maxYear) || 0,
      price_lkr: toNumberOrNull(medianPrice),
      source: "snapshot",
    });
    if (out.length >= Math.max(1, limit)) break;
  }
  return out;
}

function deriveSourcesFromCounts(rows: { source: string; count: number }[]): ListingSourceStat[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const source = canonicalSource(row.source);
    if (!source) continue;
    counts.set(source, (counts.get(source) || 0) + Number(row.count || 0));
  }
  return Array.from(counts.entries())
    .map(([source, count]) => ({ source, label: sourceLabel(source), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function normalizeStatsOverview(data: JsonRecord): StatsOverview {
  return {
    total_listings: Number(data?.total_listings ?? data?.priced_listings ?? data?.offers_count) || 0,
    avg_price_lkr: toNumberOrNull(data?.avg_price_lkr ?? data?.average_price_lkr ?? data?.avg_price) ?? 0,
    listings_this_week: Number(data?.listings_this_week ?? data?.new_listings_this_week) || 0,
    price_change_mom: toNumberOrNull(data?.price_change_mom ?? data?.mom_change_pct),
    top_makes: Array.isArray(data?.top_makes) ? data.top_makes : [],
    district_count: Number(data?.district_count ?? data?.districts_covered) || 0,
    good_deals_count: Number(data?.good_deals_count ?? data?.hot_deals_count) || 0,
    source_count: Number(data?.source_count ?? data?.sources_count) || 0,
    last_updated: data?.last_updated || data?.last_scrape_at || data?.updated_at
      ? String(data.last_updated ?? data.last_scrape_at ?? data.updated_at)
      : null,
  };
}

function normalizeLiveMarketData(data: JsonRecord): LiveMarketSnapshot {
  return {
    generated_at: String(data?.generated_at || new Date().toISOString()),
    total_listings: Number(data?.total_listings || 0),
    priced_listings: Number(data?.priced_listings || 0),
    unavailable_price_listings: Number(data?.unavailable_price_listings || 0),
    avg_price_lkr: toNumberOrNull(data?.avg_price_lkr),
    latest_listing_at: data?.latest_listing_at ? String(data.latest_listing_at) : null,
    active_scrape_sources: Array.isArray(data?.active_scrape_sources)
      ? data.active_scrape_sources.map((row: unknown) => String(row)).filter(Boolean)
      : [],
    latest_run: (() => {
      const latestRun = asJsonRecord(data.latest_run);
      if (!data.latest_run) return null;
      return {
          source: String(latestRun.source || "unknown"),
          status: String(latestRun.status || "UNKNOWN"),
          started_at: latestRun.started_at ? String(latestRun.started_at) : null,
          finished_at: latestRun.finished_at ? String(latestRun.finished_at) : null,
          listings_found: Number(latestRun.listings_found || 0),
          listings_new: Number(latestRun.listings_new || 0),
          error_message: latestRun.error_message ? String(latestRun.error_message) : null,
        };
    })(),
    source_status: Array.isArray(data?.source_status)
      ? data.source_status.map((row: JsonRecord) => ({
          source: String(row?.source || "unknown"),
          status: String(row?.status || "UNKNOWN"),
          started_at: row?.started_at ? String(row.started_at) : null,
          finished_at: row?.finished_at ? String(row.finished_at) : null,
          listings_found: Number(row?.listings_found || 0),
          listings_new: Number(row?.listings_new || 0),
          error_message: row?.error_message ? String(row.error_message) : null,
        }))
      : [],
    latest_listings: Array.isArray(data?.latest_listings)
      ? data.latest_listings
          .map((row: unknown) => normalizeListing(asJsonRecord(row)))
          .filter((row) => Number(row.id) > 0)
      : [],
  };
}

function normalizeDistrictPricesPayload(data: JsonRecord): DistrictPrice[] {
  const points = Array.isArray(data.points) ? data.points : [];
  return points.map((point): DistrictPrice | null => {
    const p = asJsonRecord(point);
    const district = String(p.district || "");
    const canonical = normalizeDistrictName(district);
    if (!canonical) return null;
    const coords = districtCoords(canonical);
    const rawLat = toNumberOrNull(p.lat);
    const rawLng = toNumberOrNull(p.lng);
    const lat = rawLat && rawLat !== 0 ? rawLat : (coords?.lat ?? null);
    const lng = rawLng && rawLng !== 0 ? rawLng : (coords?.lng ?? null);
    return {
      district: canonical,
      avg_price: toNumberOrNull(p.avg_price_lkr ?? p.avg_price) ?? 0,
      median_price: toNumberOrNull(p.median_price_lkr ?? p.median_price) ?? undefined,
      listing_count: Number(p.count ?? p.listing_count) || 0,
      lat: lat ?? Number.NaN,
      lng: lng ?? Number.NaN,
      top_make: p?.top_make ? String(p.top_make) : undefined,
      top_model: p?.top_model ? String(p.top_model) : undefined,
      top_model_count: toNumberOrNull(p?.top_model_count) ?? undefined,
    };
  }).filter((p): p is DistrictPrice => Boolean(p) && Boolean(p.district) && Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

function normalizeListingSourceRows(rows: unknown): ListingSourceStat[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      const item = row as Record<string, unknown>;
      const source = canonicalSource(item.source || item.label);
      if (!source) return null;
      return {
        source,
        label: String(item.label || sourceLabel(source)),
        count: Number(item.count || 0),
      };
    })
    .filter((row): row is ListingSourceStat => Boolean(row && row.source));
}

function normalizeDashboardInsights(data: Record<string, unknown>): DashboardInsights {
  const segmentPerformance = Array.isArray(data.segment_performance)
    ? data.segment_performance.map((row) => {
        const item = row as Record<string, unknown>;
        return {
          segment: String(item.segment || "unknown"),
          listing_count: Number(item.listing_count || 0),
          avg_price_lkr: toNumberOrNull(item.avg_price_lkr) ?? 0,
          change_pct_30d: toNumberOrNull(item.change_pct_30d),
        };
      })
    : [];

  const trendingModels = Array.isArray(data.trending_models)
    ? data.trending_models.map((row) => {
        const item = row as Record<string, unknown>;
        return {
          make: String(item.make || ""),
          model: String(item.model || ""),
          listing_count: Number(item.listing_count || 0),
          avg_price_lkr: toNumberOrNull(item.avg_price_lkr) ?? 0,
          movement_pct: toNumberOrNull(item.movement_pct),
          thumbnail_url: item.thumbnail_url ? String(item.thumbnail_url) : null,
        };
      })
    : [];

  const hotDeals = Array.isArray(data.hot_deals)
    ? data.hot_deals.reduce<DashboardInsights["hot_deals"]>((acc, row) => {
        const item = row as Record<string, unknown>;
        const id = Number(item.id || 0);
        const price = toNumberOrNull(item.price_lkr);

        if (!Number.isFinite(id) || id <= 0 || price === null || price <= 0) {
          return acc;
        }
        // Drop unbrandable rows ("Other brand Other model") so a scrape
        // artifact can never be surfaced as a headline deal.
        if (isJunkMake(item.make)) {
          return acc;
        }

        acc.push({
          id,
          make: String(item.make || ""),
          model: String(item.model || ""),
          year: Number(item.year || 0),
          district: item.district ? String(item.district) : null,
          source: String(item.source || "unknown"),
          price_lkr: price,
          deal_score: toNumberOrNull(item.deal_score) ?? 0,
          thumbnail_url: item.thumbnail_url ? String(item.thumbnail_url) : null,
        });
        return acc;
      }, [])
    : [];

  return {
    new_listings_24h: Number(data.new_listings_24h || 0),
    segment_performance: segmentPerformance,
    trending_models: trendingModels,
    hot_deals: hotDeals,
  };
}

function textIncludes(value: unknown, needle: string): boolean {
  return String(value || "").toLowerCase().includes(needle);
}

function isPricedListing(listing: CarListing): boolean {
  const price = toNumberOrNull(listing.price_lkr);
  return price !== null && price >= MIN_REASONABLE_PRICE_LKR;
}

function listingTimestamp(listing: CarListing): number {
  const parsed = Date.parse(String(listing.first_seen_at || listing.scraped_at || listing.last_seen_at || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function matchesSnapshotFilters(listing: CarListing, filters: FilterState): boolean {
  const q = String(filters.q || "").trim().toLowerCase();
  if (q) {
    const haystack = [
      listing.title,
      listing.make,
      listing.model,
      listing.variant,
      listing.district,
      listing.city,
      listing.source,
      listing.year,
    ];
    if (!haystack.some((value) => textIncludes(value, q))) return false;
  }

  const listingSource = canonicalSource(listing.source);
  const filterSource = canonicalSource(filters.source);
  if (filterSource && listingSource !== filterSource) return false;

  if (filters.make) {
    const wantedMake = canonicalizeMake(filters.make);
    if (wantedMake && canonicalizeMake(listing.make) !== wantedMake) return false;
  }
  if (filters.model) {
    const wantedModel = canonicalizeModel(filters.model);
    if (wantedModel && canonicalizeModel(listing.model) !== wantedModel) return false;
  }
  if (!filters.include_archive && listing.is_active === false) return false;
  if (filters.district && String(listing.district || "").toLowerCase() !== String(filters.district).toLowerCase()) return false;
  if (filters.fresh_24h && listingTimestamp(listing) < Date.now() - 24 * 60 * 60 * 1000) return false;
  if (filters.year_min && Number(listing.year || 0) < filters.year_min) return false;
  if (filters.year_max && Number(listing.year || 0) > filters.year_max) return false;
  if (filters.mileage_max && Number(listing.mileage_km || 0) > filters.mileage_max) return false;

  if (filters.condition && normalizeConditionValue(listing.condition) !== filters.condition) return false;
  if (filters.body_type && !matchesBodyTypeFilter(listing, filters.body_type)) return false;
  if (filters.transmission && normalizeTransmissionValue(listing.transmission) !== filters.transmission) return false;
  if (filters.fuel_type && normalizeFuelValue(listing.fuel_type) !== filters.fuel_type) return false;

  const browseCategory = filters.vehicle_category || "cars";
  const listingCategory = normalizeVehicleCategoryValue(
    (listing as CarListing & { vehicle_category?: string }).vehicle_category,
  );
  if (browseCategory === "cars") {
    if (listingCategory && NON_CAR_CATEGORIES.has(listingCategory)) return false;
    if (!listingCategory) {
      const hay = `${listing.title || ""} ${listing.make || ""} ${listing.model || ""}`.toLowerCase();
      if (/(motorbike|motorcycle|scooter|three[\s-]?wheel|tractor|bicycle|lorry|ntorq|bajaj\s+re|tvs\s+king)/i.test(hay)) {
        return false;
      }
    }
  } else if (!matchesBrowseCategory(listingCategory, browseCategory)) {
    return false;
  }

  const price = toNumberOrNull(listing.price_lkr);
  const minReasonablePrice = browseCategory === "cars" ? MIN_REASONABLE_PRICE_LKR : 25_000;
  if (filters.price_availability === "priced" && (price === null || price < minReasonablePrice)) return false;
  if (filters.price_availability === "unavailable" && isPricedListing(listing)) return false;
  if (filters.price_min !== undefined && filters.price_min !== null && (price === null || price < filters.price_min)) return false;
  if (filters.price_max !== undefined && filters.price_max !== null && (price === null || price > filters.price_max)) return false;

  return true;
}

/** Best match: real price (2) + a photo (1). Priceless / photoless rows sink. */
function bestMatchRank(listing: CarListing): number {
  const price = toNumberOrNull(listing.price_lkr);
  const hasPrice = price !== null && price >= 100_000;
  const hasPhoto = Boolean(listing.thumbnail_url || (Array.isArray(listing.images) && listing.images.length));
  return (hasPrice ? 2 : 0) + (hasPhoto ? 1 : 0);
}

function sortSnapshotListings(listings: CarListing[], sort: FilterState["sort"]): CarListing[] {
  return [...listings].sort((a, b) => {
    if (sort === "best_match") {
      return bestMatchRank(b) - bestMatchRank(a)
        || listingTimestamp(b) - listingTimestamp(a)
        || Number(b.id || 0) - Number(a.id || 0);
    }
    if (sort === "deal_score") {
      return (toNumberOrNull(b.deal_score) ?? -Infinity) - (toNumberOrNull(a.deal_score) ?? -Infinity)
        || listingTimestamp(b) - listingTimestamp(a)
        || Number(b.id || 0) - Number(a.id || 0);
    }
    if (sort === "price_asc") {
      return (toNumberOrNull(a.price_lkr) ?? Infinity) - (toNumberOrNull(b.price_lkr) ?? Infinity)
        || listingTimestamp(b) - listingTimestamp(a);
    }
    if (sort === "price_desc") {
      return (toNumberOrNull(b.price_lkr) ?? -Infinity) - (toNumberOrNull(a.price_lkr) ?? -Infinity)
        || listingTimestamp(b) - listingTimestamp(a);
    }
    if (sort === "mileage_asc") {
      return (toNumberOrNull(a.mileage_km) ?? Infinity) - (toNumberOrNull(b.mileage_km) ?? Infinity)
        || listingTimestamp(b) - listingTimestamp(a);
    }
    if (sort === "oldest") {
      return listingTimestamp(a) - listingTimestamp(b)
        || Number(a.id || 0) - Number(b.id || 0);
    }
    return listingTimestamp(b) - listingTimestamp(a) || Number(b.id || 0) - Number(a.id || 0);
  });
}

function filterSnapshotListings(
  catalog: CarListing[],
  filters: FilterState,
  pageSize = LISTINGS_PAGE_SIZE,
): { listings: CarListing[]; total: number } {
  const matched = dedupeListings(catalog.filter((listing) => matchesSnapshotFilters(listing, filters)));
  const sorted = sortSnapshotListings(matched, filters.sort || "newest");
  const page = Math.max(1, Number(filters.page || 1));
  const size = Math.max(1, pageSize);
  const start = (page - 1) * size;
  return {
    listings: sorted.slice(start, start + size),
    total: matched.length,
  };
}

function deriveMakes(catalog: CarListing[]): { make: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const listing of catalog) {
    const make = canonicalizeMake(listing.make);
    if (!make) continue;
    counts.set(make, (counts.get(make) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([make, count]) => ({ make, count }))
    .sort((a, b) => b.count - a.count || a.make.localeCompare(b.make));
}

function deriveModels(catalog: CarListing[], make: string): { model: string; count: number }[] {
  const makeKey = (canonicalizeMake(make) || String(make || "").trim()).toLowerCase();
  const counts = new Map<string, number>();
  for (const listing of catalog) {
    if (makeKey && canonicalizeMake(listing.make)?.toLowerCase() !== makeKey) continue;
    const model = canonicalizeModel(listing.model);
    if (!model) continue;
    counts.set(model, (counts.get(model) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([model, count]) => ({ model, count }))
    .sort((a, b) => b.count - a.count || a.model.localeCompare(b.model));
}

function deriveSources(catalog: CarListing[]): ListingSourceStat[] {
  const counts = new Map<string, number>();
  for (const listing of catalog) {
    const source = canonicalSource(listing.source);
    if (!source) continue;
    counts.set(source, (counts.get(source) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([source, count]) => ({ source, label: sourceLabel(source), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function searchSuggestionsFromCatalog(catalog: CarListing[], q: string, limit: number): ListingSearchSuggestion[] {
  const query = String(q || "").trim().toLowerCase();
  if (!query) return [];
  return sortSnapshotListings(catalog.filter((listing) => matchesSnapshotFilters(listing, {
    q: query,
    sort: "newest",
    page: 1,
  })), "newest")
    .slice(0, Math.max(1, limit))
    .map((listing) => ({
      id: Number(listing.id),
      make: String(listing.make || "").trim(),
      model: String(listing.model || "").trim(),
      year: Number(listing.year) || 0,
      district: listing.district ? String(listing.district) : undefined,
      price_lkr: toNumberOrNull(listing.price_lkr),
      source: canonicalSource(listing.source) || String(listing.source || "unknown").trim().toLowerCase(),
      thumbnail_url: listing.thumbnail_url ? String(listing.thumbnail_url) : undefined,
      url: listing.url ? String(listing.url) : undefined,
    }))
    .filter((row) => row.id > 0 && row.make && row.model && row.year > 0);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function buildSnapshotTrendSeries(
  catalog: CarListing[],
  make: string,
  model: string,
  condition?: string,
  district?: string,
): PriceTrendSeries {
  const makeKey = (canonicalizeMake(make) || String(make || "").trim()).toLowerCase();
  const modelKey = (canonicalizeModel(model) || String(model || "").trim()).toLowerCase();
  const conditionKey = normalizeConditionValue(condition) || normalizeConditionValue(normalizeConditionFilter(condition));
  const districtKey = String(district || "").trim().toLowerCase();

  const rows = catalog.filter((listing) => {
    if (makeKey && (canonicalizeMake(listing.make) || "").toLowerCase() !== makeKey) return false;
    if (modelKey && (canonicalizeModel(listing.model) || "").toLowerCase() !== modelKey) return false;
    if (conditionKey && normalizeConditionValue(listing.condition) !== conditionKey) return false;
    if (districtKey && String(listing.district || "").toLowerCase() !== districtKey) return false;
    return isPricedListing(listing);
  });

  const prices = rows
    .map((listing) => toNumberOrNull(listing.price_lkr))
    .filter((price): price is number => price !== null && price >= MIN_REASONABLE_PRICE_LKR);

  if (prices.length === 0) {
    return {
      points: [],
      coverage_scope: "none",
      coverage_note: "No matching listings in the current public snapshot.",
    };
  }

  const now = new Date();
  const monthKeys: string[] = [];
  for (let back = 11; back >= 0; back--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    monthKeys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const oldestAllowed = monthKeys[0];

  const pricesByMonth = new Map<string, number[]>();
  for (const listing of rows) {
    const price = toNumberOrNull(listing.price_lkr);
    if (price === null || price < MIN_REASONABLE_PRICE_LKR) continue;
    const raw = String(listing.first_seen_at || listing.scraped_at || listing.last_seen_at || "");
    if (!/^\d{4}-\d{2}/.test(raw)) continue;
    const key = raw.slice(0, 7);
    if (key < oldestAllowed) continue;
    const bucket = pricesByMonth.get(key);
    if (bucket) bucket.push(price);
    else pricesByMonth.set(key, [price]);
  }

  // Drop thin months (fewer than 3 priced listings) — a 2-listing "median"
  // is noise, not a trend.
  const points = monthKeys
    .map((month) => {
      const prices = pricesByMonth.get(month);
      if (!prices || prices.length < 3) return null;
      const avg = prices.reduce((sum, price) => sum + price, 0) / prices.length;
      return {
        month,
        median_price: Math.round(median(prices)),
        avg_price: Math.round(avg),
        sample_count: prices.length,
      };
    })
    .filter((point): point is NonNullable<typeof point> => point !== null);

  if (points.length === 0) {
    return {
      points: [],
      coverage_scope: "none",
      coverage_note: "No matching listings in the current public snapshot.",
    };
  }

  if (points.length === 1) {
    return {
      points,
      coverage_scope: "current_snapshot",
      coverage_note:
        "Only one month of matching listings in the public snapshot — pick a broader lane for a trajectory.",
    };
  }

  return {
    points,
    coverage_scope: "exact",
    coverage_note: `Monthly medians from the public Sri Lanka snapshot (${points[0].month} – ${points[points.length - 1].month}).`,
  };
}

// ── Live API circuit breaker ─────────────────────────────────────────────────
// When the backend is down (5xx / timeout / network), public reads fail fast
// for a few minutes so every widget switches to snapshots immediately instead
// of each waiting through timeouts and retries. Remembered across reloads in
// sessionStorage. Authenticated/user paths are never short-circuited.
const API_DOWN_STORAGE_KEY = "motormila.api_down_until";
export const API_DOWN_COOLDOWN_MS = 3 * 60 * 1000;
const PUBLIC_READ_TIMEOUT_MS = 10_000;
const PRIVATE_PATH_RE = /^\/(auth|alerts|pro|dealer|admin|me|billing|profile|watchlist|users|account|my-|feedback|pipeline\/trigger)/;
let apiDownUntil = (() => {
  try {
    return typeof sessionStorage !== "undefined" ? Number(sessionStorage.getItem(API_DOWN_STORAGE_KEY) || 0) : 0;
  } catch {
    return 0;
  }
})();

function isPublicReadPath(path: string): boolean {
  return !PRIVATE_PATH_RE.test(path) && !/\/(seller-profile|mine)(\/|$)/.test(path);
}

/** True while the live API is known to be failing (snapshot mode). */
export function isLiveApiDegraded(now = Date.now()): boolean {
  return apiDownUntil > now;
}

export function markLiveApiDown(now = Date.now()): void {
  apiDownUntil = now + API_DOWN_COOLDOWN_MS;
  try {
    sessionStorage.setItem(API_DOWN_STORAGE_KEY, String(apiDownUntil));
  } catch {
    /* storage unavailable */
  }
}

export function resetLiveApiHealth(): void {
  apiDownUntil = 0;
  try {
    sessionStorage.removeItem(API_DOWN_STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

async function fetchJSON<T>(path: string, params?: QueryParams, headers?: Record<string, string>): Promise<T> {
  if (USE_MOCK) throw new Error("Mock mode is disabled");

  // /alerts/match is a POST endpoint. Issuing it as a GET returned 405 and
  // pinned the alerts page on "Loading alerts". Upgrade the verb here so the
  // client is correct against every deployed API build, including ones that do
  // not yet carry the server-side GET alias.
  if (path === "/alerts/match") {
    return postJSON<T>(path, { ...(params || {}) }, headers);
  }

  // The API accepts the alert token as a query param or the X-Alert-Token
  // header, but prefers the header when a Motormila session is also present.
  if (path === "/alerts" && !headers?.["X-Alert-Token"] && params?.token) {
    return fetchJSON<T>(path, params, { ...headers, "X-Alert-Token": String(params.token) });
  }

  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });
  }

  const publicRead = isPublicReadPath(path);
  if (publicRead && isLiveApiDegraded()) {
    throw new APIError(503, "Live API temporarily unavailable; serving snapshots.");
  }
  // Public reads all have snapshot fallbacks: one short attempt (plus one
  // retry on a plain network blip) instead of 3 x 60 s on a cold/broken Space.
  const timeoutMs = publicRead
    ? PUBLIC_READ_TIMEOUT_MS
    : API_BASE.includes("hf.space") ? HF_COLD_START_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
  const maxAttempts = publicRead ? 2 : API_BASE.includes("hf.space") ? 3 : 2;
  const credentials = resolveFetchCredentials();
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url.toString(), {
        headers: { Accept: "application/json", ...authHeaders(), ...(headers || {}) },
        credentials,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw await parseApiError(response);
      }

      const payload = await response.json();
      if (publicRead && apiDownUntil) resetLiveApiHealth();
      return payload;
    } catch (error) {
      lastError = error;
      const isAbort = error instanceof DOMException && error.name === "AbortError";
      const isServerError = error instanceof APIError && error.status >= 500;
      const isNetworkError = error instanceof TypeError;
      const retryable = isAbort || isServerError || isNetworkError;
      if (publicRead && retryable) {
        // Trip the breaker on the first 5xx/timeout; only a bare network
        // error on the first attempt gets one retry.
        if (!isNetworkError || attempt === maxAttempts - 1) {
          markLiveApiDown();
          throw error;
        }
      }
      if (!retryable || attempt === maxAttempts - 1) {
        throw error;
      }
      const backoffMs = Math.min(1000 * 2 ** attempt, 4000);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}

async function postJSON<T>(path: string, body: Record<string, unknown>, headers?: Record<string, string>): Promise<T> {
  if (USE_MOCK) throw new Error("Mock mode is disabled");

  const url = new URL(`${API_BASE}${path}`, window.location.origin).toString();
  const timeoutMs = API_BASE.includes("hf.space") ? HF_COLD_START_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
  const maxAttempts = API_BASE.includes("hf.space") ? 3 : 2;
  const credentials = resolveFetchCredentials();
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        credentials,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...authHeaders(),
          ...(headers || {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw await parseApiError(response);
      }

      return await response.json();
    } catch (error) {
      lastError = error;
      const isAbort = error instanceof DOMException && error.name === "AbortError";
      const isServerError = error instanceof APIError && error.status >= 500;
      const isNetworkError = error instanceof TypeError;
      const retryable = isAbort || isServerError || isNetworkError;
      if (!retryable || attempt === maxAttempts - 1) {
        throw error;
      }
      const backoffMs = Math.min(1000 * 2 ** attempt, 4000);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}

export const getStats = async (): Promise<StatsOverview> => {
  const snapshot = await readSnapshot<JsonRecord>("stats-summary.json");
  if (snapshot) {
    const stats = normalizeStatsOverview(snapshot);
    if (stats.good_deals_count > 0) return stats;
    const aggregates = await getSnapshotAggregates();
    if (aggregates) return { ...stats, good_deals_count: Number(aggregates.good_deals_count || 0) };
    const catalog = await getSnapshotListingCatalog();
    if (!catalog) return stats;
    const goodDeals = catalog.filter((row) => Number(row.deal_score || 0) >= 8).length;
    return { ...stats, good_deals_count: goodDeals };
  }
  if (SNAPSHOT_ONLY) refuseLiveApiFallback("stats summary");

  const data = await fetchJSON<JsonRecord>("/stats/summary");
  return normalizeStatsOverview(data);
};

export const getLiveMarketSnapshot = async (): Promise<LiveMarketSnapshot> => {
  const snapshot = await readSnapshot<JsonRecord>("live-market.json");
  if (snapshot) return normalizeLiveMarketData(snapshot);
  if (SNAPSHOT_ONLY) refuseLiveApiFallback("live market snapshot");

  const data = await fetchJSON<JsonRecord>("/stats/live");
  return normalizeLiveMarketData(data);
};

export const getLiveMarketStreamUrl = (): string => {
  return new URL(`${API_BASE}/stats/live/stream`, window.location.origin).toString();
};

/**
 * "best_match" is a frontend-first sort: older/live backends validate `sort`
 * against newest|deal_score|price_* and answer 422. When that happens we ask
 * for `newest` instead (best match's own tie-break) and apply the best-match
 * ranking to the page client-side. Remembered for the session so later pages
 * skip the failing request.
 */
let backendRejectsBestMatch = false;

function isClientError(error: unknown): boolean {
  return error instanceof APIError && error.status >= 400 && error.status < 500;
}

async function fetchListingsPage(
  params: QueryParams,
): Promise<{ data: JsonRecord; clientRanked: boolean }> {
  const wantsBestMatch = params.sort === "best_match";
  if (wantsBestMatch && backendRejectsBestMatch) {
    const data = await fetchJSON<JsonRecord>("/listings", { ...params, sort: "newest" });
    return { data, clientRanked: true };
  }
  try {
    const data = await fetchJSON<JsonRecord>("/listings", params);
    return { data, clientRanked: false };
  } catch (error) {
    if (!wantsBestMatch || !isClientError(error)) throw error;
    backendRejectsBestMatch = true;
    const data = await fetchJSON<JsonRecord>("/listings", { ...params, sort: "newest" });
    return { data, clientRanked: true };
  }
}

/** Stable best-match order for one page of newest-first rows. */
export function rankBestMatchPage(listings: CarListing[]): CarListing[] {
  return listings
    .map((listing, index) => ({ listing, index }))
    .sort((a, b) => bestMatchRank(b.listing) - bestMatchRank(a.listing) || a.index - b.index)
    .map((row) => row.listing);
}

/** Test hook: forget the remembered 4xx. */
export function __resetBestMatchSupportForTests() {
  backendRejectsBestMatch = false;
}

export const getListings = async (filters: FilterState): Promise<{ listings: CarListing[]; total: number }> => {
  const effectiveFilters: FilterState = {
    ...filters,
    vehicle_category: filters.vehicle_category || "cars",
  };
  // Live API is the first choice (see offlineValuation.ts). Snapshot is the
  // fallback for offline / SNAPSHOT_ONLY — not the primary catalog.
  if (!SNAPSHOT_ONLY) {
    try {
      const { data, clientRanked } = await fetchListingsPage({
        ...effectiveFilters,
        size: LISTINGS_PAGE_SIZE,
      });
      const items = Array.isArray(data.items) ? data.items : [];
      let listings = dedupeListings(items.map((item) => normalizeListing(asJsonRecord(item))));
      if (clientRanked) listings = rankBestMatchPage(listings);
      // The backend may not support fresh_24h; apply it client-side to ensure
      // the "New in 24h" filter actually filters. We use the same matcher as
      // the snapshot path for consistency.
      if (effectiveFilters.fresh_24h) {
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        listings = listings.filter((listing) => listingTimestamp(listing) >= cutoff);
        // If no listings have valid timestamps, fall back to showing all rather
        // than an empty result (data quality issue, not a filter issue).
        if (listings.length === 0 && items.length > 0) {
          listings = dedupeListings(items.map((item) => normalizeListing(asJsonRecord(item))));
        }
      }
      return {
        listings,
        total: effectiveFilters.fresh_24h ? listings.length : (Number(data.total) || 0),
      };
    } catch (error) {
      // Fall through to snapshot when live is unreachable.
      if (import.meta.env.DEV) console.warn("live listings failed, using snapshot", error);
    }
  }

  const scoped = await getScopedSnapshotIndex(effectiveFilters);
  if (scoped) return filterScopedSnapshot(scoped, effectiveFilters);
  const catalog = await getSnapshotListingCatalog();
  if (catalog?.length) return filterSnapshotListings(catalog, effectiveFilters);
  if (SNAPSHOT_ONLY) {
    const incoming = await getIncomingSnapshotListings();
    if (incoming.length) return filterSnapshotListings(incoming, effectiveFilters);
    return { listings: [], total: 0 };
  }

  // Live failed and no snapshot — surface the error rather than a silent empty list.
  throw new APIError(503, "Listings are temporarily unavailable.");
};

/**
 * Price sample for the filter histogram: up to `size` newest priced listings
 * matching every filter except price. Returns whole-rupee prices plus the
 * total match count. Empty on failure — the histogram simply hides.
 */
export const getListingPriceSample = async (
  filters: FilterState,
  size = 100,
): Promise<{ prices: number[]; total: number }> => {
  const sampleFilters: FilterState = {
    ...filters,
    price_min: undefined,
    price_max: undefined,
    price_availability: undefined,
    sort: "newest",
    page: 1,
    vehicle_category: filters.vehicle_category || "cars",
  };
  const toPrices = (rows: CarListing[]) =>
    rows
      .map((row) => toNumberOrNull(row.price_lkr))
      .filter((price): price is number => price !== null && price >= 100_000)
      .map((price) => Math.round(price));
  try {
    if (!SNAPSHOT_ONLY) {
      const data = await fetchJSON<JsonRecord>("/listings", { ...sampleFilters, size: Math.min(100, Math.max(1, size)) });
      const items = Array.isArray(data.items) ? data.items : [];
      return {
        prices: toPrices(items.map((item) => normalizeListing(asJsonRecord(item)))),
        total: Number(data.total) || 0,
      };
    }
  } catch {
    // fall through to the snapshot sample
  }
  try {
    const scoped = await getScopedSnapshotIndex(sampleFilters);
    if (scoped) {
      const result = filterScopedSnapshot(scoped, sampleFilters, size);
      return { prices: toPrices(result.listings), total: result.total };
    }
  } catch {
    // no snapshot either
  }
  return { prices: [], total: 0 };
};

export const sendFeedback = async (payload: FeedbackInput): Promise<FeedbackReceipt> => {
  const data = await postJSON<JsonRecord>("/feedback", {
    category: payload.category,
    route: payload.route,
    message: payload.message,
    email: payload.email || undefined,
  });

  return {
    id: Number(data?.id || 0),
    category: String(data?.category || payload.category),
    route: data?.route ? String(data.route) : null,
    status: String(data?.status || "new"),
    created_at: String(data?.created_at || new Date().toISOString()),
  };
};

const listingDetailCache = new Map<string, { expires: number; listing: CarListing }>();
const listingDetailInflight = new Map<string, Promise<CarListing>>();

export const getListing = async (id: string | number) => {
  const key = String(id);
  const cached = listingDetailCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.listing;
  const inflight = listingDetailInflight.get(key);
  if (inflight) return inflight;

  const pending = loadListing(id)
    .then((listing) => {
      listingDetailCache.set(key, { expires: Date.now() + QUERY_STALE.listings, listing });
      listingDetailInflight.delete(key);
      return listing;
    })
    .catch((error: unknown) => {
      listingDetailInflight.delete(key);
      throw error;
    });
  listingDetailInflight.set(key, pending);
  return pending;
};

async function loadListing(id: string | number) {
  if (await hasSnapshotIndex()) {
    const fromShard = await getSnapshotListingById(id);
    if (fromShard) return fromShard;
    if (SNAPSHOT_ONLY) refuseLiveApiFallback(`listing ${id}`);
    const data = await fetchJSON<JsonRecord>(`/listings/${id}`);
    return normalizeListing(data);
  }
  const catalog = await getSnapshotListingCatalog();
  if (catalog) {
    const match = catalog.find((listing) => String(listing.id) === String(id));
    if (match) return match;
  }
  if (SNAPSHOT_ONLY) {
    const incoming = await getIncomingSnapshotListings();
    const match = incoming.find((listing) => String(listing.id) === String(id));
    if (match) return match;
    refuseLiveApiFallback(`listing ${id}`);
  }

  const data = await fetchJSON<JsonRecord>(`/listings/${id}`);
  return normalizeListing(data);
}

function normalizePriceDropItems(data: JsonRecord, limit = 12): PriceDropItem[] {
  if (!Array.isArray(data?.items)) return [];
  return data.items
    .map((row: unknown) => {
      const record = asJsonRecord(row);
      const previous = toNumberOrNull(record?.previous_price_lkr) ?? 0;
      const next = toNumberOrNull(record?.new_price_lkr) ?? 0;
      return {
        listing: normalizeListing(asJsonRecord(record?.listing)),
        previous_price_lkr: previous,
        new_price_lkr: next,
        // Recompute from the two prices so the badge always matches them.
        drop_pct: computedDropPct(previous, next) || (toNumberOrNull(record?.drop_pct) ?? 0),
        dropped_at: String(record?.dropped_at || ""),
        confirmations: toNumberOrNull(record?.confirmations ?? record?.points_at_new_price),
      };
    })
    // Sanity guard: unit mismatches (lakhs vs millions), lease takeovers and
    // unconfirmed >50% "cuts" are parse bugs, not market moves.
    // confirmations are kept on the item so a later re-check (BestPicks) can
    // still honour a confirmed large drop.
    .filter((item) => item.listing.id && item.drop_pct > 0 && isPlausiblePriceDrop(item))
    .slice(0, limit);
}

export const getPriceDrops = async (days = 7, limit = 12): Promise<PriceDropItem[]> => {
  const snapshot = await readSnapshot<JsonRecord>("price-drops.json");
  if (snapshot) return normalizePriceDropItems(snapshot, limit);
  if (SNAPSHOT_ONLY) return [];

  // Over-fetch: the sanity guard drops implausible rows, keep the board full.
  const data = await fetchJSON<JsonRecord>(`/listings/price-drops?days=${days}&limit=${Math.min(60, limit * 3)}`);
  return normalizePriceDropItems(data, limit);
};

export const getListingHistoryReport = async (id: string | number): Promise<HistoryReport> => {
  return fetchJSON<HistoryReport>(`/listings/${id}/history-report`);
};

export type { FmvMethodBreakdown, ListingFmvDetail } from "@/types/fmv";


export const getListingFmv = async (id: string | number): Promise<ListingFmvDetail> => {
  try {
    const data = await fetchJSON<JsonRecord>(`/listings/${id}/fmv`);
    return {
      listing_id: toNumberOrNull(data?.listing_id),
      asking_lkr: toNumberOrNull(data?.asking_lkr),
      fmv_lkr: toNumberOrNull(data?.fmv_lkr),
      deal_score: toNumberOrNull(data?.deal_score),
      delta_pct: toNumberOrNull(data?.delta_pct),
      band: (data?.band as ListingFmvDetail["band"]) ?? null,
      label: data?.label ? String(data.label) : null,
      method: String(data?.method ?? "insufficient_data"),
      sample_count: Number(data?.sample_count ?? 0),
      sample_size: Number(data?.sample_size ?? data?.sample_count ?? 0),
      confidence: (data?.confidence as ListingFmvDetail["confidence"]) ?? "none",
      comps_median_lkr: toNumberOrNull(data?.comps_median_lkr),
      updated_at: String(data?.updated_at ?? ""),
    };
  } catch {
    const { predictFmvOffline } = await import("@/lib/offlineValuation");
    if (await hasSnapshotIndex()) {
      const target = await getSnapshotListingById(id);
      const modelIdx = target ? await getSnapshotModelIndex(String(target.make || ""), String(target.model || "")) : null;
      if (target && modelIdx) {
        // Comps share make/model; align their display names with the target.
        const comps = (modelIdx.comps || []).map((row) => ({ ...row, make: target.make, model: target.model }) as CarListing);
        return predictFmvOffline(comps, target);
      }
      throw new Error("FMV unavailable (server unreachable and listing not in snapshot).");
    }
    const catalog = await getSnapshotListingCatalog();
    const listing = catalog?.find((row) => String(row.id) === String(id));
    if (catalog && listing) return predictFmvOffline(catalog, listing);
    throw new Error("FMV unavailable (server unreachable and no snapshot).");
  }
};

export const getPriceIndex = async (): Promise<PriceIndex> => {
  const snapshot = await readSnapshot<JsonRecord>("price-index.json");
  if (snapshot && Array.isArray(snapshot.points) && snapshot.points.length > 0) {
    return snapshot as unknown as PriceIndex;
  }
  if (SNAPSHOT_ONLY) refuseLiveApiFallback("price index");
  return fetchJSON<PriceIndex>(`/stats/price-index`);
};

export const getListingPriceHistory = async (id: string | number): Promise<PriceHistoryInfo> => {
  const sparkles = await readSnapshot<{ sparklines?: Record<string, Array<[number, string]>> }>(
    "price-sparklines.json",
  );
  const raw = sparkles?.sparklines?.[String(id)];
  if (Array.isArray(raw) && raw.length > 0) {
    const { summarizeSparkline } = await import("@/lib/offlineValuation");
    return summarizeSparkline(
      id,
      raw
        .filter((p) => Array.isArray(p))
        .map(([price_lkr, scraped_at]) => ({
          price_lkr: Number(price_lkr),
          scraped_at: String(scraped_at || ""),
        })),
    );
  }
  if (SNAPSHOT_ONLY) refuseLiveApiFallback(`price history ${id}`);
  const data = await fetchJSON<JsonRecord>(`/listings/${id}/price-history`);
  const points = Array.isArray(data?.points)
    ? data.points
        .map((row: unknown) => {
          const record = asJsonRecord(row);
          return {
            price_lkr: toNumberOrNull(record?.price_lkr) ?? 0,
            scraped_at: String(record?.scraped_at || ""),
          };
        })
        .filter((point) => point.price_lkr > 0)
    : [];

  let cutCount = 0;
  let raiseCount = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].price_lkr < points[i - 1].price_lkr) cutCount++;
    else if (points[i].price_lkr > points[i - 1].price_lkr) raiseCount++;
  }

  return {
    listing_id: Number(data?.listing_id || id),
    points,
    first_price_lkr: toNumberOrNull(data?.first_price_lkr),
    current_price_lkr: toNumberOrNull(data?.current_price_lkr),
    change_pct: toNumberOrNull(data?.change_pct),
    cut_count: toNumberOrNull(data?.cut_count) ?? cutCount,
    raise_count: toNumberOrNull(data?.raise_count) ?? raiseCount,
    highest_price_lkr: toNumberOrNull(data?.highest_price_lkr),
    lowest_price_lkr: toNumberOrNull(data?.lowest_price_lkr),
    last_change_at: data?.last_change_at ? String(data.last_change_at) : null,
    tracked_points: toNumberOrNull(data?.tracked_points) ?? points.length,
  };
};

export const getSellerTrustProfile = async (id: string | number): Promise<SellerTrustProfile> => {
  const data = await fetchJSON<JsonRecord>(`/listings/${id}/seller-profile`);
  const sellerTypeRaw = String(data?.seller_type || "").toLowerCase();
  const sellerType: SellerTrustProfile["seller_type"] =
    sellerTypeRaw === "dealer" || sellerTypeRaw === "private" ? sellerTypeRaw : "unknown";

  return {
    source: String(data?.source || ""),
    source_url: String(data?.source_url || ""),
    seller_name: data?.seller_name ? String(data.seller_name) : undefined,
    seller_type: sellerType,
    member_since: data?.member_since ? String(data.member_since) : undefined,
    listing_count: toNumberOrNull(data?.listing_count) ?? undefined,
    review_count: toNumberOrNull(data?.review_count) ?? undefined,
    rating: toNumberOrNull(data?.rating) ?? undefined,
    phone_numbers: Array.isArray(data?.phone_numbers)
      ? data.phone_numbers.map((row: unknown) => String(row)).filter(Boolean)
      : [],
    whatsapp_numbers: Array.isArray(data?.whatsapp_numbers)
      ? data.whatsapp_numbers.map((row: unknown) => String(row)).filter(Boolean)
      : [],
    verified_badges: Array.isArray(data?.verified_badges)
      ? data.verified_badges.map((row: unknown) => String(row)).filter(Boolean)
      : [],
    fetched_at: data?.fetched_at ? String(data.fetched_at) : undefined,
  };
};

export const getSimilarListings = async (id: string | number) => {
  if (await hasSnapshotIndex()) {
    const base = await getSnapshotListingById(id);
    if (base) {
      const modelIdx = await getSnapshotModelIndex(String(base.make || ""), String(base.model || ""));
      return sortSnapshotListings(
        (modelIdx?.items || []).filter((listing) => listing.id !== base.id),
        "deal_score",
      ).slice(0, 8);
    }
    if (SNAPSHOT_ONLY) return [];
    const live = await fetchJSON<JsonRecord[]>(`/listings/${id}/similar`);
    return (live || []).map(normalizeListing);
  }
  const catalog = await getSnapshotListingCatalog();
  if (catalog) {
    const base = catalog.find((listing) => String(listing.id) === String(id));
    if (base) {
      return sortSnapshotListings(
        catalog.filter((listing) => (
          listing.id !== base.id
          && String(listing.make || "").toLowerCase() === String(base.make || "").toLowerCase()
          && String(listing.model || "").toLowerCase() === String(base.model || "").toLowerCase()
        )),
        "deal_score",
      ).slice(0, 8);
    }
  }
  if (SNAPSHOT_ONLY) return [];

  const data = await fetchJSON<JsonRecord[]>(`/listings/${id}/similar`);
  return (data || []).map(normalizeListing);
};

export const getDistrictPrices = async (): Promise<DistrictPrice[]> => {
  const snapshot = await readSnapshot<JsonRecord>("district-prices.json");
  if (snapshot) return normalizeDistrictPricesPayload(snapshot);
  if (SNAPSHOT_ONLY) return [];

  const data = await fetchJSON<JsonRecord>("/stats/district-prices");
  return normalizeDistrictPricesPayload(data);
};

function normalizeDistrictVelocityPayload(raw: Record<string, unknown>): DistrictVelocityData {
  const points: DistrictVelocityPoint[] = Array.isArray(raw?.points)
    ? (raw.points as Record<string, unknown>[]).map((p) => {
        const district = normalizeDistrictName(String(p?.district ?? ""));
        if (!district) return null;
        const coords = districtCoords(district);
        const rawLat = Number(p?.lat ?? 0);
        const rawLng = Number(p?.lng ?? 0);
        return {
          district,
          lat: rawLat && rawLat !== 0 ? rawLat : (coords?.lat ?? Number.NaN),
          lng: rawLng && rawLng !== 0 ? rawLng : (coords?.lng ?? Number.NaN),
          listing_count: Math.round(Number(p?.listing_count ?? 0)),
          new_7d_count: Math.round(Number(p?.new_7d_count ?? 0)),
          velocity_score: Number(p?.velocity_score ?? 0),
        };
      }).filter((p) => Boolean(p) && Boolean(p.district) && Number.isFinite(p.lat) && Number.isFinite(p.lng)) as DistrictVelocityPoint[]
    : [];
  return {
    points,
    generated_at: String(raw?.generated_at ?? new Date().toISOString()),
  };
}

async function deriveDistrictVelocityFromCatalog(): Promise<DistrictVelocityData | null> {
  const aggregates = await getSnapshotAggregates();
  if (aggregates && Array.isArray(aggregates.districts)) {
    const merged = new Map<string, { listing_count: number; new_7d_count: number }>();
    for (const row of aggregates.districts as JsonRecord[]) {
      const district = normalizeDistrictName(String(row.district || ""));
      if (!district || !districtCoords(district)) continue;
      const entry = merged.get(district) || { listing_count: 0, new_7d_count: 0 };
      entry.listing_count += Number(row.listing_count || 0);
      entry.new_7d_count += Number(row.new_7d_count || 0);
      merged.set(district, entry);
    }
    if (merged.size === 0) return null;
    return {
      points: Array.from(merged.entries()).map(([district, counts]) => {
        const coords = districtCoords(district)!;
        return {
          district,
          lat: coords.lat,
          lng: coords.lng,
          listing_count: counts.listing_count,
          new_7d_count: counts.new_7d_count,
          velocity_score: counts.new_7d_count / Math.max(counts.listing_count, 1),
        };
      }),
      generated_at: String(aggregates.generated_at || new Date().toISOString()),
    };
  }
  if (await hasSnapshotIndex()) return null;
  const catalog = await getSnapshotListingCatalog();
  if (!catalog || catalog.length === 0) return null;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const byDistrict = new Map<string, { listing_count: number; new_7d_count: number }>();
  for (const listing of catalog) {
    const district = normalizeDistrictName(listing.district || "");
    if (!district || !districtCoords(district)) continue;
    const entry = byDistrict.get(district) || { listing_count: 0, new_7d_count: 0 };
    entry.listing_count += 1;
    if (listingTimestamp(listing) >= weekAgo) entry.new_7d_count += 1;
    byDistrict.set(district, entry);
  }
  const points: DistrictVelocityPoint[] = Array.from(byDistrict.entries()).map(([district, counts]) => {
    const coords = districtCoords(district)!;
    return {
      district,
      lat: coords.lat,
      lng: coords.lng,
      listing_count: counts.listing_count,
      new_7d_count: counts.new_7d_count,
      velocity_score: counts.new_7d_count / Math.max(counts.listing_count, 1),
    };
  });
  return { points, generated_at: new Date().toISOString() };
}

const OFFLINE_FUEL_ORDER = ["petrol", "hybrid", "electric", "diesel", "other"] as const;
const OFFLINE_FUEL_MAP: Record<string, string> = {
  petrol: "petrol",
  gasoline: "petrol",
  diesel: "diesel",
  hybrid: "hybrid",
  plugin_hybrid: "hybrid",
  phev: "hybrid",
  electric: "electric",
  ev: "electric",
};

function offlineFuelCategory(raw: unknown): string {
  const key = String(raw || "").trim().toLowerCase().replace(/ /g, "_").replace(/-/g, "_");
  return OFFLINE_FUEL_MAP[key] || "other";
}

async function deriveFuelMixFromCatalog(): Promise<FuelMixData | null> {
  const aggregates = await getSnapshotAggregates();
  if (aggregates && aggregates.fuel_mix && typeof aggregates.fuel_mix === "object") {
    const mix = aggregates.fuel_mix as Record<string, number>;
    const totals: Record<string, number> = { petrol: 0, hybrid: 0, electric: 0, diesel: 0, other: 0 };
    for (const key of OFFLINE_FUEL_ORDER) totals[key] = Number(mix[key] || 0);
    const total = Object.values(totals).reduce((a, b) => a + b, 0);
    if (total === 0) return null;
    return {
      total,
      buckets: OFFLINE_FUEL_ORDER.map((fuel_type) => ({
        fuel_type,
        count: totals[fuel_type],
        pct: Math.round((totals[fuel_type] / total) * 1000) / 10,
      })),
      generated_at: String(aggregates.generated_at || new Date().toISOString()),
    };
  }
  if (await hasSnapshotIndex()) return null;
  const catalog = await getSnapshotListingCatalog();
  if (!catalog || catalog.length === 0) return null;
  const totals: Record<string, number> = { petrol: 0, hybrid: 0, electric: 0, diesel: 0, other: 0 };
  for (const listing of catalog) totals[offlineFuelCategory(listing.fuel_type)] += 1;
  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  return {
    total,
    buckets: OFFLINE_FUEL_ORDER.map((fuel_type) => ({
      fuel_type,
      count: totals[fuel_type],
      pct: total > 0 ? Math.round((totals[fuel_type] / total) * 1000) / 10 : 0,
    })),
    generated_at: new Date().toISOString(),
  };
}


async function deriveEvInsightFromCatalog(): Promise<EvInsightData | null> {
  let catalog: CarListing[] | null;
  let catalogSize: number;
  if (await hasSnapshotIndex()) {
    // ev.json holds every electric row; the Aqua index supplies the hybrid
    // benchmark. Together they replace the full-catalogue scan.
    const [ev, aqua] = await Promise.all([
      readIndexFile<JsonRecord>("ev.json"),
      getSnapshotModelIndex("Toyota", "Aqua"),
    ]);
    if (!ev) return null;
    catalog = [...normalizeIndexRows(ev.items), ...((aqua?.comps || []) as CarListing[])];
    catalogSize = Number(ev.listing_count || 0);
  } else {
    catalog = await getSnapshotListingCatalog();
    catalogSize = catalog?.length || 0;
  }
  if (!catalog || catalog.length === 0) return null;
  const priced = (row: CarListing): number | null => {
    const p = toNumberOrNull(row.price_lkr);
    return p !== null && p >= MIN_REASONABLE_PRICE_LKR ? p : null;
  };
  const evRows = catalog.filter((row) => offlineFuelCategory(row.fuel_type) === "electric");
  // Price and model stats compare against a hybrid car (the Aqua), so they use
  // electric cars only: e-scooters and electric three-wheelers made up two thirds
  // of EV rows and dragged the "median EV price" to Rs 0.65 Mn.
  const evCarRows = evRows.filter((row) => !NON_CAR_CATEGORIES.has(String(row.vehicle_category || "").toLowerCase()));
  const evPrices = evCarRows.map(priced).filter((p): p is number => p !== null);
  const byModel = new Map<string, { make: string; model: string; prices: number[]; count: number }>();
  for (const row of evCarRows) {
    const make = String(row.make || "").trim();
    const model = String(row.model || "").trim();
    if (!make || !model || model.toLowerCase() === "other") continue;
    const key = `${make}|||${model}`;
    const entry = byModel.get(key) || { make, model, prices: [], count: 0 };
    entry.count += 1;
    const p = priced(row);
    if (p !== null) entry.prices.push(p);
    byModel.set(key, entry);
  }
  const topEvModels = Array.from(byModel.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((entry) => ({
      make: entry.make,
      model: entry.model,
      listing_count: entry.count,
      median_price_lkr: entry.prices.length > 0 ? median(entry.prices) : null,
    }));
  const aquaPrices = catalog
    .filter(
      (row) =>
        String(row.make || "").toLowerCase() === "toyota" &&
        String(row.model || "").toLowerCase() === "aqua",
    )
    .map(priced)
    .filter((p): p is number => p !== null);
  const aquaCount = catalog.filter(
    (row) =>
      String(row.make || "").toLowerCase() === "toyota" &&
      String(row.model || "").toLowerCase() === "aqua",
  ).length;
  return {
    ev_count: evRows.length,
    ev_pct: catalogSize > 0 ? Math.round((evRows.length / catalogSize) * 1000) / 10 : 0,
    median_ev_price_lkr: evPrices.length > 0 ? median(evPrices) : null,
    top_ev_models: topEvModels,
    hybrid_benchmark: {
      make: "Toyota",
      model: "Aqua",
      median_price_lkr: aquaPrices.length > 0 ? median(aquaPrices) : null,
      listing_count: aquaCount,
    },
    generated_at: new Date().toISOString(),
  };
}

export const getDistrictVelocity = async (): Promise<DistrictVelocityData> => {
  const snapshot = await readSnapshot<Record<string, unknown>>("district-velocity.json");
  if (snapshot && Array.isArray(snapshot.points) && snapshot.points.length > 0) {
    return normalizeDistrictVelocityPayload(snapshot);
  }
  const derived = await deriveDistrictVelocityFromCatalog();
  if (derived) return derived;
  if (SNAPSHOT_ONLY) {
    return { points: [], generated_at: new Date().toISOString() };
  }
  const raw = await fetchJSON<Record<string, unknown>>("/stats/district-velocity");
  return normalizeDistrictVelocityPayload(raw);
};

export const getMakes = async () => {
  const sanitize = (rows: { make: string; count: number }[]) => {
    // Snapshot rows are pre-cleaned at export, but older snapshots may still
    // carry junk makes ("2012 Gp 1 2012"). Canonicalize defensively.
    const merged = new Map<string, { make: string; count: number }>();
    for (const row of rows) {
      const make = canonicalizeMake(row?.make);
      if (!make) continue;
      const key = make.toLowerCase();
      const bucket = merged.get(key);
      if (bucket) bucket.count += Number(row?.count || 0);
      else merged.set(key, { make, count: Number(row?.count || 0) });
    }
    return [...merged.values()].sort((a, b) => b.count - a.count);
  };

  const snapshot = await readSnapshot<unknown>("listing-makes.json");
  if (Array.isArray(snapshot)) {
    const cleaned = sanitize(snapshot as { make: string; count: number }[]);
    if (cleaned.length) return cleaned;
  }

  const aggregates = await getSnapshotAggregates();
  if (aggregates && Array.isArray(aggregates.makes)) {
    const cleaned = sanitize(aggregates.makes as { make: string; count: number }[]);
    if (cleaned.length) return cleaned;
  }
  const catalog = (await hasSnapshotIndex()) ? null : await getSnapshotListingCatalog();
  if (catalog) return sanitize(deriveMakes(catalog));
  if (SNAPSHOT_ONLY) return [];

  return sanitize(await fetchJSON<{ make: string; count: number }[]>("/listings/makes"));
};

export type ModelIndexEntry = { make: string; model: string; count: number };

/**
 * Full make → model index for the command palette, derived from the same
 * `listing-models.json` snapshot that backs `getModels(make)`. Canonicalized
 * and count-merged so junk rows never surface in search results.
 */
export const getModelIndex = async (): Promise<ModelIndexEntry[]> => {
  const snapshot = await readSnapshot<Record<string, { model: string; count: number }[]>>(
    "listing-models.json",
  );
  if (!snapshot) return [];
  const merged = new Map<string, ModelIndexEntry>();
  for (const [rawMake, rows] of Object.entries(snapshot)) {
    const make = canonicalizeMake(rawMake);
    if (!make || !Array.isArray(rows)) continue;
    for (const row of rows) {
      const model = canonicalizeModel(row?.model);
      if (!model) continue;
      const key = `${make.toLowerCase()}|${model.toLowerCase()}`;
      const count = Number(row?.count || 0);
      const bucket = merged.get(key);
      if (bucket) bucket.count += count;
      else merged.set(key, { make, model, count });
    }
  }
  return [...merged.values()].sort((a, b) => b.count - a.count);
};

export const getListingSearchSuggestions = async (
  q: string,
  limit = 8,
): Promise<ListingSearchSuggestion[]> => {
  const query = String(q || "").trim();
  if (!query) return [];

  if (await hasSnapshotIndex()) {
    const fromIndex = await searchSuggestionsFromIndex(query, limit);
    if (fromIndex.length || SNAPSHOT_ONLY) return fromIndex;
  } else {
    const catalog = await getSnapshotListingCatalog();
    if (catalog) return searchSuggestionsFromCatalog(catalog, query, limit);
  }
  if (SNAPSHOT_ONLY) return [];

  const data = await fetchJSON<JsonRecord[]>("/listings/search-suggestions", { q: query, limit });
  if (!Array.isArray(data)) return [];

  return data
    .map((row) => {
      const source = canonicalSource(row?.source) || String(row?.source || "unknown").trim().toLowerCase();
      return {
        id: Number(row?.id),
        make: String(row?.make || "").trim(),
        model: String(row?.model || "").trim(),
        year: Number(row?.year) || 0,
        district: row?.district ? String(row.district) : undefined,
        price_lkr: toNumberOrNull(row?.price_lkr),
        source,
        thumbnail_url: row?.thumbnail_url ? String(row.thumbnail_url) : undefined,
        url: row?.url ? String(row.url) : undefined,
      };
    })
    .filter((row) => row.id > 0 && row.make && row.model && row.year > 0);
};

export const getListingSources = async (): Promise<ListingSourceStat[]> => {
  const snapshot = await readSnapshot<unknown>("listing-sources.json");
  const snapshotRows = normalizeListingSourceRows(snapshot);
  if (snapshotRows.length > 0) return snapshotRows;

  const aggregates = await getSnapshotAggregates();
  if (aggregates && Array.isArray(aggregates.sources) && aggregates.sources.length) {
    return deriveSourcesFromCounts(aggregates.sources as { source: string; count: number }[]);
  }
  const catalog = (await hasSnapshotIndex()) ? null : await getSnapshotListingCatalog();
  if (catalog) return deriveSources(catalog);
  if (SNAPSHOT_ONLY) return [];

  try {
    const rows = await fetchJSON<Array<Record<string, unknown>>>("/listings/sources");
    if (!Array.isArray(rows)) return [];
    const normalized = normalizeListingSourceRows(rows);

    if (normalized.length > 0) {
      return normalized;
    }
  } catch {
    // Fall through to client-side source derivation for older backend deployments.
  }

  const data = await fetchJSON<JsonRecord>("/listings", { page: 1, size: 200, sort: "newest" });
  const counts = new Map<string, number>();
  for (const item of Array.isArray(data?.items) ? data.items : []) {
    const source = canonicalSource(item?.source);
    if (!source) continue;
    counts.set(source, (counts.get(source) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([source, count]) => ({ source, label: sourceLabel(source), count }))
    .sort((a, b) => b.count - a.count);
};

/** Collect model rows for a make slug from a make-keyed snapshot.
 * Route params arrive as slugs ("land-rover"); snapshot keys are display names
 * ("Land Rover"). Compare canonical forms so multi-word makes match.
 * Multiple keys can canonicalize to the same make (e.g. the polluted
 * "2017 Toyota Allion 260 G 2017" alongside the real "Toyota") — rows from ALL
 * matching keys are merged so a junk key never shadows the real one. */
export const collectMakeModelRows = (
  snapshot: Record<string, { model: string; count: number }[]> | null | undefined,
  make: string,
): { model: string; count: number }[] => {
  if (!snapshot) return [];
  const wanted = (canonicalizeMake(make) || String(make || "").trim()).toLowerCase();
  const rows: { model: string; count: number }[] = [];
  for (const key of Object.keys(snapshot)) {
    if ((canonicalizeMake(key) || key).toLowerCase() !== wanted) continue;
    const bucket = snapshot[key];
    if (Array.isArray(bucket)) rows.push(...bucket);
  }
  return rows;
};

export const getModels = async (make: string) => {
  const canonicalOwnMake = canonicalizeMake(make) || make;
  const modelKey = (model: string) => model.toLowerCase().replace(/[^a-z0-9]+/g, "");
  // Cross-make dominance map: normalized model name -> { make, count } of the
  // make with the most listings for that name. Built from the full snapshot so
  // misattributed rows ("Sunny" with 2 listings under Toyota vs 5000 under
  // Nissan) can be dropped by ratio instead of a hardcoded blocklist.
  const buildDominantMap = (
    snap: Record<string, { model: string; count: number }[]>,
  ): Map<string, { make: string; count: number }> => {
    const dominant = new Map<string, { make: string; count: number }>();
    for (const [makeKey, rows] of Object.entries(snap)) {
      if (!Array.isArray(rows)) continue;
      const rowMake = canonicalizeMake(makeKey) || makeKey;
      for (const row of rows) {
        const model = canonicalizeModel(row?.model);
        if (!model) continue;
        const count = Number(row?.count || 0);
        const key = modelKey(model);
        const existing = dominant.get(key);
        if (!existing || count > existing.count) dominant.set(key, { make: rowMake, count });
      }
    }
    return dominant;
  };
  const sanitize = (
    rows: { model: string; count: number }[],
    dominant?: Map<string, { make: string; count: number }>,
  ) => {
    // Canonicalize defensively: older snapshots carry phone numbers,
    // misspellings and trim-word leaks as model rows. Merge counts by the
    // canonical name so "Wira"/"wira" don't split a model. Rows naming a
    // foreign marque ("Toyota Aqua" under Land Rover) are misattributed
    // feed rows, not real models.
    const merged = new Map<string, { model: string; count: number }>();
    const ownKey = canonicalOwnMake.toLowerCase();
    for (const row of rows) {
      const model = canonicalizeModel(row?.model);
      if (!model) continue;
      if (modelContainsForeignMake(row?.model, canonicalOwnMake)) continue;
      const key = modelKey(model);
      const rowCount = Number(row?.count || 0);
      // Drop rows dominated 10:1 by another make's listings for the same
      // model name ("Hino"/"Sunny"/"Swift" leaking under Toyota). The
      // dominant make needs real volume so close rebadges aren't nuked.
      const dom = dominant?.get(key);
      if (
        dom &&
        dom.make.toLowerCase() !== ownKey &&
        dom.count >= 50 &&
        rowCount > 0 &&
        dom.count >= 10 * rowCount
      ) {
        continue;
      }
      const bucket = merged.get(key);
      if (bucket) bucket.count += rowCount;
      else merged.set(key, { model, count: rowCount });
    }
    return [...merged.values()].sort((a, b) => b.count - a.count);
  };

  const snapshot = await readSnapshot<Record<string, { model: string; count: number }[]>>("listing-models.json");
  const dominant = snapshot ? buildDominantMap(snapshot) : undefined;
  const rows = collectMakeModelRows(snapshot, make);
  if (rows.length) {
    const cleaned = sanitize(rows, dominant);
    if (cleaned.length) return cleaned;
  }

  const makeIdx = await getSnapshotMakeIndex(make);
  if (makeIdx && Array.isArray(makeIdx.raw.models)) {
    const cleaned = sanitize(makeIdx.raw.models as { model: string; count: number }[]);
    if (cleaned.length) return cleaned;
  }
  const catalog = (await hasSnapshotIndex()) ? null : await getSnapshotListingCatalog();
  if (catalog) return sanitize(deriveModels(catalog, make));
  if (SNAPSHOT_ONLY) return [];

  return sanitize(await fetchJSON<{ model: string; count: number }[]>("/listings/models", { make }));
};

export const estimatePrice = async (params: EstimateParams): Promise<PriceEstimate> => {
  const normalizedCondition = normalizeConditionFilter(
    params?.condition === undefined || params?.condition === null ? undefined : String(params.condition),
  );
  const payload = {
    ...params,
    condition: normalizedCondition,
    mileage: params.mileage ?? params.mileage_km,
  };

  try {
    const data = await fetchJSON<JsonRecord>("/listings/estimate", payload);
    const comparableCount = Number(data?.comparable_listings || 0);
    return {
      median: toNumberOrNull(data?.estimated_price_lkr) ?? 0,
      low: toNumberOrNull(data?.price_range_low) ?? 0,
      high: toNumberOrNull(data?.price_range_high) ?? 0,
      comparable_count: comparableCount,
      confidence: comparableCount > 10 ? "high" : (comparableCount > 3 ? "medium" : "low"),
      currency: "LKR",
      methodology: "exact make-model-year estimate",
      mileage_adjusted: Boolean(params?.mileage ?? params?.mileage_km),
    };
  } catch (error) {
    // Legacy /estimate is strict. Fall back to calibrated custom-estimate for better coverage.
    if (!(error instanceof APIError) || ![404, 422].includes(error.status)) {
      throw error;
    }

    const fallback = await postJSON<JsonRecord>("/listings/custom-estimate", {
      make: params?.make,
      model: params?.model,
      year: params?.year,
      mileage_km: params?.mileage_km ?? params?.mileage,
      condition: normalizedCondition,
      transmission: params?.transmission,
      fuel_type: params?.fuel_type,
      body_type: params?.body_type,
      district: params?.district,
      asking_price_lkr: params?.asking_price_lkr,
    });

    const comparableCount = Number(fallback?.comparable_count || 0);
    const confidence = String(fallback?.confidence || "").toLowerCase();
    const normalizedConfidence: PriceEstimate["confidence"] =
      confidence === "high" || confidence === "medium" || confidence === "low"
        ? confidence
        : (comparableCount > 10 ? "high" : (comparableCount > 3 ? "medium" : "low"));

    return {
      median: toNumberOrNull(fallback?.estimated_median_lkr) ?? 0,
      low: toNumberOrNull(fallback?.estimated_low_lkr) ?? 0,
      high: toNumberOrNull(fallback?.estimated_high_lkr) ?? 0,
      comparable_count: comparableCount,
      confidence: normalizedConfidence,
      currency: "LKR",
      methodology: String(fallback?.methodology || "fallback custom-estimate strategy"),
      mileage_adjusted: Boolean(params?.mileage ?? params?.mileage_km),
    };
  }
};

export const estimateCustomVehicle = async (
  params: CustomVehicleEstimateInput,
): Promise<CustomVehicleEstimateResult> => {
  const data = await postJSON<JsonRecord>("/listings/custom-estimate", { ...params });
  return {
    vehicle_label: String(data?.vehicle_label || `${params.make} ${params.model}`),
    estimated_low_lkr: toNumberOrNull(data?.estimated_low_lkr) ?? 0,
    estimated_median_lkr: toNumberOrNull(data?.estimated_median_lkr) ?? 0,
    estimated_high_lkr: toNumberOrNull(data?.estimated_high_lkr) ?? 0,
    comparable_count: Number(data?.comparable_count) || 0,
    confidence: (data?.confidence as CustomVehicleEstimateResult["confidence"]) || "low",
    verdict: String(data?.verdict || ""),
    verdict_label: String(data?.verdict_label || ""),
    delta_pct: toNumberOrNull(data?.delta_pct),
    methodology: String(data?.methodology || ""),
    comparables: Array.isArray(data?.comparables)
      ? data.comparables.map((row: JsonRecord) => ({
          id: Number(row?.id),
          title: String(row?.title || "Listing"),
          price_lkr: toNumberOrNull(row?.price_lkr),
          district: row?.district ? String(row.district) : null,
          deal_score: toNumberOrNull(row?.deal_score),
          detail_url: row?.detail_url ? String(row.detail_url) : null,
          external_url: row?.external_url ? String(row.external_url) : null,
        }))
      : [],
  };
};

export const getListingThumbnailProxyUrl = (listingId: number | string): string => {
  return `${API_BASE}/listings/${listingId}/thumbnail-proxy`;
};

export const getPriceTrendSeries = async (
  make: string,
  model: string,
  condition?: string,
  district?: string
): Promise<PriceTrendSeries> => {
  if (await hasSnapshotIndex()) {
    const modelIdx = make && model ? await getSnapshotModelIndex(make, model) : null;
    if (modelIdx) return buildSnapshotTrendSeries(modelIdx.comps || [], make, model, condition, district);
  }
  const catalog = (await hasSnapshotIndex()) ? null : await getSnapshotListingCatalog();
  if (catalog) return buildSnapshotTrendSeries(catalog, make, model, condition, district);
  if (SNAPSHOT_ONLY) {
    return {
      points: [],
      coverage_scope: "none",
      coverage_note: "Snapshot-only mode: live trend API disabled.",
    };
  }

  const normalizedCondition = normalizeConditionFilter(condition);
  const normalizedDistrict = String(district || "").trim() || undefined;
  const data = await fetchJSON<JsonRecord>("/stats/trends", {
    make,
    model,
    ...(normalizedCondition ? { condition: normalizedCondition } : {}),
    ...(normalizedDistrict ? { district: normalizedDistrict } : {}),
  });
  const trendPoints = Array.isArray(data.points) ? data.points : [];
  const points = trendPoints.map((point) => {
    const p = asJsonRecord(point);
    return {
    month: `${p.year}-${String(p.month).padStart(2, "0")}`,
    median_price: toNumberOrNull(p.median_price_lkr ?? p.avg_price_lkr) ?? 0,
    avg_price: toNumberOrNull(p.avg_price_lkr) ?? 0,
    sample_count: Number(p.listing_count) || 0,
  };
  }).sort((a: PriceTrendPoint, b: PriceTrendPoint) => a.month.localeCompare(b.month));

  const rawScope = String(data?.coverage_scope || "exact");
  const allowedScopes = new Set<PriceTrendSeries["coverage_scope"]>([
    "exact",
    "condition_fallback",
    "district_fallback",
    "national_fallback",
    "partial",
    "current_snapshot",
    "current_snapshot_fallback",
    "none",
  ]);

  return {
    points,
    coverage_scope: allowedScopes.has(rawScope as PriceTrendSeries["coverage_scope"])
      ? (rawScope as PriceTrendSeries["coverage_scope"])
      : "exact",
    coverage_note: data?.coverage_note ? String(data.coverage_note) : null,
  };
};

export const getPriceTrends = async (
  make: string,
  model: string,
  condition?: string,
  district?: string
): Promise<PriceTrendPoint[]> => {
  const series = await getPriceTrendSeries(make, model, condition, district);
  return series.points;
};

export const getPipelineStatus = async (): Promise<PipelineStatusResponse> => {
  const snapshot = await readSnapshot<PipelineStatusResponse>("pipeline-status.json");
  if (snapshot) return snapshot;
  if (SNAPSHOT_ONLY) refuseLiveApiFallback("pipeline status");
  try {
    return await fetchJSON<PipelineStatusResponse>("/pipeline/status");
  } catch {
    return {
      overall_status: "ok",
      jobs: [],
      generated_at: new Date().toISOString(),
    };
  }
};

export const getPipelineRuns = async (limit = 20): Promise<PipelineRunsResponse> => {
  const data = await fetchJSON<Record<string, unknown>>("/pipeline/runs", { limit });
  const runs: PipelineRunRecord[] = Array.isArray(data.runs)
    ? data.runs.map((row) => {
        const item = row as Record<string, unknown>;
        return {
          id: Number(item.id || 0),
          source: String(item.source || "unknown"),
          status: String(item.status || "UNKNOWN"),
          started_at: item.started_at ? String(item.started_at) : null,
          finished_at: item.finished_at ? String(item.finished_at) : null,
          listings_found: Number(item.listings_found || 0),
          listings_new: Number(item.listings_new || 0),
          error_message: item.error_message ? String(item.error_message) : null,
        };
      })
    : [];

  return {
    count: Number(data.count || runs.length),
    runs,
  };
};

export const triggerPipelineJob = async (job: PipelineTriggerJob, adminKey?: string): Promise<PipelineTriggerResponse> => {
  const data = await postJSON<Record<string, unknown>>(
    "/pipeline/trigger",
    { job },
    adminKey ? { "X-Admin-Key": adminKey } : undefined,
  );

  return {
    accepted: Boolean(data.accepted),
    job: (String(data.job || job) as PipelineTriggerJob),
    pid: Number(data.pid || 0),
    command: String(data.command || ""),
    started_at: String(data.started_at || new Date().toISOString()),
  };
};

async function deriveDashboardInsightsFromCatalog(): Promise<DashboardInsights | null> {
  const aggregates = await getSnapshotAggregates();
  if (aggregates) {
    const hot = normalizeIndexRows(aggregates.hot_deals);
    const top = Array.isArray(aggregates.top_models) ? (aggregates.top_models as JsonRecord[]) : [];
    return {
      new_listings_24h: Number(aggregates.new_listings_24h || 0),
      segment_performance: [],
      trending_models: top.slice(0, 8).map((row) => ({
        make: String(row.make || ""),
        model: String(row.model || ""),
        listing_count: Number(row.listing_count || 0),
        avg_price_lkr: Number(row.listing_count) ? Number(row.price_sum || 0) / Number(row.listing_count) : 0,
        movement_pct: null as number | null,
        thumbnail_url: null as string | null,
      })),
      hot_deals: hot.map((row) => ({
        id: Number(row.id),
        make: String(row.make || ""),
        model: String(row.model || ""),
        year: Number(row.year || 0),
        district: row.district ? String(row.district) : null,
        source: String(row.source || "unknown"),
        price_lkr: Number(row.price_lkr || 0),
        deal_score: Number(row.deal_score || 0),
        thumbnail_url: row.thumbnail_url ? String(row.thumbnail_url) : null,
      })),
    };
  }
  if (await hasSnapshotIndex()) return null;
  const catalog = await getSnapshotListingCatalog();
  if (!catalog || catalog.length === 0) return null;

  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const newListings24h = catalog.filter((row) => listingTimestamp(row) >= dayAgo).length;

  const hotDeals = [...catalog]
    .filter((row) => Number(row.deal_score || 0) >= 8 && isPricedListing(row))
    .sort((a, b) => Number(b.deal_score || 0) - Number(a.deal_score || 0))
    .slice(0, 12)
    .map((row) => ({
      id: Number(row.id),
      make: String(row.make || ""),
      model: String(row.model || ""),
      year: Number(row.year || 0),
      district: row.district ? String(row.district) : null,
      source: String(row.source || "unknown"),
      price_lkr: Number(row.price_lkr || 0),
      deal_score: Number(row.deal_score || 0),
      thumbnail_url: row.thumbnail_url ? String(row.thumbnail_url) : null,
    }));

  const modelCounts = new Map<string, { make: string; model: string; listing_count: number; priceSum: number }>();
  for (const row of catalog) {
    const make = String(row.make || "").trim();
    const model = String(row.model || "").trim();
    if (!make || !model) continue;
    const key = `${make}::${model}`;
    const entry = modelCounts.get(key) || { make, model, listing_count: 0, priceSum: 0 };
    entry.listing_count += 1;
    const price = toNumberOrNull(row.price_lkr);
    if (price !== null) entry.priceSum += price;
    modelCounts.set(key, entry);
  }
  const trendingModels = Array.from(modelCounts.values())
    .sort((a, b) => b.listing_count - a.listing_count)
    .slice(0, 8)
    .map((row) => ({
      make: row.make,
      model: row.model,
      listing_count: row.listing_count,
      avg_price_lkr: row.listing_count ? row.priceSum / row.listing_count : 0,
      movement_pct: null as number | null,
      thumbnail_url: null as string | null,
    }));

  return {
    new_listings_24h: newListings24h,
    segment_performance: [],
    trending_models: trendingModels,
    hot_deals: hotDeals,
  };
}

export const getDashboardInsights = async (): Promise<DashboardInsights> => {
  const snapshot = await readSnapshot<Record<string, unknown>>("dashboard-insights.json");
  if (snapshot) {
    const normalized = normalizeDashboardInsights(snapshot);
    if (normalized.hot_deals.length > 0 || normalized.trending_models.length > 0) {
      return normalized;
    }
    const derived = await deriveDashboardInsightsFromCatalog();
    if (derived) return derived;
    return normalized;
  }
  if (SNAPSHOT_ONLY) {
    const derived = await deriveDashboardInsightsFromCatalog();
    if (derived) return derived;
    refuseLiveApiFallback("dashboard insights");
  }

  const data = await fetchJSON<Record<string, unknown>>("/stats/insights");
  return normalizeDashboardInsights(data);
};

export const getProMarketSnapshot = async (): Promise<ProMarketSnapshot> => {
  return fetchJSON<ProMarketSnapshot>("/pro/market-snapshot", undefined, authHeaders());
};

export const getProVehicleLanes = async (
  filters: ProVehicleLaneFilters = {},
): Promise<ProVehicleLane[]> => {
  return fetchJSON<ProVehicleLane[]>("/pro/vehicle-lanes", { ...filters }, authHeaders());
};

export const getProDistricts = async (): Promise<ProDistrictProfile[]> => {
  return fetchJSON<ProDistrictProfile[]>("/pro/districts", undefined, authHeaders());
};

export const getProVehicleLaneDetail = async (
  params: Pick<ProVehicleLaneFilters, "make" | "model" | "district" | "condition">,
): Promise<ProDetailPayload> => {
  return fetchJSON<ProDetailPayload>("/pro/vehicle-lane-detail", params, authHeaders());
};

export const getProDistrictDetail = async (district: string): Promise<ProDetailPayload> => {
  return fetchJSON<ProDetailPayload>("/pro/district-detail", { district }, authHeaders());
};

export const getProArbitrageGaps = async (
  make: string,
  model: string,
  limit = 10,
): Promise<ProArbitrageGap[]> => {
  return fetchJSON<ProArbitrageGap[]>("/pro/arbitrage-gaps", { make, model, limit }, authHeaders());
};

export const getListingsForExport = async (
  filters: FilterState,
  maxRows = 100,
): Promise<{ listings: CarListing[]; total: number }> => {
  const size = Math.max(1, Math.min(100, Math.floor(maxRows)));
  const scoped = await getScopedSnapshotIndex(filters);
  if (scoped) return filterScopedSnapshot(scoped, { ...filters, page: 1 }, size);
  const catalog = await getSnapshotListingCatalog();
  if (catalog?.length) return filterSnapshotListings(catalog, { ...filters, page: 1 }, size);
  if (SNAPSHOT_ONLY) {
    const incoming = await getIncomingSnapshotListings();
    if (incoming.length) return filterSnapshotListings(incoming, { ...filters, page: 1 }, size);
    return { listings: [], total: 0 };
  }

  const { data, clientRanked } = await fetchListingsPage({
    ...filters,
    page: 1,
    size,
  });

  const items = Array.isArray(data.items) ? data.items : [];
  const rows = items.map((item) => normalizeListing(asJsonRecord(item)));
  return {
    listings: clientRanked ? rankBestMatchPage(rows) : rows,
    total: Number(data.total || 0),
  };
};

export const getDistrictQuickInsight = async (district: string): Promise<DistrictQuickInsight> => {
  const districtIdx = await getSnapshotDistrictIndex(district);
  if (districtIdx && districtIdx.total > 0) {
    const raw = districtIdx.raw;
    return {
      district: String(raw.district || district),
      listing_count: districtIdx.total,
      avg_price_lkr: toNumberOrNull(raw.avg_price_lkr),
      median_price_lkr: toNumberOrNull(raw.median_price_lkr),
      change_pct_30d: null,
      top_models: Array.isArray(raw.top_models)
        ? (raw.top_models as JsonRecord[]).map((row) => ({
            make: String(row.make || ""),
            model: String(row.model || ""),
            listing_count: Number(row.listing_count || 0),
            avg_price_lkr: toNumberOrNull(row.avg_price_lkr) ?? 0,
          }))
        : [],
    };
  }
  const catalog = (await hasSnapshotIndex()) ? null : await getSnapshotListingCatalog();
  if (catalog) {
    const districtKey = String(district || "").trim().toLowerCase();
    const rows = catalog.filter((listing) => String(listing.district || "").toLowerCase() === districtKey);
    if (rows.length > 0) {
      const priced = rows.map((listing) => toNumberOrNull(listing.price_lkr)).filter((price): price is number => price !== null);
      const sortedPrices = [...priced].sort((a, b) => a - b);
      const modelCounts = new Map<string, { make: string; model: string; count: number; total: number }>();
      for (const listing of rows) {
        const price = toNumberOrNull(listing.price_lkr);
        const make = String(listing.make || "").trim();
        const model = String(listing.model || "").trim();
        if (!make || !model || price === null) continue;
        const key = `${make}\u0000${model}`;
        const existing = modelCounts.get(key) || { make, model, count: 0, total: 0 };
        existing.count += 1;
        existing.total += price;
        modelCounts.set(key, existing);
      }

      return {
        district: normalizeDistrictName(district) || district,
        listing_count: rows.length,
        avg_price_lkr: priced.length ? priced.reduce((sum, price) => sum + price, 0) / priced.length : null,
        median_price_lkr: sortedPrices.length ? sortedPrices[Math.floor(sortedPrices.length / 2)] : null,
        change_pct_30d: null,
        top_models: Array.from(modelCounts.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, 5)
          .map((row) => ({
            make: row.make,
            model: row.model,
            listing_count: row.count,
            avg_price_lkr: row.total / row.count,
          })),
      };
    }
  }

  if (SNAPSHOT_ONLY) {
    return {
      district,
      listing_count: 0,
      avg_price_lkr: null,
      median_price_lkr: null,
      change_pct_30d: null,
      top_models: [],
    };
  }

  const data = await fetchJSON<Record<string, unknown>>("/stats/district-insight", { district });

  const topModels = Array.isArray(data.top_models)
    ? data.top_models.map((row) => {
        const item = row as Record<string, unknown>;
        return {
          make: String(item.make || ""),
          model: String(item.model || ""),
          listing_count: Number(item.listing_count || 0),
          avg_price_lkr: toNumberOrNull(item.avg_price_lkr) ?? 0,
        };
      })
    : [];

  return {
    district: normalizeDistrictName(String(data.district || district)) || String(data.district || district),
    listing_count: Number(data.listing_count || 0),
    avg_price_lkr: toNumberOrNull(data.avg_price_lkr),
    median_price_lkr: toNumberOrNull(data.median_price_lkr),
    change_pct_30d: toNumberOrNull(data.change_pct_30d),
    top_models: topModels,
  };
};

function normalizeMarketSignal(row: JsonRecord): MarketSignal {
  return {
    id: Number(row.id || 0),
    source: String(row.source || "unknown"),
    signal_type: String(row.signal_type || "unknown"),
    period_year: toNumberOrNull(row.period_year),
    period_month: toNumberOrNull(row.period_month),
    metric: String(row.metric || ""),
    category: row.category ? String(row.category) : null,
    value_numeric: toNumberOrNull(row.value_numeric),
    unit: row.unit ? String(row.unit) : null,
    source_url: String(row.source_url || ""),
    observed_at: String(row.observed_at || ""),
  };
}

export const getMarketSignals = async (limit = 6): Promise<MarketSignal[]> => {
  const data = await fetchJSON<JsonRecord[]>("/market/signals", { limit });
  return (data || []).map(normalizeMarketSignal);
};

export const getMarketSignal = async (id: number): Promise<MarketSignal> => {
  try {
    const data = await fetchJSON<JsonRecord>(`/market/signals/${id}`);
    const signal = normalizeMarketSignal(data);
    if (signal.id === id) return signal;
  } catch {
    // Fall through — older backends / cold starts may lack GET /signals/{id}.
  }

  const rows = await getMarketSignals(500);
  const found = rows.find((signal) => signal.id === id);
  if (found) return found;

  throw new APIError(404, "Market signal not found");
};

export const getMakeModelInsight = async (make: string, model: string): Promise<MakeModelInsight> => {
  let catalog: CarListing[] | null = null;
  if (await hasSnapshotIndex()) {
    // Every row of the model as compact comps: exact totals, medians, districts.
    const modelIdx = await getSnapshotModelIndex(make, model);
    if (modelIdx) {
      catalog = modelIdx.comps || [];
      make = String(modelIdx.raw.make || make);
      model = String(modelIdx.raw.model || model);
    }
  } else {
    catalog = await getSnapshotListingCatalog();
  }
  if (catalog) {
    const makeKey = make.trim().toLowerCase();
    const modelKey = model.trim().toLowerCase();
    const rows = catalog.filter(
      (l) =>
        String(l.make || "").toLowerCase() === makeKey &&
        String(l.model || "").toLowerCase() === modelKey,
    );
    const prices = rows
      .map((l) => toNumberOrNull(l.price_lkr))
      .filter((p): p is number => p !== null && p >= MIN_REASONABLE_PRICE_LKR);
    const avg = prices.length ? prices.reduce((s, p) => s + p, 0) / prices.length : null;
    const sortedPrices = [...prices].sort((a, b) => a - b);
    const mid = Math.floor(sortedPrices.length / 2);
    const medianVal = sortedPrices.length
      ? sortedPrices.length % 2 === 0
        ? (sortedPrices[mid - 1] + sortedPrices[mid]) / 2
        : sortedPrices[mid]
      : null;

    const districtMap = new Map<string, { count: number; total: number; priced: number }>();
    for (const l of rows) {
      const d = cleanDistrict(l.district);
      if (!d) continue;
      const entry = districtMap.get(d) ?? { count: 0, total: 0, priced: 0 };
      entry.count += 1;
      const price = toNumberOrNull(l.price_lkr);
      if (price !== null && price >= MIN_REASONABLE_PRICE_LKR) {
        entry.total += price;
        entry.priced += 1;
      }
      districtMap.set(d, entry);
    }
    const top_districts = Array.from(districtMap.entries())
      .map(([district, { count, total, priced }]) => ({
        district,
        count,
        avg_price_lkr: priced > 0 ? total / priced : null,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const sample = rows[0];
    return {
      make: sample ? String(sample.make || make).trim() : make.trim(),
      model: sample ? String(sample.model || model).trim() : model.trim(),
      total: rows.length,
      avg_price_lkr: avg,
      median_price_lkr: medianVal,
      top_districts,
    };
  }

  if (SNAPSHOT_ONLY) {
    return {
      make: make.trim(),
      model: model.trim(),
      total: 0,
      avg_price_lkr: null,
      median_price_lkr: null,
      top_districts: [],
    };
  }

  const data = await fetchJSON<JsonRecord>("/stats/make-model-insight", { make, model });
  return {
    make: String(data.make || make),
    model: String(data.model || model),
    total: Number(data.total || 0),
    avg_price_lkr: toNumberOrNull(data.avg_price_lkr),
    median_price_lkr: toNumberOrNull(data.median_price_lkr),
    top_districts: Array.isArray(data.top_districts)
      ? (data.top_districts as JsonRecord[]).map((row) => ({
          district: cleanDistrict(row.district) ?? "",
          count: Number(row.count || 0),
          avg_price_lkr: toNumberOrNull(row.avg_price_lkr),
        })).filter((row) => row.district)
      : [],
  };
};

export const getModelPriceHistory = async (
  make: string,
  model: string,
  opts?: { from_year?: number; to_year?: number },
): Promise<ModelPriceHistory> => {
  const data = await fetchJSON<JsonRecord>("/stats/model-price-history", {
    make,
    model,
    from_year: opts?.from_year ?? 2000,
    to_year: opts?.to_year ?? 2026,
  });

  const mapPoint = (row: JsonRecord) => ({
    period: String(row.period || ""),
    period_year: Number(row.period_year || 0),
    period_month: Number(row.period_month || 0),
    median_price_lkr: toNumberOrNull(row.median_price_lkr),
    listing_count: Number(row.listing_count || 0),
    origin: String(row.origin || ""),
  });

  const calendar = (data.calendar_series as JsonRecord | undefined) || {};
  const counts = (data.counts as JsonRecord | undefined) || {};
  const interpretation = (data.interpretation as JsonRecord | undefined) || {};

  return {
    make: String(data.make || make),
    model: String(data.model || model),
    from_year: Number(data.from_year || opts?.from_year || 2000),
    to_year: Number(data.to_year || opts?.to_year || 2026),
    calendar_series: {
      live_aggregates: Array.isArray(calendar.live_aggregates)
        ? (calendar.live_aggregates as JsonRecord[]).map(mapPoint)
        : [],
      archive_observations: Array.isArray(calendar.archive_observations)
        ? (calendar.archive_observations as JsonRecord[]).map(mapPoint)
        : [],
    },
    cross_section_by_yom: Array.isArray(data.cross_section_by_yom)
      ? (data.cross_section_by_yom as JsonRecord[]).map((row) => ({
          yom: Number(row.yom || 0),
          listing_count: Number(row.listing_count || 0),
          avg_price_lkr: toNumberOrNull(row.avg_price_lkr),
          median_price_lkr: toNumberOrNull(row.median_price_lkr),
          note: row.note ? String(row.note) : undefined,
        }))
      : [],
    counts: {
      aggregate_points: Number(counts.aggregate_points || 0),
      archive_points: Number(counts.archive_points || 0),
      archive_listings: Number(counts.archive_listings || 0),
      yom_buckets: Number(counts.yom_buckets || 0),
    },
    interpretation: {
      calendar_series: String(interpretation.calendar_series || ""),
      cross_section_by_yom: String(interpretation.cross_section_by_yom || ""),
    },
  };
};

export const getMakeInsight = async (make: string): Promise<MakeInsight> => {
  // Snapshot-first: the exported make-insights.json carries the same payload
  // as the backend endpoint, so MakeHub stats/popular-models render without
  // depending on the live API.
  const snapshot = await readSnapshot<Record<string, JsonRecord>>("make-insights.json");
  if (snapshot) {
    const wanted = (canonicalizeMake(make) || String(make || "").trim()).toLowerCase();
    for (const key of Object.keys(snapshot)) {
      if ((canonicalizeMake(key) || key).toLowerCase() !== wanted) continue;
      const data = snapshot[key];
      const mapModelRow = (row: JsonRecord) => ({
        model: String(row.model || ""),
        count: Number(row.count || 0),
        avg_price_lkr: toNumberOrNull(row.avg_price_lkr),
      });
      return {
        make: String(data.make || make),
        total: Number(data.total || 0),
        avg_price_lkr: toNumberOrNull(data.avg_price_lkr),
        median_price_lkr: toNumberOrNull(data.median_price_lkr),
        top_models: Array.isArray(data.top_models) ? (data.top_models as JsonRecord[]).map(mapModelRow) : [],
        all_models: Array.isArray(data.all_models) ? (data.all_models as JsonRecord[]).map(mapModelRow) : undefined,
        top_districts: Array.isArray(data.top_districts)
          ? (data.top_districts as JsonRecord[]).map((row) => ({
              district: cleanDistrict(row.district) ?? "",
              count: Number(row.count || 0),
              avg_price_lkr: toNumberOrNull(row.avg_price_lkr),
            })).filter((row) => row.district)
          : [],
      };
    }
  }

  const data = await fetchJSON<JsonRecord>("/stats/make-insight", { make });
  const mapModelRow = (row: JsonRecord) => ({
    model: String(row.model || ""),
    count: Number(row.count || 0),
    avg_price_lkr: toNumberOrNull(row.avg_price_lkr),
  });
  return {
    make: String(data.make || make),
    total: Number(data.total || 0),
    avg_price_lkr: toNumberOrNull(data.avg_price_lkr),
    median_price_lkr: toNumberOrNull(data.median_price_lkr),
    top_models: Array.isArray(data.top_models)
      ? (data.top_models as JsonRecord[]).map(mapModelRow)
      : [],
    all_models: Array.isArray(data.all_models)
      ? (data.all_models as JsonRecord[]).map(mapModelRow)
      : undefined,
    top_districts: Array.isArray(data.top_districts)
      ? (data.top_districts as JsonRecord[]).map((row) => ({
          district: cleanDistrict(row.district) ?? "",
          count: Number(row.count || 0),
          avg_price_lkr: toNumberOrNull(row.avg_price_lkr),
        })).filter((row) => row.district)
      : [],
  };
};

export const formatPrice = (price: number | null): string => {
  return formatPriceLkrMillions(price);
};

// ---------------------------------------------------------------------------
// Market Alerts — server-side (anonymous token pattern)
// ---------------------------------------------------------------------------

const ALERT_TOKEN_KEY = "motormila.alert_token.v1";

export function getOrCreateAlertToken(): string {
  try {
    if (typeof window === "undefined") return "";
    const stored = window.localStorage.getItem(ALERT_TOKEN_KEY);
    if (stored && stored.length >= 8 && stored.length <= 36) return stored;
    const fresh = crypto.randomUUID();
    window.localStorage.setItem(ALERT_TOKEN_KEY, fresh);
    return fresh;
  } catch {
    return "";
  }
}

export interface AlertCreateInput {
  make?: string;
  model?: string;
  max_price?: number;
  district?: string;
  notify_phone?: string;
  notify_email?: string;
  notify_telegram_chat_id?: string;
  notify_channels?: string;
  delivery_mode?: "instant" | "digest";
  quiet_hours_enabled?: boolean;
}

export interface ServerMarketAlert {
  id: number;
  user_token: string;
  make: string | null;
  model: string | null;
  max_price: number | null;
  district: string | null;
  notify_phone?: string | null;
  notify_email?: string | null;
  notify_telegram_chat_id?: string | null;
  notify_channels?: string | null;
  delivery_mode?: string | null;
  quiet_hours_enabled?: boolean | null;
  active: boolean;
  created_at: string;
}

export interface AlertMatchListing {
  id: number;
  title: string | null;
  make: string;
  model: string;
  year: number | null;
  price_lkr: number | null;
  district: string | null;
  deal_score: number | null;
  thumbnail_url: string | null;
}

export interface AlertMatchResult {
  alert_id: number;
  make: string | null;
  model: string | null;
  district: string | null;
  max_price: number | null;
  matching_count: number;
  listings: AlertMatchListing[];
}

export interface AlertMatchResponse {
  results: AlertMatchResult[];
  checked_at: string;
}

function alertTokenHeader(token: string): Record<string, string> {
  return token ? { "X-Alert-Token": token } : {};
}

export const getAlerts = async (token: string): Promise<ServerMarketAlert[]> => {
  if (!token) return [];
  return fetchJSON<ServerMarketAlert[]>("/alerts", { token });
};

export const createAlert = async (token: string, data: AlertCreateInput): Promise<ServerMarketAlert> => {
  return postJSON<ServerMarketAlert>("/alerts", { ...data }, alertTokenHeader(token));
};

export const deleteAlert = async (token: string, id: number): Promise<void> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const url = new URL(`${API_BASE}/alerts/${id}`, window.location.origin).toString();
  const response = await fetch(url, {
    method: "DELETE",
    headers: { Accept: "application/json", ...authHeaders(), ...alertTokenHeader(token) },
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
  if (!response.ok && response.status !== 204) {
    throw await parseApiError(response);
  }
};

export const matchAlerts = async (token: string): Promise<AlertMatchResponse> => {
  if (!token) return { results: [], checked_at: new Date().toISOString() };
  return fetchJSON<AlertMatchResponse>("/alerts/match", { token });
};

// ---------------------------------------------------------------------------
// Notifications — in-app notification center (poll-based)
// ---------------------------------------------------------------------------

export interface UserNotification {
  id: number;
  user_token: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}

export const getNotifications = async (): Promise<UserNotification[]> => {
  return fetchJSON<UserNotification[]>("/notifications", undefined, authHeaders());
};

export const markNotificationRead = async (id: number): Promise<UserNotification> => {
  return postJSON<UserNotification>(`/notifications/${id}/read`, {}, authHeaders());
};

export const markAllNotificationsRead = async (): Promise<{ marked_read: number }> => {
  return postJSON<{ marked_read: number }>("/notifications/read-all", {}, authHeaders());
};

export interface AlertChannelsUpdateInput {
  channels?: string[];
  delivery_mode?: "instant" | "digest";
  quiet_hours_enabled?: boolean;
}

export const updateAlertChannels = async (
  token: string,
  id: number,
  data: AlertChannelsUpdateInput,
): Promise<ServerMarketAlert> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const url = new URL(`${API_BASE}/alerts/${id}/channels`, window.location.origin).toString();
  try {
    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...authHeaders(),
        ...alertTokenHeader(token),
      },
      body: JSON.stringify(data),
      signal: controller.signal,
    });
    if (!response.ok) throw await parseApiError(response);
    return (await response.json()) as ServerMarketAlert;
  } finally {
    clearTimeout(timeout);
  }
};

export interface NotificationPreferences {
  channels: string[];
  quiet_hours: { start: number; end: number; tz: string; note: string };
  digest_time: string;
  delivery_modes: string[];
  push_configured: boolean;
  vapid_public_key: string | null;
  topics: string[];
}

export const getNotificationPreferences = async (): Promise<NotificationPreferences> => {
  return fetchJSON<NotificationPreferences>("/notifications/preferences", undefined, authHeaders());
};

export const subscribePushEndpoint = async (sub: {
  endpoint: string;
  p256dh?: string;
  auth?: string;
}): Promise<{ subscribed: boolean; push_configured: boolean }> => {
  return postJSON<{ subscribed: boolean; push_configured: boolean }>(
    "/notifications/push/subscribe",
    { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
    authHeaders(),
  );
};

export const unsubscribePushEndpoint = async (endpoint: string): Promise<{ subscribed: boolean }> => {
  return postJSON<{ subscribed: boolean }>(
    "/notifications/push/unsubscribe",
    { endpoint },
    authHeaders(),
  );
};

// ---------------------------------------------------------------------------
// Compare page helpers
// ---------------------------------------------------------------------------

export const getListingsBatch = async (ids: number[]): Promise<CarListing[]> => {
  if (ids.length === 0) return [];
  const results = await Promise.allSettled(ids.map((id) => getListing(id)));
  return results
    .filter((r): r is PromiseFulfilledResult<CarListing> => r.status === "fulfilled")
    .map((r) => r.value);
};

function normalizeFuelMixData(data: JsonRecord): FuelMixData {
  const buckets = Array.isArray(data.buckets)
    ? data.buckets.map((row) => {
        const item = row as Record<string, unknown>;
        return {
          fuel_type: String(item.fuel_type || "other"),
          count: Number(item.count || 0),
          pct: Number(item.pct ?? 0),
        };
      })
    : [];
  return {
    total: Number(data.total || 0),
    buckets,
    generated_at: String(data.generated_at || new Date().toISOString()),
  };
}

function normalizeHybridBandsData(data: JsonRecord): HybridBandsData {
  const bands = Array.isArray(data.bands)
    ? data.bands.map((row) => {
        const item = row as Record<string, unknown>;
        return {
          label: String(item.label || ""),
          cc_max: toNumberOrNull(item.cc_max),
          count: Number(item.count || 0),
          median_price_lkr: toNumberOrNull(item.median_price_lkr),
        };
      })
    : [];
  return {
    total_hybrids: Number(data.total_hybrids || 0),
    bands,
    generated_at: String(data.generated_at || new Date().toISOString()),
  };
}

export const getFuelMix = async (): Promise<FuelMixData> => {
  const snapshot = await readSnapshot<JsonRecord>("fuel-mix.json");
  if (snapshot && Array.isArray(snapshot.buckets) && snapshot.buckets.length > 0) {
    return normalizeFuelMixData(snapshot);
  }
  const derived = await deriveFuelMixFromCatalog();
  if (derived) return derived;
  if (SNAPSHOT_ONLY) refuseLiveApiFallback("fuel mix");
  const data = await fetchJSON<JsonRecord>("/stats/fuel-mix");
  return normalizeFuelMixData(data);
};

export const getHybridBands = async (): Promise<HybridBandsData> => {
  const snapshot = await readSnapshot<JsonRecord>("hybrid-bands.json");
  if (snapshot && Array.isArray(snapshot.bands)) {
    return normalizeHybridBandsData(snapshot);
  }
  if (SNAPSHOT_ONLY) refuseLiveApiFallback("hybrid bands");
  const data = await fetchJSON<JsonRecord>("/stats/hybrid-bands");
  return normalizeHybridBandsData(data);
};

function normalizeEvInsightData(data: JsonRecord): EvInsightData {
  const topEvModels = Array.isArray(data.top_ev_models)
    ? (data.top_ev_models as JsonRecord[]).map((row) => ({
        make: String(row.make || ""),
        model: String(row.model || ""),
        listing_count: Number(row.listing_count || 0),
        median_price_lkr: toNumberOrNull(row.median_price_lkr),
      }))
    : [];

  const benchmarkRaw = asJsonRecord(data.hybrid_benchmark);
  const hybridBenchmark = {
    make: String(benchmarkRaw.make || "Toyota"),
    model: String(benchmarkRaw.model || "Aqua"),
    median_price_lkr: toNumberOrNull(benchmarkRaw.median_price_lkr),
    listing_count: Number(benchmarkRaw.listing_count || 0),
  };

  return {
    ev_count: Number(data.ev_count || 0),
    ev_pct: Number(data.ev_pct ?? 0),
    median_ev_price_lkr: toNumberOrNull(data.median_ev_price_lkr),
    top_ev_models: topEvModels,
    hybrid_benchmark: hybridBenchmark,
    generated_at: String(data.generated_at || new Date().toISOString()),
  };
}

export const getEvInsight = async (): Promise<EvInsightData> => {
  const derived = await deriveEvInsightFromCatalog();
  if (derived && derived.ev_count > 0) return derived;
  if (SNAPSHOT_ONLY && derived) return derived;
  try {
    const data = await fetchJSON<JsonRecord>("/stats/ev-insight");
    return normalizeEvInsightData(data);
  } catch {
    if (derived) return derived;
    throw new Error("EV insight unavailable (server unreachable and no snapshot).");
  }
};

export const formatNumber = (num: number): string => {
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
};

// ---------------------------------------------------------------------------
// Dealer — inventory benchmark
// ---------------------------------------------------------------------------

export interface UrlBenchmarkResult {
  url: string;
  make: string | null;
  model: string | null;
  year: number | null;
  listing_price: number | null;
  market_median: number | null;
  price_gap_pct: number | null;
  comparable_count: number;
  error: string | null;
}

export const benchmarkDealerUrls = async (
  urls: string[],
): Promise<UrlBenchmarkResult[]> => {
  const data = await postJSON<UrlBenchmarkResult[]>("/dealer/benchmark-urls", { urls });
  return Array.isArray(data) ? data : [];
};

export interface DealerClaimProfile {
  id: number;
  claim_token: string;
  display_name: string;
  contact_phone: string | null;
  contact_email: string | null;
  seller_name_pattern: string | null;
  claimed_url: string | null;
  status: string;
  matched_listings: number;
  verified_at?: string | null;
  plan?: string;
  subscription_status?: string;
  billing_email?: string | null;
  current_period_end?: string | null;
}

const DEALER_CLAIM_TOKEN_KEY = "motormila.dealer_claim_token.v1";

export function getStoredDealerClaimToken(): string | null {
  try {
    return window.localStorage.getItem(DEALER_CLAIM_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function storeDealerClaimToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(DEALER_CLAIM_TOKEN_KEY, token);
    else window.localStorage.removeItem(DEALER_CLAIM_TOKEN_KEY);
  } catch {
    // ignore
  }
}

export const claimDealerProfile = async (payload: {
  display_name: string;
  contact_phone?: string;
  contact_email?: string;
  seller_name_pattern?: string;
  claimed_url?: string;
  claim_token?: string;
}): Promise<DealerClaimProfile> => {
  return postJSON<DealerClaimProfile>("/dealer/claim", payload);
};

export const getDealerProfile = async (claimToken: string): Promise<DealerClaimProfile> => {
  return fetchJSON<DealerClaimProfile>("/dealer/me", { claim_token: claimToken });
};

export const getSourceQuality = async (): Promise<SourceQualityResponse> => {
  const data = await fetchJSON<Record<string, unknown>>("/stats/source-quality");
  const sources = Array.isArray(data.sources)
    ? (data.sources as Record<string, unknown>[]).map((row) => ({
        source: String(row.source || ""),
        listing_count: Number(row.listing_count || 0),
        price_fill_rate: Number(row.price_fill_rate ?? 0),
        fresh_24h_pct: Number(row.fresh_24h_pct ?? 0),
        outlier_rate: Number(row.outlier_rate ?? 0),
        duplicate_rate: Number(row.duplicate_rate ?? 0),
      }))
    : [];
  return {
    generated_at: String(data.generated_at || new Date().toISOString()),
    sources,
  };
};

function normalizeImportEraEntry(raw: Record<string, unknown>): ImportEraEntry {
  const eraRaw = String(raw?.era || "");
  const era = eraRaw === "post_freeze" ? "post_freeze" : "pre_freeze";
  return {
    era,
    label: String(raw?.label || (era === "pre_freeze" ? "Pre-freeze (≤2024)" : "Post-freeze (≥2025)")),
    count: Number(raw?.count || 0),
    median_price_lkr: toNumberOrNull(raw?.median_price_lkr),
  };
}

function normalizeImportEraMakeRow(raw: Record<string, unknown>): ImportEraMakeRow {
  return {
    make: String(raw?.make || ""),
    pre_freeze: normalizeImportEraEntry(asJsonRecord(raw?.pre_freeze)),
    post_freeze: normalizeImportEraEntry(asJsonRecord(raw?.post_freeze)),
  };
}

export const getImportEraSplit = async (topN?: number): Promise<ImportEraSplitData> => {
  const snapshot = await readSnapshot<JsonRecord>("import-era-split.json");
  if (snapshot && Array.isArray(snapshot.makes)) {
    return {
      makes: (snapshot.makes as Record<string, unknown>[])
        .map(normalizeImportEraMakeRow)
        .filter((row) => Boolean(row.make)),
      freeze_boundary_year: Number(snapshot.freeze_boundary_year || 2025),
      generated_at: String(snapshot.generated_at || new Date().toISOString()),
    };
  }
  if (SNAPSHOT_ONLY) refuseLiveApiFallback("import era split");
  const params: QueryParams = {};
  if (topN !== undefined) params.top_n = topN;
  const data = await fetchJSON<Record<string, unknown>>("/stats/import-era-split", params);
  const makes: ImportEraMakeRow[] = Array.isArray(data?.makes)
    ? (data.makes as Record<string, unknown>[])
        .map(normalizeImportEraMakeRow)
        .filter((row) => Boolean(row.make))
    : [];
  return {
    makes,
    freeze_boundary_year: Number(data?.freeze_boundary_year || 2025),
    generated_at: String(data?.generated_at || new Date().toISOString()),
  };
};

export interface LandedCostInput {
  cif_usd: number;
  exchange_rate: number;
  fuel_type: "petrol" | "diesel" | "hybrid" | "electric";
  engine_cc?: number;
  motor_kw?: number;
  apply_surcharge: boolean;
  apply_sscl: boolean;
}

export interface LandedCostResult {
  cif_lkr: number;
  cid: number;
  surcharge: number;
  excise: number;
  sscl: number;
  vat: number;
  luxury_tax: number;
  total_tax: number;
  landed_cost: number;
  surcharge_applied: boolean;
  notes: string;
}

export interface TcoInput {
  daily_km: number;
  fuel_type: "petrol" | "diesel" | "hybrid" | "electric";
  mileage_kmpl: number;
  lease_installment: number;
  insurance_annual: number;
  service_annual: number;
  tyres_annual: number;
  resale_loss_annual: number;
}

export interface TcoResult {
  fuel_price_lkr: number;
  fuel_cost_monthly: number;
  lease_cost_monthly: number;
  overhead_cost_monthly: number;
  total_tco_monthly: number;
  notes: string;
}

export interface PermitInfo {
  id: number;
  permit_name: string;
  permit_type: string;
  market_price_lkr: number;
  updated_at?: string | null;
}

/** Reference USD/LKR used only when the live macro feed is unreachable (labelled non-live). */
const MACRO_FALLBACK_USD_LKR = 300;

export interface MacroContext {
  usd_lkr: number;
  reference_date?: string | null;
  source: string;
  source_url: string;
  fetched_at: string;
  inflation_index?: number | null;
  inflation_yoy_percent?: number | null;
  inflation_reference_date?: string | null;
  notes: string;
  /** True when this context came from the local fallback instead of the live feed. */
  fallback?: boolean;
}

export type OwnershipVehicleClass = "motor_car" | "dual_purpose" | "motorcycle" | "three_wheeler";

export interface OwnershipBundleResult {
  revenue_licence: {
    base_fee_lkr: number;
    delay_charge_lkr: number;
    emission_test_lkr: number;
    total_lkr: number;
    schedule_note: string;
  };
  third_party_insurance: {
    base_premium_lkr: number;
    stamp_duty_lkr: number;
    total_lkr: number;
    schedule_note: string;
  };
  transfer: {
    processing_fee_lkr: number;
    stamp_duty_lkr: number;
    total_lkr: number;
    schedule_note: string;
  } | null;
  first_year_statutory_total_lkr: number;
  notes: string;
}

export interface ImportEligibilityResult {
  eligible: boolean;
  status: "likely_allowed" | "restricted" | "needs_review";
  reasons: string[];
  notes: string;
}

export interface VehicleNewsItem {
  id: string | null;
  title: string;
  thumb: string | null;
  source: string;
}

export const calculateLandedCost = async (input: LandedCostInput): Promise<LandedCostResult> => {
  return await postJSON<LandedCostResult>("/calculators/landed-cost", input as unknown as Record<string, unknown>);
};

export const calculateTco = async (input: TcoInput): Promise<TcoResult> => {
  return await postJSON<TcoResult>("/calculators/tco", input as unknown as Record<string, unknown>);
};

const BENCHMARK_PERMITS: PermitInfo[] = [
  { id: 1, permit_name: "Government Doctor Permit", permit_type: "duty_free", market_price_lkr: 5500000 },
  { id: 2, permit_name: "Government MP / State Officer Permit", permit_type: "duty_free", market_price_lkr: 9800000 },
  { id: 3, permit_name: "Special EV Import Permit (Remittance)", permit_type: "ev", market_price_lkr: 2200000 },
  { id: 4, permit_name: "Foreign Employment EV Permit", permit_type: "ev", market_price_lkr: 1800000 },
];

export const getPermits = async (): Promise<PermitInfo[]> => {
  const snapshot = await readSnapshot<{ items?: unknown[] }>("permits.json");
  if (snapshot && Array.isArray(snapshot.items) && snapshot.items.length > 0) {
    return snapshot.items as PermitInfo[];
  }
  try {
    const data = await fetchJSON<PermitInfo[]>("/calculators/permits");
    if (Array.isArray(data) && data.length > 0) return data;
  } catch {
    // Fall through to benchmarks below.
  }
  return BENCHMARK_PERMITS;
};

export const getNhtsaModels = async (make: string): Promise<NhtsaModelsResult> => {
  const params: QueryParams = { make };
  const data = await fetchJSON<NhtsaModelsResult>("/listings/nhtsa-models", params);
  return {
    make: String(data?.make ?? make),
    count: Number(data?.count ?? 0),
    models: Array.isArray(data?.models) ? data.models : [],
  };
};

export const getListingSafetyResearch = async (
  id: string | number,
): Promise<SafetyResearchResponse> => {
  return fetchJSON<SafetyResearchResponse>(`/listings/${id}/safety-research`);
};

export const getListingGeo = async (
  id: string | number,
): Promise<EnrichmentEnvelope<{
  lat?: number | null;
  lng?: number | null;
  formatted?: string | null;
  result_type?: string | null;
}>> => {
  return fetchJSON(`/listings/${id}/geo`);
};

export const getVehicleSafetyResearch = async (input: {
  make: string;
  model: string;
  year?: number | null;
}): Promise<SafetyResearchResponse> => {
  const params: QueryParams = { make: input.make, model: input.model };
  if (input.year) params.year = input.year;
  return fetchJSON<SafetyResearchResponse>("/vehicles/safety-research", params);
};

export const getChargingStations = async (input?: {
  lat?: number;
  lng?: number;
  radius_km?: number;
}): Promise<ChargingStationsResponse> => {
  const params: QueryParams = {};
  if (input?.lat != null) params.lat = input.lat;
  if (input?.lng != null) params.lng = input.lng;
  if (input?.radius_km != null) params.radius_km = input.radius_km;
  const data = await fetchJSON<ChargingStationsResponse>("/ev/charging-stations", params);
  const stations = Array.isArray(data?.stations) ? data.stations : [];
  return {
    count: Number(data?.count ?? stations.length),
    lat: data?.lat,
    lng: data?.lng,
    radius_km: Number(data?.radius_km ?? input?.radius_km ?? 25),
    attribution: String(data?.attribution || "Data © Open Charge Map contributors and original data providers."),
    limitation: data?.limitation,
    stations,
  };
};

export const getMacroContext = async (): Promise<MacroContext> => {
  try {
    return await fetchJSON<MacroContext>("/calculators/macro");
  } catch {
    // Live FX is best-effort: when the feed is unreachable, fall back to a
    // clearly-labelled reference rate so the calculator still works.
    return {
      usd_lkr: MACRO_FALLBACK_USD_LKR,
      reference_date: null,
      source: "Fallback reference rate (live FX unavailable)",
      source_url: "",
      fetched_at: new Date().toISOString(),
      notes: "Fallback rate — not a live print. Confirm with your bank before committing.",
      fallback: true,
    };
  }
};

export const calculateOwnershipBundle = async (input: {
  vehicle_class?: OwnershipVehicleClass;
  fuel_type: "petrol" | "diesel" | "hybrid" | "electric";
  engine_cc?: number;
  unladen_kg?: number;
  consideration_lkr?: number;
  include_transfer?: boolean;
}): Promise<OwnershipBundleResult> => {
  return await postJSON<OwnershipBundleResult>(
    "/calculators/ownership-bundle",
    input as unknown as Record<string, unknown>,
  );
};

export const checkImportEligibility = async (input: {
  fuel_type: "petrol" | "diesel" | "hybrid" | "electric";
  model_year?: number;
  as_of_year?: number;
}): Promise<ImportEligibilityResult> => {
  return await postJSON<ImportEligibilityResult>(
    "/calculators/import-eligibility",
    input as unknown as Record<string, unknown>,
  );
};

export const getVehicleNews = async (limit = 8): Promise<VehicleNewsItem[]> => {
  const data = await fetchJSON<{ items?: VehicleNewsItem[] }>(`/calculators/vehicle-news?limit=${limit}`);
  return Array.isArray(data?.items) ? data.items : [];
};

export type AdminUser = {
  id: number;
  email: string;
  name: string;
  plan: "free" | "pro" | "enterprise" | "dealer";
  subscriptionStatus: string;
  role: "user" | "admin";
  isActive: boolean;
  invitedByEmail?: string | null;
  lastLoginAt?: string | null;
  createdAt?: string | null;
};

export type AdminInvite = {
  id: number;
  email: string;
  plan: string;
  role: string;
  status: string;
  token: string;
  signupPath: string;
  invitedByEmail?: string | null;
  expiresAt?: string | null;
  acceptedAt?: string | null;
  createdAt?: string | null;
};

export type AdminOverview = {
  listings: { total: number; live: number };
  users: { total: number; free: number; pro: number; admins: number };
  invites: { pending: number };
  feedback: { open: number };
  dealers: { verified: number };
  recentScrapes: Array<{
    id: number;
    source: string;
    status?: string | null;
    listingsFound: number;
    listingsNew: number;
    startedAt?: string | null;
    finishedAt?: string | null;
    errorMessage?: string | null;
  }>;
  topMakes: Array<{ make: string; count: number }>;
  generatedAt: string;
};

export const getAdminOverview = async (): Promise<AdminOverview> => {
  return fetchJSON<AdminOverview>("/admin/overview", undefined, authHeaders());
};

export const getAdminUsers = async (
  params: { limit?: number; offset?: number; q?: string; plan?: string } = {},
): Promise<{ total: number; users: AdminUser[] }> => {
  return fetchJSON<{ total: number; users: AdminUser[] }>("/admin/users", params, authHeaders());
};

export const getAdminInvites = async (
  params: { status?: string; limit?: number } = {},
): Promise<{ invites: AdminInvite[] }> => {
  return fetchJSON<{ invites: AdminInvite[] }>("/admin/invites", params, authHeaders());
};

export const createAdminInvite = async (input: {
  email: string;
  plan?: string;
  role?: string;
}): Promise<AdminInvite> => {
  return postJSON<AdminInvite>("/admin/invites", input, authHeaders());
};

export type AdminAnalytics = {
  listings: {
    bySource: Array<{ source: string; count: number }>;
    byDistrict: Array<{ district: string; count: number }>;
    avgPriceLkr: number;
    minPriceLkr: number;
    maxPriceLkr: number;
  };
  users: {
    byPlan: Array<{ plan: string; count: number }>;
    bySubscription: Array<{ status: string; count: number }>;
    signupsToday: number;
    inactive: number;
    neverLoggedIn: number;
  };
  alerts: { active: number; withWhatsapp: number };
  signals: { total: number; bySource: Array<{ source: string; count: number }> };
  scrapes: { success: number; failed: number };
  invites: Array<{ status: string; count: number }>;
  feedback: Array<{ status: string; count: number }>;
  dealers: Array<{ status: string; count: number }>;
  generatedAt: string;
};

export type AdminFeedbackItem = {
  id: number;
  category: string;
  route?: string | null;
  message: string;
  email?: string | null;
  status: string;
  createdAt?: string | null;
};

export type AdminDealer = {
  id: number;
  displayName: string;
  contactPhone?: string | null;
  contactEmail?: string | null;
  sellerNamePattern?: string | null;
  claimedUrl?: string | null;
  status: string;
  plan: string;
  subscriptionStatus: string;
  verifiedAt?: string | null;
  createdAt?: string | null;
};

export type AdminPipelineRun = {
  id: number;
  source: string;
  status?: string | null;
  listingsFound: number;
  listingsNew: number;
  startedAt?: string | null;
  finishedAt?: string | null;
  errorMessage?: string | null;
};

export type AdminPermit = {
  id: number;
  permitName: string;
  permitType: string;
  marketPriceLkr: number;
  updatedAt?: string | null;
};

export type AdminProviderHealth = {
  id: string;
  label: string;
  enabled: boolean;
  configured: boolean;
  lastRun?: {
    id?: number;
    status?: string;
    rows?: number | null;
    failures?: number | null;
    checksum?: string | null;
    startedAt?: string | null;
    endedAt?: string | null;
    error?: string | null;
  } | null;
};

export type AdminSystem = {
  adminEmail?: string;
  databaseOk: boolean;
  flags: {
    appAccessEnforced: boolean;
    proAccessEnforced: boolean;
    adminApiKeyConfigured: boolean;
    billingWebhookConfigured: boolean;
    b2bKeysConfigured: boolean;
    resendConfigured: boolean;
    twilioConfigured: boolean;
    dealerAdminTokenConfigured: boolean;
    publicAppOrigin?: string | null;
  };
  statsCacheKeys: string[];
  providers?: AdminProviderHealth[];
  generatedAt: string;
};

export const getAdminAnalytics = async (): Promise<AdminAnalytics> => {
  return fetchJSON<AdminAnalytics>("/admin/analytics", undefined, authHeaders());
};

export const getAdminFeedback = async (
  params: { status?: string; limit?: number } = {},
): Promise<{ feedback: AdminFeedbackItem[] }> => {
  return fetchJSON<{ feedback: AdminFeedbackItem[] }>("/admin/feedback", params, authHeaders());
};

export const updateAdminFeedback = async (
  id: number,
  status: string,
): Promise<AdminFeedbackItem> => {
  if (USE_MOCK) throw new Error("Mock mode is disabled");
  const url = new URL(`${API_BASE}/admin/feedback/${id}`, window.location.origin).toString();
  const response = await fetch(url, {
    method: "PATCH",
    credentials: resolveFetchCredentials(),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) throw await parseApiError(response);
  return response.json();
};

export const getAdminDealers = async (
  params: { status?: string; limit?: number } = {},
): Promise<{ dealers: AdminDealer[] }> => {
  return fetchJSON<{ dealers: AdminDealer[] }>("/admin/dealers", params, authHeaders());
};

export const verifyAdminDealer = async (id: number): Promise<AdminDealer> => {
  return postJSON<AdminDealer>(`/admin/dealers/${id}/verify`, {}, authHeaders());
};

export const getAdminPipeline = async (
  params: { limit?: number } = {},
): Promise<{ orphansReconciled: number; runs: AdminPipelineRun[] }> => {
  return fetchJSON<{ orphansReconciled: number; runs: AdminPipelineRun[] }>(
    "/admin/pipeline",
    params,
    authHeaders(),
  );
};

export const triggerAdminPipeline = async (
  job: "sync" | "alt_sync" = "sync",
): Promise<{ ok: boolean; job: string; pid: number }> => {
  return postJSON<{ ok: boolean; job: string; pid: number }>(
    "/admin/pipeline/trigger",
    { job },
    authHeaders(),
  );
};

export const getAdminPermits = async (): Promise<{ permits: AdminPermit[] }> => {
  return fetchJSON<{ permits: AdminPermit[] }>("/admin/permits", undefined, authHeaders());
};

export const upsertAdminPermit = async (input: {
  permit_name: string;
  permit_type: string;
  market_price_lkr: number;
}): Promise<AdminPermit> => {
  return postJSON<AdminPermit>("/admin/permits", input, authHeaders());
};

export const clearAdminStatsCache = async (key?: string): Promise<{ ok: boolean; deleted: number }> => {
  if (USE_MOCK) throw new Error("Mock mode is disabled");
  const url = new URL(`${API_BASE}/admin/cache`, window.location.origin);
  if (key) url.searchParams.set("key", key);
  const response = await fetch(url.toString(), {
    method: "DELETE",
    credentials: resolveFetchCredentials(),
    headers: { Accept: "application/json", ...authHeaders() },
  });
  if (!response.ok) throw await parseApiError(response);
  return response.json();
};

export const getAdminSystem = async (): Promise<AdminSystem> => {
  return fetchJSON<AdminSystem>("/admin/system", undefined, authHeaders());
};

export const runRevcarDataPilot = async (): Promise<{
  ok: boolean;
  status?: string;
  attempted?: number;
  matched?: number;
  false_matches?: number;
  match_rate?: number;
  msrp_used_for_lkr_fmv?: boolean;
}> => {
  return postJSON("/admin/enrichment/revcardata", {}, authHeaders());
};

export const updateAdminUser = async (
  userId: number,
  patch: {
    plan?: string;
    subscription_status?: string;
    role?: string;
    is_active?: boolean;
    name?: string;
  },
): Promise<AdminUser> => {
  if (USE_MOCK) throw new Error("Mock mode is disabled");
  const url = new URL(`${API_BASE}/admin/users/${userId}`, window.location.origin).toString();
  const response = await fetch(url, {
    method: "PATCH",
    credentials: resolveFetchCredentials(),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw await parseApiError(response);
  return response.json();
};

export const revokeAdminInvite = async (inviteId: number): Promise<{ ok: boolean }> => {
  if (USE_MOCK) throw new Error("Mock mode is disabled");
  const url = new URL(`${API_BASE}/admin/invites/${inviteId}`, window.location.origin).toString();
  const response = await fetch(url, {
    method: "DELETE",
    credentials: resolveFetchCredentials(),
    headers: {
      Accept: "application/json",
      ...authHeaders(),
    },
  });
  if (!response.ok) throw await parseApiError(response);
  return response.json();
};

// ── User-submitted listings (sell-your-car) ────────────────────────────────

export type MyListingInput = {
  make: string;
  model: string;
  year?: number;
  priceLkr?: number;
  mileage?: number;
  fuelType?: string;
  transmission?: string;
  condition?: string;
  bodyType?: string;
  vehicleCategory?: string;
  district?: string;
  city?: string;
  title?: string;
  description?: string;
  contactName?: string;
  contactPhone: string;
  imageUrls?: string[];
};

export type MyListing = {
  id: number;
  make: string;
  model: string;
  year?: number | null;
  priceLkr?: number | null;
  mileage?: number | null;
  fuelType?: string | null;
  transmission?: string | null;
  condition?: string | null;
  bodyType?: string | null;
  vehicleCategory?: string | null;
  district?: string | null;
  city?: string | null;
  title?: string | null;
  description?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  imageUrls: string[];
  status: string;
  createdAt?: string | null;
  updatedAt?: string | null;
};

function toMyListing(data: JsonRecord): MyListing {
  return {
    id: Number(data.id || 0),
    make: String(data.make || ""),
    model: String(data.model || ""),
    year: toNumberOrNull(data.year),
    priceLkr: toNumberOrNull(data.price_lkr ?? data.priceLkr),
    mileage: toNumberOrNull(data.mileage),
    fuelType: data.fuel_type ? String(data.fuel_type) : data.fuelType ? String(data.fuelType) : null,
    transmission: data.transmission ? String(data.transmission) : null,
    condition: data.condition ? String(data.condition) : null,
    bodyType: data.body_type ? String(data.body_type) : data.bodyType ? String(data.bodyType) : null,
    vehicleCategory: data.vehicle_category ? String(data.vehicle_category) : data.vehicleCategory ? String(data.vehicleCategory) : null,
    district: data.district ? String(data.district) : null,
    city: data.city ? String(data.city) : null,
    title: data.title ? String(data.title) : null,
    description: data.description ? String(data.description) : null,
    contactName: data.contact_name ? String(data.contact_name) : data.contactName ? String(data.contactName) : null,
    contactPhone: data.contact_phone ? String(data.contact_phone) : data.contactPhone ? String(data.contactPhone) : null,
    imageUrls: Array.isArray(data.image_urls)
      ? data.image_urls.map((u: unknown) => String(u)).filter(Boolean)
      : Array.isArray(data.imageUrls)
        ? data.imageUrls.map((u: unknown) => String(u)).filter(Boolean)
        : [],
    status: String(data.status || data.user_listing_status || "pending"),
    createdAt: data.created_at ? String(data.created_at) : data.createdAt ? String(data.createdAt) : null,
    updatedAt: data.updated_at ? String(data.updated_at) : data.updatedAt ? String(data.updatedAt) : null,
  };
}

export const createMyListing = async (input: MyListingInput): Promise<MyListing> => {
  const body: Record<string, unknown> = {
    make: input.make,
    model: input.model,
    year: input.year,
    price_lkr: input.priceLkr,
    mileage: input.mileage,
    fuel_type: input.fuelType,
    transmission: input.transmission,
    condition: input.condition,
    body_type: input.bodyType,
    vehicle_category: input.vehicleCategory,
    district: input.district,
    city: input.city,
    title: input.title,
    description: input.description,
    contact_name: input.contactName,
    contact_phone: input.contactPhone,
    image_urls: input.imageUrls || [],
  };
  const data = await postJSON<JsonRecord>("/listings/mine", body, authHeaders());
  return toMyListing(data);
};

export const getMyListings = async (): Promise<MyListing[]> => {
  const items = await fetchJSON<JsonRecord[]>("/listings/mine", undefined, authHeaders());
  return Array.isArray(items) ? items.map(toMyListing) : [];
};

export const updateMyListing = async (
  id: number,
  patch: Partial<MyListingInput> & { status?: string },
): Promise<MyListing> => {
  const body: Record<string, unknown> = {};
  if (patch.make !== undefined) body.make = patch.make;
  if (patch.model !== undefined) body.model = patch.model;
  if (patch.year !== undefined) body.year = patch.year;
  if (patch.priceLkr !== undefined) body.price_lkr = patch.priceLkr;
  if (patch.mileage !== undefined) body.mileage = patch.mileage;
  if (patch.fuelType !== undefined) body.fuel_type = patch.fuelType;
  if (patch.transmission !== undefined) body.transmission = patch.transmission;
  if (patch.condition !== undefined) body.condition = patch.condition;
  if (patch.bodyType !== undefined) body.body_type = patch.bodyType;
  if (patch.vehicleCategory !== undefined) body.vehicle_category = patch.vehicleCategory;
  if (patch.district !== undefined) body.district = patch.district;
  if (patch.city !== undefined) body.city = patch.city;
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.description !== undefined) body.description = patch.description;
  if (patch.contactName !== undefined) body.contact_name = patch.contactName;
  if (patch.contactPhone !== undefined) body.contact_phone = patch.contactPhone;
  if (patch.imageUrls !== undefined) body.image_urls = patch.imageUrls;
  if (patch.status !== undefined) body.status = patch.status;
  const url = new URL(`${API_BASE}/listings/mine/${id}`, window.location.origin).toString();
  const response = await fetch(url, {
    method: "PATCH",
    credentials: resolveFetchCredentials(),
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await parseApiError(response);
  return toMyListing((await response.json()) as JsonRecord);
};

export const deleteMyListing = async (id: number): Promise<void> => {
  const url = new URL(`${API_BASE}/listings/mine/${id}`, window.location.origin).toString();
  const response = await fetch(url, {
    method: "DELETE",
    credentials: resolveFetchCredentials(),
    headers: {
      Accept: "application/json",
      ...authHeaders(),
    },
  });
  if (!response.ok) throw await parseApiError(response);
};

// ---------------------------------------------------------------------------
// ui/features: snapshot comps for a make/model (estimate fallback, sell-speed)
// ---------------------------------------------------------------------------

/**
 * Every snapshot row for one make/model (compact comps: id, price, year,
 * mileage, district, condition, first_seen_at, fuel). Reads the per-model
 * idx/ file when published, else filters the legacy full catalogue.
 * Never calls the live API; returns [] when no snapshot covers the model.
 * Pass `{ allowFullCatalog: false }` for non-essential UI (badges) so it
 * never triggers the full-catalogue download.
 */
export const getSnapshotModelComps = async (
  make: string,
  model: string,
  opts: { allowFullCatalog?: boolean } = {},
): Promise<CarListing[]> => {
  if (!make || !model) return [];
  try {
    if (await hasSnapshotIndex()) {
      const idx = await getSnapshotModelIndex(make, model);
      return (idx?.comps || []) as CarListing[];
    }
    // The legacy catalogue is tens of MB: only badges/extras opt out of it.
    if (opts.allowFullCatalog === false) return [];
    const catalog = await getSnapshotListingCatalog();
    if (!catalog) return [];
    const mk = makeIndexKey(make);
    const mo = modelIndexKey(model);
    return catalog.filter((row) => makeIndexKey(row.make) === mk && modelIndexKey(row.model) === mo);
  } catch {
    return [];
  }
};
