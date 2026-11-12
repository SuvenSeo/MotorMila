"""Platform-owner allowlist.

Accounts listed in ``OWNER_EMAILS`` (comma-separated, case-insensitive;
default ``suvenseoras@gmail.com``) are always treated as full admins on the
top paid tier: role=admin, plan=enterprise, subscription_status=active,
is_active=true. The auth layer heals the owner's ``platform_users`` row to
those values whenever the account is resolved, so admin demotions, plan
downgrades, billing webhooks or deactivation can never lock the owner out.

Owner elevation never *creates* an account: the owner signs up / is invited
like anyone else, and elevation applies from the first resolution onwards.
Set ``OWNER_EMAILS=`` (empty) to disable the allowlist entirely.
"""

from __future__ import annotations

import os

DEFAULT_OWNER_EMAILS = "suvenseoras@gmail.com"

OWNER_ROLE = "admin"
OWNER_PLAN = "enterprise"
OWNER_SUBSCRIPTION_STATUS = "active"


def owner_emails() -> frozenset[str]:
    raw = os.getenv("OWNER_EMAILS")
    if raw is None:
        raw = DEFAULT_OWNER_EMAILS
    return frozenset(
        part.strip().lower() for part in raw.split(",") if part and part.strip()
    )


def is_owner_email(email: object) -> bool:
    if not isinstance(email, str):
        return False
    normalized = email.strip().lower()
    return bool(normalized) and normalized in owner_emails()
