"""Optional invite email delivery via Resend (or SMTP fallback).

Configured when RESEND_API_KEY (preferred) or SMTP_* env vars are set.
Fails open: invite creation still succeeds if email cannot be sent.
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


def _public_app_origin() -> str:
    return (
        os.getenv("PUBLIC_APP_ORIGIN", "").strip().rstrip("/")
        or os.getenv("FRONTEND_ORIGIN", "").strip().rstrip("/")
        or "https://motormila.vercel.app"
    )


def invite_signup_url(token: str) -> str:
    return f"{_public_app_origin()}/sign-up?token={token}"


def try_send_invite_email(*, to_email: str, plan: str, token: str, invited_by: Optional[str] = None) -> bool:
    """Best-effort invite email. Returns True when a provider accepted the message."""
    signup_url = invite_signup_url(token)
    subject = "You're invited to Motormila"
    body = (
        f"You've been invited to Motormila on the {plan} plan.\n\n"
        f"Create your account:\n{signup_url}\n\n"
        f"{'Invited by: ' + invited_by + chr(10) if invited_by else ''}"
        "If you weren't expecting this, you can ignore the email."
    )
    html = (
        f"<p>You've been invited to <strong>Motormila</strong> on the "
        f"<strong>{plan}</strong> plan.</p>"
        f'<p><a href="{signup_url}">Create your account</a></p>'
        f"<p style='color:#666;font-size:12px'>Or open: {signup_url}</p>"
    )

    resend_key = os.getenv("RESEND_API_KEY", "").strip()
    if resend_key:
        return _send_resend(
            api_key=resend_key,
            to_email=to_email,
            subject=subject,
            text=body,
            html=html,
        )

    smtp_host = os.getenv("SMTP_HOST", "").strip()
    if smtp_host:
        return _send_smtp(to_email=to_email, subject=subject, text=body)

    log.info("invite_email_skipped", reason="no_email_provider_configured", to=to_email)
    return False


def try_send_waitlist_confirmation(*, to_email: str) -> bool:
    """Best-effort confirmation for mobile-app launch-list signups.

    Uses Resend when RESEND_API_KEY is set; silently skips otherwise.
    Never raises — callers treat this as fire-and-forget.
    """
    resend_key = os.getenv("RESEND_API_KEY", "").strip()
    if not resend_key:
        log.info("waitlist_email_skipped", reason="no_email_provider_configured", to=to_email)
        return False
    subject = "You're on the Motormila launch list"
    text = (
        "Thanks for joining the Motormila mobile launch list.\n\n"
        "We'll email you the moment the Android APK drops — beta invites go out first.\n\n"
        "— The Motormila team"
    )
    html = (
        "<p>Thanks for joining the <strong>Motormila mobile</strong> launch list.</p>"
        "<p>We'll email you the moment the Android APK drops — beta invites go out first.</p>"
        "<p style='color:#666;font-size:12px'>One email at launch. No marketing lists.</p>"
    )
    try:
        return _send_resend(api_key=resend_key, to_email=to_email, subject=subject, text=text, html=html)
    except Exception as exc:  # noqa: BLE001 — email must never break signup
        log.warning("waitlist_email_failed", error=str(exc), to=to_email)
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
            log.info("invite_email_resend", ok=ok, to=to_email)
            return ok
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        log.warning("invite_email_resend_failed", error=str(exc), to=to_email)
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
        log.info("invite_email_smtp", ok=True, to=to_email)
        return True
    except (OSError, smtplib.SMTPException) as exc:
        log.warning("invite_email_smtp_failed", error=str(exc), to=to_email)
        return False
