// Temporary/internal snapshot exporter for egress recovery.
// Uses HOT_DATABASE_URL / DATABASE_URL available at Vercel runtime
// (Sensitive env vars are not readable via `vercel env pull`).
//
// Auth: Authorization: Bearer <SNAPSHOT_EXPORT_SECRET>
// or ?token=<SNAPSHOT_EXPORT_SECRET>
//
// Query:
//   kind=stats-summary|live-market|district-prices|district-velocity|
//        dashboard-insights|price-drops|listing-makes|listing-sources|listings|ping
//   cursor=<int> limit=<int>  (listings only)

import { neon } from "@neondatabase/serverless";

const MIN_PRICE = 100_000;

/** Sri Lanka district centroids — mirrored from backend/app/utils/districts.py */
const SL_DISTRICT_COORDS = {
  Colombo: { lat: 6.9271, lng: 79.8612 },
  Gampaha: { lat: 7.084, lng: 80.0098 },
  Kalutara: { lat: 6.5854, lng: 79.9607 },
  Kandy: { lat: 7.2906, lng: 80.6337 },
  Matale: { lat: 7.4675, lng: 80.6234 },
  "Nuwara Eliya": { lat: 6.9497, lng: 80.7891 },
  Galle: { lat: 6.0535, lng: 80.221 },
  Matara: { lat: 5.9549, lng: 80.555 },
  Hambantota: { lat: 6.1243, lng: 81.1185 },
  Jaffna: { lat: 9.6615, lng: 80.0255 },
  Kilinochchi: { lat: 9.3803, lng: 80.377 },
  Mannar: { lat: 8.981, lng: 79.9044 },
  Vavuniya: { lat: 8.7514, lng: 80.4971 },
  Batticaloa: { lat: 7.731, lng: 81.6747 },
  Ampara: { lat: 7.2964, lng: 81.6747 },
  Trincomalee: { lat: 8.5874, lng: 81.2152 },
  Kurunegala: { lat: 7.4863, lng: 80.3647 },
  Puttalam: { lat: 8.0362, lng: 79.8283 },
  Anuradhapura: { lat: 8.3114, lng: 80.4037 },
  Polonnaruwa: { lat: 7.9403, lng: 81.0188 },
  Badulla: { lat: 6.9934, lng: 81.055 },
  Monaragala: { lat: 6.8728, lng: 81.3507 },
  Ratnapura: { lat: 6.6828, lng: 80.3992 },
  Kegalle: { lat: 7.2513, lng: 80.3464 },
  "Sri Lanka": { lat: 7.8731, lng: 80.7718 },
};

const DISTRICT_ALIASES = {
  nuwaraeliya: "Nuwara Eliya",
  "nuwara eliya": "Nuwara Eliya",
  "gampaha district": "Gampaha",
  "colombo district": "Colombo",
  "kegalle district": "Kegalle",
};

function titleCaseDistrict(value) {
  return String(value)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Normalize raw district strings toward SL_DISTRICT_COORDS keys. */
function normalizeDistrictName(value) {
  if (value == null) return null;
  const cleaned = String(value).trim().replace(/-/g, " ").replace(/\s+/g, " ");
  if (!cleaned) return null;
  const key = cleaned.toLowerCase();
  if (DISTRICT_ALIASES[key]) return DISTRICT_ALIASES[key];
  const title = titleCaseDistrict(cleaned);
  return Object.prototype.hasOwnProperty.call(SL_DISTRICT_COORDS, title) ? title : null;
}

function dbUrl(env) {
  return (
    String(env?.HOT_DATABASE_URL || "").trim() ||
    String(env?.DATABASE_URL || "").trim() ||
    String(env?.COLD_DATABASE_URL || "").trim()
  );
}

function authorized(request, env) {
  const secret = String(env?.SNAPSHOT_EXPORT_SECRET || "").trim();
  if (!secret) return false;
  const header = String(request.headers.get("authorization") || "");
  if (header === `Bearer ${secret}`) return true;
  const url = new URL(request.url);
  return url.searchParams.get("token") === secret;
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "GET") {
    return json( 405, { detail: "GET only" });
  }
  if (!authorized(request, env)) {
    return json( 401, { detail: "Unauthorized" });
  }

  const url = new URL(request.url);
  const kind = String(url.searchParams.get("kind") || "ping").trim();
  const cursor = Math.max(0, Number(url.searchParams.get("cursor") || 0) || 0);
  const limit = Math.min(2000, Math.max(1, Number(url.searchParams.get("limit") || 500) || 500));

  const connectionString = dbUrl(env);
  if (!connectionString || connectionString === "[SENSITIVE]") {
    return json( 500, { detail: "No database URL configured on this deployment" });
  }

  const sql = neon(connectionString);

  try {
    
    if (kind === "ping") {
      const r = await sql.query("SELECT 1 AS ok, NOW() AS ts");
      return json( 200, { ok: true, ts: r[0]?.ts, host: "connected" });
    }

    if (kind === "stats-summary") {
      const total = await sql.query(
        `SELECT COUNT(*)::int AS c FROM car_listings WHERE COALESCE(is_active, true) = true`,
      );
      const priced = await sql.query(
        `SELECT COUNT(*)::int AS c, AVG(price_lkr)::float AS avg
         FROM car_listings
         WHERE COALESCE(is_active, true) = true AND price_lkr >= $1`,
        [MIN_PRICE],
      );
      const week = await sql.query(
        `SELECT COUNT(*)::int AS c FROM car_listings
         WHERE COALESCE(is_active, true) = true
           AND scraped_at >= NOW() - INTERVAL '7 days'`,
      );
      const makes = await sql.query(
        `SELECT make, COUNT(*)::int AS count
         FROM car_listings
         WHERE COALESCE(is_active, true) = true AND make IS NOT NULL AND make <> ''
         GROUP BY make ORDER BY count DESC LIMIT 12`,
      );
      const districts = await sql.query(
        `SELECT COUNT(DISTINCT district)::int AS c FROM car_listings
         WHERE COALESCE(is_active, true) = true AND district IS NOT NULL AND district <> ''`,
      );
      const goodDeals = await sql.query(
        `SELECT COUNT(*)::int AS c FROM car_listings
         WHERE COALESCE(is_active, true) = true
           AND deal_score IS NOT NULL AND deal_score >= 8`,
      );
      const sources = await sql.query(
        `SELECT COUNT(DISTINCT source)::int AS c FROM car_listings
         WHERE COALESCE(is_active, true) = true
           AND source IS NOT NULL AND source <> ''`,
      );
      const lastUpdated = await sql.query(
        `SELECT MAX(scraped_at) AS ts FROM car_listings
         WHERE scraped_at IS NOT NULL`,
      );
      return json( 200, {
        total_listings: total[0]?.c || 0,
        priced_listings: priced[0]?.c || 0,
        avg_price_lkr: priced[0]?.avg || 0,
        listings_this_week: week[0]?.c || 0,
        price_change_mom: null,
        top_makes: makes,
        district_count: districts[0]?.c || 0,
        good_deals_count: goodDeals[0]?.c || 0,
        source_count: sources[0]?.c || 0,
        last_updated: lastUpdated[0]?.ts || null,
        generated_at: new Date().toISOString(),
      });
    }

    if (kind === "live-market") {
      const total = await sql.query(
        `SELECT COUNT(*)::int AS c FROM car_listings WHERE COALESCE(is_active, true) = true`,
      );
      const latest = await sql.query(
        `SELECT scraped_at FROM car_listings
         WHERE scraped_at IS NOT NULL
         ORDER BY scraped_at DESC LIMIT 1`,
      );
      return json( 200, {
        total_listings: total[0]?.c || 0,
        latest_listing_at: latest[0]?.scraped_at || null,
        generated_at: new Date().toISOString(),
        sources: [],
      });
    }

    if (kind === "district-prices") {
      const rows = await sql.query(
        `SELECT district,
                COUNT(*)::int AS count,
                AVG(price_lkr)::float AS avg_price_lkr,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_lkr)::float AS median_price_lkr
         FROM car_listings
         WHERE COALESCE(is_active, true) = true
           AND district IS NOT NULL AND district <> ''
           AND price_lkr >= $1
         GROUP BY district
         ORDER BY count DESC`,
        [MIN_PRICE],
      );

      // Optional cheap top_make per raw district (mode by count).
      const topMakeRows = await sql.query(
        `SELECT district, make, COUNT(*)::int AS c
         FROM car_listings
         WHERE COALESCE(is_active, true) = true
           AND district IS NOT NULL AND district <> ''
           AND make IS NOT NULL AND make <> ''
           AND price_lkr >= $1
         GROUP BY district, make`,
        [MIN_PRICE],
      );
      const topMakeByRaw = new Map();
      for (const row of topMakeRows) {
        const prev = topMakeByRaw.get(row.district);
        if (!prev || row.c > prev.c) {
          topMakeByRaw.set(row.district, { make: row.make, c: row.c });
        }
      }

      // Merge alias/case variants into canonical districts.
      const agg = new Map();
      for (const r of rows) {
        const district = normalizeDistrictName(r.district);
        if (!district || district === "Sri Lanka") continue;
        const coords = SL_DISTRICT_COORDS[district];
        if (!coords) continue;
        const count = Number(r.count) || 0;
        const avg = Number(r.avg_price_lkr) || 0;
        const median = Number(r.median_price_lkr) || avg;
        const topMake = topMakeByRaw.get(r.district)?.make || null;
        const existing = agg.get(district);
        if (!existing) {
          agg.set(district, {
            district,
            count,
            avg_price_lkr: avg,
            median_price_lkr: median,
            lat: coords.lat,
            lng: coords.lng,
            top_make: topMake,
            _avgWeight: count,
            _medianWeight: count,
            _topMakeCounts: topMake ? { [topMake]: count } : {},
          });
          continue;
        }
        const combined = existing.count + count;
        existing.avg_price_lkr =
          combined > 0
            ? (existing.avg_price_lkr * existing._avgWeight + avg * count) / combined
            : 0;
        existing.median_price_lkr =
          combined > 0
            ? (existing.median_price_lkr * existing._medianWeight + median * count) / combined
            : 0;
        existing.count = combined;
        existing._avgWeight = combined;
        existing._medianWeight = combined;
        if (topMake) {
          existing._topMakeCounts[topMake] = (existing._topMakeCounts[topMake] || 0) + count;
        }
      }

      const points = [...agg.values()]
        .map((p) => {
          let top_make = p.top_make;
          const counts = p._topMakeCounts || {};
          const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
          if (ranked.length) top_make = ranked[0][0];
          return {
            district: p.district,
            count: p.count,
            avg_price_lkr: p.avg_price_lkr,
            median_price_lkr: p.median_price_lkr,
            lat: p.lat,
            lng: p.lng,
            top_make: top_make || null,
          };
        })
        .sort((a, b) => b.count - a.count);

      return json( 200, { points });
    }

    if (kind === "district-velocity") {
      const rows = await sql.query(
        `SELECT district,
                COUNT(*)::int AS listing_count,
                COUNT(*) FILTER (
                  WHERE scraped_at >= NOW() - INTERVAL '7 days'
                )::int AS new_7d_count
         FROM car_listings
         WHERE COALESCE(is_active, true) = true
           AND district IS NOT NULL AND district <> ''
         GROUP BY district`,
      );

      const agg = new Map();
      for (const r of rows) {
        const district = normalizeDistrictName(r.district);
        if (!district || district === "Sri Lanka") continue;
        const coords = SL_DISTRICT_COORDS[district];
        if (!coords) continue;
        const listing_count = Number(r.listing_count) || 0;
        const new_7d_count = Number(r.new_7d_count) || 0;
        const existing = agg.get(district);
        if (!existing) {
          agg.set(district, {
            district,
            lat: coords.lat,
            lng: coords.lng,
            listing_count,
            new_7d_count,
          });
        } else {
          existing.listing_count += listing_count;
          existing.new_7d_count += new_7d_count;
        }
      }

      const points = [...agg.values()]
        .map((p) => ({
          district: p.district,
          lat: p.lat,
          lng: p.lng,
          listing_count: p.listing_count,
          new_7d_count: p.new_7d_count,
          velocity_score:
            Math.round((p.new_7d_count / Math.max(p.listing_count, 1)) * 10000) / 10000,
        }))
        .sort((a, b) => b.listing_count - a.listing_count);

      return json( 200, {
        points,
        generated_at: new Date().toISOString(),
      });
    }

    if (kind === "dashboard-insights") {
      const new24h = await sql.query(
        `SELECT COUNT(*)::int AS c FROM car_listings
         WHERE COALESCE(is_active, true) = true
           AND scraped_at >= NOW() - INTERVAL '24 hours'`,
      );

      const trending = await sql.query(
        `SELECT make, model,
                COUNT(*)::int AS listing_count,
                AVG(price_lkr)::float AS avg_price_lkr,
                MAX(thumbnail_url) AS thumbnail_url
         FROM car_listings
         WHERE COALESCE(is_active, true) = true
           AND make IS NOT NULL AND make <> ''
           AND model IS NOT NULL AND model <> ''
           AND price_lkr IS NOT NULL AND price_lkr >= $1
         GROUP BY make, model
         ORDER BY listing_count DESC
         LIMIT 8`,
        [MIN_PRICE],
      );

      const hotDeals = await sql.query(
        `SELECT id, make, model, year, district, source, price_lkr, deal_score, thumbnail_url
         FROM car_listings
         WHERE COALESCE(is_active, true) = true
           AND deal_score IS NOT NULL AND deal_score >= 8
           AND price_lkr IS NOT NULL AND price_lkr >= $1
         ORDER BY deal_score DESC, scraped_at DESC NULLS LAST
         LIMIT 12`,
        [MIN_PRICE],
      );

      return json( 200, {
        new_listings_24h: new24h[0]?.c || 0,
        segment_performance: [],
        trending_models: trending.map((r) => ({
          make: r.make || "",
          model: r.model || "",
          listing_count: r.listing_count || 0,
          avg_price_lkr: r.avg_price_lkr != null ? Number(r.avg_price_lkr) : 0,
          movement_pct: null,
          thumbnail_url: r.thumbnail_url || null,
        })),
        hot_deals: hotDeals.map((r) => ({
          id: r.id,
          make: r.make || "",
          model: r.model || "",
          year: r.year != null ? Number(r.year) : 0,
          district: r.district || null,
          source: r.source || "unknown",
          price_lkr: Number(r.price_lkr),
          deal_score: r.deal_score != null ? Number(r.deal_score) : 0,
          thumbnail_url: r.thumbnail_url || null,
        })),
        generated_at: new Date().toISOString(),
      });
    }

    if (kind === "price-drops") {
      // vehicle_price_history exists in prod, but a full LAG join + nested listing
      // payload is heavy for this exporter; soft-empty is enough for snapshot UI.
      return json( 200, { items: [] });
    }

    if (kind === "listing-makes") {
      const rows = await sql.query(
        `SELECT make, COUNT(*)::int AS count FROM car_listings
         WHERE COALESCE(is_active, true) = true AND make IS NOT NULL AND make <> ''
         GROUP BY make ORDER BY count DESC`,
      );
      return json( 200, rows);
    }

    if (kind === "listing-sources") {
      const rows = await sql.query(
        `SELECT source, COUNT(*)::int AS count FROM car_listings
         WHERE COALESCE(is_active, true) = true AND source IS NOT NULL AND source <> ''
         GROUP BY source ORDER BY count DESC`,
      );
      return json( 200, rows);
    }

    if (kind === "listings") {
      const rows = await sql.query(
        `SELECT id, source, source_id, url, title, make, model, year, price_lkr,
                mileage, fuel_type, transmission, condition, body_type, district,
                thumbnail_url, is_active, scraped_at, deal_score
         FROM car_listings
         WHERE COALESCE(is_active, true) = true AND id > $1
         ORDER BY id ASC
         LIMIT $2`,
        [cursor, limit],
      );
      const items = rows.map((row) => ({
        id: row.id,
        source: row.source,
        source_id: row.source_id,
        url: row.url,
        detail_url: row.url,
        external_url: row.url,
        title: row.title || "",
        make: row.make || "",
        model: row.model || "",
        year: row.year,
        price_lkr: row.price_lkr != null ? Number(row.price_lkr) : null,
        mileage: row.mileage,
        mileage_km: row.mileage,
        fuel_type: row.fuel_type,
        transmission: row.transmission,
        condition: row.condition,
        body_type: row.body_type,
        district: row.district,
        thumbnail_url: row.thumbnail_url,
        is_active: row.is_active !== false,
        scraped_at: row.scraped_at,
        deal_score: row.deal_score != null ? Number(row.deal_score) : null,
      }));
      const nextCursor = items.length ? items[items.length - 1].id : null;
      return json( 200, {
        items,
        next_cursor: items.length === limit ? nextCursor : null,
        count: items.length,
      });
    }

    return json( 400, { detail: `Unknown kind: ${kind}` });
  } catch (error) {
    return json( 500, {
      detail: "snapshot_export_failed",
      error: String(error && error.message ? error.message : error).slice(0, 300),
    });
  }
}
