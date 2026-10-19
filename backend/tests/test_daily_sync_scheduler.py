"""Tests for app.services.daily_sync_scheduler.

Covers the env parsing helpers (_env_truthy, _env_int, _resolve_sync_hours,
_resolve_timezone), the per-hour cron wiring plus idempotent start/stop, the
opt-in run-on-startup job, and the single-flight lock around run_sync.main.

A misparsed env var here silently disables or mis-times production scrapes,
so the parsing edge cases are the point.
"""

import asyncio
import os
import sys
from pathlib import Path

# Importing the scheduler pulls in run_sync -> scrapers -> db/session, which
# validates DB env at import time; sqlite fallback matches backend CI.
os.environ.setdefault("ALLOW_SQLITE_FALLBACK", "true")

sys.path.append(str(Path(__file__).resolve().parents[1]))

import run_sync  # noqa: E402
from app.services import daily_sync_scheduler as scheduler  # noqa: E402


def test_env_truthy_parsing(monkeypatch):
    monkeypatch.delenv("DAILY_SYNC_ENABLED", raising=False)
    assert scheduler._env_truthy("DAILY_SYNC_ENABLED", True) is True
    assert scheduler._env_truthy("DAILY_SYNC_ENABLED", False) is False

    for token in ("1", "true", "TRUE", "yes", "on", " True "):
        monkeypatch.setenv("DAILY_SYNC_ENABLED", token)
        assert scheduler._env_truthy("DAILY_SYNC_ENABLED", False) is True

    for token in ("0", "false", "no", "off"):
        monkeypatch.setenv("DAILY_SYNC_ENABLED", token)
        assert scheduler._env_truthy("DAILY_SYNC_ENABLED", True) is False

    for token in ("", "maybe", "2"):
        monkeypatch.setenv("DAILY_SYNC_ENABLED", token)
        assert scheduler._env_truthy("DAILY_SYNC_ENABLED", True) is True
        assert scheduler._env_truthy("DAILY_SYNC_ENABLED", False) is False


def test_env_int_parses_and_clamps_to_bounds(monkeypatch):
    monkeypatch.delenv("DAILY_SYNC_MINUTE", raising=False)
    assert scheduler._env_int("DAILY_SYNC_MINUTE", default=10, minimum=0, maximum=59) == 10

    for raw in ("", "   ", "abc", "12.5"):
        monkeypatch.setenv("DAILY_SYNC_MINUTE", raw)
        assert scheduler._env_int("DAILY_SYNC_MINUTE", default=10, minimum=0, maximum=59) == 10

    for raw, expected in (("7", 7), ("0", 0), ("59", 59)):
        monkeypatch.setenv("DAILY_SYNC_MINUTE", raw)
        assert scheduler._env_int("DAILY_SYNC_MINUTE", default=10, minimum=0, maximum=59) == expected

    for raw in ("-1", "60", "100"):
        monkeypatch.setenv("DAILY_SYNC_MINUTE", raw)
        assert scheduler._env_int("DAILY_SYNC_MINUTE", default=10, minimum=0, maximum=59) == 10


def test_resolve_sync_hours_parsing_and_fallbacks(monkeypatch):
    monkeypatch.delenv("DAILY_SYNC_HOURS", raising=False)
    monkeypatch.delenv("DAILY_SYNC_HOUR", raising=False)
    assert scheduler._resolve_sync_hours() == [6, 18]  # default twice daily

    monkeypatch.setenv("DAILY_SYNC_HOURS", "18,6,6,21")
    assert scheduler._resolve_sync_hours() == [6, 18, 21]  # sorted, deduped

    monkeypatch.setenv("DAILY_SYNC_HOURS", "6,24,abc, 12 ")
    assert scheduler._resolve_sync_hours() == [6, 12]  # invalid tokens dropped

    monkeypatch.setenv("DAILY_SYNC_HOURS", "24,99")
    assert scheduler._resolve_sync_hours() == [6, 18]  # all invalid -> default

    # Backward-compat single hour honoured when the plural var is absent/empty.
    monkeypatch.delenv("DAILY_SYNC_HOURS", raising=False)
    monkeypatch.setenv("DAILY_SYNC_HOUR", "3")
    assert scheduler._resolve_sync_hours() == [3]

    monkeypatch.delenv("DAILY_SYNC_HOURS", raising=False)
    monkeypatch.setenv("DAILY_SYNC_HOUR", "25")
    assert scheduler._resolve_sync_hours() == [6, 18]  # out of range -> default


def test_resolve_timezone_default_and_invalid_fallback(monkeypatch):
    monkeypatch.delenv("DAILY_SYNC_TIMEZONE", raising=False)
    assert scheduler._resolve_timezone().key == "Asia/Colombo"

    monkeypatch.setenv("DAILY_SYNC_TIMEZONE", "UTC")
    assert scheduler._resolve_timezone().key == "UTC"

    monkeypatch.setenv("DAILY_SYNC_TIMEZONE", "Not/AZone")
    assert scheduler._resolve_timezone().key == "UTC"

    monkeypatch.setenv("DAILY_SYNC_TIMEZONE", "   ")
    assert scheduler._resolve_timezone().key == "Asia/Colombo"


def test_scheduler_disabled_if_not_opted_in(monkeypatch):
    monkeypatch.setattr(scheduler, "_scheduler", None)
    monkeypatch.delenv("DAILY_SYNC_ENABLED", raising=False)

    scheduler.start_daily_sync_scheduler()

    assert scheduler._scheduler is None


def test_scheduler_wires_one_cron_job_per_hour(monkeypatch):
    monkeypatch.setattr(scheduler, "_scheduler", None)
    monkeypatch.setenv("DAILY_SYNC_ENABLED", "true")
    monkeypatch.setenv("DAILY_SYNC_HOURS", "6,18")
    monkeypatch.setenv("DAILY_SYNC_MINUTE", "10")

    async def scenario():
        scheduler.start_daily_sync_scheduler()
        try:
            running = scheduler._scheduler
            assert running is not None and running.running

            jobs = {job.id: job for job in running.get_jobs()}
            assert set(jobs) == {"daily-listing-sync-06h", "daily-listing-sync-18h"}
            for job in jobs.values():
                assert "minute='10'" in str(job.trigger)
                assert job.max_instances == 1

            scheduler.start_daily_sync_scheduler()  # already running -> no-op
            assert scheduler._scheduler is running
        finally:
            scheduler.stop_daily_sync_scheduler()
        assert scheduler._scheduler is None

    asyncio.run(scenario())


def test_run_on_startup_launches_immediate_job(monkeypatch):
    monkeypatch.setattr(scheduler, "_scheduler", None)
    monkeypatch.setattr(scheduler, "_sync_lock", asyncio.Lock())
    monkeypatch.setenv("DAILY_SYNC_ENABLED", "true")
    monkeypatch.setenv("DAILY_SYNC_RUN_ON_STARTUP", "true")
    monkeypatch.setenv("DAILY_SYNC_HOURS", "6")

    calls = []
    done = asyncio.Event()

    async def fake_main(profile_override=None):
        calls.append(profile_override)
        done.set()

    monkeypatch.setattr(run_sync, "main", fake_main)

    async def scenario():
        scheduler.start_daily_sync_scheduler()
        try:
            await asyncio.wait_for(done.wait(), timeout=2)
            assert calls == ["daily"]
        finally:
            scheduler.stop_daily_sync_scheduler()

    asyncio.run(scenario())


def test_run_daily_sync_job_calls_main_with_profile(monkeypatch):
    monkeypatch.setattr(scheduler, "_sync_lock", asyncio.Lock())
    monkeypatch.setenv("DAILY_SYNC_PROFILE", "weekly")

    calls = []

    async def fake_main(profile_override=None):
        calls.append(profile_override)

    monkeypatch.setattr(run_sync, "main", fake_main)

    async def scenario():
        await scheduler._run_daily_sync_job()
        assert calls == ["weekly"]

    asyncio.run(scenario())


def test_run_daily_sync_job_skips_while_previous_run_in_progress(monkeypatch):
    lock = asyncio.Lock()
    monkeypatch.setattr(scheduler, "_sync_lock", lock)

    calls = []

    async def fake_main(profile_override=None):
        calls.append(profile_override)

    monkeypatch.setattr(run_sync, "main", fake_main)

    async def scenario():
        await lock.acquire()
        try:
            await scheduler._run_daily_sync_job()
        finally:
            lock.release()
        assert calls == []

    asyncio.run(scenario())


def test_run_daily_sync_job_timeout_is_caught(monkeypatch):
    monkeypatch.setattr(scheduler, "_sync_lock", asyncio.Lock())
    monkeypatch.setenv("DAILY_SYNC_TIMEOUT_SECONDS", "120")

    calls = []

    async def fake_main(profile_override=None):
        calls.append(profile_override)

    class _FakeAsyncio:
        TimeoutError = asyncio.TimeoutError

        @staticmethod
        async def wait_for(coro, timeout):
            coro.close()  # patched run_sync.main coroutine is never awaited
            raise asyncio.TimeoutError("timed out")

    monkeypatch.setattr(scheduler, "asyncio", _FakeAsyncio)
    monkeypatch.setattr(run_sync, "main", fake_main)

    async def scenario():
        await scheduler._run_daily_sync_job()  # must log, not raise
        assert calls == []

    asyncio.run(scenario())


def test_run_daily_sync_job_failure_is_caught(monkeypatch):
    monkeypatch.setattr(scheduler, "_sync_lock", asyncio.Lock())

    calls = []

    async def fake_main(profile_override=None):
        calls.append(profile_override)

    class _FakeAsyncio:
        TimeoutError = asyncio.TimeoutError

        @staticmethod
        async def wait_for(coro, timeout):
            coro.close()
            raise ValueError("sync exploded")

    monkeypatch.setattr(scheduler, "asyncio", _FakeAsyncio)
    monkeypatch.setattr(run_sync, "main", fake_main)

    async def scenario():
        await scheduler._run_daily_sync_job()  # generic error path also no-raise
        assert calls == []

    asyncio.run(scenario())
