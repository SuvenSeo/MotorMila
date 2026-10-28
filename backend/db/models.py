from sqlalchemy import Column, Integer, BigInteger, String, Text, Boolean, Numeric, DateTime, ForeignKey, Index, JSON
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.sql import func


class Base(DeclarativeBase):
    pass

class CarListing(Base):
    __tablename__ = 'car_listings'

    id = Column(Integer, primary_key=True)
    # Legacy column: pointed at the removed raw_listings staging table. Kept in
    # the DB (drops need a real migration) but no longer written or read.
    raw_id = Column(BigInteger, nullable=True)
    source = Column(String(20), nullable=False)
    source_id = Column(String(100), nullable=False)
    scraped_at = Column(DateTime(timezone=True), nullable=False)
    first_seen_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    last_seen_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    # Bumped only when price or live-status meaningfully changes — drives sitemap lastmod.
    content_updated_at = Column(DateTime(timezone=True), nullable=True)
    title = Column(Text)
    url = Column(Text)

    # Vehicle specific fields
    make = Column(String(50), nullable=False)
    model = Column(String(100), nullable=False)
    year = Column(Integer, nullable=True)
    price_lkr = Column(Numeric(15, 2))
    mileage = Column(Integer)  # in km
    fuel_type = Column(String(20))
    transmission = Column(String(20))
    engine_capacity = Column(Integer)  # in cc
    condition = Column(String(20))
    body_type = Column(String(30))
    # cars | motorbikes | vans | ... — set by multi-category scrapers; null = legacy
    vehicle_category = Column(String(40), nullable=True)

    # Location
    raw_location = Column(Text)
    district = Column(String(50))
    city = Column(String(100))
    location_id = Column(BigInteger, ForeignKey('locations.id'))

    # Image & Thumbnails
    thumbnail_url = Column(Text)
    thumbnail_url_cached = Column(Text, nullable=True)
    # JSON array (string) of the listing's full gallery image URLs, as served
    # by the source site. Populated by scrapers that can cheaply enumerate all
    # photos (e.g. ikman's API hands out every image id); NULL/empty means
    # "only thumbnail_url is known". Merge/upsert paths must never overwrite
    # a populated value with NULL (see listing_upsert._UPDATE_SKIP_NULL_KEYS).
    images = Column(Text, nullable=True)
    # Perceptual hash (64-bit pHash, hex-encoded) of the thumbnail image, used
    # to spot the same physical vehicle re-listed with edited specs (year,
    # district, price) that heuristic make/model matching would miss.
    image_phash = Column(String(16), nullable=True)

    # Valuation
    deal_score = Column(Numeric(5, 1))
    market_median_lkr = Column(Numeric(15, 2))
    
    # Flags
    is_outlier = Column(Boolean, default=False)
    outlier_reason = Column(Text)
    is_duplicate = Column(Boolean, default=False)
    duplicate_of = Column(BigInteger, ForeignKey('car_listings.id'))
    # Soft-delete: flipped False by the post-scrape lifecycle pass when the
    # listing stops appearing at its source; flipped back True on re-sight.
    is_active = Column(Boolean, nullable=False, default=True, server_default='true')

    # ── User-submitted listings (sell-your-car) ──────────────────────────
    # owner_user_id is NULL for scraper-fed rows; set when a signed-in user
    # creates a listing. user_listing_status tracks the seller workflow
    # (draft → pending → published / removed). Scraped rows keep 'scraped'.
    owner_user_id = Column(String(64), nullable=True)
    user_listing_status = Column(
        String(20), nullable=False, default='scraped', server_default='scraped'
    )
    contact_name = Column(String(120), nullable=True)
    contact_phone = Column(String(32), nullable=True)
    description = Column(Text, nullable=True)
    user_images = Column(Text, nullable=True)  # JSON array of image URLs

    __table_args__ = (
        Index('idx_car_listings_source_source_id', 'source', 'source_id', unique=True),
        Index('idx_car_listings_make_model', 'make', 'model'),
        Index('idx_car_listings_make_model_district', 'make', 'model', 'district'),
        Index('idx_car_listings_district', 'district'),
        Index('idx_car_listings_price', 'price_lkr'),
        Index('idx_car_listings_active_price', 'is_outlier', 'price_lkr'),
        Index('idx_car_listings_scraped_at', 'scraped_at'),
        Index('idx_car_listings_first_seen_at', 'first_seen_at'),
        Index('idx_car_listings_last_seen_at', 'last_seen_at'),
        Index('idx_car_listings_content_updated_at', 'content_updated_at'),
        Index('idx_car_listings_deal_score', 'deal_score'),
        Index('idx_car_listings_source', 'source'),
        Index(
            'idx_car_listings_live_category_price',
            'is_active',
            'is_outlier',
            'vehicle_category',
            'price_lkr',
        ),
        Index(
            'idx_car_listings_category_first_seen',
            'vehicle_category',
            'first_seen_at',
        ),
    )


def live_listing_filter():
    """Single boolean expression for "count this listing in market views":
    not a statistical outlier AND still live at its source AND not flagged
    as a cross-source duplicate (canonical row carries the signal).

    Composes safely inside filter()/and_()/or_() because it is one expression.
    """
    from sqlalchemy import and_

    return and_(
        CarListing.is_outlier == False,  # noqa: E712
        CarListing.is_active == True,  # noqa: E712
        CarListing.is_duplicate == False,  # noqa: E712
        # User-submitted listings only count once an admin published them
        # (moderation queue); scraped rows carry 'scraped'.
        CarListing.user_listing_status.in_(LIVE_LISTING_STATUSES),
    )


# user_listing_status values that may appear in public market views.
LIVE_LISTING_STATUSES = ("scraped", "published")

class PriceAggregate(Base):
    __tablename__ = 'price_aggregates'

    id = Column(Integer, primary_key=True)
    make = Column(String(50), nullable=False)
    model = Column(String(100), nullable=False)
    year = Column(Integer)
    district = Column(String(50)) # optional for local trends
    
    period_year = Column(Integer, nullable=False)
    period_month = Column(Integer, nullable=False)
    
    median_price_lkr = Column(Numeric(15, 2))
    avg_price_lkr = Column(Numeric(15, 2))
    p25_price_lkr = Column(Numeric(15, 2))
    p75_price_lkr = Column(Numeric(15, 2))
    listing_count = Column(Integer)
    
    computed_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index('idx_price_aggregates_lookup', 'make', 'model', 'year', 'period_year', 'period_month'),
        Index('idx_price_aggregates_scope_period', 'make', 'model', 'district', 'period_year', 'period_month'),
    )

class MarketSignal(Base):
    __tablename__ = 'market_signals'

    id = Column(Integer, primary_key=True)
    source = Column(String(40), nullable=False)
    signal_type = Column(String(60), nullable=False)
    period_year = Column(Integer)
    period_month = Column(Integer)
    metric = Column(String(80), nullable=False)
    category = Column(String(80))
    value_numeric = Column(Numeric(18, 2))
    unit = Column(String(30))
    source_url = Column(Text, nullable=False)
    observed_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    raw_meta = Column(JSON)

    __table_args__ = (
        Index('idx_market_signals_source_type', 'source', 'signal_type'),
        Index('idx_market_signals_period', 'period_year', 'period_month'),
        Index('idx_market_signals_metric_category', 'metric', 'category'),
    )

class ImportPriceSnapshot(Base):
    __tablename__ = 'import_price_snapshots'

    id = Column(Integer, primary_key=True)
    source = Column(String(40), nullable=False)
    source_id = Column(String(100), nullable=False)
    observed_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    url = Column(Text, nullable=False)
    title = Column(Text)
    make = Column(String(50))
    model = Column(String(100))
    year = Column(Integer)
    price_lkr = Column(Numeric(15, 2))
    mileage = Column(Integer)
    fuel_type = Column(String(20))
    transmission = Column(String(20))
    body_type = Column(String(30))
    source_market = Column(String(50))
    raw_meta = Column(JSON)

    __table_args__ = (
        Index('idx_import_price_source_source_id', 'source', 'source_id', unique=True),
        Index('idx_import_price_make_model', 'make', 'model'),
        Index('idx_import_price_observed_at', 'observed_at'),
    )


class HistoricalPriceObservation(Base):
    """Dated asking-price points from archives (Wayback/Common Crawl) or curated past ads.

    Kept separate from live ``car_listings`` so archive rows never poison
    velocity, deal scores, or active inventory views.
    """

    __tablename__ = 'historical_price_observations'

    id = Column(Integer, primary_key=True)
    archive_source = Column(String(40), nullable=False)  # wayback_ikman, wayback_riyasewana, ...
    source_id = Column(String(120), nullable=False)
    observed_at = Column(DateTime(timezone=True), nullable=False)
    url = Column(Text, nullable=False)
    title = Column(Text)
    make = Column(String(50))
    model = Column(String(100))
    year = Column(Integer)
    price_lkr = Column(Numeric(15, 2), nullable=False)
    mileage = Column(Integer)
    district = Column(String(50))
    city = Column(String(100))
    confidence = Column(String(20), nullable=False, server_default='medium')
    raw_meta = Column(JSON)
    ingested_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index(
            'idx_hist_price_archive_source_id_observed',
            'archive_source',
            'source_id',
            'observed_at',
            unique=True,
        ),
        Index('idx_hist_price_make_model_observed', 'make', 'model', 'observed_at'),
        Index('idx_hist_price_observed_at', 'observed_at'),
    )


class Location(Base):
    __tablename__ = 'locations'

    id = Column(Integer, primary_key=True)
    normalized_key = Column(Text, unique=True, nullable=False) # e.g. "colombo|nugegoda"
    district = Column(String(50))
    city = Column(String(100))
    lat = Column(Numeric(9, 6))
    lng = Column(Numeric(9, 6))
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

class ScrapeRun(Base):
    __tablename__ = 'scrape_runs'

    id = Column(Integer, primary_key=True)
    source = Column(String(20), nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=False)
    finished_at = Column(DateTime(timezone=True))
    status = Column(String(10)) # SUCCESS, FAILED
    listings_found = Column(Integer, default=0)
    listings_new = Column(Integer, default=0)
    error_message = Column(Text)

class UserFeedback(Base):
    __tablename__ = 'user_feedback'

    id = Column(Integer, primary_key=True)
    category = Column(String(30), nullable=False, default="general")
    route = Column(Text)
    message = Column(Text, nullable=False)
    email = Column(String(255))
    user_agent = Column(Text)
    status = Column(String(20), nullable=False, default="new")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        Index('idx_user_feedback_status_created', 'status', 'created_at'),
    )


class MarketStatsCache(Base):
    """Key-value materialized cache for heavy aggregate endpoints.

    Rows are upserted by ``cache_key``; ``payload`` holds the JSON blob;
    ``refreshed_at`` is used for TTL checks.  Valid keys: ``summary``,
    ``district_prices``.
    """

    __tablename__ = 'market_stats_cache'

    cache_key = Column(String(80), primary_key=True)
    payload = Column(JSON, nullable=False)
    refreshed_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class MarketAlert(Base):
    __tablename__ = 'market_alerts'

    id = Column(Integer, primary_key=True)
    user_token = Column(String(36), nullable=False)
    make = Column(String(50), nullable=True)
    model = Column(String(100), nullable=True)
    max_price = Column(Numeric(15, 2), nullable=True)
    district = Column(String(50), nullable=True)
    # Optional E.164 / local mobile for Twilio WhatsApp match notifications.
    notify_phone = Column(String(32), nullable=True)
    # Optional email address for email match notifications.
    notify_email = Column(String(255), nullable=True)
    # Optional Telegram chat_id (numeric id or @username) for Telegram notifications.
    notify_telegram_chat_id = Column(String(64), nullable=True)
    # Comma-separated list of channels to notify: "inapp", "whatsapp", "email", "telegram", "push".
    # When null/empty, infer active channels from whichever destination fields are set.
    # "inapp" is always fail-open immediate even when other channels queue.
    notify_channels = Column(String(64), nullable=True)
    # "instant" (default) vs "digest" (07:00 Asia/Colombo daily batch).
    delivery_mode = Column(String(16), nullable=True)
    # When True, external channels (email/whatsapp/telegram/push) queue during
    # quiet hours 21:00-07:00 Asia/Colombo instead of sending immediately.
    quiet_hours_enabled = Column(Boolean, nullable=True)
    active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        Index('idx_market_alerts_user_token', 'user_token'),
        Index('idx_market_alerts_active', 'active'),
    )


class MarketAlertMatch(Base):
    """Persists the most recent alert-match pass result for each active alert.

    Rows are upserted (one row per alert_id) by ``run_alert_match_pass`` after
    every scrape cycle.  ``match_count`` reflects the current live-listing
    count and ``last_matched_at`` records when the pass ran.
    """

    __tablename__ = 'market_alert_matches'

    id = Column(Integer, primary_key=True)
    alert_id = Column(Integer, ForeignKey('market_alerts.id'), nullable=False, unique=True)
    match_count = Column(Integer, nullable=False, default=0)
    last_matched_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        Index('idx_market_alert_matches_alert_id', 'alert_id'),
    )


class ImportTaxConfig(Base):
    __tablename__ = 'import_tax_configs'

    id = Column(Integer, primary_key=True)
    effective_from = Column(DateTime(timezone=True), nullable=False)
    cid_rate = Column(Numeric(5, 4), nullable=False, default=0.20)
    cid_surcharge_rate = Column(Numeric(5, 4), nullable=False, default=0.50)
    sscl_rate = Column(Numeric(5, 4), nullable=False, default=0.025)
    vat_rate = Column(Numeric(5, 4), nullable=False, default=0.18)
    special_levy_2_5 = Column(Boolean, nullable=False, default=True)
    surcharge_50 = Column(Boolean, nullable=False, default=True)
    notes = Column(Text)


class VehiclePermit(Base):
    __tablename__ = 'vehicle_permits'

    id = Column(Integer, primary_key=True)
    permit_name = Column(String(100), nullable=False)
    permit_type = Column(String(50), nullable=False)
    market_price_lkr = Column(Numeric(15, 2), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class VehiclePriceHistory(Base):
    __tablename__ = 'vehicle_price_history'

    id = Column(Integer, primary_key=True)
    vehicle_id = Column(Integer, ForeignKey('car_listings.id', ondelete='CASCADE'), nullable=False)
    price_lkr = Column(Numeric(15, 2), nullable=False)
    scraped_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        Index('idx_vehicle_price_history_lookup', 'vehicle_id', 'scraped_at'),
    )


class DealerProfile(Base):
    """Lightweight claimed dealer yard / seller identity."""

    __tablename__ = "dealer_profiles"

    id = Column(Integer, primary_key=True)
    claim_token = Column(String(64), nullable=False, unique=True)
    display_name = Column(String(120), nullable=False)
    contact_phone = Column(String(32), nullable=True)
    contact_email = Column(String(255), nullable=True)
    seller_name_pattern = Column(String(120), nullable=True)
    claimed_url = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="pending")  # pending | verified
    verified_at = Column(DateTime(timezone=True), nullable=True)
    plan = Column(String(20), nullable=False, default="dealer")  # free | dealer | enterprise
    subscription_status = Column(String(20), nullable=False, default="none")  # none|trialing|active|past_due|canceled
    billing_email = Column(String(255), nullable=True)
    current_period_end = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("idx_dealer_profiles_claim_token", "claim_token"),
        Index("idx_dealer_profiles_status", "status"),
    )


class ImagePhashJob(Base):
    """Background queue for perceptual-hash computation on listing thumbnails."""

    __tablename__ = "image_phash_jobs"

    id = Column(Integer, primary_key=True)
    listing_id = Column(Integer, ForeignKey("car_listings.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(20), nullable=False, default="pending")  # pending | processing | done | failed
    attempts = Column(Integer, nullable=False, default=0)
    last_error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("idx_image_phash_jobs_status", "status", "id"),
        Index("idx_image_phash_jobs_listing", "listing_id"),
    )


class PlatformUser(Base):
    """Invited Motormila accounts (admin-provisioned; not self-serve open signup)."""

    __tablename__ = "platform_users"

    id = Column(Integer, primary_key=True)
    email = Column(String(255), nullable=False, unique=True)
    password_hash = Column(String(255), nullable=False)
    name = Column(String(120), nullable=False)
    plan = Column(String(20), nullable=False, default="free")  # free | pro | enterprise
    subscription_status = Column(String(20), nullable=False, default="none")
    role = Column(String(20), nullable=False, default="user")  # user | admin
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
    # Bumped on logout / plan-role-active changes to invalidate outstanding JWTs.
    token_version = Column(Integer, nullable=False, default=0, server_default="0")
    invited_by_email = Column(String(255), nullable=True)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    # Self-serve trial expiry (SELF_SIGNUP trialing). Null = no trial / legacy rows.
    trial_ends_at = Column(DateTime(timezone=True), nullable=True)
    # Mailbox ownership. Defaults TRUE so pre-existing rows, invite signups and
    # AUTH_USERS bootstrap accounts stay verified; only self-signup writes FALSE.
    email_verified = Column(Boolean, nullable=False, default=True, server_default="true")
    # Single-use email tokens: only the SHA-256 hex digest is stored.
    email_verification_token_hash = Column(String(64), nullable=True)
    email_verification_expires_at = Column(DateTime(timezone=True), nullable=True)
    password_reset_token_hash = Column(String(64), nullable=True)
    password_reset_expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("idx_platform_users_email", "email"),
        Index("idx_platform_users_plan", "plan"),
        Index("idx_platform_users_role", "role"),
    )


class UserInvite(Base):
    """Admin-issued email invites. Signup requires a valid pending invite token."""

    __tablename__ = "user_invites"

    id = Column(Integer, primary_key=True)
    email = Column(String(255), nullable=False)
    plan = Column(String(20), nullable=False, default="free")  # free | pro | enterprise
    role = Column(String(20), nullable=False, default="user")  # user | admin
    token = Column(String(64), nullable=False, unique=True)
    status = Column(String(20), nullable=False, default="pending")  # pending | accepted | revoked
    invited_by_email = Column(String(255), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    accepted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        Index("idx_user_invites_email", "email"),
        Index("idx_user_invites_token", "token"),
        Index("idx_user_invites_status", "status"),
    )


class PushSubscription(Base):
    """Web-push subscription for one user_token (VAPID, fail-open to in-app)."""

    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True)
    user_token = Column(String(64), nullable=False)
    endpoint = Column(Text, nullable=False, unique=True)
    p256dh = Column(Text, nullable=True)
    auth = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        Index("idx_push_subscriptions_user_token", "user_token"),
    )


class DevicePushToken(Base):
    """Native (FCM) push token for one signed-in account on one device.

    Upserted by POST /notifications/devices (token is globally unique: a
    re-login on the same device re-binds it to the new account). Pruned when
    FCM reports the token UNREGISTERED / invalid. ``watched_listing_ids`` is a
    JSON list of the device's local watchlist so price drops on watched
    listings can be pushed even though the watchlist itself is device-local.
    """

    __tablename__ = "device_push_tokens"

    id = Column(Integer, primary_key=True)
    user_token = Column(String(320), nullable=False)
    token = Column(String(512), nullable=False, unique=True)
    platform = Column(String(16), nullable=False, default="android")
    app_version = Column(String(32), nullable=True)
    price_drops_enabled = Column(Boolean, nullable=False, default=True, server_default="true")
    watched_listing_ids = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        Index("idx_device_push_tokens_user_token", "user_token"),
    )


class NotificationDeliveryLog(Base):
    """Receipt log for channel delivery with dedupe key alert_id:listing_id:channel."""

    __tablename__ = "notification_delivery_log"

    id = Column(Integer, primary_key=True)
    dedupe_key = Column(String(180), nullable=False, unique=True)
    alert_id = Column(Integer, nullable=True)
    listing_id = Column(Integer, nullable=True)
    channel = Column(String(32), nullable=True)
    status = Column(String(20), nullable=False, default="sent")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        Index("idx_notification_delivery_log_dedupe", "dedupe_key"),
        Index("idx_notification_delivery_log_alert", "alert_id"),
    )


class UserNotification(Base):
    """In-app notification row created when an alert match fires or other system events occur."""

    __tablename__ = "user_notifications"

    id = Column(Integer, primary_key=True)
    user_token = Column(String(64), nullable=False)
    title = Column(String(200), nullable=False)
    body = Column(Text, nullable=True)
    link = Column(Text, nullable=True)
    read = Column(Boolean, nullable=False, default=False, server_default="false")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        Index("idx_user_notifications_user_token", "user_token"),
        Index("idx_user_notifications_user_token_read", "user_token", "read"),
    )


class AnalyticsEvent(Base):
    """Append-only product analytics events from the frontend (and backend).

    Intentionally lightweight — no PII required, properties is a JSON blob.
    The table is write-heavy and read-rarely; keep indexes minimal.
    """

    __tablename__ = "analytics_events"

    id = Column(Integer, primary_key=True)
    event = Column(String(120), nullable=False)
    properties = Column(JSON, nullable=True)
    session_id = Column(String(64), nullable=True)
    user_email = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        Index("idx_analytics_events_event_created", "event", "created_at"),
        Index("idx_analytics_events_session", "session_id"),
    )


class ProviderSyncRun(Base):
    """One ingest/refresh attempt for a third-party enrichment provider.

    Used for admin health, retries, and checksum/traceability. Never stores
    API keys — only provider id, status, row counts, and a payload checksum.
    """

    __tablename__ = "provider_sync_runs"

    id = Column(Integer, primary_key=True)
    provider = Column(String(40), nullable=False)
    status = Column(String(20), nullable=False)  # running, success, partial, failed
    rows = Column(Integer, nullable=True)
    failures = Column(Integer, nullable=True)
    checksum = Column(String(128), nullable=True)
    error_message = Column(Text, nullable=True)
    details = Column(JSON, nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    ended_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("idx_provider_sync_runs_provider_started", "provider", "started_at"),
        Index("idx_provider_sync_runs_started_at", "started_at"),
    )


class VehicleCatalogMatch(Base):
    """Traceable mapping from a MotorMila vehicle key to an external catalog id."""

    __tablename__ = "vehicle_catalog_matches"

    id = Column(Integer, primary_key=True)
    vehicle_key = Column(String(180), nullable=False)
    provider = Column(String(40), nullable=False)
    provider_vehicle_id = Column(String(80), nullable=True)
    match_confidence = Column(Numeric(5, 4), nullable=True)
    matched_attributes = Column(JSON, nullable=True)
    fetched_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        Index("idx_vehicle_catalog_matches_key_provider", "vehicle_key", "provider", unique=True),
    )


class VehicleSafetySnapshot(Base):
    """Cached NHTSA safety-research card for a canonical vehicle key."""

    __tablename__ = "vehicle_safety_snapshots"

    vehicle_key = Column(String(180), primary_key=True)
    provider = Column(String(40), nullable=False, default="nhtsa")
    payload = Column(JSON, nullable=False)
    source_version = Column(String(80), nullable=True)
    refreshed_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        Index("idx_vehicle_safety_snapshots_refreshed", "refreshed_at"),
    )


class VehicleReliabilitySnapshot(Base):
    """Weekly ProblemsByVin reliability / known-issues snapshot."""

    __tablename__ = "vehicle_reliability_snapshots"

    vehicle_key = Column(String(180), primary_key=True)
    provider = Column(String(40), nullable=False, default="problemsbyvin")
    payload = Column(JSON, nullable=False)
    source_version = Column(String(80), nullable=True)
    checksum = Column(String(128), nullable=True)
    refreshed_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        Index("idx_vehicle_reliability_snapshots_refreshed", "refreshed_at"),
    )


class ChargePoint(Base):
    """Cached Open Charge Map POI for Sri Lanka charger search."""

    __tablename__ = "charge_points"

    ocm_id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=True)
    operator = Column(String(120), nullable=True)
    address = Column(Text, nullable=True)
    town = Column(String(100), nullable=True)
    lat = Column(Numeric(9, 6), nullable=False)
    lng = Column(Numeric(9, 6), nullable=False)
    status = Column(String(40), nullable=True)
    connectors = Column(JSON, nullable=True)
    power_kw = Column(Numeric(8, 2), nullable=True)
    data_provider = Column(String(200), nullable=True)
    license_note = Column(String(200), nullable=True)
    attribution = Column(Text, nullable=True)
    source_updated_at = Column(String(40), nullable=True)
    refreshed_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        Index("idx_charge_points_lat_lng", "lat", "lng"),
        Index("idx_charge_points_town", "town"),
    )


class ListingGeoEnrichment(Base):
    """Geocoded ad-location pin. Never written onto car_listings.raw_location."""

    __tablename__ = "listing_geo_enrichment"

    listing_id = Column(Integer, primary_key=True)
    provider = Column(String(40), nullable=False, default="geoapify")
    source_location_hash = Column(String(64), nullable=False)
    lat = Column(Numeric(9, 6), nullable=True)
    lng = Column(Numeric(9, 6), nullable=True)
    formatted_address = Column(Text, nullable=True)
    result_type = Column(String(40), nullable=True)
    match_confidence = Column(Numeric(5, 4), nullable=True)
    payload = Column(JSON, nullable=True)
    source_url = Column(Text, nullable=True)
    fetched_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        Index("idx_listing_geo_hash", "source_location_hash"),
        Index("idx_listing_geo_fetched", "fetched_at"),
    )


class BillingWebhookEvent(Base):
    """Processed billing-webhook event ids (replay protection / idempotency)."""

    __tablename__ = "billing_webhook_events"

    event_id = Column(String(120), primary_key=True)
    email = Column(String(255), nullable=True)
    received_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
