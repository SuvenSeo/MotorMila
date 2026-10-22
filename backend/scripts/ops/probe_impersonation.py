"""Read-only probe: can a Cloudflare-walled source be reached with Chrome
impersonation instead of a plain httpx User-Agent?

patpat.lk and saleme.lk answer hosted-runner requests with an interstitial
(405 "Human Verification" / 403 "Just a moment..."). riyasewana already gets
through the same class of wall using curl_cffi Chrome impersonation, so this
checks whether the same trick unblocks the other two — which would avoid paying
for a residential proxy.

Usage:
    python scripts/ops/probe_impersonation.py patpat saleme
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import httpx  # noqa: E402
from bs4 import BeautifulSoup  # noqa: E402
from curl_cffi import requests as curl_requests  # noqa: E402

from app.scrapers.net import USER_AGENT_POOL, blocked_response_reason  # noqa: E402

HEADERS = {
    "User-Agent": USER_AGENT_POOL[0],
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

TARGETS = {
    "patpat": "https://patpat.lk/en/sri-lanka/vehicle/car",
    "saleme": "https://www.saleme.lk/ads/sri-lanka/cars",
    "riyasewana": "https://riyasewana.com/vehicle/car",
    "riyahub": "https://riyahub.lk/vehicle/cars",
}

# Chrome versions curl_cffi can impersonate. Probe a couple so a single dropped
# version does not read as "impersonation does not work".
IMPERSONATIONS = ("chrome124", "chrome131", "chrome136")


def _title(body: str) -> str:
    soup = BeautifulSoup(body, "lxml")
    return soup.title.get_text(strip=True) if soup.title else ""


def _report(label: str, status: int | None, body: str, elapsed: float, error: str = "") -> bool:
    ok = False
    print(f"  {label:<26} status={status} bytes={len(body):>7} {elapsed:5.1f}s title={_title(body)[:42]!r}")
    if error:
        print(f"      error={error[:120]}")
    reason = blocked_response_reason(status, body)
    if reason:
        print(f"      -> BLOCKED ({reason})")
    elif status == 200 and body:
        print("      -> reachable")
        ok = True
    return ok


def probe(name: str) -> None:
    url = TARGETS.get(name)
    if not url:
        print(f"{name}: no target URL configured")
        return

    print(f"\n=== {name}  {url}")

    started = time.monotonic()
    try:
        res = httpx.get(url, headers=HEADERS, timeout=30, follow_redirects=True)
        _report("httpx (plain UA)", res.status_code, res.text, time.monotonic() - started)
    except Exception as exc:  # noqa: BLE001 - diagnostic surface
        print(f"  {'httpx (plain UA)':<26} error={type(exc).__name__}: {str(exc)[:100]}")

    for imp in IMPERSONATIONS:
        started = time.monotonic()
        try:
            res = curl_requests.get(
                url,
                headers=HEADERS,
                impersonate=imp,
                timeout=30,
                allow_redirects=True,
            )
            if _report(f"curl_cffi {imp}", res.status_code, res.text, time.monotonic() - started):
                return
        except Exception as exc:  # noqa: BLE001 - diagnostic surface
            print(f"  {'curl_cffi ' + imp:<26} error={type(exc).__name__}: {str(exc)[:100]}")


def main(argv: list[str]) -> int:
    names = argv or list(TARGETS)
    for name in names:
        probe(name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
