/**
 * motormila-db — Cloudflare Worker data service for Motormila's account/user tables.
 *
 * What this is, and what it is NOT:
 * - It is a storage service for the 12 account/user tables in D1
 *   (platform_users, user_invites, dealer_profiles, market_alerts,
 *   market_alert_matches, push_subscriptions, device_push_tokens,
 *   user_notifications, notification_delivery_log, user_feedback,
 *   billing_webhook_events, analytics_events).
 * - It is NOT an auth service. Passwords are bcrypt (rounds=12) and tokens
 *   are HMAC-SHA256 in the Python backend, and Workers Free allows only
 *   10 ms of CPU per invocation — bcrypt in a Worker would blow that budget
 *   and need Workers Paid ($5/mo). So password checking, token signing and
 *   all auth logic stay in the Python backend; this Worker only stores and
 *   returns rows, to an authenticated caller, with parameterized queries.
 *   No arbitrary SQL is ever accepted: every operation is a fixed query
 *   with an allowlisted field list.
 * - Catalog listings, price history and aggregates are NOT here. Public
 *   catalog stays on Pages/R2 snapshots, which is why D1's daily row caps
 *   are not hit by public traffic.
 *
 * Auth: every request must carry `X-Motormila-Db-Key: <DB_SERVICE_KEY>`.
 * That key is a Worker secret, never committed. The Python backend calls
 * this Worker (or the D1 HTTP API directly, see backend/app/db/d1_client.py)
 * with the same key; browsers and the public never call it.
 *
 * Deploy: `wrangler deploy` with the D1 binding in wrangler.toml.
 * D1 database: motormila-accounts (created 2026-10-28, see migrations/).
 */

export interface Env {
  DB: D1Database;
  DB_SERVICE_KEY: string;
}

type Row = Record<string, unknown>;

const USER_FIELDS = [
  "id", "email", "password_hash", "name", "plan", "subscription_status",
  "role", "is_active", "token_version", "invited_by_email", "last_login_at",
  "trial_ends_at", "email_verified", "email_verification_token_hash",
  "email_verification_expires_at", "password_reset_token_hash",
  "password_reset_expires_at", "created_at", "updated_at",
] as const;

const USER_WRITABLE = [
  "password_hash", "name", "plan", "subscription_status", "role",
  "is_active", "token_version", "invited_by_email", "last_login_at",
  "trial_ends_at", "email_verified", "email_verification_token_hash",
  "email_verification_expires_at", "password_reset_token_hash",
  "password_reset_expires_at",
] as const;

const ALERT_WRITABLE = [
  "make", "model", "max_price", "district", "notify_phone", "notify_email",
  "notify_telegram_chat_id", "notify_channels", "delivery_mode",
  "quiet_hours_enabled", "active",
] as const;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function pick(row: Row | null, fields: readonly string[]): Row | null {
  if (!row) return null;
  const out: Row = {};
  for (const f of fields) out[f] = row[f] ?? null;
  return out;
}

function updateSet(body: Row, allowed: readonly string[]): { set: string; vals: unknown[] } {
  const parts: string[] = [];
  const vals: unknown[] = [];
  for (const f of allowed) {
    if (body[f] !== undefined) {
      parts.push(`${f} = ?`);
      vals.push(body[f]);
    }
  }
  parts.push("updated_at = CURRENT_TIMESTAMP");
  return { set: parts.join(", "), vals };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return json({ ok: true, service: "motormila-db", tables: 12 });
    }
    if (request.headers.get("X-Motormila-Db-Key") !== env.DB_SERVICE_KEY) {
      return json({ detail: "Unauthorized" }, 401);
    }
    let body: Row = {};
    try {
      body = (await request.json()) as Row;
    } catch {
      body = {};
    }
    const db = env.DB;

    // --- users ---
    if (url.pathname === "/users/by-email" && request.method === "POST") {
      const row = await db
        .prepare(`SELECT ${USER_FIELDS.join(", ")} FROM platform_users WHERE email = ?`)
        .bind(String(body.email || "").toLowerCase())
        .first<Row>();
      return json({ user: pick(row, USER_FIELDS) });
    }
    if (url.pathname === "/users/upsert" && request.method === "POST") {
      const email = String(body.email || "").toLowerCase();
      const existing = await db
        .prepare("SELECT id FROM platform_users WHERE email = ?")
        .bind(email)
        .first<Row>();
      if (existing) {
        const { set, vals } = updateSet(body, USER_WRITABLE);
        await db.prepare(`UPDATE platform_users SET ${set} WHERE email = ?`).bind(...vals, email).run();
      } else {
        await db
          .prepare(
            `INSERT INTO platform_users (email, password_hash, name, plan, subscription_status, role, is_active, token_version, invited_by_email, last_login_at, trial_ends_at, email_verified, email_verification_token_hash, email_verification_expires_at, password_reset_token_hash, password_reset_expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            email, body.password_hash ?? "", body.name ?? "", body.plan ?? "free",
            body.subscription_status ?? "none", body.role ?? "user",
            body.is_active ?? 1, body.token_version ?? 0, body.invited_by_email ?? null,
            body.last_login_at ?? null, body.trial_ends_at ?? null, body.email_verified ?? 1,
            body.email_verification_token_hash ?? null, body.email_verification_expires_at ?? null,
            body.password_reset_token_hash ?? null, body.password_reset_expires_at ?? null
          )
          .run();
      }
      const row = await db
        .prepare(`SELECT ${USER_FIELDS.join(", ")} FROM platform_users WHERE email = ?`)
        .bind(email)
        .first<Row>();
      return json({ user: pick(row, USER_FIELDS) });
    }
    if (url.pathname === "/users/bump-token-version" && request.method === "POST") {
      await db
        .prepare("UPDATE platform_users SET token_version = token_version + 1, updated_at = CURRENT_TIMESTAMP WHERE email = ?")
        .bind(String(body.email || "").toLowerCase())
        .run();
      return json({ ok: true });
    }

    // --- invites ---
    if (url.pathname === "/invites/by-token" && request.method === "POST") {
      const row = await db
        .prepare("SELECT * FROM user_invites WHERE token = ?")
        .bind(String(body.token || ""))
        .first<Row>();
      return json({ invite: row ?? null });
    }
    if (url.pathname === "/invites/create" && request.method === "POST") {
      const r = await db
        .prepare("INSERT INTO user_invites (email, plan, role, token, status, invited_by_email, expires_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)")
        .bind(String(body.email || "").toLowerCase(), body.plan ?? "free", body.role ?? "user", body.token ?? "", body.invited_by_email ?? null, body.expires_at ?? null)
        .run();
      return json({ id: r.meta.last_row_id });
    }
    if (url.pathname === "/invites/update" && request.method === "POST") {
      await db
        .prepare("UPDATE user_invites SET status = ?, accepted_at = ? WHERE token = ?")
        .bind(body.status ?? "pending", body.accepted_at ?? null, String(body.token || ""))
        .run();
      return json({ ok: true });
    }

    // --- alerts ---
    if (url.pathname === "/alerts/by-user" && request.method === "POST") {
      const { results } = await db
        .prepare("SELECT * FROM market_alerts WHERE user_token = ? ORDER BY id DESC")
        .bind(String(body.user_token || ""))
        .all<Row>();
      return json({ alerts: results });
    }
    if (url.pathname === "/alerts/create" && request.method === "POST") {
      const cols = ["user_token", ...ALERT_WRITABLE];
      const vals = cols.map((c) => (body as Row)[c] ?? null);
      const r = await db
        .prepare(`INSERT INTO market_alerts (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`)
        .bind(...vals)
        .run();
      return json({ id: r.meta.last_row_id });
    }
    if (url.pathname === "/alerts/update" && request.method === "POST") {
      const { set, vals } = updateSet(body, ALERT_WRITABLE);
      await db.prepare(`UPDATE market_alerts SET ${set} WHERE id = ?`).bind(...vals, body.id).run();
      return json({ ok: true });
    }
    if (url.pathname === "/alerts/delete" && request.method === "POST") {
      await db.prepare("DELETE FROM market_alerts WHERE id = ?").bind(body.id).run();
      return json({ ok: true });
    }
    if (url.pathname === "/alerts/active" && request.method === "POST") {
      const { results } = await db
        .prepare("SELECT * FROM market_alerts WHERE active = 1 ORDER BY id")
        .all<Row>();
      return json({ alerts: results });
    }
    if (url.pathname === "/alerts/match-upsert" && request.method === "POST") {
      await db
        .prepare("INSERT INTO market_alert_matches (alert_id, match_count) VALUES (?, ?) ON CONFLICT(alert_id) DO UPDATE SET match_count = excluded.match_count, last_matched_at = CURRENT_TIMESTAMP")
        .bind(body.alert_id, body.match_count ?? 0)
        .run();
      return json({ ok: true });
    }

    // --- notifications ---
    if (url.pathname === "/notifications/by-user" && request.method === "POST") {
      const { results } = await db
        .prepare("SELECT * FROM user_notifications WHERE user_token = ? ORDER BY id DESC LIMIT 100")
        .bind(String(body.user_token || ""))
        .all<Row>();
      return json({ notifications: results });
    }
    if (url.pathname === "/notifications/create" && request.method === "POST") {
      const r = await db
        .prepare("INSERT INTO user_notifications (user_token, title, body, link) VALUES (?, ?, ?, ?)")
        .bind(String(body.user_token || ""), body.title ?? "", body.body ?? null, body.link ?? null)
        .run();
      return json({ id: r.meta.last_row_id });
    }
    if (url.pathname === "/notifications/mark-read" && request.method === "POST") {
      await db.prepare("UPDATE user_notifications SET read = 1 WHERE id = ?").bind(body.id).run();
      return json({ ok: true });
    }
    if (url.pathname === "/notifications/mark-all-read" && request.method === "POST") {
      await db.prepare("UPDATE user_notifications SET read = 1 WHERE user_token = ?").bind(String(body.user_token || "")).run();
      return json({ ok: true });
    }
    if (url.pathname === "/notifications/delivery-log" && request.method === "POST") {
      await db
        .prepare("INSERT OR IGNORE INTO notification_delivery_log (dedupe_key, alert_id, listing_id, channel, status) VALUES (?, ?, ?, ?, ?)")
        .bind(body.dedupe_key ?? "", body.alert_id ?? null, body.listing_id ?? null, body.channel ?? null, body.status ?? "sent")
        .run();
      return json({ ok: true });
    }

    // --- dealer ---
    if (url.pathname === "/dealer/by-claim-token" && request.method === "POST") {
      const row = await db.prepare("SELECT * FROM dealer_profiles WHERE claim_token = ?").bind(String(body.claim_token || "")).first<Row>();
      return json({ dealer: row ?? null });
    }
    if (url.pathname === "/dealer/upsert" && request.method === "POST") {
      const existing = await db.prepare("SELECT id FROM dealer_profiles WHERE claim_token = ?").bind(String(body.claim_token || "")).first<Row>();
      if (existing) {
        await db.prepare("UPDATE dealer_profiles SET display_name = ?, contact_phone = ?, contact_email = ?, seller_name_pattern = ?, claimed_url = ?, status = ?, verified_at = ?, plan = ?, subscription_status = ?, billing_email = ?, current_period_end = ?, updated_at = CURRENT_TIMESTAMP WHERE claim_token = ?")
          .bind(body.display_name ?? "", body.contact_phone ?? null, body.contact_email ?? null, body.seller_name_pattern ?? null, body.claimed_url ?? null, body.status ?? "pending", body.verified_at ?? null, body.plan ?? "dealer", body.subscription_status ?? "none", body.billing_email ?? null, body.current_period_end ?? null, String(body.claim_token || "")).run();
      } else {
        await db.prepare("INSERT INTO dealer_profiles (claim_token, display_name, contact_phone, contact_email, seller_name_pattern, claimed_url, status, verified_at, plan, subscription_status, billing_email, current_period_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(String(body.claim_token || ""), body.display_name ?? "", body.contact_phone ?? null, body.contact_email ?? null, body.seller_name_pattern ?? null, body.claimed_url ?? null, body.status ?? "pending", body.verified_at ?? null, body.plan ?? "dealer", body.subscription_status ?? "none", body.billing_email ?? null, body.current_period_end ?? null).run();
      }
      return json({ ok: true });
    }

    // --- feedback / billing / analytics / push ---
    if (url.pathname === "/feedback/create" && request.method === "POST") {
      const r = await db.prepare("INSERT INTO user_feedback (category, route, message, email, user_agent, status) VALUES (?, ?, ?, ?, ?, 'new')").bind(body.category ?? null, body.route ?? null, body.message ?? "", body.email ?? null, body.user_agent ?? null).run();
      return json({ id: r.meta.last_row_id });
    }
    if (url.pathname === "/billing/event-seen" && request.method === "POST") {
      const row = await db.prepare("SELECT event_id FROM billing_webhook_events WHERE event_id = ?").bind(String(body.event_id || "")).first<Row>();
      return json({ seen: Boolean(row) });
    }
    if (url.pathname === "/billing/event-mark" && request.method === "POST") {
      await db.prepare("INSERT OR IGNORE INTO billing_webhook_events (event_id, email) VALUES (?, ?)").bind(String(body.event_id || ""), body.email ?? null).run();
      return json({ ok: true });
    }
    if (url.pathname === "/analytics/create" && request.method === "POST") {
      await db.prepare("INSERT INTO analytics_events (event, properties, session_id, user_email) VALUES (?, ?, ?, ?)").bind(body.event ?? "", body.properties ? JSON.stringify(body.properties) : null, body.session_id ?? null, body.user_email ?? null).run();
      return json({ ok: true });
    }
    if (url.pathname === "/push/subscribe" && request.method === "POST") {
      await db.prepare("INSERT OR REPLACE INTO push_subscriptions (user_token, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)").bind(String(body.user_token || ""), body.endpoint ?? "", body.p256dh ?? null, body.auth ?? null).run();
      return json({ ok: true });
    }
    if (url.pathname === "/push/unsubscribe" && request.method === "POST") {
      await db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(body.endpoint ?? "").run();
      return json({ ok: true });
    }
    if (url.pathname === "/devices/upsert" && request.method === "POST") {
      await db.prepare("INSERT INTO device_push_tokens (user_token, token, platform, app_version, price_drops_enabled, watched_listing_ids) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(token) DO UPDATE SET user_token = excluded.user_token, platform = excluded.platform, app_version = excluded.app_version, price_drops_enabled = excluded.price_drops_enabled, watched_listing_ids = excluded.watched_listing_ids, updated_at = CURRENT_TIMESTAMP")
        .bind(String(body.user_token || ""), body.token ?? "", body.platform ?? "android", body.app_version ?? null, body.price_drops_enabled ?? 1, body.watched_listing_ids ? JSON.stringify(body.watched_listing_ids) : null).run();
      return json({ ok: true });
    }
    if (url.pathname === "/devices/delete" && request.method === "POST") {
      await db.prepare("DELETE FROM device_push_tokens WHERE token = ?").bind(body.token ?? "").run();
      return json({ ok: true });
    }

    return json({ detail: "Not Found" }, 404);
  },
};
