"""Decision-time policy for market-alert match deliveries."""
from contextlib import nullcontext

from sqlalchemy.orm import Session

from app.utils.channel_center import match_channels_of
from app.utils.plan_limits import is_free_browse_plan
from db.models import MarketAlert, PlatformUser


def dispatch_session(db: Session):
    """Use the API's writable catalog, not a scraper's possibly stale copy."""
    factory = db.info.get("alert_dispatch_sessionmaker")
    return factory() if factory is not None else nullcontext(db)


def lock_active_rule(db: Session, alert_id: int) -> MarketAlert | None:
    # Discovery only nominates an ID. At READ COMMITTED PostgreSQL rechecks
    # active after waiting for a concurrent edit, and populate_existing
    # overwrites any older state already present in this session.
    return (db.query(MarketAlert)
            .filter(MarketAlert.id == alert_id, MarketAlert.active.is_(True))
            .populate_existing().with_for_update().one_or_none())


def permitted_channels(db: Session, alert: MarketAlert) -> set[str]:
    """Intersect the rule with current entitlements; never fill a destination.

    Read columns, not a potentially cached PlatformUser. FOR SHARE keeps the
    account active, verified and on the checked plan until dispatch completes.
    The mapped query also respects a dedicated account-store bind.
    """
    if not alert.active:
        return set()
    channels = match_channels_of(alert)
    if alert.notify_channels is None:
        channels.add("inapp")  # historical default for a legacy inferred rule
    if not alert.user_token.startswith("mm:"):
        return channels & {"inapp", "push"}

    owner = (db.query(PlatformUser.email, PlatformUser.plan, PlatformUser.role)
             .filter(PlatformUser.email == alert.user_token[3:],
                     PlatformUser.is_active.is_(True), PlatformUser.email_verified.is_(True))
             .with_for_update(read=True).one_or_none())
    if owner is None:
        return set()
    if not is_free_browse_plan(owner.plan, role=owner.role):
        return channels
    allowed = {"inapp", "push"}
    if alert.notify_email and alert.notify_email.lower() == owner.email.lower():
        allowed.add("email")
    return channels & allowed
