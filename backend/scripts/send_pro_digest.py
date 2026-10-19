#!/usr/bin/env python3
"""Weekly Pro email digest for Motormila.

Builds an HTML summary of market activity (top vehicle lanes, hot deals, and
active alert counts) and either:

* **Dry-run** (default) — pretty-prints the HTML to stdout so the CI log
  captures it for review without sending anything.
* **Live send** — posts the email via SendGrid if both ``SENDGRID_API_KEY``
  and ``DIGEST_RECIPIENTS`` (comma-separated) are set.

Typical CI invocation (dry-run)::

    python scripts/send_pro_digest.py --dry-run

Live send (set secrets in the environment)::

    SENDGRID_API_KEY=SG.xxx DIGEST_RECIPIENTS=a@b.com,c@d.com \
        python scripts/send_pro_digest.py

Pro users are read from ``AUTH_USERS`` env-var JSON (same source as the auth
module).  The digest is addressed to users whose plan is "pro" or "enterprise"
and whose subscription_status is "active" or "trialing", falling back to
``DIGEST_RECIPIENTS`` if ``AUTH_USERS`` is not set.
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import sys
import textwrap
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

sys.path.append(str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine, desc, func
from sqlalchemy.orm import Session, sessionmaker

from db.models import CarListing, MarketAlert, MarketAlertMatch, live_listing_filter

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SENDGRID_SEND_URL = "https://api.sendgrid.com/v3/mail/send"
DIGEST_FROM_EMAIL = os.getenv("DIGEST_FROM_EMAIL", "noreply@motormila.lk")
DIGEST_FROM_NAME = os.getenv("DIGEST_FROM_NAME", "Motormila")
DIGEST_SUBJECT = os.getenv("DIGEST_SUBJECT", "Motormila Pro — Weekly Market Digest")

PRO_PLANS = {"pro", "enterprise"}
ACTIVE_STATUSES = {"active", "trialing"}

MIN_REASONABLE_PRICE_LKR = 100_000
TOP_LANES_LIMIT = 10
HOT_DEALS_LIMIT = 5

# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------


def _db_session() -> Session:
    url = (
        os.getenv("HOT_DATABASE_URL")
        or os.getenv("COLD_DATABASE_URL")
        or os.getenv("DATABASE_URL")
        or ""
    ).strip()
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if not url:
        # Secure default matches db/session.py: never silently fall back to a
        # local SQLite file unless explicitly opted in (tests / local dev).
        allow_sqlite = os.getenv("ALLOW_SQLITE_FALLBACK", "false").lower() == "true"
        if not allow_sqlite:
            raise RuntimeError("No database URL configured (set HOT_DATABASE_URL).")
        url = "sqlite:///./motormila.db"
    engine = create_engine(url, pool_pre_ping=True) if not url.startswith("sqlite") else create_engine(url, connect_args={"check_same_thread": False})
    return sessionmaker(bind=engine)()


# ---------------------------------------------------------------------------
# Data queries
# ---------------------------------------------------------------------------


def query_top_lanes(db: Session, limit: int = TOP_LANES_LIMIT) -> list[dict]:
    """Return the top *limit* make/model combos by listing count."""
    rows = (
        db.query(
            CarListing.make,
            CarListing.model,
            func.count(CarListing.id).label("listing_count"),
            func.avg(CarListing.price_lkr).label("avg_price"),
            func.min(CarListing.price_lkr).label("min_price"),
            func.max(CarListing.price_lkr).label("max_price"),
            func.avg(CarListing.deal_score).label("avg_deal_score"),
        )
        .filter(
            live_listing_filter(),
            CarListing.price_lkr.isnot(None),
            CarListing.price_lkr >= MIN_REASONABLE_PRICE_LKR,
            CarListing.make.isnot(None),
            CarListing.model.isnot(None),
        )
        .group_by(CarListing.make, CarListing.model)
        .order_by(desc("listing_count"))
        .limit(limit)
        .all()
    )
    return [
        {
            "make": row.make,
            "model": row.model,
            "listing_count": int(row.listing_count or 0),
            "avg_price_lkr": round(float(row.avg_price), 0) if row.avg_price else None,
            "min_price_lkr": round(float(row.min_price), 0) if row.min_price else None,
            "max_price_lkr": round(float(row.max_price), 0) if row.max_price else None,
            "avg_deal_score": round(float(row.avg_deal_score), 1) if row.avg_deal_score else None,
        }
        for row in rows
    ]


def query_hot_deals(db: Session, limit: int = HOT_DEALS_LIMIT) -> list[dict]:
    """Return the top *limit* listings by deal_score."""
    rows = (
        db.query(CarListing)
        .filter(
            live_listing_filter(),
            CarListing.deal_score.isnot(None),
            CarListing.price_lkr.isnot(None),
            CarListing.price_lkr >= MIN_REASONABLE_PRICE_LKR,
        )
        .order_by(desc(CarListing.deal_score))
        .limit(limit)
        .all()
    )
    return [
        {
            "id": row.id,
            "title": row.title or f"{row.make} {row.model}",
            "make": row.make,
            "model": row.model,
            "year": row.year,
            "price_lkr": round(float(row.price_lkr), 0) if row.price_lkr else None,
            "district": row.district,
            "deal_score": round(float(row.deal_score), 1) if row.deal_score else None,
            "url": row.url,
        }
        for row in rows
    ]


def query_alert_stats(db: Session) -> dict:
    """Return counts of active alerts and total matches from the last pass."""
    active_count = int(
        db.query(func.count(MarketAlert.id))
        .filter(MarketAlert.active.is_(True))
        .scalar()
        or 0
    )
    total_matches = int(
        db.query(func.sum(MarketAlertMatch.match_count)).scalar() or 0
    )
    return {"active_alerts": active_count, "total_matches": total_matches}


# ---------------------------------------------------------------------------
# Pro user resolution
# ---------------------------------------------------------------------------


def _pro_recipients_from_auth_users() -> list[str]:
    """Parse AUTH_USERS and return emails of active pro/enterprise subscribers."""
    raw = os.getenv("AUTH_USERS", "").strip()
    if not raw:
        return []
    try:
        users = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(users, list):
        return []

    emails: list[str] = []
    for user in users:
        if not isinstance(user, dict):
            continue
        plan = str(user.get("plan") or "").strip().lower()
        status = str(user.get("subscription_status") or "active").strip().lower()
        email = str(user.get("email") or "").strip().lower()
        if email and plan in PRO_PLANS and status in ACTIVE_STATUSES:
            emails.append(email)
    return emails


def resolve_recipients() -> list[str]:
    """Return the list of recipient email addresses for the digest.

    Priority:
    1. Pro/enterprise users from AUTH_USERS env var.
    2. DIGEST_RECIPIENTS env var (comma-separated).
    """
    from_auth = _pro_recipients_from_auth_users()
    if from_auth:
        return from_auth

    env_list = os.getenv("DIGEST_RECIPIENTS", "").strip()
    if env_list:
        return [e.strip() for e in env_list.split(",") if e.strip()]
    return []


# ---------------------------------------------------------------------------
# HTML builder
# ---------------------------------------------------------------------------


def _fmt_price(value: Optional[float]) -> str:
    if value is None:
        return "N/A"
    return f"Rs. {value:,.0f}"


def _fmt_score(value: Optional[float]) -> str:
    if value is None:
        return "N/A"
    return f"{value:.1f}"


def build_digest_html(
    *,
    generated_at: datetime,
    top_lanes: list[dict],
    hot_deals: list[dict],
    alert_stats: dict,
) -> str:
    """Build and return the full HTML digest string."""

    date_str = generated_at.strftime("%B %d, %Y")

    # --- Top lanes table rows ---
    lane_rows = ""
    for rank, lane in enumerate(top_lanes, 1):
        lane_rows += textwrap.dedent(f"""
            <tr>
              <td style="padding:6px 10px;border-bottom:1px solid #eee;">{rank}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:600;">{lane['make']} {lane['model']}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">{lane['listing_count']:,}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">{_fmt_price(lane['avg_price_lkr'])}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">{_fmt_price(lane['min_price_lkr'])}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;">{_fmt_score(lane['avg_deal_score'])}</td>
            </tr>
        """).strip()

    # --- Hot deals rows ---
    deal_rows = ""
    for deal in hot_deals:
        year_str = str(deal["year"]) if deal["year"] else "—"
        district_str = deal["district"] or "—"
        url = deal.get("url") or "#"
        title = deal["title"] or f"{deal['make']} {deal['model']}"
        deal_rows += textwrap.dedent(f"""
            <tr>
              <td style="padding:6px 10px;border-bottom:1px solid #eee;">
                <a href="{url}" style="color:#2563eb;text-decoration:none;">{title}</a>
              </td>
              <td style="padding:6px 10px;border-bottom:1px solid #eee;">{year_str}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #eee;">{district_str}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">{_fmt_price(deal['price_lkr'])}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;color:#16a34a;font-weight:700;">{_fmt_score(deal['deal_score'])}</td>
            </tr>
        """).strip()

    active_alerts = alert_stats.get("active_alerts", 0)
    total_matches = alert_stats.get("total_matches", 0)

    html = textwrap.dedent(f"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>{DIGEST_SUBJECT}</title>
        </head>
        <body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f3f4f6;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
            <tr>
              <td align="center">
                <table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">

                  <!-- Header -->
                  <tr>
                    <td style="background:#1e40af;padding:24px 32px;">
                      <h1 style="margin:0;color:#ffffff;font-size:22px;letter-spacing:-0.5px;">
                        Motormila Pro &mdash; Weekly Market Digest
                      </h1>
                      <p style="margin:6px 0 0;color:#bfdbfe;font-size:13px;">{date_str}</p>
                    </td>
                  </tr>

                  <!-- Alert summary banner -->
                  <tr>
                    <td style="background:#eff6ff;padding:16px 32px;border-bottom:1px solid #dbeafe;">
                      <p style="margin:0;font-size:14px;color:#1e3a8a;">
                        <strong>{active_alerts:,}</strong> active price alerts &bull;
                        <strong>{total_matches:,}</strong> total live matches this week
                      </p>
                    </td>
                  </tr>

                  <!-- Top vehicle lanes -->
                  <tr>
                    <td style="padding:24px 32px 8px;">
                      <h2 style="margin:0 0 12px;font-size:16px;color:#111827;">Top Vehicle Lanes by Inventory</h2>
                      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#374151;">
                        <thead>
                          <tr style="background:#f9fafb;">
                            <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #e5e7eb;">#</th>
                            <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #e5e7eb;">Make / Model</th>
                            <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #e5e7eb;">Listings</th>
                            <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #e5e7eb;">Avg Price</th>
                            <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #e5e7eb;">Min Price</th>
                            <th style="padding:8px 10px;text-align:center;border-bottom:2px solid #e5e7eb;">Deal Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lane_rows}
                        </tbody>
                      </table>
                    </td>
                  </tr>

                  <!-- Hot deals -->
                  <tr>
                    <td style="padding:24px 32px 8px;">
                      <h2 style="margin:0 0 12px;font-size:16px;color:#111827;">Hot Deals This Week</h2>
                      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#374151;">
                        <thead>
                          <tr style="background:#f9fafb;">
                            <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #e5e7eb;">Listing</th>
                            <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #e5e7eb;">Year</th>
                            <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #e5e7eb;">District</th>
                            <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #e5e7eb;">Price</th>
                            <th style="padding:8px 10px;text-align:center;border-bottom:2px solid #e5e7eb;">Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {deal_rows}
                        </tbody>
                      </table>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="padding:20px 32px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
                      <p style="margin:0;">
                        This digest was generated automatically by Motormila.
                        Data reflects listings active at the time of generation.
                      </p>
                      <p style="margin:8px 0 0;">
                        Generated at {generated_at.strftime("%Y-%m-%d %H:%M UTC")}
                      </p>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
    """).strip()

    return html


# ---------------------------------------------------------------------------
# SendGrid sender
# ---------------------------------------------------------------------------


def _send_via_sendgrid(*, api_key: str, recipients: list[str], subject: str, html: str) -> None:
    payload = json.dumps({
        "personalizations": [
            {
                "to": [{"email": addr} for addr in recipients],
                "subject": subject,
            }
        ],
        "from": {"email": DIGEST_FROM_EMAIL, "name": DIGEST_FROM_NAME},
        "content": [{"type": "text/html", "value": html}],
    }).encode()

    req = urllib.request.Request(
        SENDGRID_SEND_URL,
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            status = resp.status
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="replace")
        raise RuntimeError(f"SendGrid error {exc.code}: {body}") from exc

    if status not in (200, 202):
        raise RuntimeError(f"Unexpected SendGrid status {status}")


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


def run_digest(*, dry_run: bool, db: Optional[Session] = None) -> dict:
    """Build and optionally send the weekly digest.

    Parameters
    ----------
    dry_run:
        When *True* the HTML is printed to stdout; no email is sent
        regardless of whether ``SENDGRID_API_KEY`` is set.
    db:
        Optional pre-created Session; a new one is opened if omitted.

    Returns
    -------
    dict
        ``{"sent": bool, "recipients": list[str], "html_length": int}``
    """
    close_db = db is None
    if db is None:
        db = _db_session()

    try:
        generated_at = datetime.now(timezone.utc)
        top_lanes = query_top_lanes(db)
        hot_deals = query_hot_deals(db)
        alert_stats = query_alert_stats(db)
    finally:
        if close_db:
            db.close()

    html = build_digest_html(
        generated_at=generated_at,
        top_lanes=top_lanes,
        hot_deals=hot_deals,
        alert_stats=alert_stats,
    )

    api_key = os.getenv("SENDGRID_API_KEY", "").strip()
    recipients = resolve_recipients()

    if dry_run or not api_key:
        print("=== Motormila Pro Weekly Digest (DRY-RUN) ===")
        if not api_key:
            print("(SENDGRID_API_KEY not set — printing to stdout)")
        print(f"Recipients would be: {recipients or ['<none configured>']}")
        print()
        print(html)
        return {"sent": False, "recipients": recipients, "html_length": len(html)}

    if not recipients:
        print("No recipients configured; skipping send.")
        return {"sent": False, "recipients": [], "html_length": len(html)}

    _send_via_sendgrid(
        api_key=api_key,
        recipients=recipients,
        subject=DIGEST_SUBJECT,
        html=html,
    )
    print(f"Digest sent to {len(recipients)} recipient(s): {', '.join(recipients)}")
    return {"sent": True, "recipients": recipients, "html_length": len(html)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Send the Motormila Pro weekly digest.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=not bool(os.getenv("SENDGRID_API_KEY", "").strip()),
        help="Print the digest HTML to stdout instead of sending (default when SENDGRID_API_KEY is not set).",
    )
    args = parser.parse_args()

    result = run_digest(dry_run=args.dry_run)
    sys.exit(0)
