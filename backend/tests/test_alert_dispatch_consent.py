"""Delivery policy at the worker boundary; no provider or service connections."""
from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.utils import alert_matcher, digest_flush, notify_email, notify_push, notify_telegram, notify_whatsapp
from app.utils.channel_center import match_channels_of, normalize_channels
from db.models import (
    Base, CarListing, MarketAlert, MarketAlertMatch, NotificationDeliveryLog,
    PlatformUser, PushSubscription, UserNotification,
)


def test_stored_sms_is_not_consent_to_whatsapp():
    alert = MarketAlert(notify_channels="sms", notify_phone="0771234567")
    assert match_channels_of(alert) == set()
    assert normalize_channels("SMS,email") == {"email"}
    with pytest.raises(ValueError):
        normalize_channels("sms", strict=True)


OWNER = "owner@example.test"
OTHER = "other@example.test"
EXTERNAL = ("whatsapp", "telegram", "email", "push")


@pytest.fixture
def sessions(tmp_path):
    # Independent connections; keep ORM instances alive across commits to expose
    # code that mistakes a SELECT returning a cached instance for a fresh read.
    engine = create_engine(f"sqlite:///{tmp_path / 'catalog.db'}")
    with engine.begin() as conn:
        conn.exec_driver_sql("PRAGMA journal_mode=WAL")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)
    with factory.begin() as db:
        db.add(PlatformUser(email=OWNER, name="Fixture", password_hash="unused",
                            email_verified=True, plan="pro", subscription_status="active"))
        db.add(CarListing(source="fixture", source_id="1", make="Toyota", model="Aqua",
                          scraped_at=datetime.now(timezone.utc)))
    yield factory
    engine.dispose()


@pytest.fixture
def sent(monkeypatch):
    calls = []
    for channel, module, sender in (("whatsapp", notify_whatsapp, "send_whatsapp_alert"),
                                    ("telegram", notify_telegram, "send_telegram_alert"),
                                    ("email", notify_email, "send_alert_email"),
                                    ("push", notify_push, "send_push_alert")):
        def send(*, ch=channel, **kwargs):
            calls.append((ch, kwargs))
            return True
        for target in (module, alert_matcher):
            monkeypatch.setattr(target, sender, send)
            monkeypatch.setattr(target, f"{channel}_notify_configured", lambda: True)
    return calls


def rule_for(db, *, channels, owner=None, email=OTHER, mode="instant"):
    token = f"mm:{OWNER}" if owner is None else owner
    alert = MarketAlert(user_token=token, active=True, notify_channels=channels,
                        notify_phone="0771234567", notify_telegram_chat_id="1234",
                        notify_email=email, delivery_mode=mode)
    db.add(alert)
    db.add(PushSubscription(user_token=token, endpoint=f"https://push.invalid/{token}"))
    db.commit()
    return alert


def seed_queue(db, alert, channels):
    db.add(MarketAlertMatch(alert_id=alert.id, match_count=1,
                            last_matched_at=datetime.now(timezone.utc)))
    for ch in channels:
        db.add(NotificationDeliveryLog(dedupe_key=f"{alert.id}:1:{ch}", alert_id=alert.id,
                                      listing_id=1, channel=ch, status="digest_queued"))
    db.commit()


@pytest.mark.parametrize("path", ["instant", "flush"])
@pytest.mark.parametrize(("change", "recipient", "allowed"), [
    ("downgrade", OTHER, {"push"}), ("downgrade", OWNER, {"push", "email"}),
    ("unverify", OWNER, set()), ("disable", OTHER, set()), ("delete", OWNER, set()),
    ("legacy", OWNER, {"push"}), ("none", OTHER, set(EXTERNAL)),
])
def test_dispatch_intersects_current_owner_policy(sessions, sent, path, change, recipient, allowed):
    with sessions() as worker:
        cached_owner = worker.query(PlatformUser).one()
        alert = rule_for(worker, channels=",".join(EXTERNAL), email=recipient,
                         owner="anonymous" if change == "legacy" else None)
        if path == "flush":
            seed_queue(worker, alert, EXTERNAL)
        with sessions.begin() as writer:
            owner = writer.query(PlatformUser).one()
            if change == "downgrade":
                owner.plan = "free"
            elif change == "unverify":
                owner.email_verified = False
            elif change == "disable":
                owner.is_active = False
            elif change == "delete":
                writer.delete(owner)
        assert cached_owner.plan == "pro"  # intentionally stale in this session
        if path == "flush":
            summary = digest_flush.flush_queued_deliveries(worker)
            assert {r.channel: r.status for r in worker.query(NotificationDeliveryLog)} == {
                ch: "sent" if ch in allowed else "skipped" for ch in EXTERNAL
            }
        else:
            summary = alert_matcher.run_alert_match_pass(worker)
        assert summary["errors"] == 0
        assert sorted(ch for ch, _ in sent) == sorted(allowed)
        assert all(args["to_email"] == recipient for ch, args in sent if ch == "email")
        assert worker.query(UserNotification).count() == 0  # never synthesize an inbox fallback


def test_blocked_legacy_destinations_are_not_enqueued(sessions, sent):
    with sessions() as db:
        rule_for(db, channels=None, owner="legacy", mode="digest")
        result = alert_matcher.run_alert_match_pass(db)
        assert result["errors"] == 0 and result["queued"] == 0
        assert db.query(NotificationDeliveryLog).count() == 0
        assert db.query(UserNotification).count() == 1  # existing legacy inbox behavior
        assert not sent


@pytest.mark.parametrize("path", ["instant", "flush"])
@pytest.mark.parametrize("edit", ["pause", "optout"])
def test_committed_edit_after_candidate_scan_wins(sessions, sent, path, edit):
    with sessions() as worker:
        alert = rule_for(worker, channels="email")
        if path == "flush":
            seed_queue(worker, alert, ["email"])
        # Commit a change from a different connection AFTER the discovery query
        # has executed. The worker still has the old rule in its identity map.
        scanned = []
        @event.listens_for(worker, "do_orm_execute", retval=True)
        def after_scan(state):
            result = state.invoke_statement()
            if not scanned and state.is_select:
                scanned.append(True)
                with sessions.begin() as writer:
                    current = writer.get(MarketAlert, alert.id)
                    if edit == "pause":
                        current.active = False
                    else:
                        current.notify_channels = "push"
            return result
        if path == "flush":
            summary = digest_flush.flush_queued_deliveries(worker)
            assert worker.query(NotificationDeliveryLog).one().status == "skipped"
        else:
            summary = alert_matcher.run_alert_match_pass(worker)
        assert scanned and summary["errors"] == 0
        assert all(channel != "email" for channel, _ in sent)
        if edit == "pause" or path == "flush":
            assert sent == []


@pytest.mark.parametrize("path", ["instant", "flush"])
def test_providers_run_under_postgres_locks_for_only_one_rule(sessions, sent, monkeypatch, path):
    # SQLite ignores FOR UPDATE. Inspect the SQL destined for PostgreSQL and
    # verify those reads belong to the same live transaction as the send.
    from sqlalchemy.dialects import postgresql

    with sessions() as worker:
        first = rule_for(worker, channels="email")
        second = MarketAlert(user_token=first.user_token, active=True,
                             notify_channels="email", notify_email=OWNER)
        worker.add(second)
        worker.commit()
        if path == "flush":
            for alert in (first, second):
                seed_queue(worker, alert, ["email"])

        locks = {}
        @event.listens_for(worker.get_bind(), "after_cursor_execute")
        def observe(conn, cursor, statement, params, ctx, many):
            if statement.startswith("SELECT"):
                sql = str(ctx.compiled.statement.compile(dialect=postgresql.dialect()))
                if "FOR UPDATE" in sql or "FOR SHARE" in sql:
                    locks.setdefault(worker.get_transaction(), []).append(sql)

        decisions = []
        def send(**kwargs):
            decisions.append(worker.get_transaction())
            return True
        for mod in (alert_matcher, notify_email):
            monkeypatch.setattr(mod, "send_alert_email", send)
        run = alert_matcher.run_alert_match_pass if path == "instant" else digest_flush.flush_queued_deliveries
        assert run(worker)["errors"] == 0
        assert len(decisions) == len(set(decisions)) == 2
        for txn in decisions:
            assert any("FROM market_alerts" in stmt for stmt in locks[txn])
            assert any("FROM platform_users" in stmt for stmt in locks[txn])
            assert txn is not None and not txn.is_active


def test_receipt_error_cannot_release_lock_then_send(sessions, sent):
    with sessions() as worker:
        rule_for(worker, channels="email")
        NotificationDeliveryLog.__table__.drop(worker.get_bind())
        result = alert_matcher.run_alert_match_pass(worker)
        assert not sent
        assert result["errors"] == 1
        assert worker.query(MarketAlertMatch).count() == 0


@pytest.mark.parametrize("mode", ["digest", "quiet"])
def test_only_still_permitted_receipts_survive_downgrade(sessions, sent, monkeypatch, mode):
    from app.utils import channel_center

    monkeypatch.setattr(channel_center, "is_quiet_hours", lambda *_: True)
    with sessions() as db:
        alert = rule_for(db, channels=",".join(EXTERNAL), email=OWNER,
                         mode="digest" if mode == "digest" else "instant")
        alert.quiet_hours_enabled = mode == "quiet"
        db.commit()
        assert alert_matcher.run_alert_match_pass(db)["queued"] == len(EXTERNAL)
        assert not sent
        with sessions.begin() as admin:
            admin.query(PlatformUser).one().plan = "free"
        assert digest_flush.flush_queued_deliveries(db)["sent"] == 2
        assert sorted(ch for ch, _ in sent) == ["email", "push"]
        assert db.query(UserNotification).count() == 0


def test_queue_does_not_resend_receipt_completed_since_scan(sessions, sent):
    with sessions() as db:
        alert = rule_for(db, channels="email")
        seed_queue(db, alert, ["email"])
        cached = db.query(NotificationDeliveryLog).one()
        @event.listens_for(db, "do_orm_execute", once=True, retval=True)
        def finish_elsewhere(state):
            result = state.invoke_statement()
            with sessions.begin() as other:
                other.get(NotificationDeliveryLog, cached.id).status = "sent"
            return result
        result = digest_flush.flush_queued_deliveries(db)
        assert result["errors"] == 0 and result["checked"] == 1
        assert not sent


@pytest.mark.parametrize("channels", ["sms", "   "])
@pytest.mark.parametrize("path", ["instant", "flush"])
def test_nonnull_unsupported_selection_never_infers_a_route(sessions, sent, channels, path):
    with sessions() as db:
        alert = rule_for(db, channels=channels)
        if path == "flush":
            # An older worker may have created a WhatsApp receipt by mapping SMS.
            seed_queue(db, alert, ["whatsapp"])
            assert digest_flush.flush_queued_deliveries(db)["skipped"] == 1
        else:
            assert alert_matcher.run_alert_match_pass(db)["errors"] == 0
        assert sent == [] and db.query(UserNotification).count() == 0


@pytest.mark.parametrize("path", ["instant", "flush"])
def test_scraper_session_cannot_authorize_using_a_stale_cold_copy(sessions, sent, tmp_path, path):
    from db import session as db_session

    # run_sync passes a ColdSessionLocal. Model a split catalog: the alerted
    # rule/receipts exist on cold but the user has removed the rule on hot.
    hot = create_engine(f"sqlite:///{tmp_path / 'hot.db'}")
    Base.metadata.create_all(hot)
    try:
        cold_engine = sessions.kw["bind"]
        with sessions() as seed:
            alert = rule_for(seed, channels="email")
            if path == "flush":
                seed_queue(seed, alert, ["email"])
        # Use the production sessionmaker's routing, but bind BOTH sides only
        # to isolated SQLite databases.
        from unittest.mock import patch
        with patch.dict(db_session.HotSessionLocal.kw, bind=hot, binds={}), \
             db_session.ColdSessionLocal(bind=cold_engine, binds={}) as worker:
            run = alert_matcher.run_alert_match_pass if path == "instant" else digest_flush.flush_queued_deliveries
            summary = run(worker)
            assert summary["errors"] == 0 and not sent
    finally:
        hot.dispose()
