"""APScheduler wrapper: 07:00 Asia/Colombo digest-flush resend worker.

Fail-open: missing DB/table never aborts the API; the job logs and exits.
Disable with DIGEST_FLUSH_ENABLED=false. Hour/minute/timezone tunable via
DIGEST_FLUSH_HOUR / DIGEST_FLUSH_MINUTE / DIGEST_FLUSH_TIMEZONE.
"""

import asyncio
import os
from typing import Optional
from zoneinfo import ZoneInfo

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

log = structlog.get_logger()

_scheduler: Optional[AsyncIOScheduler] = None
_flush_lock = asyncio.Lock()
_price_drop_lock = asyncio.Lock()


def _env_truthy(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    token = raw.strip().lower()
    if token in {"1", "true", "yes", "on"}:
        return True
    if token in {"0", "false", "no", "off"}:
        return False
    return default


def _env_int(name: str, default: int, *, minimum: int, maximum: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        parsed = int(raw.strip())
    except ValueError:
        return default
    if parsed < minimum or parsed > maximum:
        return default
    return parsed


async def _run_digest_flush_job() -> None:
    if _flush_lock.locked():
        log.warning("digest_flush_skipped", reason="already_running")
        return
    async with _flush_lock:
        try:
            from app.utils.digest_flush import flush_queued_deliveries
            from db.session import HotSessionLocal

            def _work() -> dict:
                db = HotSessionLocal()
                try:
                    return flush_queued_deliveries(db)
                finally:
                    try:
                        db.close()
                    except Exception:
                        pass

            summary = await asyncio.to_thread(_work)
            log.info("digest_flush_job_done", **summary)
        except Exception as exc:
            log.warning("digest_flush_job_failed", error=str(exc))


async def _run_price_drop_push_job() -> None:
    """Native price-drop pushes from the API process (catches drops written by
    any sync, incl. GitHub Actions runs without FCM secrets, and drops deferred
    by quiet hours). Logged no-op when FCM is not configured."""
    if _price_drop_lock.locked():
        return
    async with _price_drop_lock:
        try:
            from app.utils.price_drop_push import run_price_drop_push_pass
            from db.session import HotSessionLocal

            def _work() -> dict:
                db = HotSessionLocal()
                try:
                    return run_price_drop_push_pass(db)
                finally:
                    try:
                        db.close()
                    except Exception:
                        pass

            await asyncio.to_thread(_work)
        except Exception as exc:
            log.warning("price_drop_push_job_failed", error=str(exc))


def start_digest_flush_scheduler() -> None:
    global _scheduler
    if not _env_truthy("DIGEST_FLUSH_ENABLED", True):
        log.info("digest_flush_disabled")
        return
    if _scheduler is not None and _scheduler.running:
        return
    zone_name = (os.getenv("DIGEST_FLUSH_TIMEZONE") or "Asia/Colombo").strip() or "Asia/Colombo"
    try:
        timezone = ZoneInfo(zone_name)
    except Exception:
        log.warning("digest_flush_timezone_invalid", timezone=zone_name, fallback="UTC")
        timezone = ZoneInfo("UTC")
    hour = _env_int("DIGEST_FLUSH_HOUR", default=7, minimum=0, maximum=23)
    minute = _env_int("DIGEST_FLUSH_MINUTE", default=0, minimum=0, maximum=59)
    scheduler = AsyncIOScheduler(timezone=timezone)
    scheduler.add_job(
        _run_digest_flush_job,
        trigger=CronTrigger(hour=hour, minute=minute, timezone=timezone),
        id="digest-flush-0700",
        max_instances=1,
        coalesce=True,
        replace_existing=True,
        misfire_grace_time=3600,
    )
    # PRICE_DROP_PUSH_INTERVAL_MINUTES=0 disables the in-process pass.
    interval = _env_int("PRICE_DROP_PUSH_INTERVAL_MINUTES", default=60, minimum=0, maximum=24 * 60)
    if interval > 0:
        scheduler.add_job(
            _run_price_drop_push_job,
            trigger=IntervalTrigger(minutes=interval, timezone=timezone),
            id="price-drop-push",
            max_instances=1,
            coalesce=True,
            replace_existing=True,
            misfire_grace_time=600,
        )
    scheduler.start()
    _scheduler = scheduler
    job = scheduler.get_job("digest-flush-0700")
    log.info(
        "digest_flush_scheduler_started",
        timezone=str(timezone),
        hour=hour,
        minute=minute,
        next_run=job.next_run_time.isoformat() if job and job.next_run_time else None,
    )


def stop_digest_flush_scheduler() -> None:
    global _scheduler
    if _scheduler is None:
        return
    try:
        _scheduler.shutdown(wait=False)
        log.info("digest_flush_scheduler_stopped")
    except Exception as exc:
        log.warning("digest_flush_scheduler_stop_failed", error=str(exc))
    finally:
        _scheduler = None
