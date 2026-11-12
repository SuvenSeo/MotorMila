"""Live Sri Lanka macro feeds for Motormila (FX + inflation).

Primary source: sri-lanka-macro-publisher published JSON (CBSL FX, DCS CCPI).
Fallback: open.er-api.com mid-market USD→LKR when the publisher is unreachable.

Inspired by community SL data pipelines (macro-publisher, ceylon-macro-engine,
gold-tracker FX conversion) — consumed as public data, not as a code dependency.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx
import structlog

log = structlog.get_logger()

MACRO_PUBLISHER_FX_URL = (
    "https://raw.githubusercontent.com/Gajarthan/sri-lanka-macro-publisher/"
    "main/data/latest/cbsl_fx.json"
)
MACRO_PUBLISHER_CCPI_URL = (
    "https://raw.githubusercontent.com/Gajarthan/sri-lanka-macro-publisher/"
    "main/data/latest/dcs_ccpi.json"
)
ER_API_USD_URL = "https://open.er-api.com/v6/latest/USD"

# Planning fallback when every live source fails (aligned with calculator default).
FALLBACK_USD_LKR = 300.0

USER_AGENT = "MotormilaMacroFeed/1.0 (+https://motormila.pages.dev)"


@dataclass(frozen=True)
class FxQuote:
    usd_lkr: float
    reference_date: str | None
    source: str
    source_url: str
    fetched_at: str


@dataclass(frozen=True)
class InflationQuote:
    index_value: float
    yoy_percent: float | None
    mom_percent: float | None
    reference_date: str | None
    source: str
    source_url: str
    fetched_at: str


@dataclass(frozen=True)
class MacroSnapshot:
    fx: FxQuote
    inflation: InflationQuote | None


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _parse_usd_records(payload: dict[str, Any]) -> FxQuote | None:
    records = payload.get("records")
    if not isinstance(records, list):
        return None

    usd_rows: list[dict[str, Any]] = []
    for row in records:
        if not isinstance(row, dict):
            continue
        if str(row.get("currency") or "").upper() != "USD":
            continue
        if str(row.get("indicator_code") or "") not in {"usd_lkr_spot", "usd_lkr", ""}:
            # Keep rows that look like USD/LKR even if indicator drifts.
            unit = str(row.get("unit") or "").lower()
            if "lkr" not in unit and "per usd" not in unit:
                continue
        try:
            value = float(row.get("value"))
        except (TypeError, ValueError):
            continue
        if value <= 0:
            continue
        usd_rows.append(row)

    if not usd_rows:
        return None

    def _sort_key(row: dict[str, Any]) -> str:
        return str(row.get("reference_date") or row.get("collected_at") or "")

    latest = sorted(usd_rows, key=_sort_key, reverse=True)[0]
    try:
        rate = float(latest["value"])
    except (TypeError, ValueError, KeyError):
        return None

    return FxQuote(
        usd_lkr=round(rate, 4),
        reference_date=str(latest.get("reference_date") or "") or None,
        source="cbsl_via_macro_publisher",
        source_url=str(
            latest.get("source_url")
            or "https://www.cbsl.gov.lk/en/rates-and-indicators/exchange-rates/"
            "daily-indicative-usd-spot-exchange-rates"
        ),
        fetched_at=_now_iso(),
    )


def _parse_ccpi_record(payload: dict[str, Any]) -> InflationQuote | None:
    records = payload.get("records")
    if not isinstance(records, list) or not records:
        return None
    row = records[0]
    if not isinstance(row, dict):
        return None
    try:
        index_value = float(row.get("value"))
    except (TypeError, ValueError):
        return None

    meta = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}

    def _meta_float(key: str) -> float | None:
        raw = meta.get(key)
        try:
            return float(raw) if raw is not None else None
        except (TypeError, ValueError):
            return None

    return InflationQuote(
        index_value=round(index_value, 2),
        yoy_percent=_meta_float("year_on_year_percent"),
        mom_percent=_meta_float("month_on_month_percent"),
        reference_date=str(row.get("reference_date") or "") or None,
        source="dcs_via_macro_publisher",
        source_url=str(
            row.get("source_url")
            or "https://www.statistics.gov.lk/InflationAndPrices/StaticalInformation/CCPI"
        ),
        fetched_at=_now_iso(),
    )


def _fetch_json(client: httpx.Client, url: str) -> dict[str, Any] | None:
    try:
        response = client.get(url, timeout=8.0)
        response.raise_for_status()
        data = response.json()
        return data if isinstance(data, dict) else None
    except Exception as exc:
        log.warning("macro_feed_fetch_failed", url=url, error=str(exc))
        return None


def _fx_from_er_api(client: httpx.Client) -> FxQuote | None:
    payload = _fetch_json(client, ER_API_USD_URL)
    if not payload or payload.get("result") != "success":
        return None
    rates = payload.get("rates")
    if not isinstance(rates, dict):
        return None
    try:
        rate = float(rates.get("LKR"))
    except (TypeError, ValueError):
        return None
    if rate <= 0:
        return None
    return FxQuote(
        usd_lkr=round(rate, 4),
        reference_date=str(payload.get("time_last_update_utc") or "") or None,
        source="open_er_api",
        source_url=ER_API_USD_URL,
        fetched_at=_now_iso(),
    )


def fetch_macro_snapshot(*, client: httpx.Client | None = None) -> MacroSnapshot:
    """Return the best available FX (+ optional CCPI) snapshot."""
    owns_client = client is None
    http = client or httpx.Client(
        headers={"User-Agent": USER_AGENT},
        follow_redirects=True,
        timeout=8.0,
    )
    try:
        fx: FxQuote | None = None
        inflation: InflationQuote | None = None

        fx_payload = _fetch_json(http, MACRO_PUBLISHER_FX_URL)
        if fx_payload:
            fx = _parse_usd_records(fx_payload)

        if fx is None:
            fx = _fx_from_er_api(http)

        if fx is None:
            fx = FxQuote(
                usd_lkr=FALLBACK_USD_LKR,
                reference_date=None,
                source="fallback_constant",
                source_url="https://motormila.pages.dev/calculator",
                fetched_at=_now_iso(),
            )

        ccpi_payload = _fetch_json(http, MACRO_PUBLISHER_CCPI_URL)
        if ccpi_payload:
            inflation = _parse_ccpi_record(ccpi_payload)

        return MacroSnapshot(fx=fx, inflation=inflation)
    finally:
        if owns_client:
            http.close()


def macro_signal_rows(snapshot: MacroSnapshot) -> list[dict[str, Any]]:
    """Rows suitable for ``market_signals`` upsert."""
    rows: list[dict[str, Any]] = [
        {
            "source": "cbsl",
            "signal_type": "exchange_rate",
            "metric": "usd_lkr_spot",
            "value_numeric": snapshot.fx.usd_lkr,
            "unit": "LKR_per_USD",
            "category": "macro",
            "source_url": snapshot.fx.source_url,
            "raw_meta": {
                "feed_source": snapshot.fx.source,
                "reference_date": snapshot.fx.reference_date,
                "fetched_at": snapshot.fx.fetched_at,
            },
        }
    ]
    if snapshot.inflation is not None:
        rows.append(
            {
                "source": "dcs",
                "signal_type": "inflation",
                "metric": "ccpi_colombo",
                "value_numeric": snapshot.inflation.index_value,
                "unit": "index",
                "category": "macro",
                "source_url": snapshot.inflation.source_url,
                "raw_meta": {
                    "feed_source": snapshot.inflation.source,
                    "reference_date": snapshot.inflation.reference_date,
                    "yoy_percent": snapshot.inflation.yoy_percent,
                    "mom_percent": snapshot.inflation.mom_percent,
                    "fetched_at": snapshot.inflation.fetched_at,
                },
            }
        )
        if snapshot.inflation.yoy_percent is not None:
            rows.append(
                {
                    "source": "dcs",
                    "signal_type": "inflation",
                    "metric": "ccpi_yoy_percent",
                    "value_numeric": snapshot.inflation.yoy_percent,
                    "unit": "pct",
                    "category": "macro",
                    "source_url": snapshot.inflation.source_url,
                    "raw_meta": {
                        "feed_source": snapshot.inflation.source,
                        "reference_date": snapshot.inflation.reference_date,
                        "index_value": snapshot.inflation.index_value,
                        "fetched_at": snapshot.inflation.fetched_at,
                    },
                }
            )
    return rows
