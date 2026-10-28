"""Optional email notifier for market-alert match deltas.

Prefers RESEND_API_KEY, falls back to SMTP_* env vars (same config used by
invite_email.py — no shared import to avoid refactor risk).

Fails open: missing credentials or network errors never abort the scrape.
"""

from __future__ import annotations

import json
import os
import smtplib
import ssl
import urllib.error
import urllib.request
from email.message import EmailMessage
from typing import Optional

import structlog

log = structlog.get_logger()


def email_notify_configured() -> bool:
    resend_key = os.getenv("RESEND_API_KEY", "").strip()
    if resend_key:
        return True
    return bool(os.getenv("SMTP_HOST", "").strip())


def send_alert_email(
    *,
    to_email: str,
    subject: str,
    text: str,
    html: Optional[str] = None,
) -> bool:
    """Send one alert email. Returns True when a provider accepted the message."""
    to = (to_email or "").strip()
    if not to:
        return False

    resend_key = os.getenv("RESEND_API_KEY", "").strip()
    if resend_key:
        return _send_resend(
            api_key=resend_key,
            to_email=to,
            subject=subject,
            text=text,
            html=html or text,
        )

    smtp_host = os.getenv("SMTP_HOST", "").strip()
    if smtp_host:
        return _send_smtp(to_email=to, subject=subject, text=text)

    log.info("alert_email_skipped", reason="no_email_provider_configured", to=to)
    return False


def _send_resend(*, api_key: str, to_email: str, subject: str, text: str, html: str) -> bool:
    from_addr = os.getenv("RESEND_FROM", "").strip() or "Motormila <onboarding@resend.dev>"
    payload = json.dumps(
        {
            "from": from_addr,
            "to": [to_email],
            "subject": subject,
            "text": text,
            "html": html,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            ok = 200 <= getattr(resp, "status", 200) < 300
            log.info("alert_email_resend", ok=ok, to=to_email)
            return ok
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        log.warning("alert_email_resend_failed", error=str(exc), to=to_email)
        return False


def _send_smtp(*, to_email: str, subject: str, text: str) -> bool:
    host = os.getenv("SMTP_HOST", "").strip()
    port = int(os.getenv("SMTP_PORT", "587") or 587)
    username = os.getenv("SMTP_USERNAME", "").strip()
    password = os.getenv("SMTP_PASSWORD", "").strip()
    from_addr = os.getenv("SMTP_FROM", "").strip() or username or "hello@ardenostudio.com"
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = from_addr
    message["To"] = to_email
    message.set_content(text)
    try:
        context = ssl.create_default_context()
        with smtplib.SMTP(host, port, timeout=10) as server:
            server.starttls(context=context)
            if username and password:
                server.login(username, password)
            server.send_message(message)
        log.info("alert_email_smtp", ok=True, to=to_email)
        return True
    except (OSError, smtplib.SMTPException) as exc:
        log.warning("alert_email_smtp_failed", error=str(exc), to=to_email)
        return False
