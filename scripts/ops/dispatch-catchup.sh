#!/usr/bin/env bash
# Dispatch the deep catch-up chain that recovers listings missed while the
# scrapers were degraded, then watch each stage to completion.
#
#   Ikman Deep Backfill      ─┐
#   Riyasewana Deep Backfill ─┴─> Neon
#        └─> Neon Export ─> neon-export-* release
#              └─> Manus to Live (auto-triggers on Neon Export completion)
#                    └─> merges into merged SQLite ─> Vercel = LIVE SITE
#
# Why Neon Export is the handoff: the backfills write to Neon, but
# manus-to-live.yml owns the public catalog and rebuilds it from the merged
# SQLite DB every 6h. A backfill that deployed its own Neon-derived snapshots
# would be silently overwritten, so refresh_catalog stays false and the durable
# route is the neon-export-* release.
#
# Requires a token with `actions: write` (GitHub App permission "Actions").
#
# Usage:
#   bash scripts/ops/dispatch-catchup.sh              # ikman 1-200 + riyasewana 800
#   IKMAN_SEGMENTS=2 bash scripts/ops/dispatch-catchup.sh
#   RIYASEWANA_SEGMENTS=3 bash scripts/ops/dispatch-catchup.sh
#   SKIP_IKMAN=1 bash scripts/ops/dispatch-catchup.sh
#
# Segments walk a source *deeper* into its catalogue: segment 2 starts where
# segment 1 stopped instead of re-reading pages 1..N. Raise SEGMENTS to keep
# descending.
#
# Riyasewana is behind the same Cloudflare block as patpat/saleme and succeeds
# only on some runner IPs. A blocked attempt fails in ~0.1s (it no longer burns
# its budget), so re-run this script until that stage reports success.
set -euo pipefail

REPO="${GH_REPO:-SuvenSeo/Vehicle-Platform}"
REF="${REF:-main}"
IKMAN_PAGES="${IKMAN_PAGES:-200}"
IKMAN_SEGMENTS="${IKMAN_SEGMENTS:-1}"
RIYASEWANA_PAGES="${RIYASEWANA_PAGES:-800}"
RIYASEWANA_SEGMENTS="${RIYASEWANA_SEGMENTS:-1}"
# Riyasewana used to have no start-page input, so a segment beyond page 1
# re-crawled the head of the catalogue. It now segments like ikman.
RIYASEWANA_START_PAGE="${RIYASEWANA_START_PAGE:-1}"
# Deep crawls take hours; this is a safety ceiling, not an expected wait.
WAIT_TIMEOUT_MINUTES="${WAIT_TIMEOUT_MINUTES:-300}"

log()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
warn() { printf '  !! %s\n' "$*" >&2; }

need() { command -v "$1" >/dev/null 2>&1 || { warn "missing required tool: $1"; exit 1; }; }
need gh
need jq

dispatch() { # workflow input=value...
  local wf="$1"; shift
  local args=() out rc
  for pair in "$@"; do args+=(-f "$pair"); done
  set +e
  out=$(gh workflow run "$wf" --repo "$REPO" --ref "$REF" "${args[@]}" 2>&1)
  rc=$?
  set -e
  if [ "$rc" -ne 0 ]; then
    if printf '%s' "$out" | grep -qiE '403|not accessible by integration|Resource not accessible'; then
      warn "Cannot dispatch '${wf}': this token lacks the Actions: write permission."
      warn "Fix by granting the GitHub App 'Actions: write', then re-run this script."
      manual_instructions
      exit 1
    fi
    if printf '%s' "$out" | grep -qiE 'gh auth login|populate the GH_TOKEN'; then
      warn "No GitHub credential was visible to this script (GH_TOKEN/GITHUB_TOKEN empty)."
      warn "This is an environment issue, not a repository permission one."
      warn "Re-run once a credential is present."
      exit 1
    fi
    warn "gh workflow run ${wf} failed: ${out}"
    exit "$rc"
  fi
}

latest_run_id() { # workflow -> run id (most recent dispatch)
  gh run list --repo "$REPO" --workflow "$1" --event workflow_dispatch \
    --limit 1 --json databaseId --jq '.[0].databaseId'
}

wait_for() { # workflow run_id label
  local wf="$1" run_id="$2" label="$3" started elapsed
  log "Waiting for ${label} (run ${run_id}) — up to ${WAIT_TIMEOUT_MINUTES}m"
  started=$(date +%s)
  while :; do
    local status conclusion
    status=$(gh run view "$run_id" --repo "$REPO" --json status --jq '.status' 2>/dev/null || echo unknown)
    conclusion=$(gh run view "$run_id" --repo "$REPO" --json conclusion --jq '.conclusion' 2>/dev/null || echo unknown)
    elapsed=$(( $(date +%s) - started ))
    printf '    [%4dm] %s — %s\n' $(( elapsed / 60 )) "$status" "$conclusion"
    case "$status" in
      completed)
        if [ "$conclusion" = "success" ]; then
          log "${label} succeeded"
          return 0
        fi
        warn "${label} finished as '${conclusion}'."
        if [ "$label" = "riyasewana-backfill" ]; then
          warn "That is usually the Cloudflare block on this runner IP. Re-run this"
          warn "script to draw a fresh IP — a blocked attempt costs ~0.1s now."
        fi
        if printf '%s' "$label" | grep -q '^riyasewana segment'; then
          warn "That is usually the Cloudflare block on this runner IP. Re-run this"
          warn "script to draw a fresh IP — a blocked attempt costs ~0.1s now."
        fi
        return 1
        ;;
    esac
    if [ $(( elapsed / 60 )) -ge "$WAIT_TIMEOUT_MINUTES" ]; then
      warn "${label} exceeded ${WAIT_TIMEOUT_MINUTES}m while still ${status}."
      return 1
    fi
    sleep 60
  done
}

manual_instructions() {
  warn "Or trigger these manually from the Actions tab:"
  warn "  1. Ikman Deep Backfill      max_pages=${IKMAN_PAGES} start_page=1 refresh_catalog=false"
  warn "  2. Riyasewana Deep Backfill max_pages=${RIYASEWANA_PAGES} start_page=1 refresh_catalog=false"
  warn "  3. Neon Export             limit=0 force=true  (Manus to Live then runs itself)"
}

verify_preflight() {
  # No side-effect-free probe is available: the installation-permissions
  # endpoint needs a JWT, and a dispatch POST would start a real run. So the
  # first dispatch is the probe — dispatch() reports a missing
  # Actions: write permission with the manual alternative.
  log "Preflight — dispatching the first stage"
  echo "  (a 403 here means this token needs the GitHub App 'Actions: write')"
}

verify_preflight

if [ "${SKIP_IKMAN:-0}" != "1" ]; then
  log "Dispatching Ikman Deep Backfill (${IKMAN_SEGMENTS} segment(s) of ${IKMAN_PAGES} pages)"
  start_page=1
  seg=1
  while [ "$seg" -le "$IKMAN_SEGMENTS" ]; do
    dispatch ikman-bulk-backfill.yml \
      "max_pages=${IKMAN_PAGES}" \
      "start_page=${start_page}" \
      "refresh_catalog=false"
    sleep 5
    run_id=$(latest_run_id ikman-bulk-backfill.yml)
    echo "  segment ${seg}: pages ${start_page}-$(( start_page + IKMAN_PAGES - 1 )) -> run ${run_id}"
    wait_for ikman-bulk-backfill.yml "$run_id" "ikman segment ${seg}" || true
    start_page=$(( start_page + IKMAN_PAGES ))
    seg=$(( seg + 1 ))
  done
else
  log "Skipping Ikman backfill (SKIP_IKMAN=1)"
fi

log "Dispatching Riyasewana Deep Backfill (${RIYASEWANA_SEGMENTS} segment(s) of ${RIYASEWANA_PAGES} pages)"
ry_start="${RIYASEWANA_START_PAGE}"
ry_seg=1
ry_ok=0
while [ "$ry_seg" -le "$RIYASEWANA_SEGMENTS" ]; do
  dispatch riyasewana-bulk-backfill.yml \
    "max_pages=${RIYASEWANA_PAGES}" \
    "start_page=${ry_start}" \
    "refresh_catalog=false"
  sleep 5
  ry_id=$(latest_run_id riyasewana-bulk-backfill.yml)
  echo "  segment ${ry_seg}: pages ${ry_start}-$(( ry_start + RIYASEWANA_PAGES - 1 )) -> run ${ry_id}"
  if wait_for riyasewana-bulk-backfill.yml "$ry_id" "riyasewana segment ${ry_seg}"; then
    ry_ok=1
  else
    warn "Riyasewana did not land. Re-run this script to retry with a fresh IP."
    warn "Neon Export below would still be valid, but skips riyasewana's deep catch-up."
    break
  fi
  ry_start=$(( ry_start + RIYASEWANA_PAGES ))
  ry_seg=$(( ry_seg + 1 ))
done
if [ "$ry_ok" != "1" ]; then
  warn "Continuing to Neon Export without a complete riyasewana catch-up."
fi

log "Dispatching Neon Export (force=true) — publishes neon-export-* for the merge"
dispatch neon-export.yml "limit=0" "force=true"
sleep 5
neon_id=$(latest_run_id neon-export.yml)
echo "  -> run ${neon_id}"
wait_for neon-export.yml "$neon_id" "neon-export" || true

log "Manus to Live triggers automatically on Neon Export completion"
echo "  Watch it with: gh run list --workflow=manus-to-live.yml --limit 3"
echo
echo "Catch-up dispatched. When Manus to Live finishes, verify the live catalog:"
echo "  curl -s https://motormila.vercel.app/snapshots/latest/manifest.json | jq '{listing_count, generated_at}'"
