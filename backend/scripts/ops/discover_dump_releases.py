#!/usr/bin/env python3
"""Discover Manus / Neon / laptop dump releases that the live merge has not consumed.

Used by `.github/workflows/manus-to-live.yml`. Listing must paginate — a single
`per_page=100` call drops older dumps once the repo has more than 100 releases
— and last-merged.txt must be compared as a timestamp, not as a raw tag string.

Usage:
  LAST_MERGED=20260818T1547Z python scripts/ops/discover_dump_releases.py
  python scripts/ops/discover_dump_releases.py --last-merged-file last-merged.txt \\
      --out-dumps new-dumps.txt --out-last last-merged-new.txt
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

DUMP_PREFIXES = ("manus-scrape-", "neon-export-", "laptop-db-")
# Preferred dump asset first; the legacy name is still accepted so
# pre-rename releases keep merging through the transition.
DUMP_ASSET_NAMES = ("motormila.db.gz", "autolens.db.gz")
TS_RE = re.compile(r"(\d{8}T\d{4,6}Z?)")
USER_AGENT = "manus-to-live"


def extract_dump_timestamp(value: str) -> str:
    """Return normalized YYYYMMDDTHHMMSSZ from a tag or marker for reliable string comparison."""
    text = (value or "").strip()
    match = TS_RE.search(text)
    if not match:
        return text
    raw = match.group(1).rstrip("Z")
    date_part, time_part = raw.split("T", 1)
    time_part = (time_part + "000000")[:6]
    return f"{date_part}T{time_part}Z"


def parse_next_link(link_header: str | None) -> str | None:
    """Extract the rel=next URL from a GitHub Link header."""
    if not link_header:
        return None
    for part in link_header.split(","):
        piece = part.strip()
        if 'rel="next"' not in piece:
            continue
        if piece.startswith("<") and ">" in piece:
            return piece[1 : piece.index(">")]
    return None


def paginate_github_releases(
    first_url: str,
    *,
    fetch_page,
) -> list[dict]:
    """Follow Link: rel=next until exhausted. fetch_page(url) -> (list, link_header)."""
    releases: list[dict] = []
    url: str | None = first_url
    seen: set[str] = set()
    while url and url not in seen:
        seen.add(url)
        page, link_header = fetch_page(url)
        releases.extend(page)
        url = parse_next_link(link_header)
    return releases


def _has_dump_asset(release: dict) -> bool:
    names = {asset.get("name") for asset in release.get("assets") or []}
    return any(name in names for name in DUMP_ASSET_NAMES)


def preferred_dump_asset(release: dict) -> str | None:
    """Return the dump asset name to download, preferring the new name."""
    names = {asset.get("name") for asset in release.get("assets") or []}
    for name in DUMP_ASSET_NAMES:
        if name in names:
            return name
    return None


def list_dump_candidates(releases: list[dict]) -> list[tuple[str, str]]:
    """Return (timestamp, tag) for published dump releases, oldest first."""
    candidates: list[tuple[str, str]] = []
    for release in releases:
        if release.get("draft"):
            continue
        tag = release.get("tag_name") or ""
        if not tag.startswith(DUMP_PREFIXES):
            continue
        if not _has_dump_asset(release):
            continue
        timestamp = extract_dump_timestamp(tag) or tag
        candidates.append((timestamp, tag))
    candidates.sort(key=lambda item: item[0])
    return candidates


def select_dumps_to_merge(
    *,
    releases: list[dict],
    last_merged: str = "",
    force_tag: str = "",
) -> tuple[list[str], str]:
    """Return (tags to merge oldest-first, new last-merged timestamp).

    Force-merge selects that one tag even if it is older than last-merged, but
    does not rewind the durable marker — retries should not hide newer dumps.
    """
    candidates = list_dump_candidates(releases)
    ts_by_tag = {tag: ts for ts, tag in candidates}
    last_ts = extract_dump_timestamp(last_merged)

    if force_tag:
        if force_tag not in ts_by_tag:
            print(
                f"ERROR: release-tag {force_tag} not found (or lacks a dump asset: {"/".join(DUMP_ASSET_NAMES)})",
                file=sys.stderr,
            )
            raise SystemExit(1)
        selected = [force_tag]
        new_last = max((last_ts, ts_by_tag[force_tag]), key=lambda value: value or "")
        return selected, new_last

    selected = [tag for ts, tag in candidates if ts > last_ts]
    new_last = last_ts
    if selected:
        new_last = max([last_ts] + [ts_by_tag[tag] for tag in selected], key=lambda value: value or "")
    return selected, new_last


def write_tag_list(path: Path, tags: list[str]) -> None:
    """Write one tag per line *with* a trailing newline so `wc -l` equals len(tags)."""
    if not tags:
        path.write_text("", encoding="utf-8")
        return
    path.write_text("\n".join(tags) + "\n", encoding="utf-8")


def emit_github_output(*, count: int, last_merged: str) -> None:
    github_output = os.getenv("GITHUB_OUTPUT", "").strip()
    if not github_output:
        return
    with open(github_output, "a", encoding="utf-8") as handle:
        handle.write(f"count={count}\n")
        handle.write(f"last_merged={last_merged}\n")


def has_neon_export_for_month(tags: list[str], year_month: str) -> bool:
    prefix = f"neon-export-{year_month}"
    return any(tag.startswith(prefix) for tag in tags)


def _github_fetch_page(token: str):
    def fetch_page(url: str) -> tuple[list[dict], str | None]:
        request = urllib.request.Request(
            url,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "User-Agent": USER_AGENT,
            },
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = json.load(response)
            link_header = response.headers.get("Link")
        if not isinstance(payload, list):
            raise SystemExit(f"ERROR: unexpected GitHub releases payload: {type(payload)}")
        return payload, link_header

    return fetch_page


def fetch_all_releases(repo: str, token: str) -> list[dict]:
    url = f"https://api.github.com/repos/{repo}/releases?per_page=100"
    try:
        return paginate_github_releases(url, fetch_page=_github_fetch_page(token))
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"ERROR: GitHub releases list failed: HTTP {exc.code}") from exc


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--repo",
        default=os.environ.get("GITHUB_REPOSITORY", ""),
        help="owner/name (default: GITHUB_REPOSITORY)",
    )
    parser.add_argument(
        "--last-merged-file",
        default="",
        help="path to last-merged.txt (else LAST_MERGED env / empty)",
    )
    parser.add_argument("--out-dumps", default="new-dumps.txt")
    parser.add_argument("--out-last", default="last-merged-new.txt")
    parser.add_argument(
        "--force-tag",
        default=os.environ.get("FORCE_TAG", ""),
        help="merge this exact dump tag even if it is not newer than last-merged",
    )
    parser.add_argument(
        "--check-month-export",
        default="",
        metavar="YYYYMM",
        help="print found=true/false if a neon-export-* exists for that month and exit 0",
    )
    args = parser.parse_args(argv)

    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN") or ""
    if not args.repo:
        print("ERROR: --repo or GITHUB_REPOSITORY is required", file=sys.stderr)
        return 2
    if not token:
        print("ERROR: GH_TOKEN (or GITHUB_TOKEN) is required", file=sys.stderr)
        return 2

    releases = fetch_all_releases(args.repo, token)
    tags = [rel.get("tag_name") or "" for rel in releases]

    if args.check_month_export:
        found = has_neon_export_for_month(tags, args.check_month_export)
        print(f"found={'true' if found else 'false'}")
        return 0

    last_merged = os.environ.get("LAST_MERGED", "") or ""
    if args.last_merged_file:
        marker = Path(args.last_merged_file)
        if marker.is_file():
            last_merged = marker.read_text(encoding="utf-8")

    selected, new_last = select_dumps_to_merge(
        releases=releases,
        last_merged=last_merged,
        force_tag=(args.force_tag or "").strip(),
    )
    write_tag_list(Path(args.out_dumps), selected)
    Path(args.out_last).write_text(new_last, encoding="utf-8")
    emit_github_output(count=len(selected), last_merged=new_last)

    print(f"last merged: {extract_dump_timestamp(last_merged) or '<none>'}")
    print(f"dumps to merge: {len(selected)}")
    for tag in selected:
        print(f"  {tag}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
