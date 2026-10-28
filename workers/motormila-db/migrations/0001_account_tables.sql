-- Motormila account/user tables on Cloudflare D1 (SQLite).
-- Generated from backend/db/models.py via SQLAlchemy create_all, 2026-10-28.
-- D1 is SQLite: same types, same indexes. Postgres-only features: none in these tables.
-- Catalog tables (car_listings, price history, aggregates) are intentionally NOT here:
-- public catalog stays on Pages/R2 snapshots; dealer/my-listings ownership is via dealer_profiles + user rows.

CREATE TABLE platform_users (
	id INTEGER NOT NULL, 
	email VARCHAR(255) NOT NULL, 
	password_hash VARCHAR(255) NOT NULL, 
	name VARCHAR(120) NOT NULL, 
	"plan" VARCHAR(20) NOT NULL, 
	subscription_status VARCHAR(20) NOT NULL, 
	role VARCHAR(20) NOT NULL, 
	is_active BOOLEAN DEFAULT 'true' NOT NULL, 
	token_version INTEGER DEFAULT '0' NOT NULL, 
	invited_by_email VARCHAR(255), 
	last_login_at DATETIME, 
	trial_ends_at DATETIME, 
	email_verified BOOLEAN DEFAULT 'true' NOT NULL, 
	email_verification_token_hash VARCHAR(64), 
	email_verification_expires_at DATETIME, 
	password_reset_token_hash VARCHAR(64), 
	password_reset_expires_at DATETIME, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (email)
);
CREATE INDEX idx_platform_users_email ON platform_users (email);
CREATE INDEX idx_platform_users_role ON platform_users (role);
CREATE INDEX idx_platform_users_plan ON platform_users ("plan");

CREATE TABLE user_invites (
	id INTEGER NOT NULL, 
	email VARCHAR(255) NOT NULL, 
	"plan" VARCHAR(20) NOT NULL, 
	role VARCHAR(20) NOT NULL, 
	token VARCHAR(64) NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	invited_by_email VARCHAR(255), 
	expires_at DATETIME NOT NULL, 
	accepted_at DATETIME, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (token)
);
CREATE INDEX idx_user_invites_status ON user_invites (status);
CREATE INDEX idx_user_invites_email ON user_invites (email);
CREATE INDEX idx_user_invites_token ON user_invites (token);

CREATE TABLE dealer_profiles (
	id INTEGER NOT NULL, 
	claim_token VARCHAR(64) NOT NULL, 
	display_name VARCHAR(120) NOT NULL, 
	contact_phone VARCHAR(32), 
	contact_email VARCHAR(255), 
	seller_name_pattern VARCHAR(120), 
	claimed_url TEXT, 
	status VARCHAR(20) NOT NULL, 
	verified_at DATETIME, 
	"plan" VARCHAR(20) NOT NULL, 
	subscription_status VARCHAR(20) NOT NULL, 
	billing_email VARCHAR(255), 
	current_period_end DATETIME, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (claim_token)
);
CREATE INDEX idx_dealer_profiles_status ON dealer_profiles (status);
CREATE INDEX idx_dealer_profiles_claim_token ON dealer_profiles (claim_token);

CREATE TABLE market_alerts (
	id INTEGER NOT NULL, 
	user_token VARCHAR(36) NOT NULL, 
	make VARCHAR(50), 
	model VARCHAR(100), 
	max_price NUMERIC(15, 2), 
	district VARCHAR(50), 
	notify_phone VARCHAR(32), 
	notify_email VARCHAR(255), 
	notify_telegram_chat_id VARCHAR(64), 
	notify_channels VARCHAR(64), 
	delivery_mode VARCHAR(16), 
	quiet_hours_enabled BOOLEAN, 
	active BOOLEAN NOT NULL, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id)
);
CREATE INDEX idx_market_alerts_user_token ON market_alerts (user_token);
CREATE INDEX idx_market_alerts_active ON market_alerts (active);

CREATE TABLE market_alert_matches (
	id INTEGER NOT NULL, 
	alert_id INTEGER NOT NULL, 
	match_count INTEGER NOT NULL, 
	last_matched_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (alert_id), 
	FOREIGN KEY(alert_id) REFERENCES market_alerts (id)
);
CREATE INDEX idx_market_alert_matches_alert_id ON market_alert_matches (alert_id);

CREATE TABLE push_subscriptions (
	id INTEGER NOT NULL, 
	user_token VARCHAR(64) NOT NULL, 
	endpoint TEXT NOT NULL, 
	p256dh TEXT, 
	auth TEXT, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (endpoint)
);
CREATE INDEX idx_push_subscriptions_user_token ON push_subscriptions (user_token);

CREATE TABLE device_push_tokens (
	id INTEGER NOT NULL, 
	user_token VARCHAR(320) NOT NULL, 
	token VARCHAR(512) NOT NULL, 
	platform VARCHAR(16) NOT NULL, 
	app_version VARCHAR(32), 
	price_drops_enabled BOOLEAN DEFAULT 'true' NOT NULL, 
	watched_listing_ids JSON, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (token)
);
CREATE INDEX idx_device_push_tokens_user_token ON device_push_tokens (user_token);

CREATE TABLE user_notifications (
	id INTEGER NOT NULL, 
	user_token VARCHAR(64) NOT NULL, 
	title VARCHAR(200) NOT NULL, 
	body TEXT, 
	link TEXT, 
	read BOOLEAN DEFAULT 'false' NOT NULL, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id)
);
CREATE INDEX idx_user_notifications_user_token ON user_notifications (user_token);
CREATE INDEX idx_user_notifications_user_token_read ON user_notifications (user_token, read);

CREATE TABLE notification_delivery_log (
	id INTEGER NOT NULL, 
	dedupe_key VARCHAR(180) NOT NULL, 
	alert_id INTEGER, 
	listing_id INTEGER, 
	channel VARCHAR(32), 
	status VARCHAR(20) NOT NULL, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (dedupe_key)
);
CREATE INDEX idx_notification_delivery_log_dedupe ON notification_delivery_log (dedupe_key);
CREATE INDEX idx_notification_delivery_log_alert ON notification_delivery_log (alert_id);

CREATE TABLE user_feedback (
	id INTEGER NOT NULL, 
	category VARCHAR(30) NOT NULL, 
	route TEXT, 
	message TEXT NOT NULL, 
	email VARCHAR(255), 
	user_agent TEXT, 
	status VARCHAR(20) NOT NULL, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id)
);
CREATE INDEX idx_user_feedback_status_created ON user_feedback (status, created_at);

CREATE TABLE billing_webhook_events (
	event_id VARCHAR(120) NOT NULL, 
	email VARCHAR(255), 
	received_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (event_id)
);

CREATE TABLE analytics_events (
	id INTEGER NOT NULL, 
	event VARCHAR(120) NOT NULL, 
	properties JSON, 
	session_id VARCHAR(64), 
	user_email VARCHAR(255), 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id)
);
CREATE INDEX idx_analytics_events_session ON analytics_events (session_id);
CREATE INDEX idx_analytics_events_event_created ON analytics_events (event, created_at);
