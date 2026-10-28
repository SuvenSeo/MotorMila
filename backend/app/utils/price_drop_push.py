"""Post-scrape price-drop push pass (native FCM).

Every scraper funnels price changes into ``vehicle_price_history``
(app/utils/listing_upsert.py). After each sync this pass:

1. loads registered devices (``device_push_tokens``) that opted in;
2. finds live listings whose latest recorded price is lower than the
   previous point, recorded within the lookback window;
3. for each user, picks drops on listings they watch (device watchlist) or
   that match one of their active alerts with push enabled;
4. dedupes per (listing, new price, user) through ``notification_delivery_log``,
   enforces a rolling 24 h per-user cap, and sends to every device of the user.

Fail-open + no-op friendly: with FCM unconfigured or no devices it returns
immediately. During quiet hours (21:00-07:00 Colombo) nothing is sent and
nothing is logged, so the next pass after 07:00 (digest flush job or the
next sync) still picks the drops up inside the lookback window.

Env:
  PRICE_DROP_PUSH_ENABLED        default true
  PRICE_DROP_PUSH_LOOKBACK_HOURS default 26
  PRICE_DROP_PUSH_MIN_PCT        default 1.0  (ignore sub-1% wiggles)
  PRICE_DROP_PUSH_DAILY_CAP      default 5    (per user, rolling 24 h)
  PRICE_DROP_PUSH_QUIET_HOURS    default true (defer during 21:00-07:00)
"""

from __future__ import annotations

import hashlib
import os
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Callable, Iterable, Optional

import structlog
from sqlalchemy.orm import Session

from app.utils.channel_center import (
    check_and_record_delivery,
    is_quiet_hours,
    mark_delivery_sent,
    normalize_channels,
    release_failed_delivery,
)
from app.utils.notify_fcm import (
    FCM_INVALID_TOKEN,
    FCM_NOT_CONFIGURED,
    FCM_SENT,
    fcm_configured,
    send_fcm_message,
)
from db.models import (
    CarListing,
    DevicePushToken,
    MarketAlert,
    NotificationDeliveryLog,
    VehiclePriceHistory,
    live_listing_filter,
)

log = structlog.get_logger()

PUBLIC_WEB_BASE = "https://motormila.pages.dev"
PRICE_DROP_CHANNEL = "fcm"
PRICE_DROP_KIND = "price_drop"
_CHUNK = 500


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, "").strip() or default)
    except ValueError:
        return default


@dataclass(frozen=True)
class PriceDrop:
    listing: CarListing
    old_price: Decimal
    new_price: Decimal

    @property
    def listing_id(self) -> int:
        return int(self.listing.id)

    @property
    def pct(self) -> float:
        if not self.old_price:
            return 0.0
        return float((self.old_price - self.new_price) / self.old_price * 100)


# --------------------------------------------------------------- formatting
def format_lkr_short(value: Decimal | float) -> str:
    v = float(value)
    if v >= 1_000_000:
        return f"Rs {v / 1_000_000:.1f}M"
    if v >= 1_000:
        return f"Rs {v / 1_000:.0f}K"
    return f"Rs {v:,.0f}"


def vehicle_label(listing: CarListing) -> str:
    parts = [str(p).strip() for p in (listing.make, listing.model, listing.year) if p]
    return " ".join(parts) or (str(listing.title or "").strip()[:60] or "a listing you follow")


def build_price_drop_content(drop: PriceDrop) -> tuple[str, str, dict]:
    """(title, body, data) for one drop, e.g.
    "Price drop: Toyota Aqua 2017" / "Rs 6.2M → Rs 5.9M (−4.8%)"."""
    old_s, new_s = format_lkr_short(drop.old_price), format_lkr_short(drop.new_price)
    if old_s == new_s:  # both round to the same 1-dp millions
        old_s = f"Rs {float(drop.old_price):,.0f}"
        new_s = f"Rs {float(drop.new_price):,.0f}"
    title = f"Price drop: {vehicle_label(drop.listing)}"
    body = f"{old_s} → {new_s} (−{drop.pct:.1f}%)"
    data = {
        "type": PRICE_DROP_KIND,
        "listing_id": str(drop.listing_id),
        "deep_link": f"{PUBLIC_WEB_BASE}/listing/{drop.listing_id}",
        "old_price_lkr": str(int(drop.old_price)),
        "new_price_lkr": str(int(drop.new_price)),
    }
    return title, body, data


# ------------------------------------------------------------------ dedupe
def user_hash(user_token: str) -> str:
    return hashlib.sha256(user_token.strip().lower().encode()).hexdigest()[:16]


def price_drop_dedupe_key(listing_id: int, new_price: Decimal | float, user_token: str) -> str:
    return f"pd:{int(listing_id)}:{int(new_price)}:{user_hash(user_token)}:{PRICE_DROP_CHANNEL}"


def sent_in_last_day(db: Session, user_token: str, *, now: datetime) -> int:
    try:
        return int(
            db.query(NotificationDeliveryLog)
            .filter(
                NotificationDeliveryLog.channel == PRICE_DROP_CHANNEL,
                NotificationDeliveryLog.dedupe_key.like(f"pd:%:{user_hash(user_token)}:{PRICE_DROP_CHANNEL}"),
                NotificationDeliveryLog.created_at >= now - timedelta(hours=24),
                NotificationDeliveryLog.status == "sent",
            )
            .count()
        )
    except Exception:
        return 0


# --------------------------------------------------------------- detection
def find_recent_price_drops(
    db: Session,
    *,
    since: datetime,
    min_pct: float = 1.0,
    max_listings: int = 5000,
) -> list[PriceDrop]:
    """Live listings whose newest price point (recorded >= *since*) is below
    the point before it, by at least *min_pct* percent."""
    candidate_ids = [
        int(row[0])
        for row in db.query(VehiclePriceHistory.vehicle_id)
        .filter(VehiclePriceHistory.scraped_at >= since)
        .distinct()
        .limit(max_listings)
        .all()
    ]
    drops: list[PriceDrop] = []
    for start in range(0, len(candidate_ids), _CHUNK):
        chunk = candidate_ids[start : start + _CHUNK]
        points: dict[int, list[tuple]] = {}
        for vid, price, scraped_at, pid in (
            db.query(
                VehiclePriceHistory.vehicle_id,
                VehiclePriceHistory.price_lkr,
                VehiclePriceHistory.scraped_at,
                VehiclePriceHistory.id,
            )
            .filter(VehiclePriceHistory.vehicle_id.in_(chunk))
            .all()
        ):
            points.setdefault(int(vid), []).append((scraped_at, pid, price))
        dropped: dict[int, tuple[Decimal, Decimal]] = {}
        for vid, rows in points.items():
            if len(rows) < 2:
                continue
            rows.sort(key=lambda r: (_aware(r[0]), r[1]))
            (_t_prev, _p, prev), (t_last, _q, last) = rows[-2], rows[-1]
            if prev is None or last is None or _aware(t_last) < _aware(since):
                continue
            prev_d, last_d = Decimal(str(prev)), Decimal(str(last))
            if prev_d <= 0 or last_d <= 0 or last_d >= prev_d:
                continue
            if float((prev_d - last_d) / prev_d * 100) < min_pct:
                continue
            dropped[vid] = (prev_d, last_d)
        if not dropped:
            continue
        listings = (
            db.query(CarListing)
            .filter(CarListing.id.in_(list(dropped)), live_listing_filter())
            .all()
        )
        for listing in listings:
            prev_d, last_d = dropped[int(listing.id)]
            # The listing row must still carry the dropped price (guards
            # against a later raise recorded outside the history table).
            current = listing.price_lkr
            if current is not None and Decimal(str(current)) != last_d:
                continue
            drops.append(PriceDrop(listing=listing, old_price=prev_d, new_price=last_d))
    return drops


def _aware(value: Optional[datetime]) -> datetime:
    if value is None:
        return datetime.min.replace(tzinfo=timezone.utc)
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def alert_wants_push(alert: MarketAlert) -> bool:
    raw = (getattr(alert, "notify_channels", None) or "").strip()
    return not raw or "push" in normalize_channels(raw)


def alert_matches_listing(alert: MarketAlert, listing: CarListing, new_price: Decimal) -> bool:
    def _eq(a: Optional[str], b: Optional[str]) -> bool:
        return (a or "").strip().lower() == (b or "").strip().lower()

    if alert.make and not _eq(alert.make, listing.make):
        return False
    if alert.model and not _eq(alert.model, listing.model):
        return False
    if alert.district and not _eq(alert.district, listing.district):
        return False
    if alert.max_price is not None and new_price > Decimal(str(alert.max_price)):
        return False
    return True


def _watched_ids(devices: Iterable[DevicePushToken]) -> set[int]:
    out: set[int] = set()
    for device in devices:
        for raw in device.watched_listing_ids or []:
            try:
                out.add(int(raw))
            except (TypeError, ValueError):
                continue
    return out


# -------------------------------------------------------------------- pass
def run_price_drop_push_pass(
    db: Session,
    *,
    now: Optional[datetime] = None,
    sender: Callable[..., str] = send_fcm_message,
) -> dict:
    t0 = time.monotonic()
    now = now or datetime.now(timezone.utc)
    summary = {
        "devices": 0,
        "drops": 0,
        "sent": 0,
        "duplicates": 0,
        "capped": 0,
        "failed": 0,
        "pruned_tokens": 0,
        "skipped": None,
    }

    def _done(reason: Optional[str] = None) -> dict:
        summary["skipped"] = reason
        summary["elapsed_seconds"] = round(time.monotonic() - t0, 3)
        log.info("price_drop_push_pass_complete", **summary)
        return summary

    if not _env_bool("PRICE_DROP_PUSH_ENABLED", True):
        return _done("disabled")
    if sender is send_fcm_message and not fcm_configured():
        return _done("fcm_not_configured")
    if _env_bool("PRICE_DROP_PUSH_QUIET_HOURS", True) and is_quiet_hours(now):
        return _done("quiet_hours")

    devices = (
        db.query(DevicePushToken)
        .filter(DevicePushToken.price_drops_enabled.is_(True))
        .all()
    )
    summary["devices"] = len(devices)
    if not devices:
        return _done("no_devices")

    lookback = _env_float("PRICE_DROP_PUSH_LOOKBACK_HOURS", 26.0)
    drops = find_recent_price_drops(
        db,
        since=now - timedelta(hours=lookback),
        min_pct=_env_float("PRICE_DROP_PUSH_MIN_PCT", 1.0),
    )
    summary["drops"] = len(drops)
    if not drops:
        db.commit()
        return _done()

    by_user: dict[str, list[DevicePushToken]] = {}
    for device in devices:
        by_user.setdefault(device.user_token, []).append(device)

    alerts_by_user: dict[str, list[MarketAlert]] = {}
    for alert in (
        db.query(MarketAlert)
        .filter(MarketAlert.active.is_(True), MarketAlert.user_token.in_(list(by_user)))
        .all()
    ):
        if alert_wants_push(alert):
            alerts_by_user.setdefault(alert.user_token, []).append(alert)

    cap = int(_env_float("PRICE_DROP_PUSH_DAILY_CAP", 5))

    for user_token, user_devices in by_user.items():
        watched = _watched_ids(user_devices)
        alerts = alerts_by_user.get(user_token, [])
        relevant: list[tuple[int, PriceDrop]] = []
        for drop in drops:
            if drop.listing_id in watched:
                relevant.append((0, drop))
            elif any(alert_matches_listing(a, drop.listing, drop.new_price) for a in alerts):
                relevant.append((1, drop))
        if not relevant:
            continue
        # Watched listings first, then the steepest cuts.
        relevant.sort(key=lambda item: (item[0], -item[1].pct))
        already = sent_in_last_day(db, user_token, now=now)
        live_devices = list(user_devices)
        for _rank, drop in relevant:
            if not live_devices:
                break
            key = price_drop_dedupe_key(drop.listing_id, drop.new_price, user_token)
            if db.query(NotificationDeliveryLog.id).filter(NotificationDeliveryLog.dedupe_key == key).first():
                summary["duplicates"] += 1
                continue
            if already >= cap:
                summary["capped"] += 1
                continue
            if not check_and_record_delivery(
                db, key=key, listing_id=drop.listing_id, channel=PRICE_DROP_CHANNEL, status="attempted"
            ):
                summary["duplicates"] += 1
                continue
            title, body, data = build_price_drop_content(drop)
            delivered = False
            for device in list(live_devices):
                result = sender(token=device.token, title=title, body=body, data=data)
                if result == FCM_SENT:
                    delivered = True
                elif result == FCM_INVALID_TOKEN:
                    live_devices.remove(device)
                    db.delete(device)
                    summary["pruned_tokens"] += 1
                elif result == FCM_NOT_CONFIGURED:
                    release_failed_delivery(db, key=key)
                    db.commit()
                    return _done("fcm_not_configured")
            if delivered:
                mark_delivery_sent(db, key=key)
                summary["sent"] += 1
                already += 1
            else:
                release_failed_delivery(db, key=key)
                summary["failed"] += 1
        db.commit()

    db.commit()
    return _done()
