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

from db.models import CarListing, MarketAlert, MarketAlertMatch, live_listing_filter
from app.utils.channel_center import (
    check_and_record_delivery,
    dedupe_key,
    mark_delivery_sent,
    release_failed_delivery,
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


def _resolve_channels(alert: MarketAlert) -> set[str]:
    """Return the set of channel names to notify for this alert."""
    raw = (getattr(alert, "notify_channels", None) or "").strip()
    if raw:
        return {ch.strip().lower() for ch in raw.split(",") if ch.strip()}
    # Infer from which destination fields are set.
    channels: set[str] = set()
    if getattr(alert, "notify_phone", None):
        channels.add("whatsapp")
    if getattr(alert, "notify_email", None):
        channels.add("email")
    if getattr(alert, "notify_telegram_chat_id", None):
        channels.add("telegram")
    return channels


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


def _channel_sendable(
    db: Session,
    *,
    alert: MarketAlert,
    listing_id: int,
    channel: str,
) -> tuple[bool, str, str]:
    """Apply digest/quiet-hours queue + dedupe.

    Returns ``(send_now, receipt_status, dedupe_key)``.

    - digest or quiet-hours window -> (False, "digest_queued"|"queued_quiet", key)
    - duplicate dedupe key -> (False, "duplicate", key)
    - else records the receipt as ``attempted`` and returns (True, "attempted", key).
      The caller must mark ``sent`` on success or release the receipt on failure
      so a failed send can retry next pass.
    In-app is handled by the caller (always immediate, fail-open).
    """
    key = dedupe_key(alert.id, listing_id, channel)
    try:
        queued, reason = should_queue(channel, alert)
        if queued:
            status = "digest_queued" if reason == "digest_0700" else "queued_quiet"
            check_and_record_delivery(
                db,
                key=key,
                alert_id=int(alert.id),
                listing_id=listing_id or None,
                channel=channel,
                status=status,
            )
            return False, status, key
        fresh = check_and_record_delivery(
            db,
            key=key,
            alert_id=int(alert.id),
            listing_id=listing_id or None,
            channel=channel,
            status="attempted",
        )
        return (True, "attempted", key) if fresh else (False, "duplicate", key)
    except Exception:
        # Fail open: any helper error must not block the send attempt.
        return True, "attempted", key


def run_alert_match_pass(db: Session) -> dict:
    """Check all active MarketAlerts and upsert MarketAlertMatch rows.

    For each active alert:
    - Count how many non-outlier CarListings match its filters.
    - Insert or update the corresponding MarketAlertMatch row.
    - Log the result at DEBUG level.

    A single commit is issued at the end of the pass; individual alert errors
    are caught and logged as warnings so one bad alert never aborts the rest.

    Returns a summary dict with keys:

    * ``alerts_checked``  – number of active alerts processed
    * ``total_matches``   – sum of ``match_count`` across all processed alerts
    * ``elapsed_seconds`` – wall-clock duration for the pass
    """
    t0 = time.monotonic()

    alerts: list[MarketAlert] = (
        db.query(MarketAlert)
        .filter(MarketAlert.active.is_(True))
        .all()
    )

    now = datetime.now(timezone.utc)
    total_matches = 0
    errors = 0
    whatsapp_sent = 0
    email_sent = 0
    telegram_sent = 0
    push_sent = 0
    queued = 0

    wa_configured = whatsapp_notify_configured()
    tg_configured = telegram_notify_configured()
    em_configured = email_notify_configured()
    push_configured = push_notify_configured()

    for alert in alerts:
        try:
            count = _count_matching(db, alert)
            total_matches += count

            existing: MarketAlertMatch | None = (
                db.query(MarketAlertMatch)
                .filter(MarketAlertMatch.alert_id == alert.id)
                .first()
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
                channels = _resolve_channels(alert)
                listing_id = _representative_listing_id(db, alert)

                if "whatsapp" in channels and wa_configured and getattr(alert, "notify_phone", None):
                    send_now, _receipt, dedupe = _channel_sendable(db, alert=alert, listing_id=listing_id, channel="whatsapp")
                    if not send_now:
                        queued += 1
                    elif send_whatsapp_alert(to_phone=str(alert.notify_phone), body=body):
                        whatsapp_sent += 1
                        mark_delivery_sent(db, key=dedupe)
                    else:
                        release_failed_delivery(db, key=dedupe)

                if "email" in channels and em_configured and getattr(alert, "notify_email", None):
                    send_now, _receipt, dedupe = _channel_sendable(db, alert=alert, listing_id=listing_id, channel="email")
                    if not send_now:
                        queued += 1
                    else:
                        label_parts = [p for p in [alert.make, alert.model] if p]
                        label = " ".join(label_parts) if label_parts else "your saved search"
                        subject = f"Motormila: {delta} new match{'es' if delta != 1 else ''} for {label}"
                        if send_alert_email(
                            to_email=str(alert.notify_email),
                            subject=subject,
                            text=body,
                        ):
                            email_sent += 1
                            mark_delivery_sent(db, key=dedupe)
                        else:
                            release_failed_delivery(db, key=dedupe)

                if "telegram" in channels and tg_configured and getattr(alert, "notify_telegram_chat_id", None):
                    send_now, _receipt, dedupe = _channel_sendable(db, alert=alert, listing_id=listing_id, channel="telegram")
                    if not send_now:
                        queued += 1
                    elif send_telegram_alert(chat_id=str(alert.notify_telegram_chat_id), body=body):
                        telegram_sent += 1
                        mark_delivery_sent(db, key=dedupe)
                    else:
                        release_failed_delivery(db, key=dedupe)

                if "push" in channels and push_configured:
                    send_now, _receipt, dedupe = _channel_sendable(db, alert=alert, listing_id=listing_id, channel="push")
                    if not send_now:
                        queued += 1
                    else:
                        try:
                            from db.models import PushSubscription

                            subs = (
                                db.query(PushSubscription)
                                .filter(PushSubscription.user_token == alert.user_token)
                                .all()
                            )
                            label_parts = [p for p in [alert.make, alert.model] if p]
                            label = " ".join(label_parts) if label_parts else "your saved search"
                            title = f"Motormila: {delta} new match{'es' if delta != 1 else ''} for {label}"
                            delivered = False
                            for sub in subs:
                                if send_push_alert(
                                    endpoint=str(sub.endpoint),
                                    p256dh=getattr(sub, "p256dh", None),
                                    auth=getattr(sub, "auth", None),
                                    title=title,
                                    body=body,
                                    url="/alerts",
                                    topic=PUSH_TOPIC_ALERT_MATCH,
                                ):
                                    push_sent += 1
                                    delivered = True
                                    break
                            if delivered:
                                mark_delivery_sent(db, key=dedupe)
                            else:
                                release_failed_delivery(db, key=dedupe)
                        except Exception as push_exc:
                            log.debug("alert_match_push_failed", alert_id=alert.id, error=str(push_exc))
                            try:
                                release_failed_delivery(db, key=dedupe)
                            except Exception:
                                pass

                # Record in-app notification — fail silently so this never
                # aborts the match pass if the table is missing or not yet migrated.
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
        except Exception as exc:
            errors += 1
            log.warning("alert_match_error", alert_id=alert.id, error=str(exc))

    db.commit()

    elapsed = round(time.monotonic() - t0, 3)
    summary = {
        "alerts_checked": len(alerts),
        "total_matches": total_matches,
        "whatsapp_sent": whatsapp_sent,
        "email_sent": email_sent,
        "telegram_sent": telegram_sent,
        "push_sent": push_sent,
        "queued": queued,
        "errors": errors,
        "elapsed_seconds": elapsed,
    }
    log.info("alert_match_pass_complete", **summary)
    return summary
