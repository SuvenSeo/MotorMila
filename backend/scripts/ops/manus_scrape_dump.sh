#!/usr/bin/env bash
# Manus-side scrape + upload: run on Manus's Cloud Computer (Linux).
#
# Scrapes the given sources into a LOCAL SQLite DB (no Neon needed), then
# delivers the compressed DB to GitHub so the laptop can merge it into the
# outage pipeline DB (scripts/ops/merge_sqlite_dump.py).
#
# Delivery tries, in order:
#   1) `gh` CLI if already authenticated (GitHub Actions and some Manus
#      sessions)  -> creates a GitHub Release + uploads motormila.db.gz
#                         (+ a legacy autolens.db.gz copy for pre-rename merger runs)
#   2) GH_TOKEN env var     -> same via the REST API (curl)
#
# There is no git-commit fallback. Committing dumps onto main does not update
# the live site (manus-to-live.yml only reads Release assets) and pollutes
# history. Old manus-scrape-* releases are NOT pruned here — the hosted merge
# needs unmerged dumps to stay published.
#
# Usage (after cloning the repo on the Manus VM):
#   bash backend/scripts/ops/manus_scrape_dump.sh ikman autolanka hitad autostream
#
# Env:
#   GH_TOKEN            optional GitHub token with "releases" write
#   MANUS_RELEASE_REPO  default SuvenSeo/Vehicle-Platform
#   MANUS_MAX_PAGES     per-source page budget, default 120
#   MANUS_START_PAGE    first listing page to visit, default 1. Raise it to
#                       crawl a segment deeper into a source's catalogue: a run
#                       that only ever starts at page 1 re-reads the same head
#                       of the catalogue forever and never gets past it.
#   MANUS_SOURCE_LIST   space/comma separated subset of sources to scrape
#
# NOTE: use this for API / plain-HTTP friendly sources (riyasewana, ikman,
# autolanka, hitad, autostream, saleme, riyahub, carshop, dimo, autodirect,
# cartivate). riyasewana uses curl_cffi Chrome impersonation over HTTP.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "${ROOT}/backend"

MAX="${MANUS_MAX_PAGES:-120}"
START_PAGE="${MANUS_START_PAGE:-1}"
REPO="${MANUS_RELEASE_REPO:-SuvenSeo/Vehicle-Platform}"
# Bound a stalled source so later sources and the dump upload can still run.
SOURCE_TIMEOUT="${MANUS_SOURCE_TIMEOUT_SECONDS:-900}"
# run_sync.py enforces SCRAPE_SOURCE_TIMEOUT_SECONDS in-process and, on
# timeout, still has to finalize the ScrapeRun row (status + finished_at) and
# flush its upsert buffer. If the outer `timeout` fires at the same instant the
# process is SIGKILLed before that cleanup runs, the source stays RUNNING
# forever — which is what pinned saleme/riyahub to a permanent "running" with
# last_success=null on the public pipeline-status snapshot. Give the in-process
# budget clear headroom inside the hard kill.
SOURCE_KILL_GRACE="${MANUS_SOURCE_KILL_GRACE_SECONDS:-60}"
HARD_TIMEOUT="$((SOURCE_TIMEOUT + SOURCE_KILL_GRACE))"

echo "== installing deps =="
python3 -m pip install -q -r requirements.txt

# Fresh local DB for this run so the dump contains exactly what was scraped.
rm -f motormila.db motormila.db.gz autolens.db.gz

SOURCES=("$@")
if [ ${#SOURCES[@]} -eq 0 ]; then
  if [ -n "${MANUS_SOURCE_LIST:-}" ]; then
    # shellcheck disable=SC2206
    SOURCES=($(printf '%s' "${MANUS_SOURCE_LIST}" | tr ',' ' '))
  else
    SOURCES=(riyasewana ikman autolanka auto-lanka hitad autostream saleme riyahub carshop dimo autodirect cartivate)
  fi
fi

for src in "${SOURCES[@]}"; do
  upper="$(printf '%s' "$src" | tr '[:lower:]' '[:upper:]')"
  echo "== scraping ${src} (max ${MAX} pages, from page ${START_PAGE}) =="
  env \
    ALLOW_SQLITE_FALLBACK=true \
    RUN_SCRAPERS=true \
    RUN_MARKET_ANALYSIS=false \
    RUN_MARKET_SIGNALS=false \
    RUN_LISTING_LIFECYCLE=false \
    RUN_OUTLIER_DETECTION=false \
    SCRAPE_ENABLED_SOURCES="${src}" \
    "SCRAPE_MAX_PAGES_${upper}=${MAX}" \
    "SCRAPE_START_PAGE=${START_PAGE}" \
    SCRAPE_SOURCE_TIMEOUT_SECONDS="${SOURCE_TIMEOUT}" \
    RIYASEWANA_SCRAPE_MODE=http \
    RIYASEWANA_ARCHIVE_FALLBACK=0 \
    timeout --foreground --kill-after=30s "${HARD_TIMEOUT}s" python3 run_sync.py || echo "!! ${src} scrape failed or timed out — continuing with the rest"
done

TOTAL="$(python3 -c "
import sqlite3
try:
    con = sqlite3.connect('motormila.db')
    print(con.execute('SELECT COUNT(*) FROM car_listings').fetchone()[0])
except Exception:
    print(0)
")"
echo "== scraped ${TOTAL} listings total =="
if [[ "${TOTAL}" == "0" ]]; then
  echo "ERROR: nothing scraped — aborting upload." >&2
  exit 1
fi

# Checkpoint WAL before gzip — SIGKILL of scrapers above makes lost -wal
# frames likely, and gzip of the .db alone drops them.
python -c "import sqlite3; c=sqlite3.connect('motormila.db'); c.execute('PRAGMA wal_checkpoint(TRUNCATE)'); c.close()"

gzip -f motormila.db
cp motormila.db.gz autolens.db.gz  # legacy asset name for pre-rename merger runs
# A retry job can publish several dumps inside the same minute, so a suffixed
# tag switches to second precision to keep releases distinct. The merge side
# (scripts/ops/discover_dump_releases.py) matches the manus-scrape- prefix and
# then searches for the timestamp, so both forms are accepted there.
if [ -n "${MANUS_RELEASE_TAG_SUFFIX:-}" ]; then
  TAG="manus-scrape-$(date -u +%Y%m%dT%H%M%SZ)-${MANUS_RELEASE_TAG_SUFFIX}"
else
  TAG="manus-scrape-$(date -u +%Y%m%dT%H%MZ)"
fi

# ---------------------------------------------------------------------------
# Delivery path 1: `gh` CLI (Manus integration may already authenticate it)
# ---------------------------------------------------------------------------
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  echo "== gh CLI available — creating release ${TAG} (${REPO}) =="
  if gh release create "${TAG}" motormila.db.gz autolens.db.gz --repo "${REPO}" \
      --title "${TAG}" --notes "Sources: ${SOURCES[*]} — from page ${START_PAGE} — listings: ${TOTAL}" \
      --prerelease --latest=false; then
    echo "== uploaded via gh. DONE =="
    exit 0
  fi
  echo "!! gh release create failed — trying the API fallback."
fi

# ---------------------------------------------------------------------------
# Delivery path 2: GH_TOKEN via the REST API
# ---------------------------------------------------------------------------
if [[ -n "${GH_TOKEN:-}" ]]; then
  echo "== uploading release ${TAG} via API (${REPO}) =="
  RELEASE_JSON="$(curl -fsSL -X POST \
    -H "Authorization: Bearer ${GH_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/${REPO}/releases" \
    -d "{\"tag_name\":\"${TAG}\",\"name\":\"${TAG}\",\"body\":\"Sources: ${SOURCES[*]} — from page ${START_PAGE} — listings: ${TOTAL}\",\"draft\":false,\"prerelease\":true,\"latest\":false}")"

  RELEASE_ID="$(printf '%s' "${RELEASE_JSON}" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")"

  for asset in motormila.db.gz autolens.db.gz; do  # autolens.db.gz is the legacy name
    curl -fsSL -X POST \
      -H "Authorization: Bearer ${GH_TOKEN}" \
      -H "Content-Type: application/gzip" \
      --data-binary "@${asset}" \
      "https://uploads.github.com/repos/${REPO}/releases/${RELEASE_ID}/assets?name=${asset}" >/dev/null
  done

  echo "== uploaded via API. DONE =="
  exit 0
fi

# ---------------------------------------------------------------------------
# No git-commit fallback: committing motormila.db.gz onto main does not update
# the live site (manus-to-live only reads GitHub Releases) and pollutes history.
# ---------------------------------------------------------------------------
echo "ERROR: cannot publish ${TAG}. Set GH_TOKEN (contents:read + releases:write)" >&2
echo "       or authenticate \`gh\`. The dump is at backend/motormila.db.gz" >&2
echo "       manus-to-live.yml merges GitHub Release assets named motormila.db.gz (legacy: autolens.db.gz)." >&2
exit 1
