// Internal one-page ikman scrape for cloud-agent / ops recovery.
// Auth: same SNAPSHOT_EXPORT_SECRET as api/internal-snapshot-export.js
//
// GET /api/internal-scrape?source=ikman&category=392&page=1&token=…
// Optional: next_page_token=
//
// Hobby plan timeouts are short — scrape ONE SERP page per invocation.
// The caller loops pages.

import { neon } from "@neondatabase/serverless";
const IKMAN_API = "https://api.ikman.lk";
const SOURCE = "ikman";
const CATEGORY_SLUGS = {
  392: "cars",
  402: "motorbikes",
  911: "three-wheelers",
  424: "vans",
  425: "buses",
  426: "lorries",
  918: "heavy-duty",
  919: "tractors",
  603: "bicycles",
  925: "boats",
};

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

function parsePrice(raw) {
  const digits = String(raw || "").replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n >= 100000 ? n : null;
}

function parseMileage(value) {
  const text = String(value || "");
  const m = text.replace(/,/g, "").match(/(\d+)\s*(km|kms)?/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 && n < 2_000_000 ? n : null;
}

function propertiesMap(row) {
  const props = {};
  const list = Array.isArray(row.properties) ? row.properties : [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const key = String(item.key || item.slug || item.name || "").trim().toLowerCase();
    const val = String(item.value || item.value_name || "").trim();
    if (key && val) props[key] = val;
  }
  return props;
}

function normalizeUrl(rawUrl, slug) {
  let url = String(rawUrl || "").trim();
  if (!url && slug) url = `https://ikman.lk/en/ad/${slug}`;
  if (!url) return "";
  if (url.startsWith("/")) url = `https://ikman.lk${url}`;
  if (!/^https?:\/\//i.test(url)) url = `https://ikman.lk/${url.replace(/^\/+/, "")}`;
  return url.split("?")[0];
}

function thumbnailFromImages(row) {
  const images = Array.isArray(row.images) ? row.images : [];
  for (const img of images) {
    if (typeof img === "string" && img.startsWith("http")) return img;
    if (img && typeof img === "object") {
      const cand = img.thumb || img.url || img.href || img.src;
      if (typeof cand === "string" && cand.startsWith("http")) return cand;
    }
  }
  return null;
}

function guessMakeModel(title) {
  const parts = String(title || "").trim().split(/\s+/);
  if (parts.length < 2) return { make: parts[0] || "", model: "Other" };
  return { make: parts[0], model: parts[1] || "Other" };
}

function buildPayload(row, categoryId) {
  const listingUrl = normalizeUrl(row.url, row.slug);
  if (!listingUrl) return null;
  const title = String(row.title || "").trim();
  if (!title) return null;
  const money = row.money && typeof row.money === "object" ? row.money : {};
  const price = parsePrice(money.amount || row.info);
  if (!price) return null;

  const props = propertiesMap(row);
  const guessed = guessMakeModel(title);
  const make = String(props.brand || guessed.make || "").trim();
  const model = String(props.model || guessed.model || "Other").trim() || "Other";
  if (!make) return null;

  let year = null;
  const yearRaw = props.model_year || props.year;
  if (yearRaw) {
    const y = Number(String(yearRaw).replace(/[^\d]/g, "").slice(0, 4));
    if (y >= 1950 && y <= 2100) year = y;
  }

  const area = row.area && typeof row.area === "object" ? row.area : {};
  const location = row.location && typeof row.location === "object" ? row.location : {};
  const district = String(area.name || location.name || "Sri Lanka").trim() || "Sri Lanka";
  const city = String(location.name || "").trim() || null;

  return {
    source_id: listingUrl.slice(0, 100),
    title: title.slice(0, 500),
    make: make.slice(0, 50),
    model: model.slice(0, 100),
    year,
    price_lkr: price,
    url: listingUrl,
    thumbnail_url: thumbnailFromImages(row),
    district: district.slice(0, 50),
    city: city ? city.slice(0, 100) : null,
    mileage: parseMileage(props.mileage),
    fuel_type: props.fuel_type ? String(props.fuel_type).slice(0, 20) : null,
    transmission: props.transmission ? String(props.transmission).slice(0, 20) : null,
    body_type: props.body ? String(props.body).slice(0, 30) : null,
    condition: props.condition ? String(props.condition).slice(0, 20) : null,
    vehicle_category: CATEGORY_SLUGS[categoryId] || "cars",
  };
}

async function upsertListing(sql, payload) {
  const now = new Date().toISOString();
  const existing = await sql.query(
    `SELECT id, price_lkr FROM car_listings WHERE source = $1 AND source_id = $2 LIMIT 1`,
    [SOURCE, payload.source_id],
  );
  if (existing.length) {
    await sql.query(
      `UPDATE car_listings SET
         title = $1, make = $2, model = $3, year = $4, price_lkr = $5, url = $6,
         thumbnail_url = COALESCE($7, thumbnail_url), district = $8, city = $9,
         mileage = COALESCE($10, mileage), fuel_type = COALESCE($11, fuel_type),
         transmission = COALESCE($12, transmission), body_type = COALESCE($13, body_type),
         condition = COALESCE($14, condition), vehicle_category = COALESCE($15, vehicle_category),
         scraped_at = $16::timestamptz, last_seen_at = $16::timestamptz, is_active = true
       WHERE id = $17`,
      [
        payload.title,
        payload.make,
        payload.model,
        payload.year,
        payload.price_lkr,
        payload.url,
        payload.thumbnail_url,
        payload.district,
        payload.city,
        payload.mileage,
        payload.fuel_type,
        payload.transmission,
        payload.body_type,
        payload.condition,
        payload.vehicle_category,
        now,
        existing[0].id,
      ],
    );
    return "updated";
  }

  await sql.query(
    `INSERT INTO car_listings (
       source, source_id, title, make, model, year, price_lkr, url, thumbnail_url,
       district, city, mileage, fuel_type, transmission, body_type, condition,
       vehicle_category, scraped_at, first_seen_at, last_seen_at, is_active
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
       $18::timestamptz,$18::timestamptz,$18::timestamptz,true
     )`,
    [
      SOURCE,
      payload.source_id,
      payload.title,
      payload.make,
      payload.model,
      payload.year,
      payload.price_lkr,
      payload.url,
      payload.thumbnail_url,
      payload.district,
      payload.city,
      payload.mileage,
      payload.fuel_type,
      payload.transmission,
      payload.body_type,
      payload.condition,
      payload.vehicle_category,
      now,
    ],
  );
  return "inserted";
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "GET" && request.method !== "POST") {
    return json( 405, { detail: "GET or POST only" });
  }
  if (!authorized(request, env)) {
    return json( 401, { detail: "Unauthorized" });
  }

  const url = new URL(request.url);
  const source = String(url.searchParams.get("source") || "ikman").trim().toLowerCase();
  if (source !== "ikman") {
    return json( 400, { detail: "Only source=ikman supported in this endpoint" });
  }
  const category = Math.max(1, Number(url.searchParams.get("category") || 392) || 392);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const nextPageToken = String(url.searchParams.get("next_page_token") || "").trim() || null;

  const connectionString = dbUrl(env);
  if (!connectionString || connectionString === "[SENSITIVE]") {
    return json( 500, { detail: "No database URL configured on this deployment" });
  }

  let serpPayload;
  try {
    const params = new URLSearchParams({
      category: String(category),
      page: String(page),
      sort: "date",
      order: "desc",
    });
    if (nextPageToken) params.set("next_page_token", nextPageToken);
    const response = await fetch(`${IKMAN_API}/v1/serp?${params}`, {
      headers: {
        Accept: "application/json",
        Application: "web",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!response.ok) {
      return json( 502, {
        detail: "ikman_serp_failed",
        status: response.status,
        body: (await response.text()).slice(0, 300),
      });
    }
    serpPayload = await response.json();
  } catch (error) {
    return json( 502, {
      detail: "ikman_fetch_error",
      error: String(error && error.message ? error.message : error).slice(0, 300),
    });
  }

  const serp = serpPayload && typeof serpPayload.serp === "object" ? serpPayload.serp : {};
  const results = Array.isArray(serp.results) ? serp.results : [];
  const pagination =
    serpPayload && typeof serpPayload.pagination === "object" ? serpPayload.pagination : {};
  const token = String(pagination.next_page_token || "").trim() || null;

  const sql = neon(connectionString);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];

  try {
        for (const row of results) {
      if (!row || typeof row !== "object") {
        skipped += 1;
        continue;
      }
      const payload = buildPayload(row, category);
      if (!payload) {
        skipped += 1;
        continue;
      }
      try {
        const action = await upsertListing(sql, payload);
        if (action === "inserted") inserted += 1;
        else updated += 1;
      } catch (error) {
        skipped += 1;
        if (errors.length < 5) {
          errors.push(String(error && error.message ? error.message : error).slice(0, 160));
        }
      }
    }
  } catch (error) {
    return json( 500, {
      detail: "scrape_db_failed",
      error: String(error && error.message ? error.message : error).slice(0, 300),
    });
  }

  return json( 200, {
    source,
    category,
    page,
    result_count: results.length,
    inserted,
    updated,
    skipped,
    next_page_token: token,
    errors,
    generated_at: new Date().toISOString(),
  });
}
