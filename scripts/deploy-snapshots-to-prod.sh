#!/usr/bin/env bash
# deploy-snapshots-to-prod.sh
#
# Deploy refreshed snapshot JSON to motormila.vercel.app from CI (or locally).
#
# Stats-only exports (daily scrapes, --skip-catalog) do not carry the listing
# catalog, so the current catalog is fetched from the live site first and the
# fresh stats are overlaid on top. Those stats include live-market.json
# `latest_listings` (newest ads by first_seen_at) so the homepage grid can
# move between full-catalog refreshes. Full exports (weekly catalog refresh,
# ikman backfill) are deployed as-is.
#
# Usage:
#   SNAPSHOT_SOURCE_DIR=<dir with fresh snapshot JSON> bash scripts/deploy-snapshots-to-prod.sh
#
# Requires (CI): VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID secrets.
# Local fallback: existing `vercel` login + linked project (.vercel/).

set -euo pipefail

if command -v python3 >/dev/null 2>&1; then PY=python3; else PY=python; fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SNAP_DIR="${ROOT}/public/snapshots/latest"
SOURCE_DIR="${SNAPSHOT_SOURCE_DIR:-${SNAP_DIR}}"
LIVE_BASE="${LIVE_SNAPSHOT_BASE:-https://motormila.vercel.app/snapshots/latest}"

mkdir -p "${SNAP_DIR}"

# ---------------------------------------------------------------------------
# 1) Overlay the fresh snapshot files from the export FIRST.
# ---------------------------------------------------------------------------
if [[ -d "${SOURCE_DIR}" && "${SOURCE_DIR}" != "${SNAP_DIR}" ]]; then
  echo "==> Overlaying fresh snapshots from ${SOURCE_DIR}"
  if [[ -f "${SOURCE_DIR}/listing-catalog.json" ]]; then
    "${PY}" - "${SNAP_DIR}" "${SOURCE_DIR}" <<'PY'
import glob, json, os, sys
snap, src = sys.argv[1], sys.argv[2]
try:
    with open(os.path.join(src, "listing-catalog.json"), encoding="utf-8") as fh:
        keep = set(json.load(fh).get("parts", []))
except Exception:
    keep = set()
for old in glob.glob(os.path.join(snap, "listing-catalog-part-*.json")):
    if os.path.basename(old) not in keep:
        os.remove(old)
PY
  fi
  cp -f "${SOURCE_DIR}"/*.json "${SNAP_DIR}/" 2>/dev/null || true
fi

# ---------------------------------------------------------------------------
# 2) Ensure listing catalog is present (fallback fetch from live site if missing).
# ---------------------------------------------------------------------------
if [[ ! -s "${SNAP_DIR}/listing-catalog.json" ]]; then
  echo "==> Listing catalog not in local export; attempting fetch from live site…"
  if curl -fsSL --max-time 120 -o "${SNAP_DIR}/listing-catalog.json" \
    "${LIVE_BASE}/listing-catalog.json" 2>/dev/null; then
    "${PY}" - "${SNAP_DIR}" "${LIVE_BASE}" <<'PY'
import json, os, subprocess, sys
snap, base = sys.argv[1], sys.argv[2]
try:
    with open(os.path.join(snap, "listing-catalog.json"), encoding="utf-8") as fh:
        manifest = json.load(fh)
except Exception as exc:
    print(f"WARN: bad live catalog manifest: {exc}")
    sys.exit(0)
for part in manifest.get("parts", []):
    target = os.path.join(snap, part)
    if os.path.exists(target) and os.path.getsize(target) > 0:
        continue
    print(f"  fetching {part} …")
    try:
        subprocess.run(
            ["curl", "-fsSL", "--max-time", "300", "-o", target, f"{base}/{part}"],
            check=True,
        )
    except Exception as exc:
        print(f"WARN: failed to fetch part {part}: {exc}")
PY
  else
    echo "WARN: could not fetch listing-catalog.json from ${LIVE_BASE} (proceeding with stats-only snapshot)" >&2
  fi
fi

# ---------------------------------------------------------------------------
# 2c) Preserve the emergency failover DB (large; produced by manus-to-live).
#     Without this, a restore-catalog deploy redeploys the tree without it and
#     the HF Space loses its Neon-outage fallback (404 -> failover:false).
#     Served from public R2 since 2026-10-16 (the 101MB+ gz crossed Vercel's
#     100MB per-file deploy limit) — preserve from there.
# ---------------------------------------------------------------------------
R2_FAILOVER_BASE="https://pub-f15911ef9a914db9a44e1fd6b47dfe4e.r2.dev/snapshots/latest"
for dbname in merged-motormila.db.gz merged-autolens.db.gz; do  # second is the legacy name
  if [[ ! -s "${SNAP_DIR}/${dbname}" ]]; then
    echo "==> Failover DB ${dbname} missing locally; fetching from R2…"
    curl -fsSL --max-time 600 -o "${SNAP_DIR}/${dbname}" \
      "${R2_FAILOVER_BASE}/${dbname}" || \
      echo "WARN: could not preserve ${dbname} from R2" >&2
  fi
done

# ---------------------------------------------------------------------------
# 2b) Preserve the sideload APK + release manifest (/app/*) across deploys.
#     They are gitignored (binary), so fresh CI checkouts don't have them;
#     pull from the live site the same way the catalog fallback does.
# ---------------------------------------------------------------------------
APP_DIR="${ROOT}/public/app"
mkdir -p "${APP_DIR}"
for rel in latest-release.json; do
  if [[ ! -s "${APP_DIR}/${rel}" ]]; then
    curl -fsSL --max-time 30 -o "${APP_DIR}/${rel}" "https://motormila.vercel.app/app/${rel}" 2>/dev/null || true
  fi
done
if [[ -s "${APP_DIR}/latest-release.json" ]]; then
  APK_PATH="$(grep -o '/app/[^"]*\.apk' "${APP_DIR}/latest-release.json" | head -1 || true)"
  if [[ -n "${APK_PATH}" ]]; then
    APK_FILE="${APP_DIR}/$(basename "${APK_PATH}")"
    if [[ ! -s "${APK_FILE}" ]]; then
      echo "==> Fetching APK $(basename "${APK_PATH}") from live site…"
      curl -fsSL --max-time 300 -o "${APK_FILE}" "https://motormila.vercel.app${APK_PATH}" || \
        echo "WARN: could not preserve ${APK_PATH} from live site" >&2
    fi
  fi
fi

# ---------------------------------------------------------------------------
# 3) Validate every JSON file parses.
# ---------------------------------------------------------------------------
"${PY}" - "${SNAP_DIR}" <<'PY'
import glob, json, sys
snap = sys.argv[1]
files = sorted(glob.glob(f"{snap}/*.json"))
if not files:
    print("ERROR: no snapshot JSON files to deploy"); sys.exit(1)
for f in files:
    json.load(open(f, encoding="utf-8"))
print(f"  OK {len(files)} JSON files valid")
PY

# ---------------------------------------------------------------------------
# 4) Deploy to Vercel production (gitignored snapshots included).
# ---------------------------------------------------------------------------
cd "${ROOT}"
echo "==> Deploying to Vercel production…"
# Vercel rejects individual files >100MB. The merged DB dumps (102MB+) are for
# backend failover only and already live on public R2 — move them aside for the
# Vercel upload, then move them back for the R2 step that follows in the
# workflow. (.vercelignore entries alone did not stop the CLI uploading them —
# four consecutive 100MB deploy failures on 2026-10-16 proved it.)
# NOTE: cover both the snapshots dir AND the repo root — the restore-catalog
# workflow downloads the release gz files to ./ before gunzipping.
FAILOVER_STASH="$(mktemp -d)"
mv ./merged-*.db.gz "${FAILOVER_STASH}/" 2>/dev/null || true
mv "${SNAP_DIR}"/merged-*.db.gz "${FAILOVER_STASH}/" 2>/dev/null || true
restore_failover_dumps() {
  mv "${FAILOVER_STASH}"/merged-*.db.gz "${SNAP_DIR}/" 2>/dev/null || true
  rmdir "${FAILOVER_STASH}" 2>/dev/null || true
}
trap restore_failover_dumps EXIT
if [[ -n "${VERCEL_TOKEN:-}" ]]; then
  npx --yes vercel deploy --prod --yes --token "${VERCEL_TOKEN}"
else
  npx --yes vercel deploy --prod --yes
fi
trap - EXIT
restore_failover_dumps

# ---------------------------------------------------------------------------
# 5) Verify the production alias serves the fresh stats file AND every catalog
#    part the manifest references (a missing part silently breaks listing
#    search while the stats check alone still passes).
# ---------------------------------------------------------------------------
sleep 10
# Vercel's SPA rewrite answers 200 with text/html for missing files, so check
# the content type, not just the status code.
STATUS=$(curl -s -o /dev/null -w "%{http_code}|%{content_type}" --max-time 30 \
  "${LIVE_BASE}/stats-summary.json")
CODE="${STATUS%%|*}"; CTYPE="${STATUS#*|}"
echo "==> Production stats check: HTTP ${CODE} (${CTYPE})"
if [[ "${CODE}" != "200" || "${CTYPE}" != *json* ]]; then
  echo "ERROR: production snapshots did not come up (HTTP ${STATUS})" >&2
  exit 1
fi
"${PY}" - "${LIVE_BASE}" <<'PY'
import json, subprocess, sys, urllib.request
base = sys.argv[1]
try:
    with urllib.request.urlopen(f"{base}/listing-catalog.json", timeout=30) as r:
        manifest = json.load(r)
except Exception as exc:
    print(f"NOTICE: listing-catalog.json not verified on live site ({exc}) — stats verified OK")
    sys.exit(0)
for part in manifest.get("parts", []):
    probe = subprocess.run(
        ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}|%{content_type}",
         "--max-time", "30", f"{base}/{part}"],
        capture_output=True, text=True,
    ).stdout.strip()
    code, ctype = probe.split("|", 1)
    if code != "200" or "json" not in ctype.lower():
        print(f"WARN: catalog part {part} came back HTTP {code} ({ctype})")
        continue
    print(f"  OK part {part} HTTP {code} ({ctype})")
PY
echo "==> Done — motormila.vercel.app snapshots updated."
