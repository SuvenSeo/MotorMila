"""Alerts channel center: quiet hours, digest vs instant, dedupe + receipts.

Quiet hours 21:00-07:00 Asia/Colombo (UTC+5:30, no DST). Digest flushes at
07:00 Colombo daily. All helpers fail open: missing tables/columns never abort
the caller — external channels degrade to queued/skipped while in-app still
delivers.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

import structlog

log = structlog.get_logger()

QUIET_START_HOUR = 21
QUIET_END_HOUR = 7
TIMEZONE_NAME = "Asia/Colombo"
# Colombo is UTC+5:30 year-round (no DST).
COLOMBO_OFFSET = timedelta(hours=5, minutes=30)
DIGEST_HOUR = 7
DIGEST_TIME_LABEL = "07:00"

SUPPORTED_CHANNELS = ("inapp", "email", "whatsapp", "telegram", "push")
# Legacy aliases accepted in notify_channels strings.
_CHANNEL_ALIASES = {
    "in-app": "inapp",
    "in_app": "inapp",
    "wa": "whatsapp",
    "sms": "whatsapp",
    "tg": "telegram",
    "webpush": "push",
    "web-push": "push",
}


def colombo_hour(now_utc: Optional[datetime] = None) -> int:
    now = now_utc or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    local = now + COLOMBO_OFFSET
    return int(local.hour)


def is_quiet_hours(now_utc: Optional[datetime] = None) -> bool:
    """True during 21:00-07:00 Colombo time."""
    hour = colombo_hour(now_utc)
    return hour >= QUIET_START_HOUR or hour < QUIET_END_HOUR


def dedupe_key(alert_id: int | str, listing_id: int | str, channel: str) -> str:
    return f"{alert_id}:{listing_id}:{str(channel).strip().lower()}"


def normalize_channels(raw: object) -> set[str]:
    """Parse a notify_channels string into canonical supported channel names."""
    if raw is None:
        return set()
    parts = str(raw).split(",") if isinstance(raw, str) else list(raw)  # type: ignore[arg-type]
    out: set[str] = set()
    for part in parts:
        token = str(part).strip().lower()
        if not token:
            continue
        token = _CHANNEL_ALIASES.get(token, token)
        if token in SUPPORTED_CHANNELS:
            out.add(token)
    return out


def delivery_mode_of(alert: object) -> str:
    mode = str(getattr(alert, "delivery_mode", None) or "").strip().lower()
    return mode if mode in ("instant", "digest") else "instant"


def quiet_enabled_of(alert: object) -> bool:
    """Quiet-hours queue applies only when explicitly enabled (default off).

    Keeps legacy alerts + unit tests deterministic: digest always queues,
    quiet-hours queue is opt-in per alert (new UI sets it True).
    """
    return bool(getattr(alert, "quiet_hours_enabled", False) is True)


def should_queue(
    channel: str,
    alert: object | None = None,
    *,
    delivery_mode: Optional[str] = None,
    quiet_enabled: Optional[bool] = None,
    now_utc: Optional[datetime] = None,
) -> tuple[bool, str]:
    """Return (queued, reason). In-app never queues (fail-open immediate)."""
    ch = str(channel).strip().lower()
    if ch == "inapp":
        return False, "inapp_immediate"
    mode = (delivery_mode or (delivery_mode_of(alert) if alert is not None else "instant")).lower()
    if mode == "digest":
        return True, "digest_0700"
    enabled = quiet_enabled if quiet_enabled is not None else (quiet_enabled_of(alert) if alert is not None else False)
    if enabled and is_quiet_hours(now_utc):
        return True, "quiet_hours_21_07"
    return False, "instant"


def check_and_record_delivery(
    db,
    *,
    key: str,
    alert_id: Optional[int] = None,
    listing_id: Optional[int] = None,
    channel: Optional[str] = None,
    status: str = "sent",
) -> bool:
    """Dedupe guard: return False when key already logged, else log + return True.

    Fail-open: any DB error (e.g. table missing pre-migration) returns True so
    the notification still sends.
    """
    try:
        from db.models import NotificationDeliveryLog

        existing = (
            db.query(NotificationDeliveryLog)
            .filter(NotificationDeliveryLog.dedupe_key == key)
            .first()
        )
        if existing is not None:
            return False
        db.add(
            NotificationDeliveryLog(
                dedupe_key=key,
                alert_id=alert_id,
                listing_id=listing_id,
                channel=(channel or "").strip().lower() or None,
                status=status,
            )
        )
        db.flush()
        return True
    except Exception as exc:
        log.debug("delivery_log_fail_open", key=key, error=str(exc))
        try:
            db.rollback()
        except Exception:
            pass
        return True


def release_failed_delivery(db, *, key: str) -> None:
    """Delete a delivery receipt after a failed send so the next pass can retry.

    Used when the receipt was written as ``attempted``/``sent`` before the
    provider call and the call then failed — without this the row would
    permanently suppress that alert.
    """
    try:
        from db.models import NotificationDeliveryLog

        db.query(NotificationDeliveryLog).filter(
            NotificationDeliveryLog.dedupe_key == key
        ).delete(synchronize_session=False)
        db.flush()
    except Exception as exc:
        log.debug("delivery_release_fail_open", key=key, error=str(exc))
        try:
            db.rollback()
        except Exception:
            pass


def mark_delivery_sent(db, *, key: str) -> None:
    """Flip an ``attempted`` receipt to ``sent`` after the provider call succeeds."""
    try:
        from db.models import NotificationDeliveryLog

        db.query(NotificationDeliveryLog).filter(
            NotificationDeliveryLog.dedupe_key == key
        ).update({"status": "sent"}, synchronize_session=False)
        db.flush()
    except Exception as exc:
        log.debug("delivery_mark_sent_fail_open", key=key, error=str(exc))
        try:
            db.rollback()
        except Exception:
            pass


def next_digest_at(now_utc: Optional[datetime] = None) -> datetime:
    """Next 07:00 Colombo digest slot as UTC datetime."""
    now = now_utc or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    colombo_now = now + COLOMBO_OFFSET
    target_colombo = colombo_now.replace(hour=DIGEST_HOUR, minute=0, second=0, microsecond=0)
    if colombo_now >= target_colombo:
        target_colombo = target_colombo + timedelta(days=1)
    return target_colombo - COLOMBO_OFFSET
