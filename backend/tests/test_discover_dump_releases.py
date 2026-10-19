"""Tests for dump-release discovery used by manus-to-live.yml.

The hosted merge pipeline was skipping most hourly Manus dumps because:
1. GitHub's releases API was fetched as a single page of 100 (repo already
   has more than that).
2. last-merged.txt sometimes stored a full tag (`manus-scrape-…`) while
   candidates compared a bare timestamp, so `ts > last` was always false.
3. new-dumps.txt was written without a trailing newline, so `wc -l` reported
   0 for a single pending dump and the merge step never ran. When two dumps
   were pending, `while read` dropped the last line and last-merged jumped
   past an unmerged dump.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
OPS = BACKEND / "scripts" / "ops"
sys.path.insert(0, str(OPS))
sys.path.insert(0, str(BACKEND))

import discover_dump_releases as ddr  # noqa: E402


def _rel(tag: str, *assets: str, draft: bool = False) -> dict:
    return {
        "tag_name": tag,
        "draft": draft,
        "assets": [{"name": name} for name in assets],
    }


DUMPS = [
    _rel("manus-scrape-20260815T1133Z", "autolens.db.gz"),
    _rel("manus-scrape-20260818T1404Z", "motormila.db.gz"),
    _rel("manus-scrape-20260818T1547Z", "autolens.db.gz"),
    _rel("manus-scrape-20260818T1551Z", "autolens.db.gz"),
    _rel("merged-db", "merged-autolens.db.gz", "last-merged.txt"),
    _rel("manus-scrape-parallel-20260814T0000Z", "autolens-recovered.db.gz"),
    _rel("neon-export-20260901T0400Z", "motormila.db.gz", "autolens.db.gz"),
    _rel("laptop-db-20260816T0900Z", "motormila.db.gz"),
    _rel("manus-scrape-20260818T1600Z", "autolens.db.gz", draft=True),
]


def test_extract_dump_timestamp_from_tag_or_bare_marker() -> None:
    assert ddr.extract_dump_timestamp("manus-scrape-20260818T1547Z") == "20260818T154700Z"
    assert ddr.extract_dump_timestamp("20260818T1547Z") == "20260818T154700Z"
    assert ddr.extract_dump_timestamp("  manus-scrape-20260815T1133Z\n") == "20260815T113300Z"
    assert ddr.extract_dump_timestamp("20260818T154700Z") == "20260818T154700Z"
    assert ddr.extract_dump_timestamp("") == ""


def test_extract_dump_timestamp_tolerates_six_digit_seconds() -> None:
    """A hand-created release used %H%M%SZ instead of the script's %H%MZ.

    manus-scrape-20260823T093908Z shipped this way on 2026-08-23 and got
    written into last-merged.txt. The old strict 4-digit regex did not match
    it at all, so extract_dump_timestamp fell back to returning the whole
    tag string — a value that (being alphabetic) sorts *after* every real
    "YYYYMMDDTHHMMZ" candidate, so `ts > last_ts` was always false and the
    live merge silently stopped consuming new dumps for 10 days.
    """
    assert ddr.extract_dump_timestamp("manus-scrape-20260823T093908Z") == "20260823T093908Z"


def test_select_dumps_recovers_from_a_malformed_last_merged_tag() -> None:
    """Regression test for the production incident: a poisoned watermark
    must not block dumps that are genuinely newer than it.
    """
    releases = [
        _rel("manus-scrape-20260823T093908Z", "autolens.db.gz"),
        _rel("manus-scrape-20260903T0737Z", "autolens.db.gz"),
    ]
    tags, new_last = ddr.select_dumps_to_merge(
        releases=releases,
        last_merged="manus-scrape-20260823T093908Z",
    )
    assert tags == ["manus-scrape-20260903T0737Z"]
    assert new_last == "20260903T073700Z"


def test_select_dumps_newer_than_full_tag_last_merged() -> None:
    """A last-merged.txt that stored the whole tag must still see newer dumps."""
    tags, new_last = ddr.select_dumps_to_merge(
        releases=DUMPS,
        last_merged="manus-scrape-20260815T1133Z",
    )
    assert tags == [
        "laptop-db-20260816T0900Z",
        "manus-scrape-20260818T1404Z",
        "manus-scrape-20260818T1547Z",
        "manus-scrape-20260818T1551Z",
        "neon-export-20260901T0400Z",
    ]
    assert new_last == "20260901T040000Z"


def test_select_dumps_newer_than_bare_timestamp() -> None:
    tags, new_last = ddr.select_dumps_to_merge(
        releases=DUMPS,
        last_merged="20260818T1547Z",
    )
    assert tags == ["manus-scrape-20260818T1551Z", "neon-export-20260901T0400Z"]
    assert new_last == "20260901T040000Z"


def test_select_dumps_skips_missing_asset_and_drafts() -> None:
    tags, _ = ddr.select_dumps_to_merge(releases=DUMPS, last_merged="")
    assert "manus-scrape-parallel-20260814T0000Z" not in tags
    assert "merged-db" not in tags
    assert "manus-scrape-20260818T1600Z" not in tags
    assert "manus-scrape-20260815T1133Z" in tags


def test_force_tag_selects_even_if_older_than_last_merged() -> None:
    tags, new_last = ddr.select_dumps_to_merge(
        releases=DUMPS,
        last_merged="20260818T1547Z",
        force_tag="manus-scrape-20260815T1133Z",
    )
    assert tags == ["manus-scrape-20260815T1133Z"]
    # Force-merge must not rewind the durable marker.
    assert new_last == "20260818T154700Z"


def test_force_tag_missing_asset_raises() -> None:
    with pytest.raises(SystemExit):
        ddr.select_dumps_to_merge(
            releases=DUMPS,
            last_merged="",
            force_tag="manus-scrape-parallel-20260814T0000Z",
        )


def test_write_dumps_file_trailing_newline_so_wc_l_matches(tmp_path: Path) -> None:
    path = tmp_path / "new-dumps.txt"
    tags = ["manus-scrape-20260818T1551Z"]
    ddr.write_tag_list(path, tags)
    raw = path.read_bytes()
    assert raw.endswith(b"\n")
    assert raw.decode().splitlines() == tags
    # The workflow used `wc -l`; a single dump with no newline reported 0.
    assert raw.count(b"\n") == 1

    empty = tmp_path / "empty.txt"
    ddr.write_tag_list(empty, [])
    assert empty.read_bytes() == b""


def test_paginate_github_releases_follows_link_header() -> None:
    page1 = [_rel("manus-scrape-20260818T1551Z", "autolens.db.gz")]
    page2 = [_rel("manus-scrape-20260815T1133Z", "autolens.db.gz")]
    calls: list[str] = []

    def fetch_page(url: str) -> tuple[list[dict], str | None]:
        calls.append(url)
        if "page=2" in url:
            return page2, None
        return page1, '<https://api.github.com/repos/x/y/releases?page=2>; rel="next"'

    releases = ddr.paginate_github_releases(
        "https://api.github.com/repos/x/y/releases?per_page=100",
        fetch_page=fetch_page,
    )
    assert [r["tag_name"] for r in releases] == [
        "manus-scrape-20260818T1551Z",
        "manus-scrape-20260815T1133Z",
    ]
    assert len(calls) == 2


def test_parse_next_link_ignores_other_rels() -> None:
    header = (
        '<https://api.github.com/repos/x/y/releases?page=1>; rel="prev", '
        '<https://api.github.com/repos/x/y/releases?page=3>; rel="next"'
    )
    assert ddr.parse_next_link(header) == (
        "https://api.github.com/repos/x/y/releases?page=3"
    )
    assert ddr.parse_next_link(None) is None
    assert ddr.parse_next_link("") is None


def test_write_github_output_count(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    out = tmp_path / "github_output"
    monkeypatch.setenv("GITHUB_OUTPUT", str(out))
    ddr.emit_github_output(count=1, last_merged="20260818T1551Z")
    text = out.read_text(encoding="utf-8")
    assert "count=1\n" in text
    assert "last_merged=20260818T1551Z\n" in text


def test_monthly_neon_export_tag_detection() -> None:
    tags = [
        "manus-scrape-20260818T1551Z",
        "neon-export-20260801T0400Z",
        "neon-export-20260901T0315Z",
    ]
    assert ddr.has_neon_export_for_month(tags, "202609") is True
    assert ddr.has_neon_export_for_month(tags, "202610") is False
    assert ddr.has_neon_export_for_month(tags, "202608") is True


def test_accepts_new_and_legacy_dump_asset_names() -> None:
    """Post-rename producers ship motormila.db.gz; old releases only have
    autolens.db.gz. Both must merge; anything else must not."""
    releases = [
        _rel("manus-scrape-20260910T0100Z", "motormila.db.gz"),
        _rel("manus-scrape-20260909T0100Z", "autolens.db.gz"),
        _rel("manus-scrape-20260908T0100Z", "something-else.db.gz"),
    ]
    tags, _ = ddr.select_dumps_to_merge(releases=releases, last_merged="")
    assert "manus-scrape-20260910T0100Z" in tags
    assert "manus-scrape-20260909T0100Z" in tags
    assert "manus-scrape-20260908T0100Z" not in tags


def test_preferred_dump_asset_prefers_new_name() -> None:
    assert ddr.preferred_dump_asset(_rel("t", "autolens.db.gz")) == "autolens.db.gz"
    assert (
        ddr.preferred_dump_asset(_rel("t", "motormila.db.gz", "autolens.db.gz"))
        == "motormila.db.gz"
    )
    assert ddr.preferred_dump_asset(_rel("t", "other.db.gz")) is None
