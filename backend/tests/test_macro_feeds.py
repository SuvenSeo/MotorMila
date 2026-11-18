"""Macro feed parsing tests (no network)."""

from datetime import datetime, timezone
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.services.macro_feeds import (
    ER_API_USD_URL,
    FALLBACK_USD_LKR,
    MACRO_PUBLISHER_CCPI_URL,
    MACRO_PUBLISHER_FX_URL,
    _parse_ccpi_record,
    _parse_usd_records,
    fetch_macro_snapshot,
    macro_signal_rows,
)
from app.services.macro_feeds import FxQuote, InflationQuote, MacroSnapshot


class _MockResponse:
    def __init__(self, payload: dict | None, status_code: int = 200):
        self._payload = payload
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        return self._payload


class _MockClient:
    def __init__(self, responses: dict[str, _MockResponse]):
        self._responses = responses

    def get(self, url: str, **kwargs):
        return self._responses.get(url, _MockResponse(None, status_code=404))


def test_parse_usd_records_picks_latest_reference_date():
    payload = {
        "records": [
            {
                "currency": "USD",
                "indicator_code": "usd_lkr_spot",
                "reference_date": "2026-07-22",
                "value": 336.1,
                "unit": "LKR per USD",
                "source_url": "https://www.cbsl.gov.lk/fx",
            },
            {
                "currency": "USD",
                "indicator_code": "usd_lkr_spot",
                "reference_date": "2026-07-24",
                "value": 336.2576,
                "unit": "LKR per USD",
                "source_url": "https://www.cbsl.gov.lk/fx",
            },
            {
                "currency": "EUR",
                "indicator_code": "eur_lkr_spot",
                "reference_date": "2026-07-24",
                "value": 360.0,
                "unit": "LKR per EUR",
                "source_url": "https://www.cbsl.gov.lk/fx",
            },
        ]
    }
    quote = _parse_usd_records(payload)
    assert quote is not None
    assert quote.usd_lkr == 336.2576
    assert quote.reference_date == "2026-07-24"
    assert quote.source == "cbsl_via_macro_publisher"


def test_parse_ccpi_record_reads_yoy_meta():
    payload = {
        "records": [
            {
                "value": 207.7,
                "reference_date": "2026-06-30",
                "source_url": "https://www.statistics.gov.lk/ccpi",
                "metadata": {
                    "year_on_year_percent": "6.8",
                    "month_on_month_percent": "2.1",
                },
            }
        ]
    }
    quote = _parse_ccpi_record(payload)
    assert quote is not None
    assert quote.index_value == 207.7
    assert quote.yoy_percent == 6.8
    assert quote.mom_percent == 2.1


def test_macro_signal_rows_include_fx_and_yoy():
    snapshot = MacroSnapshot(
        fx=FxQuote(
            usd_lkr=336.25,
            reference_date="2026-07-24",
            source="cbsl_via_macro_publisher",
            source_url="https://cbsl.example/fx",
            fetched_at="2026-07-26T00:00:00Z",
        ),
        inflation=InflationQuote(
            index_value=207.7,
            yoy_percent=6.8,
            mom_percent=2.1,
            reference_date="2026-06-30",
            source="dcs_via_macro_publisher",
            source_url="https://dcs.example/ccpi",
            fetched_at="2026-07-26T00:00:00Z",
        ),
    )
    rows = macro_signal_rows(snapshot)
    metrics = {row["metric"] for row in rows}
    assert "usd_lkr_spot" in metrics
    assert "ccpi_colombo" in metrics
    assert "ccpi_yoy_percent" in metrics
    assert FALLBACK_USD_LKR == 300.0


def test_fetch_macro_snapshot_uses_er_api_when_cbsl_fx_is_stale():
    stale_cbsl = {
        "records": [
            {
                "currency": "USD",
                "indicator_code": "usd_lkr_spot",
                "reference_date": "2026-10-05",
                "value": 330.6009,
                "unit": "LKR per USD",
            }
        ]
    }
    fresh_er = {
        "result": "success",
        "time_last_update_utc": "Wed, 18 Nov 2026 00:02:31 +0000",
        "rates": {"LKR": 332.75},
    }
    client = _MockClient(
        {
            MACRO_PUBLISHER_FX_URL: _MockResponse(stale_cbsl),
            ER_API_USD_URL: _MockResponse(fresh_er),
            MACRO_PUBLISHER_CCPI_URL: _MockResponse(None, status_code=404),
        }
    )
    snap = fetch_macro_snapshot(
        client=client,
        now=datetime(2026, 11, 18, 6, 0, tzinfo=timezone.utc),
    )
    assert snap.fx.source == "open_er_api"
    assert snap.fx.usd_lkr == 332.75
    assert snap.fx.reference_date == "2026-11-18"


def test_fetch_macro_snapshot_keeps_fresh_cbsl_without_hitting_er_api():
    fresh_cbsl = {
        "records": [
            {
                "currency": "USD",
                "indicator_code": "usd_lkr_spot",
                "reference_date": "2026-11-16",
                "value": 332.10,
                "unit": "LKR per USD",
            }
        ]
    }
    client = _MockClient(
        {
            MACRO_PUBLISHER_FX_URL: _MockResponse(fresh_cbsl),
            ER_API_USD_URL: _MockResponse(None, status_code=500),
            MACRO_PUBLISHER_CCPI_URL: _MockResponse(None, status_code=404),
        }
    )
    snap = fetch_macro_snapshot(
        client=client,
        now=datetime(2026, 11, 18, 6, 0, tzinfo=timezone.utc),
    )
    assert snap.fx.source == "cbsl_via_macro_publisher"
    assert snap.fx.usd_lkr == 332.1


def test_fetch_macro_snapshot_keeps_stale_cbsl_if_er_api_fails():
    stale_cbsl = {
        "records": [
            {
                "currency": "USD",
                "indicator_code": "usd_lkr_spot",
                "reference_date": "2026-10-05",
                "value": 330.6009,
                "unit": "LKR per USD",
            }
        ]
    }
    client = _MockClient(
        {
            MACRO_PUBLISHER_FX_URL: _MockResponse(stale_cbsl),
            ER_API_USD_URL: _MockResponse(None, status_code=503),
            MACRO_PUBLISHER_CCPI_URL: _MockResponse(None, status_code=404),
        }
    )
    snap = fetch_macro_snapshot(
        client=client,
        now=datetime(2026, 11, 18, 6, 0, tzinfo=timezone.utc),
    )
    assert snap.fx.source == "cbsl_via_macro_publisher"
    assert snap.fx.usd_lkr == 330.6009
