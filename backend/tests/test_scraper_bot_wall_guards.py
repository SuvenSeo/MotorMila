"""Bot-wall guards for the hosted scrape fleet.

Background: saleme.lk (Cloudflare) and patpat.lk ("Human Verification") answer
hosted-runner requests with an HTML challenge page instead of listings. The
scrapers used to treat that as "an empty page", keep paginating, and burn the
source's entire wall-clock budget (~10 min/run) for zero rows — and a cleanly
aborted zero-listing run was still recorded as SUCCESS, so a permanently
walled source reported itself as healthy on the public pipeline-status bar.
"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path

import pytest
import yaml

from app.scrapers.generic_detail import GenericDetailScraper, SourceBlockedError
from app.scrapers.net import blocked_response_reason

WORKFLOW = Path(__file__).resolve().parents[2] / ".github" / "workflows"
DUMP_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "ops" / "manus_scrape_dump.sh"


# ---------------------------------------------------------------------------
# blocked_response_reason
# ---------------------------------------------------------------------------


def test_cloudflare_challenge_title_is_detected():
    body = "<html><head><title>Just a moment...</title></head><body>Enable JavaScript and cookies to continue.</body></html>"
    assert blocked_response_reason(403, body) is not None


def test_cf_mitigated_header_is_detected_even_on_http_200():
    # Cloudflare serves some challenges with a 200 plus this header.
    reason = blocked_response_reason(200, "<html><body>ok</body></html>", {"cf-mitigated": "challenge"})
    assert reason is not None
    assert "cf_mitigated" in reason


def test_patpat_style_405_human_verification_is_detected():
    body = "<html><head><title>Human Verification</title></head><body>Please verify.</body></html>"
    assert blocked_response_reason(405, body) is not None


@pytest.mark.parametrize("status", [401, 403, 405, 406, 429])
def test_unambiguous_block_statuses_are_detected(status: int):
    assert blocked_response_reason(status, "") is not None


def test_rate_limited_is_detected():
    assert blocked_response_reason(429, "slow down") is not None


def test_real_listing_page_is_not_flagged():
    body = "<html><head><title>Cars for Sale in Sri Lanka</title></head><body><a href='/x'>car</a></body></html>"
    assert blocked_response_reason(200, body, {"content-type": "text/html"}) is None


def test_pagination_404_past_end_of_catalogue_is_not_flagged():
    """A 404 on page 40 of 20 must stay non-fatal, or sources stop early."""
    assert blocked_response_reason(404, "<html><body>Not Found</body></html>") is None


def test_500_server_error_is_not_treated_as_a_wall():
    assert blocked_response_reason(500, "<html><body>Server Error</body></html>") is None


def test_missing_or_bad_status_does_not_raise():
    assert blocked_response_reason(None, "") is None
    assert blocked_response_reason("nonsense", "") is None


# ---------------------------------------------------------------------------
# GenericDetailScraper aborts instead of burning its budget
# ---------------------------------------------------------------------------


class _FakeResponse:
    def __init__(self, status_code: int, text: str, headers: dict | None = None):
        self.status_code = status_code
        self.text = text
        self.headers = headers or {}

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class _FakeClient:
    """Records every GET so the test can assert the scraper stopped early."""

    def __init__(self, responses: list[_FakeResponse]):
        self._responses = responses
        self.requested: list[str] = []

    async def get(self, url, **kwargs):
        self.requested.append(url)
        index = min(len(self.requested) - 1, len(self._responses) - 1)
        return self._responses[index]

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc_info):
        return False


class _BlockingScraper(GenericDetailScraper):
    SOURCE = "walltest"
    BASE_URL = "https://example.test"
    START_URLS = ("https://example.test/list",)

    @classmethod
    def _extract_listing_links(cls, soup):
        return []


def _run_with_client(monkeypatch, scraper, client):
    import app.scrapers.generic_detail as gd

    monkeypatch.setattr(gd.httpx, "AsyncClient", lambda **kwargs: client)
    asyncio.run(scraper.scrape(max_pages=5))


def test_blocked_listing_page_aborts_source_immediately(monkeypatch):
    scraper = _BlockingScraper(db=None)
    wall = _FakeResponse(403, "<html><head><title>Just a moment...</title></head></html>")
    client = _FakeClient([wall, wall, wall, wall, wall])

    _run_with_client(monkeypatch, scraper, client)

    # One request, not one per page: the point is to stop burning the budget.
    assert len(client.requested) == 1
    assert scraper.blocked_reason


def test_blocked_detail_page_aborts_and_records_reason(monkeypatch):
    scraper = _BlockingScraper(db=None)
    # Listing page resolves fine but yields no links, so the block must be
    # detected on the listing fetch itself; this asserts the attribute contract.
    wall = _FakeResponse(200, "<html><head><title>Just a moment...</title></head></html>")
    client = _FakeClient([wall])

    _run_with_client(monkeypatch, scraper, client)

    assert scraper.blocked_reason


def test_healthy_source_leaves_blocked_reason_unset(monkeypatch):
    scraper = _BlockingScraper(db=None)
    ok = _FakeResponse(200, "<html><head><title>Cars</title></head><body>no links</body></html>")
    client = _FakeClient([ok, ok, ok, ok, ok])

    _run_with_client(monkeypatch, scraper, client)

    assert scraper.blocked_reason is None


def test_source_blocked_error_is_a_runtime_error():
    # run_sync and the shell wrapper both treat it as a normal failure path.
    assert issubclass(SourceBlockedError, RuntimeError)


# ---------------------------------------------------------------------------
# Pipeline wiring guards
# ---------------------------------------------------------------------------


def test_auto_lanka_is_in_the_live_scrape_list():
    """auto-lanka.com serves its catalogue fine; it must stay wired in.

    It was registered in SOURCE_REGISTRY but absent from the Manus scrape
    invocation, so it contributed zero rows to the live catalog indefinitely.
    """
    workflow = (WORKFLOW / "manus-scrape-every-2h.yml").read_text(encoding="utf-8")
    assert "auto-lanka" in workflow

    script = DUMP_SCRIPT.read_text(encoding="utf-8")
    # Assert on the hard-coded default list, not the argv passthrough or the
    # MANUS_SOURCE_LIST override.
    default_line = next(
        line
        for line in script.splitlines()
        if "riyasewana ikman" in line and line.strip().startswith("SOURCES=(")
    )
    assert "auto-lanka" in default_line


def test_hard_kill_wraps_the_in_process_budget():
    """The shell `timeout` must outlast the in-Python budget.

    If they are equal the process is SIGKILLed before run_sync can finalize its
    ScrapeRun row, leaving the source permanently RUNNING with a null
    last_success on the public pipeline-status snapshot.
    """
    script = DUMP_SCRIPT.read_text(encoding="utf-8")
    assert 'HARD_TIMEOUT="$((SOURCE_TIMEOUT + SOURCE_KILL_GRACE))"' in script
    assert '--kill-after=30s "${HARD_TIMEOUT}s"' in script
    # The in-process budget is still the smaller one.
    assert 'SCRAPE_SOURCE_TIMEOUT_SECONDS="${SOURCE_TIMEOUT}"' in script


def test_pipeline_monitor_verifies_the_live_site_not_just_neon():
    """A monitor that is red during a known outage stops being read."""
    monitor = (WORKFLOW / "pipeline-monitor.yml").read_text(encoding="utf-8")
    assert "probe-neon.yml" in monitor
    assert "live-site-health" in monitor
    assert "snapshots/latest/manifest.json" in monitor


# ---------------------------------------------------------------------------
# patpat: the wall arrived as 405, not 403
# ---------------------------------------------------------------------------


def test_patpat_detects_the_405_wall_it_actually_receives():
    from app.scrapers import patpat as patpat_module

    # Regression: the old guard was frozenset({403, 429}), but patpat.lk answers
    # blocked GETs with 405 + "Human Verification". Nothing fired, so every page
    # fell through to the generic error path.
    body = "<html><head><title>Human Verification</title></head></html>"
    assert blocked_response_reason(405, body) is not None
    assert hasattr(patpat_module.PatpatScraper, "__init__")


def test_patpat_aborts_after_one_request_when_walled(monkeypatch):
    import app.scrapers.patpat as patpat_module

    wall = _FakeResponse(405, "<html><head><title>Human Verification</title></head></html>")
    client = _FakeClient([wall] * 40)
    monkeypatch.setattr(patpat_module.httpx, "AsyncClient", lambda **kwargs: client)

    scraper = patpat_module.PatpatScraper(db=None)
    with pytest.raises(patpat_module.PatpatBlockedError):
        asyncio.run(scraper.scrape(max_pages=5))

    # 1 request, not up to 25 per category across 11 categories.
    assert len(client.requested) == 1
    assert "human_verification" in (scraper.blocked_reason or "")


# ---------------------------------------------------------------------------
# IP-blocked sources need separate runner IPs to retry
# ---------------------------------------------------------------------------


def _workflow(name: str) -> dict:
    return yaml.safe_load((WORKFLOW / name).read_text(encoding="utf-8"))


def test_riyasewana_is_scraped_in_a_retrying_job_not_the_single_ip_one():
    """Cloudflare blocks a share of GitHub runner IPs, so retries need new jobs.

    Measured over 8 live runs, riyasewana succeeded 2x. A retry inside one job
    would reuse the same runner IP and change nothing, so it needs a matrix.
    """
    wf = _workflow("manus-scrape-every-2h.yml")

    main_step = None
    for step in wf["jobs"]["scrape-and-dump"]["steps"]:
        if step.get("name") == "Scrape sources and upload dump":
            main_step = step["run"]
    assert main_step is not None
    assert "riyasewana" not in main_step

    walled = wf["jobs"]["walled-sources"]
    attempts = walled["strategy"]["matrix"]["attempt"]
    assert len(attempts) >= 3, "needs multiple IP draws per cycle"
    assert walled["strategy"]["fail-fast"] is False
    # Each leg must publish its own dump release, tagged so they cannot collide.
    assert "MANUS_RELEASE_TAG_SUFFIX" in str(walled["env"])


def test_suffixed_release_tags_are_accepted_by_the_merge():
    """A retry job publishing several dumps must not break the merge marker."""
    from scripts.ops.discover_dump_releases import extract_dump_timestamp

    plain = extract_dump_timestamp("manus-scrape-20260926T1440Z")
    suffixed = extract_dump_timestamp("manus-scrape-20260926T144012Z-w1")
    assert plain.startswith("20260926T1440")
    # Second-precision + suffix must still compare correctly against the marker.
    assert suffixed.startswith("20260926T1440")
    assert plain < suffixed


def test_release_tag_suffix_uses_second_precision():
    """Two legs uploading in the same minute must not collide on one tag."""
    script = DUMP_SCRIPT.read_text(encoding="utf-8")
    assert 'MANUS_RELEASE_TAG_SUFFIX' in script
    assert "%Y%m%dT%H%M%SZ" in script


def test_residential_workflow_does_not_depend_on_the_offline_laptop():
    """It was pinned to the offline self-hosted runner, so it could never run."""
    wf = _workflow("residential-cf-sources.yml")
    assert wf["jobs"]["scrape-source"]["runs-on"] != "self-hosted"
    # And it must be wired to the proxy that actually unblocks these sources.
    text = (WORKFLOW / "residential-cf-sources.yml").read_text(encoding="utf-8")
    assert "SCRAPE_PROXY_URL" in text


def test_main_scrape_job_honours_an_optional_proxy():
    wf = _workflow("manus-scrape-every-2h.yml")
    walled_env = str(wf["jobs"]["walled-sources"]["steps"])
    assert "SCRAPE_PROXY_URL" in walled_env


# ---------------------------------------------------------------------------
# riyasewana segmentable deep crawl
# ---------------------------------------------------------------------------


def test_riyasewana_supports_a_start_page():
    """Deep crawls must be able to advance past the head of the catalogue.

    Without this every run restarts at page 1, so a crawl budgeted to reach
    page 200 spends its whole window re-reading pages it already has and never
    gets deeper. Mirrors IKMAN_START_PAGE, which ikman already had.
    """
    from app.scrapers.riyasewana import _start_page

    assert _start_page() == 1  # unset -> page 1

    monkey = os.environ
    try:
        monkey["RIYASEWANA_START_PAGE"] = "41"
        assert _start_page() == 41
        monkey["RIYASEWANA_START_PAGE"] = "0"
        assert _start_page() == 1, "must clamp to at least page 1"
        monkey["RIYASEWANA_START_PAGE"] = "not-a-number"
        assert _start_page() == 1, "must fall back rather than crash"
    finally:
        monkey.pop("RIYASEWANA_START_PAGE", None)


def test_riyasewana_crawl_loops_read_the_start_page():
    """Both crawl paths (Playwright and plain-HTTP) must honour it."""
    import inspect

    from app.scrapers.riyasewana import RiyasewanaScraper

    for method in (RiyasewanaScraper._scrape_live, RiyasewanaScraper._scrape_via_http):
        source = inspect.getsource(method)
        assert "page_num = self._start_page" in source, (
            f"{method.__name__} still restarts at page 1"
        )


def test_riyasewana_start_page_defaults_to_one_without_scrape():
    """The private crawl methods must be safe when called directly."""
    from app.scrapers.riyasewana import RiyasewanaScraper

    scraper = RiyasewanaScraper.__new__(RiyasewanaScraper)
    RiyasewanaScraper.__init__(scraper, None)
    assert scraper._start_page == 1


# ---------------------------------------------------------------------------
# Catch-up / deep-backfill reachability
# ---------------------------------------------------------------------------


def test_deep_backfills_can_actually_run():
    """A backfill pinned to the offline laptop can never recover anything.

    riyasewana is 54% of the live catalog and this is its only dedicated
    recovery tool, so a dead runner meant that source had no catch-up path.
    """
    for name in ("riyasewana-bulk-backfill.yml", "ikman-bulk-backfill.yml"):
        wf = _workflow(name)
        for job_name, job in wf["jobs"].items():
            assert job.get("runs-on") != "self-hosted", f"{name}:{job_name} needs the offline laptop"


def test_riyasewana_backfill_crawls_deeply_and_can_use_a_proxy():
    wf = _workflow("riyasewana-bulk-backfill.yml")
    scrape = wf["jobs"]["scrape-riyasewana"]
    assert int(scrape["timeout-minutes"]) >= 120
    text = str(scrape["steps"])
    assert "RIYASEWANA_FLAT_BUDGET" in text, "must give every category the full budget"
    assert "SCRAPE_MAX_PAGES_RIYASEWANA" in text
    assert "SCRAPE_PROXY_URL" in text


def test_backfills_do_not_clobber_the_catalog_manus_to_live_owns():
    """manus-to-live rebuilds public snapshots every 6h from merged SQLite.

    A backfill that deploys its own Neon-derived snapshots is therefore undone
    within 6h, so the durable route is Neon Export -> manus-to-live merge.
    """
    for name in ("ikman-bulk-backfill.yml", "riyasewana-bulk-backfill.yml"):
        wf = _workflow(name)
        for key, spec in (wf.get("on") or wf.get(True) or {}).get("inputs", {}).items():
            if key == "refresh_catalog":
                assert spec.get("default") is False, (
                    f"{name} should not deploy by default; it gets clobbered by manus-to-live"
                )


def test_neon_export_is_the_durable_handoff_to_the_live_site():
    neon = _workflow("neon-export.yml")
    assert "workflow_dispatch" in (neon.get("on") or neon.get(True))
    # manus-to-live must consume neon-export releases, otherwise a backfill can
    # never reach the public catalog.
    live = _workflow("manus-to-live.yml")
    triggers = str((live.get("on") or live.get(True)).get("workflow_run", {}).get("workflows", []))
    assert "Neon Export" in triggers
