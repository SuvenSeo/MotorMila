"""Firebase Cloud Messaging (HTTP v1) sender for native Android pushes.

Secrets-gated, fail-open: when no service account is configured every send
returns ``FCM_NOT_CONFIGURED`` (logged once per process) and callers skip.

Configure ONE of:
  FCM_SERVICE_ACCOUNT_JSON        service-account JSON (raw or base64)
  GOOGLE_APPLICATION_CREDENTIALS  path to the service-account JSON file
Optional:
  FCM_PROJECT_ID                  overrides the JSON's ``project_id``

Auth is the standard service-account JWT-bearer flow (RS256 assertion signed
with ``cryptography`` -> OAuth2 access token, cached until shortly before
expiry), so no google-auth dependency is needed.
"""

from __future__ import annotations

import base64
import json
import os
import threading
import time
from dataclasses import dataclass
from typing import Any, Callable, Optional

import httpx
import structlog

log = structlog.get_logger()

FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging"
DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token"
FCM_SEND_URL = "https://fcm.googleapis.com/v1/projects/{project_id}/messages:send"

FCM_SENT = "sent"
FCM_INVALID_TOKEN = "invalid_token"
FCM_FAILED = "failed"
FCM_NOT_CONFIGURED = "not_configured"


@dataclass(frozen=True)
class ServiceAccount:
    client_email: str
    private_key: str
    project_id: str
    token_uri: str = DEFAULT_TOKEN_URI


_lock = threading.Lock()
_cached_token: Optional[tuple[str, float]] = None  # (access_token, expires_at_epoch)
_warned_unconfigured = False


def _reset_cache_for_tests() -> None:
    global _cached_token, _warned_unconfigured
    with _lock:
        _cached_token = None
        _warned_unconfigured = False


def _parse_service_account(raw: str) -> Optional[dict]:
    raw = (raw or "").strip()
    if not raw:
        return None
    if not raw.startswith("{"):
        try:
            raw = base64.b64decode(raw + "=" * (-len(raw) % 4)).decode("utf-8")
        except Exception:
            return None
    try:
        data = json.loads(raw)
    except (ValueError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def load_service_account() -> Optional[ServiceAccount]:
    data = _parse_service_account(os.getenv("FCM_SERVICE_ACCOUNT_JSON", ""))
    if data is None:
        path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
        if path and os.path.isfile(path):
            try:
                with open(path, "r", encoding="utf-8") as fh:
                    data = _parse_service_account(fh.read())
            except OSError:
                data = None
    if not data:
        return None
    client_email = str(data.get("client_email") or "").strip()
    private_key = str(data.get("private_key") or "").strip()
    project_id = (os.getenv("FCM_PROJECT_ID", "").strip() or str(data.get("project_id") or "").strip())
    if not (client_email and private_key and project_id):
        return None
    return ServiceAccount(
        client_email=client_email,
        private_key=private_key,
        project_id=project_id,
        token_uri=str(data.get("token_uri") or DEFAULT_TOKEN_URI),
    )


def fcm_configured() -> bool:
    return load_service_account() is not None


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def build_signed_assertion(sa: ServiceAccount, *, now: Optional[int] = None) -> str:
    """RS256 JWT assertion for the OAuth2 JWT-bearer grant."""
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding

    issued = int(now if now is not None else time.time())
    header = {"alg": "RS256", "typ": "JWT"}
    claims = {
        "iss": sa.client_email,
        "scope": FCM_SCOPE,
        "aud": sa.token_uri,
        "iat": issued,
        "exp": issued + 3600,
    }
    signing_input = (
        _b64url(json.dumps(header, separators=(",", ":")).encode())
        + "."
        + _b64url(json.dumps(claims, separators=(",", ":")).encode())
    )
    key = serialization.load_pem_private_key(sa.private_key.encode(), password=None)
    signature = key.sign(signing_input.encode("ascii"), padding.PKCS1v15(), hashes.SHA256())  # type: ignore[union-attr,call-arg]
    return signing_input + "." + _b64url(signature)


def _access_token(sa: ServiceAccount, client: httpx.Client) -> Optional[str]:
    global _cached_token
    with _lock:
        if _cached_token and _cached_token[1] - 60 > time.time():
            return _cached_token[0]
    try:
        resp = client.post(
            sa.token_uri,
            data={
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": build_signed_assertion(sa),
            },
        )
    except Exception as exc:
        log.warning("fcm_oauth_failed", error=str(exc))
        return None
    if resp.status_code != 200:
        log.warning("fcm_oauth_failed", status=resp.status_code, body=resp.text[:300])
        return None
    payload = resp.json()
    token = str(payload.get("access_token") or "")
    if not token:
        return None
    expires_in = int(payload.get("expires_in") or 3600)
    with _lock:
        _cached_token = (token, time.time() + expires_in)
    return token


def is_invalid_token_response(status_code: int, body: Any) -> bool:
    """FCM says the registration token is dead: prune it.

    404 / UNREGISTERED = app uninstalled or token rotated;
    400 INVALID_ARGUMENT naming the token = malformed token.
    """
    if status_code == 404:
        return True
    error = body.get("error") if isinstance(body, dict) else None
    if not isinstance(error, dict):
        return False
    codes = {
        detail.get("errorCode")
        for detail in (error.get("details") or [])
        if isinstance(detail, dict)
    }
    if "UNREGISTERED" in codes:
        return True
    # INVALID_ARGUMENT also covers bad payloads; only a token complaint
    # ("... not a valid FCM registration token") means the token is dead.
    message = str(error.get("message") or "").lower()
    return status_code == 400 and "registration token" in message


def build_message(*, token: str, title: str, body: str, data: dict[str, Any]) -> dict:
    """Data-only, high-priority Android message.

    Data-only so ``onMessageReceived`` always runs (foreground and
    background) and the app builds the notification itself with the
    in-app deep link. FCM data values must be strings.
    """
    flat = {str(k): str(v) for k, v in data.items() if v is not None}
    flat["title"] = title[:120]
    flat["body"] = body[:300]
    return {
        "message": {
            "token": token,
            "data": flat,
            "android": {"priority": "high", "ttl": "86400s"},
        }
    }


def send_fcm_message(
    *,
    token: str,
    title: str,
    body: str,
    data: dict[str, Any],
    client_factory: Callable[[], httpx.Client] | None = None,
) -> str:
    """Send one push. Returns FCM_SENT / FCM_INVALID_TOKEN / FCM_FAILED / FCM_NOT_CONFIGURED."""
    global _warned_unconfigured
    sa = load_service_account()
    if sa is None:
        if not _warned_unconfigured:
            _warned_unconfigured = True
            log.info("fcm_skipped_not_configured", reason="FCM_SERVICE_ACCOUNT_JSON unset")
        return FCM_NOT_CONFIGURED
    if not token:
        return FCM_INVALID_TOKEN
    factory = client_factory or (lambda: httpx.Client(timeout=10.0))
    try:
        with factory() as client:
            access = _access_token(sa, client)
            if not access:
                return FCM_FAILED
            resp = client.post(
                FCM_SEND_URL.format(project_id=sa.project_id),
                headers={"Authorization": f"Bearer {access}"},
                json=build_message(token=token, title=title, body=body, data=data),
            )
    except Exception as exc:
        log.warning("fcm_send_failed", error=str(exc))
        return FCM_FAILED
    if resp.status_code == 200:
        return FCM_SENT
    try:
        parsed = resp.json()
    except Exception:
        parsed = None
    if is_invalid_token_response(resp.status_code, parsed):
        log.info("fcm_token_invalid", status=resp.status_code)
        return FCM_INVALID_TOKEN
    if resp.status_code == 401:
        # Cached access token revoked/expired early: drop it for the next call.
        _reset_access_token()
    log.warning("fcm_send_rejected", status=resp.status_code, body=resp.text[:300])
    return FCM_FAILED


def _reset_access_token() -> None:
    global _cached_token
    with _lock:
        _cached_token = None
