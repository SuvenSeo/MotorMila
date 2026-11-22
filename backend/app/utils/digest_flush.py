"""07:00 Asia/Colombo resend worker for digest/quiet-hours queued receipts.

Reads NotificationDeliveryLog rows with status digest_queued/queued_quiet,
rebuilds one message per (alert, channel) from the current MarketAlertMatch
count, resends via the configured provider, and flips receipts to sent.

A rule or account read failure cannot authorize a send. In-app delivery is
handled separately in alert_matcher.
"""

from __future__ import annotations

import structlog
from sqlalchemy.orm import Session

from app.utils.alert_dispatch import dispatch_session, lock_active_rule, permitted_channels

log = structlog.get_logger()

QUEUED_STATUSES = ("digest_queued", "queued_quiet")


def _send_digest(db, alert, channel, count):
    from app.utils.notify_email import email_notify_configured, send_alert_email
    from app.utils.notify_push import PUSH_TOPIC_ALERT_MATCH, push_notify_configured, send_push_alert
    from db.models import PushSubscription
    from app.utils.notify_telegram import send_telegram_alert, telegram_notify_configured
    from app.utils.notify_whatsapp import (
        build_alert_match_message,
        send_whatsapp_alert,
        whatsapp_notify_configured,
    )

    body = build_alert_match_message(
        make=alert.make,
        model=alert.model,
        district=alert.district,
        max_price=float(alert.max_price) if alert.max_price is not None else None,
        match_count=count,
    )
    if channel == "whatsapp" and alert.notify_phone:
        return whatsapp_notify_configured() and send_whatsapp_alert(to_phone=alert.notify_phone, body=body)
    if channel == "telegram" and alert.notify_telegram_chat_id:
        return telegram_notify_configured() and send_telegram_alert(chat_id=alert.notify_telegram_chat_id, body=body)
    label = " ".join(p for p in (alert.make, alert.model) if p) or "your saved search"
    title = f"Motormila digest: {count} match{'es' if count != 1 else ''} for {label}"
    if channel == "email" and alert.notify_email:
        return email_notify_configured() and send_alert_email(to_email=alert.notify_email, subject=title, text=body)
    if channel == "push" and push_notify_configured():
        subs = (db.query(PushSubscription.endpoint, PushSubscription.p256dh, PushSubscription.auth)
                .filter_by(user_token=alert.user_token).all())
        return any(send_push_alert(endpoint=sub.endpoint, p256dh=sub.p256dh, auth=sub.auth,
                                   title=title, body=body, url="/alerts", topic=PUSH_TOPIC_ALERT_MATCH)
                   for sub in subs)
    return False


def flush_queued_deliveries(db: Session, *, limit: int = 500) -> dict:
    with dispatch_session(db) as worker:
        return _flush_queued_deliveries(worker, limit=limit)


def _flush_queued_deliveries(db: Session, *, limit: int = 500) -> dict:
    """Resend queued external-channel receipts. Returns summary dict."""
    from db.models import MarketAlertMatch, NotificationDeliveryLog

    summary = {"checked": 0, "sent": 0, "skipped": 0, "errors": 0}
    try:
        rows = (
            db.query(NotificationDeliveryLog.id, NotificationDeliveryLog.alert_id, NotificationDeliveryLog.channel)
            .filter(NotificationDeliveryLog.status.in_(QUEUED_STATUSES))
            .order_by(NotificationDeliveryLog.id.asc())
            .limit(max(1, min(int(limit or 500), 2000)))
            .all()
        )
        db.commit()  # candidate IDs are not dispatch authorization
    except Exception as exc:
        db.rollback()
        summary["errors"] += 1
        log.debug("digest_flush_read_failed", error=str(exc))
        return summary
    if not rows:
        return summary

    # Group by (alert_id, channel) so one send covers duplicate receipts.
    groups: dict[tuple, list] = {}
    for row in rows:
        key = (row.alert_id, row.channel)
        groups.setdefault(key, []).append(row.id)
    summary["checked"] = len(rows)

    for (alert_id, stored_channel), receipt_ids in groups.items():
        channel = (stored_channel or "").strip().lower()
        try:
            # Lock in the same order as the matcher: rule first, then receipts.
            # A concurrent flush may have already sent some/all of this group.
            alert = lock_active_rule(db, alert_id) if alert_id is not None else None
            receipts = (db.query(NotificationDeliveryLog)
                        .filter(NotificationDeliveryLog.id.in_(receipt_ids),
                                NotificationDeliveryLog.alert_id == alert_id,
                                NotificationDeliveryLog.channel == stored_channel,
                                NotificationDeliveryLog.status.in_(QUEUED_STATUSES))
                        .populate_existing().with_for_update().all())
            if not receipts:
                db.commit()
                continue
            ok = False
            if alert is not None and channel in permitted_channels(db, alert):
                match = db.query(MarketAlertMatch.match_count).filter_by(alert_id=alert.id).scalar()
                if match and match > 0:
                    ok = _send_digest(db, alert, channel, int(match))
            for receipt in receipts:
                receipt.status = "sent" if ok else "skipped"
            db.commit()
            summary["sent" if ok else "skipped"] += 1
        except Exception as exc:
            db.rollback()
            summary["errors"] += 1
            log.debug("digest_flush_group_failed", alert_id=alert_id, channel=channel, error=str(exc))
    log.info("digest_flush_complete", **summary)
    return summary
