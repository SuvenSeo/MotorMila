"""Optional Telegram notifier for market-alert match deltas.

Fails open: missing credentials or network errors never abort the scrape.
Configure via:

  TELEGRAM_BOT_TOKEN   (from @BotFather, e.g. 123456789:ABCdef...)
"""

from __future__ import annotations

import os

import httpx
import structlog

log = structlog.get_logger()


def telegram_notify_configured() -> bool:
    return bool(os.getenv("TELEGRAM_BOT_TOKEN", "").strip())


def send_telegram_alert(
    *,
    chat_id: str,
    body: str,
    timeout_seconds: float = 8.0,
) -> bool:
    """Send one Telegram message via the Bot API. Returns True on HTTP 2xx."""
    token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    if not token:
        return False

    cid = (chat_id or "").strip()
    if not cid:
        return False

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    try:
        response = httpx.post(
            url,
            json={"chat_id": cid, "text": body[:4096]},
            timeout=timeout_seconds,
        )
        if 200 <= response.status_code < 300:
            log.info("telegram_alert_sent", chat_id=cid, status=response.status_code)
            return True
        log.warning(
            "telegram_alert_failed",
            chat_id=cid,
            status=response.status_code,
            body=response.text[:200],
        )
        return False
    except Exception as exc:
        # Never log str(exc): httpx exceptions embed the request URL, which
        # contains TELEGRAM_BOT_TOKEN.
        log.warning(
            "telegram_alert_error",
            error_type=type(exc).__name__,
            chat_id=cid,
        )
        return False
