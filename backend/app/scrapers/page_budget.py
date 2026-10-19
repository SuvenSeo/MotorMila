"""Shared page-budget helpers for multi-category vehicle scrapers.

Every cap here used to be a hard-coded number, which meant a source could only
ever see as much of its catalogue as a constant allowed:

    secondary_page_budget(120) -> 25      # max_pages // 4, then capped at 25

That 25-page ceiling was the single biggest artificial depth limiter in the
fleet. It hit every non-primary category of ikman, riyasewana, patpat, saleme,
riyahub, hitad and auto-lanka — so those sources never saw more than the first
25 pages of a category no matter how large the budget was, and none of them
could start past page 25 either.

The real governor is wall-clock, not page count: a source stops when it runs
out of time or hits a genuine end of catalogue, not when it hits a constant.
So both knobs are now operator-tunable and the defaults no longer impose a
cliff:

* ``SCRAPE_SECONDARY_PAGE_CAP``    (default: no ceiling, was a hard 25)
* ``SCRAPE_SECONDARY_PAGE_DIVISOR`` (default 1 = no rationing, was 4)
* ``SCRAPE_SECONDARY_MIN_PAGES``   (default 5)

Depth beyond what a single run can reach is reached by segmenting instead —
see :func:`start_page_from_env`.
"""

from __future__ import annotations

import os

DEFAULT_SECONDARY_PAGE_CAP: int | None = None
DEFAULT_SECONDARY_MIN_PAGES = 5
DEFAULT_SECONDARY_DIVISOR = 1


def _env_int(name: str, fallback: int, *, minimum: int = 1) -> int:
    """Read a positive int from the environment, falling back on junk."""
    raw = os.getenv(name)
    if raw is None or str(raw).strip() == "":
        return fallback
    try:
        parsed = int(str(raw).strip())
    except (TypeError, ValueError):
        return fallback
    return parsed if parsed >= minimum else fallback


def secondary_page_cap() -> int | None:
    """Ceiling for a single non-primary category.

    ``None`` (the default) means no ceiling at all: a category may use the
    whole budget and is then stopped only by wall-clock or by a genuine end of
    catalogue. Set ``SCRAPE_SECONDARY_PAGE_CAP`` to ration deliberately.
    """
    return _env_int("SCRAPE_SECONDARY_PAGE_CAP", 0, minimum=0) or None


def secondary_page_divisor() -> int:
    """How much of the primary budget a secondary category may use (1 = all)."""
    return _env_int("SCRAPE_SECONDARY_PAGE_DIVISOR", DEFAULT_SECONDARY_DIVISOR)


def secondary_min_pages() -> int:
    """Floor so a small budget still lets a category get past page 1."""
    return _env_int("SCRAPE_SECONDARY_MIN_PAGES", DEFAULT_SECONDARY_MIN_PAGES)


def secondary_page_budget(
    max_pages: int,
    *,
    min_pages: int | None = None,
    max_pages_cap: int | None = None,
    divisor: int | None = None,
) -> int:
    """Page budget for one non-primary vehicle category.

    Never exceeds the caller-requested ``max_pages``, and never imposes a
    ceiling the operator did not ask for.
    """
    page_limit = max(1, int(max_pages or 1))
    floor = secondary_min_pages() if min_pages is None else max(1, int(min_pages))
    cap = secondary_page_cap() if max_pages_cap is None else max_pages_cap
    div = max(1, int(divisor)) if divisor is not None else secondary_page_divisor()

    desired = max(floor, page_limit // div)
    if cap is not None:
        desired = min(max(1, int(cap)), desired)
    return max(1, min(page_limit, desired))


def page_budget_for_category(
    *,
    is_primary: bool,
    max_pages: int,
    min_pages: int | None = None,
    max_pages_cap: int | None = None,
    divisor: int | None = None,
) -> int:
    page_limit = max(1, int(max_pages or 1))
    if is_primary:
        return page_limit
    return secondary_page_budget(
        page_limit,
        min_pages=min_pages,
        max_pages_cap=max_pages_cap,
        divisor=divisor,
    )


def should_stop_at_page_hint(
    page_num: int,
    max_page_hint: int | None,
    *,
    produced_listings: bool,
) -> bool:
    """Whether an advertised "last page" is safe to stop on.

    A site's own pagination hint is a claim, not a fact: many render a window
    (``1 2 3 … Next``) and so under-report the true last page. Stopping on it
    would silently cut the catalogue short, which is far worse than the handful
    of wasted requests it would have saved.

    So the hint only ends a crawl on a page that produced nothing anyway —
    where the empty-page detector is about to stop it regardless. A page that
    is still yielding listings is always followed, hint or not.
    """
    if not max_page_hint or produced_listings:
        return False
    return page_num >= max_page_hint


def start_page_from_env(source: str, *, default: int = 1) -> int:
    """First page a crawl should visit, so a source can be crawled in segments.

    Reads ``<SOURCE>_START_PAGE`` and falls back to the fleet-wide
    ``SCRAPE_START_PAGE``. Without this a source is only ever crawled from
    page 1: each run re-reads the same first pages and a deep catalogue is
    never reached, no matter how generous the page budget is.

    Values below 1 and values that are not integers are ignored rather than
    raised, so a mistyped env var degrades to a normal full crawl instead of
    killing a scrape run.
    """
    names = [f"{source.upper()}_START_PAGE", "SCRAPE_START_PAGE"]
    for name in names:
        raw = os.getenv(name)
        if raw is None or str(raw).strip() == "":
            continue
        try:
            parsed = int(str(raw).strip())
        except (TypeError, ValueError):
            continue
        if parsed < 1:
            continue
        return parsed
    return max(1, int(default or 1))
