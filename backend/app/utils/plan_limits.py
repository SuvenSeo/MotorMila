"""Shared free vs Pro plan ceilings (server-side).

Keep in sync with ``src/lib/planLimits.ts``.
"""

from __future__ import annotations

from typing import Optional

FREE_LISTINGS_MAX_SIZE = 12
FREE_LISTINGS_MAX_PAGE = 1
FREE_BEST_PICKS_LIMIT = 6
FREE_ALERTS_LIMIT = 1
FREE_PRICE_DROPS_LIMIT = 3
FREE_SIMILAR_LIMIT = 4
FREE_PULSE_LIMIT = 6
FREE_TRENDS_MONTHS = 6
FREE_EV_MODELS_LIMIT = 3
FREE_VEHICLE_NEWS_LIMIT = 2
PRO_ALERTS_LIMIT = 20

# Full-access paid plans (not free-teased). Dealer includes Pro depth + yard tools.
PRO_PLANS = {"pro", "enterprise", "dealer"}


def is_free_browse_plan(plan: Optional[str], *, role: Optional[str] = None) -> bool:
    """True when the caller should receive free-tier teaser limits.

    Anonymous callers (``plan is None``) are free-teased: omitting the
    Authorization header must never unlock Pro-depth data.
    """
    if str(role or "").strip().lower() == "admin":
        return False
    if plan is None:
        return True
    return str(plan).strip().lower() not in PRO_PLANS


def take_last_months(rows: list, months: int) -> list:
    """Keep the newest N period-sorted rows for free teasers."""
    if not isinstance(rows, list) or months <= 0:
        return []
    if len(rows) <= months:
        return rows
    return rows[-months:]
