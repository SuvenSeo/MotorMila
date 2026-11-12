"""Optional Twilio WhatsApp notifier for market-alert match deltas.

Fails open: missing credentials or network errors never abort the scrape.
Configure via:

  TWILIO_ACCOUNT_SID
  TWILIO_AUTH_TOKEN
  TWILIO_WHATSAPP_FROM   (e.g. whatsapp:+14155238886)
"""

from __future__ import annotations

import os
from typing import Optional
from urllib.parse import quote

import httpx
import structlog

log = structlog.get_logger()


def whatsapp_notify_configured() -> bool:
    return bool(
        os.getenv("TWILIO_ACCOUNT_SID", "").strip()
        and os.getenv("TWILIO_AUTH_TOKEN", "").strip()
        and os.getenv("TWILIO_WHATSAPP_FROM", "").strip()
    )


def normalize_whatsapp_to(phone: str) -> Optional[str]:
    raw = (phone or "").strip()
    if not raw:
        return None
    digits = "".join(ch for ch in raw if ch.isdigit() or ch == "+")
    if not digits:
        return None
    if not digits.startswith("+"):
        # Sri Lanka default country code when users enter local mobiles.
        if digits.startswith("0"):
            digits = "+94" + digits[1:]
        else:
            digits = "+" + digits
    return f"whatsapp:{digits}"


def send_whatsapp_alert(
    *,
    to_phone: str,
    body: str,
    timeout_seconds: float = 8.0,
) -> bool:
    """Send one WhatsApp message via Twilio. Returns True on HTTP 2xx."""
    if not whatsapp_notify_configured():
        return False

    to_addr = normalize_whatsapp_to(to_phone)
    if not to_addr:
        return False

    sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
    token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
    from_addr = os.getenv("TWILIO_WHATSAPP_FROM", "").strip()
    if not from_addr.startswith("whatsapp:"):
        from_addr = f"whatsapp:{from_addr}"

    url = f"https://api.twilio.com/2010-04-01/Accounts/{quote(sid)}/Messages.json"
    try:
        response = httpx.post(
            url,
            data={"From": from_addr, "To": to_addr, "Body": body[:1500]},
            auth=(sid, token),
            timeout=timeout_seconds,
        )
        if 200 <= response.status_code < 300:
            log.info("whatsapp_alert_sent", to=to_addr, status=response.status_code)
            return True
        log.warning(
            "whatsapp_alert_failed",
            to=to_addr,
            status=response.status_code,
            body=response.text[:200],
        )
        return False
    except Exception as exc:
        log.warning("whatsapp_alert_error", error=str(exc))
        return False


def build_alert_match_message(
    *,
    make: Optional[str],
    model: Optional[str],
    district: Optional[str],
    max_price: Optional[float],
    match_count: int,
    site_origin: str = "https://motormila.pages.dev",
) -> str:
    label_parts = [p for p in [make, model] if p]
    label = " ".join(label_parts) if label_parts else "your saved search"
    where = f" in {district}" if district else ""
    budget = f" under Rs {int(max_price):,}" if max_price else ""
    return (
        f"Motormila: {match_count} new match{'es' if match_count != 1 else ''} "
        f"for {label}{where}{budget}. "
        f"Open {site_origin}/alerts"
    )
