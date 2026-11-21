"""Post-scrape alert match pass.

Iterates every active MarketAlert and counts matching CarListings.  Results
are logged via structlog and persisted in the MarketAlertMatch table (one row
per alert, upserted on each pass).

Usage::

    from app.utils.alert_matcher import run_alert_match_pass
    summary = run_alert_match_pass(db)
    # {"alerts_checked": 12, "total_matches": 47, "elapsed_seconds": 0.21}
"""

import time
from datetime import datetime, timezone

import structlog
from sqlalchemy.orm import Session

from db.models import (
    CarListing, MarketAlert, MarketAlertMatch, NotificationDeliveryLog, PushSubscription, live_listing_filter,
)
from app.utils.alert_dispatch import dispatch_session, lock_active_rule, permitted_channels
from app.utils.channel_center import (
    dedupe_key,
    match_channels_of as _resolve_channels,
    should_queue,
)
from app.utils.notify_email import email_notify_configured, send_alert_email
from app.utils.notify_push import (
    PUSH_TOPIC_ALERT_MATCH,
    push_notify_configured,
    send_push_alert,
)
from app.utils.notify_telegram import send_telegram_alert, telegram_notify_configured
from app.utils.notify_whatsapp import (
    build_alert_match_message,
    send_whatsapp_alert,
    whatsapp_notify_configured,
)
from app.utils.user_notifications import record_alert_match_notification

log = structlog.get_logger()


def _count_matching(db: Session, alert: MarketAlert) -> int:
    """Return the number of live listings that satisfy *alert*'s filters."""
    q = db.query(CarListing).filter(live_listing_filter())
    if alert.make:
        q = q.filter(CarListing.make.ilike(alert.make))
    if alert.model:
        q = q.filter(CarListing.model.ilike(alert.model))
    if alert.district:
        q = q.filter(CarListing.district.ilike(alert.district))
    if alert.max_price:
        q = q.filter(CarListing.price_lkr <= alert.max_price)
    return int(q.count())


def _representative_listing_id(db: Session, alert: MarketAlert) -> int:
    """Top matching listing id for the dedupe key (alert:listing:channel)."""
    try:
        q = db.query(CarListing.id).filter(live_listing_filter())
        if alert.make:
            q = q.filter(CarListing.make.ilike(alert.make))
        if alert.model:
            q = q.filter(CarListing.model.ilike(alert.model))
        if alert.district:
            q = q.filter(CarListing.district.ilike(alert.district))
        if alert.max_price:
            q = q.filter(CarListing.price_lkr <= alert.max_price)
        row = q.order_by(CarListing.id.desc()).first()
        return int(row[0]) if row and row[0] is not None else 0
    except Exception:
        return 0


def _record_decision(
    db: Session, alert: MarketAlert, listing_id: int, channel: str,
) -> NotificationDeliveryLog | None:
    """Under the rule lock, reserve this delivery before contacting a provider."""
    key = dedupe_key(alert.id, listing_id, channel)
    if db.query(NotificationDeliveryLog.id).filter_by(dedupe_key=key).first():
        return None
    queued, reason = should_queue(channel, alert)
    status = "attempted"
    if queued:
        status = "digest_queued" if reason == "digest_0700" else "queued_quiet"
    receipt = NotificationDeliveryLog(dedupe_key=key, alert_id=alert.id, listing_id=listing_id or None,
                                      channel=channel, status=status)
    db.add(receipt)
    # No fail-open rollback: losing the transaction also loses consent locks.
    db.flush()
    return receipt


def _send_match(db: Session, channel: str, alert: MarketAlert, delta: int, body: str) -> bool:
    if channel == "whatsapp":
        return send_whatsapp_alert(to_phone=alert.notify_phone, body=body)
    if channel == "telegram":
        return send_telegram_alert(chat_id=alert.notify_telegram_chat_id, body=body)
    label = " ".join(p for p in (alert.make, alert.model) if p) or "your saved search"
    title = f"Motormila: {delta} new match{'es' if delta != 1 else ''} for {label}"
    if channel == "email":
        return send_alert_email(to_email=alert.notify_email, subject=title, text=body)
    if channel == "push":
        subs = (db.query(PushSubscription.endpoint, PushSubscription.p256dh, PushSubscription.auth)
                .filter_by(user_token=alert.user_token).all())
        return any(send_push_alert(endpoint=sub.endpoint, p256dh=sub.p256dh, auth=sub.auth,
                                   title=title, body=body, url="/alerts", topic=PUSH_TOPIC_ALERT_MATCH)
                   for sub in subs)
    raise ValueError(f"Unsupported match delivery: {channel}")


def run_alert_match_pass(db: Session) -> dict:
    with dispatch_session(db) as worker:
        return _run_alert_match_pass(worker)


def _run_alert_match_pass(db: Session) -> dict:
    """Check all active MarketAlerts and upsert MarketAlertMatch rows.

    For each active alert:
    - Count how many non-outlier CarListings match its filters.
    - Insert or update the corresponding MarketAlertMatch row.
    - Log the result at DEBUG level.

    Each rule commits before the next rule is locked; individual alert errors
    are caught and logged as warnings so one bad alert never aborts the rest.

    Returns a summary dict with keys:

    * ``alerts_checked``  – number of active alerts processed
    * ``total_matches``   – sum of ``match_count`` across all processed alerts
    * ``elapsed_seconds`` – wall-clock duration for the pass
    """
    t0 = time.monotonic()

    alert_ids = (
        db.query(MarketAlert.id)
        .filter(MarketAlert.active.is_(True))
        .all()
    )

    db.commit()  # end the read-only candidate scan

    now = datetime.now(timezone.utc)
    total_matches = 0
    errors = 0
    configured = {
        "whatsapp": whatsapp_notify_configured(), "email": email_notify_configured(),
        "telegram": telegram_notify_configured(), "push": push_notify_configured(),
    }
    sent = dict.fromkeys(configured, 0)
    queued = 0

    for (alert_id,) in alert_ids:
        try:
            alert = lock_active_rule(db, alert_id)
            if alert is None:
                db.commit()
                continue
            count = _count_matching(db, alert)
            total_matches += count

            existing: MarketAlertMatch | None = (
                db.query(MarketAlertMatch)
                .filter(MarketAlertMatch.alert_id == alert.id)
                .populate_existing().first()
            )
            previous_count = int(existing.match_count) if existing is not None else 0
            if existing is None:
                db.add(
                    MarketAlertMatch(
                        alert_id=alert.id,
                        match_count=count,
                        last_matched_at=now,
                    )
                )
            else:
                existing.match_count = count
                existing.last_matched_at = now

            # Fire notifications only when the match count increases (new inventory).
            if count > previous_count:
                delta = count - previous_count
                body = build_alert_match_message(
                    make=alert.make,
                    model=alert.model,
                    district=alert.district,
                    max_price=float(alert.max_price) if alert.max_price is not None else None,
                    match_count=delta,
                )
                channels = permitted_channels(db, alert)
                listing_id = _representative_listing_id(db, alert)

                destinations = {"whatsapp": alert.notify_phone, "email": alert.notify_email,
                                "telegram": alert.notify_telegram_chat_id}
                for ch, ready in configured.items():
                    if ch not in channels or not ready or (ch in destinations and not destinations[ch]):
                        continue
                    receipt = _record_decision(db, alert, listing_id, ch)
                    if receipt is None:
                        continue  # duplicate, not queued
                    if receipt.status != "attempted":
                        queued += 1
                    elif _send_match(db, ch, alert, delta, body):
                        sent[ch] += 1
                        receipt.status = "sent"
                    else:
                        db.delete(receipt)

                # Legacy inferred alerts include the inbox; explicit selections are opt-in.
                if "inapp" in channels:
                    try:
                        record_alert_match_notification(
                            db,
                            user_token=alert.user_token,
                            make=alert.make,
                            model=alert.model,
                            district=alert.district,
                            max_price=float(alert.max_price) if alert.max_price is not None else None,
                            new_match_count=delta,
                        )
                    except Exception as notif_exc:
                        log.debug("alert_match_inapp_notif_failed", alert_id=alert.id, error=str(notif_exc))

            log.debug(
                "alert_match",
                alert_id=alert.id,
                make=alert.make,
                model=alert.model,
                district=alert.district,
                match_count=count,
            )
            db.commit()
        except Exception as exc:
            db.rollback()
            errors += 1
            log.warning("alert_match_error", alert_id=alert_id, error=str(exc))

    elapsed = round(time.monotonic() - t0, 3)
    summary = {
        "alerts_checked": len(alert_ids),
        "total_matches": total_matches,
        **{f"{ch}_sent": n for ch, n in sent.items()},
        "queued": queued,
        "errors": errors,
        "elapsed_seconds": elapsed,
    }
    log.info("alert_match_pass_complete", **summary)
    return summary
