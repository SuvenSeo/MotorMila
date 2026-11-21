"""07:00 Asia/Colombo resend worker for digest/quiet-hours queued receipts.

Reads NotificationDeliveryLog rows with status digest_queued/queued_quiet,
rebuilds one message per (alert, channel) from the current MarketAlertMatch
count, resends via the configured provider, and flips receipts to sent.

Fail-open: any error returns counts with errors>0, never raises. In-app
delivery is untouched (always immediate in alert_matcher).
"""

from __future__ import annotations

import structlog
from sqlalchemy.orm import Session

from app.utils.channel_center import match_channels_of

log = structlog.get_logger()

QUEUED_STATUSES = ("digest_queued", "queued_quiet")


def flush_queued_deliveries(db: Session, *, limit: int = 500) -> dict:
    """Resend queued external-channel receipts. Returns summary dict."""
    from db.models import MarketAlert, MarketAlertMatch, NotificationDeliveryLog

    summary = {"checked": 0, "sent": 0, "skipped": 0, "errors": 0}
    try:
        rows = (
            db.query(NotificationDeliveryLog)
            .filter(NotificationDeliveryLog.status.in_(QUEUED_STATUSES))
            .order_by(NotificationDeliveryLog.id.asc())
            .limit(max(1, min(int(limit or 500), 2000)))
            .all()
        )
    except Exception as exc:
        log.debug("digest_flush_read_failed", error=str(exc))
        return summary
    if not rows:
        return summary

    # Group by (alert_id, channel) so one send covers duplicate receipts.
    groups: dict[tuple, list] = {}
    for row in rows:
        key = (row.alert_id, (row.channel or "").strip().lower())
        groups.setdefault(key, []).append(row)
    summary["checked"] = len(rows)

    try:
        from app.utils.notify_email import email_notify_configured, send_alert_email
        from app.utils.notify_push import push_notify_configured
        from app.utils.notify_telegram import send_telegram_alert, telegram_notify_configured
        from app.utils.notify_whatsapp import (
            build_alert_match_message,
            send_whatsapp_alert,
            whatsapp_notify_configured,
        )
    except Exception as exc:
        log.debug("digest_flush_import_failed", error=str(exc))
        summary["errors"] += 1
        return summary

    for (alert_id, channel), receipts in groups.items():
        try:
            alert = db.query(MarketAlert).filter(MarketAlert.id == alert_id).first() if alert_id else None
            if alert is None or not alert.active or channel not in match_channels_of(alert):
                for r in receipts:
                    r.status = "skipped"
                summary["skipped"] += 1
                continue
            match = (
                db.query(MarketAlertMatch)
                .filter(MarketAlertMatch.alert_id == alert.id)
                .first()
            )
            count = int(match.match_count) if match is not None else 0
            if count <= 0:
                for r in receipts:
                    r.status = "skipped"
                continue
            body = build_alert_match_message(
                make=alert.make,
                model=alert.model,
                district=alert.district,
                max_price=float(alert.max_price) if alert.max_price is not None else None,
                match_count=count,
            )
            ok = False
            if channel == "whatsapp" and getattr(alert, "notify_phone", None):
                ok = send_whatsapp_alert(to_phone=str(alert.notify_phone), body=body) if whatsapp_notify_configured() else False
            elif channel == "email" and getattr(alert, "notify_email", None):
                if email_notify_configured():
                    label_parts = [p for p in [alert.make, alert.model] if p]
                    label = " ".join(label_parts) if label_parts else "your saved search"
                    ok = send_alert_email(
                        to_email=str(alert.notify_email),
                        subject=f"Motormila digest: {count} match{'es' if count != 1 else ''} for {label}",
                        text=body,
                    )
            elif channel == "telegram" and getattr(alert, "notify_telegram_chat_id", None):
                ok = send_telegram_alert(chat_id=str(alert.notify_telegram_chat_id), body=body) if telegram_notify_configured() else False
            elif channel == "push":
                if push_notify_configured():
                    try:
                        from db.models import PushSubscription

                        from app.utils.notify_push import PUSH_TOPIC_ALERT_MATCH, send_push_alert

                        subs = db.query(PushSubscription).filter(PushSubscription.user_token == alert.user_token).all()
                        label_parts = [p for p in [alert.make, alert.model] if p]
                        label = " ".join(label_parts) if label_parts else "your saved search"
                        for sub in subs:
                            if send_push_alert(
                                endpoint=str(sub.endpoint),
                                p256dh=getattr(sub, "p256dh", None),
                                auth=getattr(sub, "auth", None),
                                title=f"Motormila digest: {count} match{'es' if count != 1 else ''} for {label}",
                                body=body,
                                url="/alerts",
                                topic=PUSH_TOPIC_ALERT_MATCH,
                            ):
                                ok = True
                                break
                    except Exception as push_exc:
                        log.debug("digest_flush_push_failed", alert_id=alert_id, error=str(push_exc))
            else:
                ok = False
            for r in receipts:
                r.status = "sent" if ok else "skipped"
            if ok:
                summary["sent"] += 1
            else:
                summary["skipped"] += 1
        except Exception as exc:
            summary["errors"] += 1
            log.debug("digest_flush_group_failed", alert_id=alert_id, channel=channel, error=str(exc))
            try:
                db.rollback()
            except Exception:
                pass
    try:
        db.commit()
    except Exception as exc:
        log.debug("digest_flush_commit_failed", error=str(exc))
        try:
            db.rollback()
        except Exception:
            pass
        summary["errors"] += 1
    log.info("digest_flush_complete", **summary)
    return summary
