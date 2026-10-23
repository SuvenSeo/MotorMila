"""Small bounded TTL cache for the public listing search.

Why: filtered ``GET /listings`` runs two scans per request (the page and a
``COUNT(*)`` over every matching row). On the Hugging Face cpu-basic Space
that cost 6-30 s per filtered request, and the same handful of filters
(Home rails, district / body chips, page 2, 3, ...) repeat constantly.

* Counts are cached per filter set (page / size / sort do not change a
  count), so paging and re-sorting skip the count scan.
* Whole responses are cached only for anonymous callers (no session token),
  who all see the identical free-browse payload. Signed-in responses are
  never cached here.

Process-local on purpose: HF Spaces runs one uvicorn worker. Entries live for
``LISTINGS_CACHE_TTL_SECONDS`` (default 60 s; 0 disables) and the store is
capped (``LISTINGS_CACHE_MAX_ENTRIES``, default 512) with LRU eviction, so an
arbitrary-query flood cannot grow memory without bound. Disabled under pytest
unless a test opts in with ``LISTINGS_CACHE_FORCE=true``.
"""

from __future__ import annotations

import os
import threading
import time
from collections import OrderedDict
from typing import Any

_MISSING = object()
MISSING = _MISSING

_LOCK = threading.Lock()
_STORE: "OrderedDict[str, tuple[float, Any]]" = OrderedDict()


def _env_int(name: str, default: int, minimum: int) -> int:
    raw = os.getenv(name, "").strip()
    try:
        return max(minimum, int(raw)) if raw else default
    except ValueError:
        return default


def ttl_seconds() -> int:
    return _env_int("LISTINGS_CACHE_TTL_SECONDS", 60, 0)


def max_entries() -> int:
    return _env_int("LISTINGS_CACHE_MAX_ENTRIES", 512, 1)


def enabled() -> bool:
    if ttl_seconds() <= 0:
        return False
    if os.getenv("PYTEST_CURRENT_TEST") and os.getenv("LISTINGS_CACHE_FORCE", "").strip().lower() not in {
        "1",
        "true",
        "yes",
        "on",
    }:
        return False
    return True


def get(key: str) -> Any:
    if not enabled():
        return _MISSING
    now = time.monotonic()
    with _LOCK:
        entry = _STORE.get(key)
        if entry is None:
            return _MISSING
        expires_at, value = entry
        if now >= expires_at:
            _STORE.pop(key, None)
            return _MISSING
        _STORE.move_to_end(key)
        return value


def put(key: str, value: Any) -> None:
    if not enabled():
        return
    with _LOCK:
        _STORE[key] = (time.monotonic() + ttl_seconds(), value)
        _STORE.move_to_end(key)
        limit = max_entries()
        while len(_STORE) > limit:
            _STORE.popitem(last=False)


def clear() -> None:
    with _LOCK:
        _STORE.clear()


def size() -> int:
    with _LOCK:
        return len(_STORE)
